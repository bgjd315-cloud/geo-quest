#!/usr/bin/env node
// 題庫檢查：任何一項錯誤都不得建置或發布（build.js 會先呼叫這支）。
// 用法：node scripts/validate.js
const fs = require('fs');
const path = require('path');
const G = require('../src/geo.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const errors = [], warnings = [];
const err = (id, msg) => errors.push(`[${id}] ${msg}`);
const warn = (id, msg) => warnings.push(`[${id}] ${msg}`);

function readJSON(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) { err('manifest', `找不到資料檔 data/${rel}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { err('manifest', `data/${rel} 不是合法的 JSON：${e.message}`); return null; }
}

function validate() {
  const man = readJSON('manifest.json');
  if (!man) return report();
  const files = {};
  for (const rel of [].concat(man.core, man.figures, man.cards, man.questions)) files[rel] = readJSON(rel);

  const concepts = files['concepts.json'], regions = files['regions.json'], units = files['units.json'];
  if (!concepts || !regions || !units) return report();
  const conceptIds = new Set(concepts.units.flatMap(u => u.concepts.map(c => c.id)));
  const regionNames = new Set(regions.regions.map(r => r.name));
  const unitNames = new Set(units.units.map(u => u.name));
  const levelIds = new Set(units.units.flatMap(u => u.levels.map(l => l.id).concat(u.boss ? [u.boss.id] : [])));

  // 圖表引用的資料檔必須存在，而且要註明來源
  for (const rel of man.figures) {
    const f = files[rel];
    if (!f) continue;
    if (!f.source) err(rel, '資料檔沒有註明 source（來源）');
    if (rel.startsWith('climate/') && !f.period) err(rel, '氣候資料沒有註明統計期間 period');
    if (rel.startsWith('population/') && !(f.estimateYears && f.projectionYears)) err(rel, '人口資料要註明哪些年份是估計值、哪些是推估');
    if ((rel.startsWith('terrain/') || rel.startsWith('maps/')) && f.fictional !== true) err(rel, '虛構圖資必須標示 fictional: true');
    if (rel.startsWith('terrain/') && !/練習用虛構地形/.test(f.name)) err(rel, '等高線練習圖名稱必須標示「練習用虛構地形」');
  }

  const DIAGRAMS = new Set(['orographic', 'raintypes', 'pressure', 'fronts', 'season', 'monsoon', 'compass', 'timezone']);
  function checkFigure(id, fig) {
    if (!fig) return;
    const need = (key) => {
      const rel = fig[key];
      if (!rel) { err(id, `圖表 ${fig.type} 缺少 ${key}`); return null; }
      if (!man.figures.includes(rel)) { err(id, `圖表引用的 ${rel} 沒有列在 manifest.figures`); return null; }
      return files[rel];
    };
    switch (fig.type) {
      case 'climograph': { const d = need('data'); if (d && !d.stations[fig.station]) err(id, `氣候資料沒有測站「${fig.station}」`); break; }
      case 'climographs': { const d = need('data'); if (d) for (const o of fig.stations) if (!d.stations[o.station]) err(id, `氣候資料沒有測站「${o.station}」`); break; }
      case 'tw-stations': { const d = need('data'); need('basemap'); if (d) for (const o of fig.stations) { const s = d.stations[o.station]; if (!s) err(id, `氣候資料沒有測站「${o.station}」`); else if (s.lat == null) err(id, `測站「${o.station}」沒有座標`); } break; }
      case 'contour': { const t = need('terrain'); if (t) for (const k of (fig.points || []).concat(fig.line || [])) if (!t.points[k]) err(id, `地形 ${fig.terrain} 沒有點「${k}」`); break; }
      case 'profile': { const t = need('terrain'); if (t) for (const k of [fig.from, fig.to]) if (!t.points[k]) err(id, `地形 ${fig.terrain} 沒有點「${k}」`); break; }
      case 'town': { const m = need('map'); if (m && fig.hide) for (const n of fig.hide) if (!m.landmarks.find(l => l.name === n)) err(id, `地圖沒有地標「${n}」`); break; }
      case 'graticule': { need('basemap'); for (const p of fig.points || []) if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) err(id, `經緯度超出範圍：${p.label}`); break; }
      case 'region-map': case 'polar-map': {
        const b = need('basemap');
        if (fig.type === 'region-map' && !(Array.isArray(fig.bbox) && fig.bbox.length === 4 && fig.bbox[0] < fig.bbox[2] && fig.bbox[1] < fig.bbox[3])) err(id, 'region-map 的 bbox 必須是 [西經度, 南緯度, 東經度, 北緯度]');
        if (b) for (const a3 of fig.highlight || []) if (!b.countries.find(c => c.a3 === a3)) err(id, `底圖沒有國家代碼 ${a3}`);
        const xy = [];
        for (const p of fig.points || []) {
          let lat = p.lat, lon = p.lon;
          if (p.station) { const d = files[p.data || fig.data]; if (!d) { err(id, `點「${p.station}」引用的氣候資料檔不存在`); continue; } const s = d.stations[p.station]; if (!s) { err(id, `氣候資料沒有測站「${p.station}」`); continue; } lat = s.lat; lon = s.lon; }
          else if (typeof p.lat !== 'number' || typeof p.lon !== 'number' || !p.label) { err(id, '地圖上的點要有 label、lat、lon，或引用 station'); continue; }
          // 用和 charts.js 相同的投影算螢幕位置，檢查是否在圖框內、彼此是否太近
          if (fig.type === 'region-map' && fig.bbox) {
            const [x0, y0, x1, y1] = fig.bbox, wrap = x1 > 180, L = wrap && lon < 0 ? lon + 360 : lon;
            if (L < x0 || L > x1 || lat < y0 || lat > y1) { err(id, `點「${p.label || p.station}」(${lat}, ${lon}) 在地圖範圍 ${JSON.stringify(fig.bbox)} 之外`); continue; }
            const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), W = fig.width || 360, H = W * (y1 - y0) / ((x1 - x0) * k);
            xy.push([p.label || p.station, (L - x0) / (x1 - x0) * W, (y1 - lat) / (y1 - y0) * H]);
          } else if (fig.type === 'polar-map') {
            const S = fig.pole === 'S' ? -1 : 1, edge = fig.edge || 50;
            if (S * lat < edge) { err(id, `點「${p.label || p.station}」在極區地圖外緣（${edge} 度）之外`); continue; }
            const r = (90 - S * lat) / (90 - edge) * 170, a = lon * Math.PI / 180;
            xy.push([p.label || p.station, 180 + r * Math.sin(a), 180 + S * r * Math.cos(a)]);
          }
        }
        for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) {
          if (Math.hypot(xy[i][1] - xy[j][1], xy[i][2] - xy[j][2]) < 14) warn(id, `地圖上「${xy[i][0]}」和「${xy[j][0]}」距離太近，標籤可能重疊`);
        }
        break;
      }
      case 'pyramid': { const d = need('data'); if (d && !(d.countries[fig.country] && d.countries[fig.country][fig.year])) err(id, `人口資料沒有 ${fig.country} ${fig.year}`); break; }
      case 'pyramids': { const d = need('data'); if (d) for (const o of fig.items) if (!(d.countries[o.country] && d.countries[o.country][o.year])) err(id, `人口資料沒有 ${o.country} ${o.year}`); break; }
      case 'diagram': if (!DIAGRAMS.has(fig.id)) err(id, `未知的示意圖 ${fig.id}`); break;
      default: err(id, `未知的圖表類型 ${fig.type}`);
    }
  }

  // 原理卡
  const cards = {};
  for (const rel of man.cards) {
    const c = files[rel];
    if (!c) continue;
    if (!c.source) err(rel, '原理卡檔案沒有註明 source');
    for (const [k, v] of Object.entries(c.cards)) {
      if (!conceptIds.has(k)) err(rel, `原理卡的概念「${k}」不在 concepts.json`);
      if (!v.text) err(rel, `原理卡「${k}」沒有說明文字`);
      checkFigure(`${rel}:${k}`, v.figure);
      cards[k] = v;
    }
  }

  // 題目
  const seenId = new Set(), seenStem = new Map();
  const STATUS = new Set(['待審', '確認', '退回']);
  const CHOICE = new Set(['single', 'click', 'clue', 'decode', 'compare', 'transfer']);
  const TYPES = new Set([...CHOICE, 'chain', 'order', 'match']);
  CHOICE.add('compare'); CHOICE.add('transfer');
  const all = [];
  for (const rel of man.questions) {
    const f = files[rel];
    if (!f) continue;
    for (const q of f.questions) { q._file = rel; all.push(q); }
  }

  const optLen = q => (q.options || []).length;
  function checkChoice(id, q) {
    if (!Array.isArray(q.options) || q.options.length < 2) { err(id, '選項至少要 2 個'); return; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(id, `答案 ${q.answer} 不在選項範圍 0～${q.options.length - 1}`);
    const texts = q.options.map(o => typeof o === 'string' ? o : JSON.stringify(o));
    if (new Set(texts).size !== texts.length) err(id, '選項有重複');
    for (const o of q.options) if (typeof o === 'object') checkFigure(id, o.figure);
    // 正解明顯比每個干擾選項都長，孩子會「挑最長的」猜對
    const L = q.options.map(o => typeof o === 'string' ? o.length : 0);
    if (L.every(v => v > 0) && q.answer >= 0 && q.answer < L.length) {
      const others = Math.max(...L.filter((_, i) => i !== q.answer));
      if (L[q.answer] > others * 1.3 && L[q.answer] - others >= 4) warn(id, `正解（${L[q.answer]} 字）明顯比其他選項長（最長 ${others} 字），容易被猜中`);
    }
    if (!q.explain) err(id, '缺少解析 explain');
  }

  for (const q of all) {
    const id = q.id || '(沒有 id)';
    if (!q.id) err(q._file, '有題目沒有 id');
    if (seenId.has(q.id)) err(id, 'id 重複');
    seenId.add(q.id);
    for (const k of ['unit', 'level', 'region', 'type', 'status', 'source', 'stem']) if (!q[k]) err(id, `缺少欄位 ${k}`);
    if (!String(q.source || '').trim()) err(id, 'source 未填寫');
    if (!STATUS.has(q.status)) err(id, `status 必須是 待審／確認／退回，目前是「${q.status}」`);
    if (!TYPES.has(q.type)) err(id, `未知題型 ${q.type}`);
    if (!unitNames.has(q.unit)) err(id, `unit「${q.unit}」不在 units.json`);
    if (!levelIds.has(q.level)) err(id, `level「${q.level}」不在 units.json`);
    if (!regionNames.has(q.region)) err(id, `region「${q.region}」不在 regions.json`);
    if (!Array.isArray(q.concepts) || !q.concepts.length) err(id, 'concepts 不可為空');
    for (const c of q.concepts || []) {
      if (!conceptIds.has(c)) err(id, `概念「${c}」不在 concepts.json`);
      else if (!cards[c]) err(id, `概念「${c}」沒有原理卡（答錯時要顯示）`);
    }
    checkFigure(id, q.figure);

    // 重複題：題幹＋圖完全相同
    const key = (q.stem || '').replace(/\s/g, '') + JSON.stringify(q.figure || null) + JSON.stringify(q.parts ? q.parts.map(p => p.stem) : null);
    if (seenStem.has(key)) err(id, `與 ${seenStem.get(key)} 重複`);
    seenStem.set(key, id);

    const PARTS = new Set(['chain', 'transfer', 'compare']);
    if (Array.isArray(q.parts) && !PARTS.has(q.type)) err(id, `只有 chain／transfer／compare 可以有小題 parts`);
    if (CHOICE.has(q.type) && !q.parts) checkChoice(id, q);
    if (q.type === 'click') {
      const f = q.figure || {};
      if (!f.pick) err(id, '圖上點選題的圖必須設定 pick: true');
      const labels = f.type === 'contour' ? f.points : (f.type === 'graticule' || f.type === 'region-map' || f.type === 'polar-map') ? (f.points || []).map(p => p.label || p.station) : f.type === 'tw-stations' ? f.stations.map(o => o.label || o.station) : f.type === 'town' ? files[f.map] && files[f.map].landmarks.map(l => l.name) : f.type === 'diagram' && f.id === 'fronts' ? ['甲', '乙', '丙', '丁'] : null;
      if (!labels) err(id, `圖上點選題不支援圖表 ${f.type}`);
      else for (const o of q.options || []) if (!labels.includes(o)) err(id, `選項「${o}」在圖上找不到可點的標記`);
    }
    if (q.type === 'clue' && (!Array.isArray(q.clues) || q.clues.length < 2)) err(id, '線索猜地至少要 2 條線索');
    if (q.type === 'chain' && !Array.isArray(q.parts)) err(id, '連鎖題組必須有 parts');
    if (Array.isArray(q.parts)) {
      if (q.parts.length < 2) err(id, '有小題的題目至少要 2 小題');
      (q.parts || []).forEach((p, k) => {
        checkChoice(`${id}#${k + 1}`, p);
        for (const c of p.concepts || []) if (!conceptIds.has(c)) err(`${id}#${k + 1}`, `概念「${c}」不在 concepts.json`);
        checkFigure(`${id}#${k + 1}`, p.figure);
        if (p.check) runCheck(`${id}#${k + 1}`, p, q.figure, files);
      });
    }
    if (q.type === 'order') {
      const n = (q.items || []).length;
      const ok = Array.isArray(q.answer) && q.answer.length === n && [...q.answer].sort((a, b) => a - b).every((v, i) => v === i);
      if (n < 2 || !ok) err(id, '排序題的答案必須是 items 的完整排列');
      if (!q.explain) err(id, '缺少解析 explain');
    }
    if (q.type === 'match') {
      const ok = Array.isArray(q.answer) && q.answer.length === (q.left || []).length && q.answer.every(v => Number.isInteger(v) && v >= 0 && v < (q.right || []).length) && new Set(q.answer).size === q.answer.length;
      if (!ok) err(id, '配對題的答案必須讓每個左項對到不同的右項');
      if (!q.explain) err(id, '缺少解析 explain');
    }
    if (q.check) runCheck(id, q, q.figure, files);
  }

  // 錯題回收需要的變化題：每個概念至少 2 題；區域題的概念要有通論題可補救
  const byConcept = {};
  for (const q of all) for (const c of q.concepts || []) (byConcept[c] = byConcept[c] || []).push(q);
  for (const [c, qs] of Object.entries(byConcept)) {
    if (qs.length < 2) warn(c, `概念只有 ${qs.length} 題，錯題回收時沒有題目可替換`);
    if (qs.some(q => q.region !== '通論') && !qs.some(q => q.region === '通論' && q.type !== 'chain')) warn(c, '有區域題但沒有通論基本題，答錯時無法補救');
  }

  return report(all);
}

// ---------- 自動驗算：用程式重算答案，確保圖、數據與答案一致 ----------
function runCheck(id, q, figure, files) {
  const c = q.check;
  const ansText = () => { const o = q.options[q.answer]; return typeof o === 'string' ? o : null; };
  const fail = msg => err(id, `自動驗算失敗：${msg}`);
  const town = () => files[c.map];
  const lm = name => { const l = town().landmarks.find(x => x.name === name); if (!l) fail(`地圖沒有地標 ${name}`); return l; };
  const cellOf = l => town().cols[Math.floor(l.x)] + town().rows[Math.floor(l.y)];
  const figPoints = () => figure && figure.type === 'graticule' ? figure.points : [];

  switch (c.kind) {
    case 'town-cell': { const l = lm(ansText()); if (l && cellOf(l) !== c.cell) fail(`${ansText()} 在 ${cellOf(l)}，不是 ${c.cell}`); break; }
    case 'town-cell-of': { const l = lm(c.name); if (l && cellOf(l) !== ansText()) fail(`${c.name} 在 ${cellOf(l)}，答案卻是 ${ansText()}`); break; }
    case 'town-direction': {
      const a = lm(c.from), b = lm(c.to); if (!a || !b) break;
      const d = G.direction(a, b, c.n || 8);
      const t = ansText().replace(/^正/, '');
      if (d !== t) fail(`從${c.from}看${c.to}是「${d}」，答案卻是「${ansText()}」`);
      break;
    }
    case 'town-distance': {
      const a = lm(c.from), b = lm(c.to); if (!a || !b) break;
      const m = Math.hypot(a.x - b.x, a.y - b.y) * town().cellMeters;
      if (Math.abs(m - c.meters) > 1) fail(`${c.from}到${c.to}是 ${m} 公尺，不是 ${c.meters}`);
      if (!matchesMeters(ansText(), c.meters)) fail(`答案「${ansText()}」和 ${c.meters} 公尺不符`);
      break;
    }
    case 'scale': {
      const m = c.cm * c.denom / 100;
      if (m !== c.meters) fail(`${c.cm} 公分 × ${c.denom} 是 ${m} 公尺，不是 ${c.meters}`);
      if (!matchesMeters(ansText(), m)) fail(`答案「${ansText()}」和 ${m} 公尺不符`);
      break;
    }
    case 'timezone': {
      const r = G.timeAt(c.fromLon, c.fromHour, c.toLon);
      if (r.h !== c.h || r.day !== c.day) fail(`算出來是 ${r.day === 0 ? '同一天' : r.day < 0 ? '前一天' : '隔天'} ${r.h} 點，設定卻是 ${c.day} 天 ${c.h} 點`);
      break;
    }
    case 'latlon-quadrant': {
      const ok = figPoints().filter(p => (c.ns === 'S' ? p.lat < 0 : p.lat > 0) && (c.ew === 'W' ? p.lon < 0 : p.lon > 0));
      if (ok.length !== 1 || ok[0].label !== ansText()) fail(`符合條件的點是 ${ok.map(p => p.label).join('、') || '沒有'}，答案卻是 ${ansText()}`);
      break;
    }
    case 'latlon-point': {
      const p = figPoints().find(x => x.label === c.label);
      if (!p || p.lat !== c.lat || p.lon !== c.lon) fail(`${c.label} 點的座標和設定不符`);
      const want = `${Math.abs(c.lat)}°${c.lat < 0 ? 'S' : 'N'}，${Math.abs(c.lon)}°${c.lon < 0 ? 'W' : 'E'}`;
      if (ansText() !== want) fail(`答案應為「${want}」`);
      break;
    }
    case 'latlon-zone': {
      const zone = lat => Math.abs(lat) < 23.5 ? '熱帶' : Math.abs(lat) < 66.5 ? '溫帶' : '寒帶';
      const ok = figPoints().filter(p => zone(p.lat) === c.zone);
      if (ok.length !== 1 || ok[0].label !== ansText()) fail(`位於${c.zone}的點是 ${ok.map(p => p.label).join('、') || '沒有'}`);
      break;
    }
    case 'terrain-highest': case 'terrain-lowest': case 'terrain-steepest': {
      const T = files[c.terrain];
      const pts = c.points || q.options.filter(o => T.points[o]);
      const val = k => {
        const p = T.points[k];
        if (c.kind === 'terrain-steepest') return Math.hypot(G.elevation(T, p.x + .5, p.y) - G.elevation(T, p.x - .5, p.y), G.elevation(T, p.x, p.y + .5) - G.elevation(T, p.x, p.y - .5));
        return G.elevation(T, p.x, p.y) * (c.kind === 'terrain-lowest' ? -1 : 1);
      };
      const best = pts.slice().sort((a, b) => val(b) - val(a));
      if (best[0] !== ansText()) fail(`算出來是 ${best[0]}（${pts.map(k => `${k}:${val(k).toFixed(1)}`).join(' ')}），答案卻是 ${ansText()}`);
      if (best.length > 1 && Math.abs(val(best[0]) - val(best[1])) < Math.abs(val(best[0])) * 0.15) fail(`第一名和第二名差距太小，孩子看圖難以判斷`);
      break;
    }
    case 'terrain-feature': {
      const T = files[c.terrain];
      const f = T.features.find(x => x.type === c.feature);
      const on = q.options.filter(k => { const p = T.points[k]; if (!p) return false; const dx = f.x2 - f.x1, dy = f.y2 - f.y1, L2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((p.x - f.x1) * dx + (p.y - f.y1) * dy) / L2)); return Math.hypot(p.x - (f.x1 + t * dx), p.y - (f.y1 + t * dy)) <= f.w && t > 0.15; });
      if (on.length !== 1 || on[0] !== ansText()) fail(`位在${c.feature === 'valley' ? '河谷' : '山脊'}上的點是 ${on.join('、') || '沒有'}，答案卻是 ${ansText()}`);
      break;
    }
    case 'profile-match': {
      const o = q.options[q.answer];
      const line = figure && figure.line;
      if (!o || !o.figure || !line || o.figure.terrain !== figure.terrain || o.figure.from !== line[0] || o.figure.to !== line[1]) fail('正確選項的剖面圖和題目的剖面線不一致');
      break;
    }
    case 'profile-peaks': {
      const T = files[c.terrain];
      const pr = G.profile(T, T.points[c.from], T.points[c.to], 200).map(o => o.z);
      // 山頂＝局部最高點，且往左、往右都要先下降至少 40 公尺才會遇到更高的地方
      let peaks = 0;
      for (let i = 1; i < pr.length - 1; i++) {
        if (!(pr[i] >= pr[i - 1] && pr[i] > pr[i + 1])) continue;
        const drop = dir => { let lo = pr[i]; for (let j = i + dir; j >= 0 && j < pr.length; j += dir) { if (pr[j] > pr[i]) break; lo = Math.min(lo, pr[j]); } return pr[i] - lo; };
        if (drop(-1) >= 40 && drop(1) >= 40) peaks++;
      }
      if (peaks !== c.peaks) fail(`剖面上有 ${peaks} 個高點，設定是 ${c.peaks}`);
      if (!ansText().startsWith(String(c.peaks))) fail(`答案「${ansText()}」和 ${c.peaks} 座不符`);
      break;
    }
    case 'fronts': {
      const want = ['甲', '乙', '丙', '丁'][c.order.indexOf(c.want)];
      if (want !== ansText()) fail(`${c.want} 的位置是 ${want}，答案卻是 ${ansText()}`);
      if (figure && JSON.stringify(figure.opts && figure.opts.order) !== JSON.stringify(c.order)) fail('驗算用的符號順序和圖上不一致');
      break;
    }
    case 'climate-value': {
      const d = files[c.data];
      for (const v of c.values) {
        const s = d.stations[v.station];
        if (!s) { fail(`沒有測站 ${v.station}`); continue; }
        const x = G.climateStats(s)[v.prop];
        if (v.eq != null && Math.abs(x - v.eq) > 0.05) fail(`${v.station} 的 ${v.prop} 是 ${x}，題目寫 ${v.eq}`);
        if (v.gt != null && !(x > v.gt)) fail(`${v.station} 的 ${v.prop} 是 ${x}，不大於 ${v.gt}`);
        if (v.lt != null && !(x < v.lt)) fail(`${v.station} 的 ${v.prop} 是 ${x}，不小於 ${v.lt}`);
      }
      break;
    }
    case 'climate-rank': {
      const d = files[c.data];
      const vals = c.stations.map(n => G.climateStats(d.stations[n])[c.prop]);
      const target = c.pick === 'max' ? Math.max(...vals) : Math.min(...vals);
      const idx = vals.indexOf(target);
      if (idx !== q.answer) fail(`${c.prop} ${c.pick} 是 ${c.stations[idx]}（${vals.join('、')}），答案卻是第 ${q.answer + 1} 個選項`);
      break;
    }
    case 'climate-order': {
      const d = files[c.data];
      const v = n => G.climateStats(d.stations[n])[c.prop];
      const right = q.items.map((n, i) => i).sort((a, b) => (c.desc ? v(q.items[b]) - v(q.items[a]) : v(q.items[a]) - v(q.items[b])));
      if (JSON.stringify(right) !== JSON.stringify(q.answer)) fail(`正確排序應為 ${right.map(i => q.items[i]).join(' → ')}`);
      break;
    }
    case 'pyramid-value': {
      const d = files[c.data];
      for (const v of c.values) {
        const g = d.countries[v.country] && d.countries[v.country][v.year];
        if (!g) { fail(`沒有 ${v.country} ${v.year} 的人口資料`); continue; }
        const x = G.popStats(g)[v.prop];
        if (v.eq != null && Math.abs(x - v.eq) > 0.05) fail(`${v.country} ${v.year} 的 ${v.prop} 是 ${x}，題目寫 ${v.eq}`);
        if (v.gt != null && !(x > v.gt)) fail(`${v.country} ${v.year} 的 ${v.prop} 是 ${x}，不大於 ${v.gt}`);
        if (v.lt != null && !(x < v.lt)) fail(`${v.country} ${v.year} 的 ${v.prop} 是 ${x}，不小於 ${v.lt}`);
      }
      break;
    }
    case 'pyramid-rank': {
      const d = files[c.data];
      const vals = c.items.map(o => G.popStats(d.countries[o.country][o.year])[c.prop]);
      const target = c.pick === 'max' ? Math.max(...vals) : Math.min(...vals);
      if (vals.indexOf(target) !== q.answer) fail(`${c.prop} ${c.pick} 是第 ${vals.indexOf(target) + 1} 個（${vals.join('、')}），答案卻是第 ${q.answer + 1} 個`);
      break;
    }
    default: fail(`未知的驗算類型 ${c.kind}`);
  }
}

function matchesMeters(text, meters) {
  if (!text) return false;
  const m = text.match(/([\d.,]+)\s*(公里|公尺)/);
  if (!m) return false;
  const v = parseFloat(m[1].replace(/,/g, '')) * (m[2] === '公里' ? 1000 : 1);
  return Math.abs(v - meters) < 0.5;
}

function report(all) {
  const n = all ? all.length : 0;
  const parts = all ? all.reduce((s, q) => s + (q.type === 'chain' ? q.parts.length : 1), 0) : 0;
  for (const w of warnings) console.log('⚠ ' + w);
  for (const e of errors) console.log('✗ ' + e);
  if (all) {
    const by = {};
    for (const q of all) { const k = `${q.unit}｜${q.status}`; by[k] = (by[k] || 0) + 1; }
    console.log(`\n題目 ${n} 題（含題組小題共 ${parts} 小題）`);
    for (const [k, v] of Object.entries(by)) console.log(`  ${k}：${v}`);
  }
  console.log(errors.length ? `\n題庫檢查未通過：${errors.length} 個錯誤。不得建置或發布。` : `\n題庫檢查通過（警告 ${warnings.length} 則）。`);
  return errors.length === 0;
}

if (require.main === module) process.exit(validate() ? 0 : 1);
module.exports = { validate };
