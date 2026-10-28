#!/usr/bin/env node
// 題庫檢查：任何一項錯誤都不得建置或發布（build.js 會先呼叫這支）。
// 用法：node scripts/validate.js
const fs = require('fs');
const path = require('path');
const G = require('../src/modules/geo/geo.js');

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

    checkBody(id, q);
  }

  // 題型相關的檢查（地理、歷史共用）
  function checkBody(id, q) {
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

  // ---------- 歷史：data/history/ ----------
  const hman = readJSON('history/manifest.json');
  const hev = hman && readJSON('history/' + hman.events);
  if (hev) {
    const THEMES = ['統治與政權', '經濟與貿易', '社會與文化', '思想與宗教', '對外交流與衝突', '近代化'];
    const lineIds = new Set((hev.lines || []).map(l => l.id));
    const eras = new Map(), events = new Map();
    for (const t of hev.themes || []) if (!THEMES.includes(t)) err('history/events', `主題「${t}」不在六大主題內`);
    for (const e of hev.eras || []) {
      if (eras.has(e.id)) err('history/events', `分期 id 重複：${e.id}`);
      eras.set(e.id, e);
      if (!lineIds.has(e.line)) err('history/events', `分期 ${e.id} 的 line「${e.line}」不存在`);
    }
    for (const e of hev.events || []) {
      const id = 'history/' + (e.id || '(沒有 id)');
      if (!e.id) err(id, '事件沒有 id');
      if (events.has(e.id)) err(id, '事件 id 重複');
      else if (eras.has(e.id)) warn(id, '事件 id 和分期 id 相同（可用，但建議改名以免混淆）');
      events.set(e.id, e);
      for (const k of ['name', 'time', 'line', 'era']) if (!e[k]) err(id, `事件缺少欄位 ${k}`);
      const era = eras.get(e.era);
      if (!era) err(id, `分期「${e.era}」不在 eras`);
      else if (era.line !== e.line) err(id, `事件屬於 ${e.line}，分期 ${e.era} 卻屬於 ${era.line}`);
      if (!Array.isArray(e.themes) || !e.themes.length) err(id, 'themes 不可為空');
      for (const t of e.themes || []) if (!THEMES.includes(t)) err(id, `主題「${t}」不在六大主題內`);
    }
    for (const e of hev.events || []) for (const r of e.related || []) if (!events.has(r)) err('history/' + e.id, `相關事件「${r}」不存在`);
    for (const rel of hman.cards || []) {
      const f = readJSON('history/' + rel);
      for (const [k, c] of Object.entries((f && f.cards) || {})) {
        if (!events.has(k)) err('history/' + rel, `館藏卡「${k}」不是 events.json 的事件`);
        if (!c.title || !c.text) err('history/' + rel, `館藏卡「${k}」缺 title 或 text`);
      }
    }
    // 歷史題目：欄位比照地理（不用 unit、region、concepts），另外必須標 theme、era、skill
    const skills = new Set(hev.skills || []);
    const kpf = readJSON('history/kp.json');
    const kps = new Set(((kpf && kpf.points) || []).map(p => p.id));
    const list = v => [].concat(v || []);
    let hn = 0;
    for (const rel of hman.questions || []) {
      const f = readJSON('history/' + rel);
      for (const q of (f && f.questions) || []) {
        hn++;
        const id = q.id || '(沒有 id)';
        if (!q.id) err('history/' + rel, '有題目沒有 id');
        if (seenId.has(q.id)) err(id, 'id 重複（地理、歷史題目 id 都不可重複）');
        seenId.add(q.id);
        for (const k of ['level', 'type', 'status', 'source', 'stem', 'theme', 'era', 'skill']) if (!list(q[k]).length) err(id, `缺少欄位 ${k}`);
        if (!String(q.source || '').trim()) err(id, 'source 未填寫');
        if (!STATUS.has(q.status)) err(id, `status 必須是 待審／確認／退回，目前是「${q.status}」`);
        if (!TYPES.has(q.type)) err(id, `未知題型 ${q.type}`);
        for (const t of list(q.theme)) if (!THEMES.includes(t)) err(id, `theme「${t}」不在六大主題內`);
        if (!eras.has(q.era)) err(id, `era「${q.era}」不在 events.json 的分期`);
        for (const s of list(q.skill)) if (!skills.has(s)) err(id, `skill「${s}」不在 events.json 的能力清單`);
        for (const e of q.eventIds || []) if (!events.has(e)) err(id, `事件「${e}」不在 events.json`);
        for (const k of q.kp || []) if (!kps.has(k)) err(id, `知識點「${k}」不在 kp.json`);
        checkFigure(id, q.figure);
        const key = (q.stem || '').replace(/\s/g, '') + JSON.stringify(q.figure || null) + JSON.stringify(q.parts ? q.parts.map(p => p.stem) : null);
        if (seenStem.has(key)) err(id, `與 ${seenStem.get(key)} 重複`);
        seenStem.set(key, id);
        checkBody(id, q);
      }
    }
    // 故事章節（docs/歷史故事指引.md）：結構問題是錯誤；字數、句數等風格問題是警告
    const OUTLINE = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T7b', 'T8', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'];
    const LINE_OF = { F: 'tw', T: 'ea', I: 'w' };
    const len = s => String(s || '').replace(/\s/g, '').length;
    const cardIds = new Set();
    for (const rel of hman.cards || []) { const f = readJSON('history/' + rel); for (const k of Object.keys((f && f.cards) || {})) cardIds.add(k); }
    const seenCh = new Set();
    let sn = 0, sq = 0;
    for (const rel of hman.stories || []) {
      const f = readJSON('history/' + rel);
      if (!f) continue;
      const fid = 'history/' + rel;
      if (!lineIds.has(f.line)) err(fid, `line「${f.line}」不是 tw／ea／w`);
      if (!Array.isArray(f.chapters)) { err(fid, '缺少 chapters 陣列'); continue; }
      for (const ch of f.chapters) {
        sn++;
        const id = 'story:' + (ch && ch.id || '(沒有 id)');
        if (!ch || !ch.id) { err(fid, '有章節沒有 id'); continue; }
        if (seenCh.has(ch.id)) err(id, '章節 id 重複');
        seenCh.add(ch.id);
        if (!OUTLINE.includes(ch.id)) err(id, `章節 id 不在故事大綱（${OUTLINE.join('、')}）`);
        else if (LINE_OF[ch.id[0]] !== f.line) err(id, `章節屬於 ${LINE_OF[ch.id[0]]} 線，卻寫在 line 為「${f.line}」的檔案`);
        for (const k of ['title', 'era', 'doc', 'opening', 'ending']) if (!String(ch[k] || '').trim()) err(id, `缺少欄位 ${k}`);
        if (ch.status != null && !STATUS.has(ch.status)) err(id, `status 必須是 待審／確認／退回，目前是「${ch.status}」`);
        if (ch.era && !eras.has(ch.era)) err(id, `era「${ch.era}」不在 events.json 的分期`);
        if (!Array.isArray(ch.eventIds) || !ch.eventIds.length) err(id, 'eventIds 不可為空');
        for (const e of ch.eventIds || []) if (!events.has(e)) err(id, `事件「${e}」不在 events.json`);
        for (const t of list(ch.themes)) if (!THEMES.includes(t)) err(id, `主題「${t}」不在六大主題內`);
        for (const s of list(ch.skills)) if (!skills.has(s)) err(id, `能力「${s}」不在 events.json 的能力清單`);
        if (!list(ch.themes).length || !list(ch.skills).length) warn(id, 'themes、skills 要標');
        for (const e of ch.unlock || []) {
          if (!events.has(e)) err(id, `解鎖的館藏卡「${e}」不在 events.json`);
          else if (!cardIds.has(e)) warn(id, `解鎖的事件「${e}」還沒有館藏卡內容`);
        }
        if (!Array.isArray(ch.unlock) || !ch.unlock.length) warn(id, 'unlock 沒填，會改用 eventIds');
        // 開場：250–600 字之外是錯誤，300–500 字之外是警告
        const ol = len(ch.opening);
        if (ch.opening && (ol < 250 || ol > 600)) err(id, `開場 ${ol} 字，必須在 250–600 字之間（建議 300–500）`);
        else if (ch.opening && (ol < 300 || ol > 500)) warn(id, `開場 ${ol} 字，建議 300–500 字`);
        if (ch.ending && (len(ch.ending) < 100 || len(ch.ending) > 250)) warn(id, `結尾 ${len(ch.ending)} 字，建議 100–250 字`);
        // 時代選擇
        const ec = ch.eraChoice;
        if (!ec || !Array.isArray(ec.options) || ec.options.length < 2) err(id, 'eraChoice 至少要 2 個選項');
        else {
          const right = ec.options.filter(o => o.correct === true);
          if (right.length !== 1) err(id, `eraChoice 必須剛好一個正確選項，目前 ${right.length} 個`);
          for (const o of ec.options) {
            if (!o.text || !o.feedback) err(id, 'eraChoice 每個選項都要有 text 和 feedback');
            if (o.era && !eras.has(o.era)) err(id, `eraChoice 選項的 era「${o.era}」不在分期`);
          }
          if (right.length === 1 && right[0].era && right[0].era !== ch.era) warn(id, `eraChoice 正解的 era（${right[0].era}）和章節 era（${ch.era}）不同`);
          const L = ec.options.map(o => len(o.text)), ri = ec.options.indexOf(right[0]);
          if (ri >= 0 && L[ri] > Math.max(...L.filter((_, i) => i !== ri)) * 1.3 && L.length > 1) warn(id, 'eraChoice 正解明顯比其他選項長');
        }
        // 場景與嵌入題（嵌入題比照題庫題目檢查；status 跟著章節，source 可省略）
        const sc = ch.scenes;
        if (!Array.isArray(sc) || sc.length < 2 || sc.length > 5) err(id, `scenes 必須 2–5 段，目前 ${Array.isArray(sc) ? sc.length : 0} 段`);
        else if (sc.length < 3 || sc.length > 4) warn(id, `scenes ${sc.length} 段，指引建議 3–4 段`);
        (Array.isArray(sc) ? sc : []).forEach((s, k) => {
          const sid = `${id}#場景${k + 1}`;
          if (!s || !String(s.text || '').trim()) err(sid, '缺少故事段落 text');
          else if (len(s.text) < 200 || len(s.text) > 400) warn(sid, `段落 ${len(s.text)} 字，建議 200–400 字`);
          const q = s && s.question;
          if (!q || typeof q !== 'object') { err(sid, '每段都要有嵌入題 question'); return; }
          sq++;
          const qid = q.id || sid;
          if (!q.id) err(sid, '嵌入題沒有 id');
          else if (q.id !== `s-${ch.id}-${k + 1}`) warn(qid, `嵌入題 id 建議用 s-${ch.id}-${k + 1}`);
          if (q.id && seenId.has(q.id)) err(qid, 'id 重複（地理、歷史題目與故事嵌入題的 id 都不可重複）');
          if (q.id) seenId.add(q.id);
          for (const k2 of ['type', 'stem', 'theme', 'era', 'skill']) if (!list(q[k2]).length) err(qid, `缺少欄位 ${k2}`);
          if (!TYPES.has(q.type)) err(qid, `未知題型 ${q.type}`);
          if (q.type === 'click' || q.figure) err(qid, '嵌入題不要用圖上點選或圖表');
          if (q.status && !STATUS.has(q.status)) err(qid, `status 必須是 待審／確認／退回`);
          for (const t of list(q.theme)) if (!THEMES.includes(t)) err(qid, `theme「${t}」不在六大主題內`);
          if (q.era && !eras.has(q.era)) err(qid, `era「${q.era}」不在 events.json 的分期`);
          if (q.level && q.level !== q.era) warn(qid, `level（${q.level}）應等於 era（${q.era}）`);
          for (const s2 of list(q.skill)) if (!skills.has(s2)) err(qid, `skill「${s2}」不在 events.json 的能力清單`);
          if (!Array.isArray(q.eventIds) || !q.eventIds.length) warn(qid, 'eventIds 沒填，錯題回收會改用分期');
          for (const e of q.eventIds || []) if (!events.has(e)) err(qid, `事件「${e}」不在 events.json`);
          for (const k2 of q.kp || []) if (!kps.has(k2)) err(qid, `知識點「${k2}」不在 kp.json`);
          if (!q.kp) warn(qid, '沒有標 kp（會考知識點）');
          const key = (q.stem || '').replace(/\s/g, '') + JSON.stringify(q.figure || null) + JSON.stringify(q.parts ? q.parts.map(p => p.stem) : null);
          if (seenStem.has(key)) err(qid, `題幹與 ${seenStem.get(key)} 一字不差`);
          seenStem.set(key, qid);
          checkBody(qid, q);
        });
        // 時代錯置偵探
        const dt = ch.detective;
        if (!dt || !Array.isArray(dt.sentences) || !dt.sentences.length) err(id, '缺少 detective.sentences');
        else {
          const n = dt.sentences.length, w = dt.wrong;
          if (n < 6 || n > 10) warn(id, `detective ${n} 句，指引建議 6–10 句`);
          if (!Array.isArray(w) || !w.length) err(id, 'detective.wrong 不可為空');
          else {
            if (w.length < 2 || w.length > 3) warn(id, `detective 有 ${w.length} 處錯置，指引建議 2–3 處`);
            if (new Set(w).size !== w.length) err(id, 'detective.wrong 有重複');
            for (const i of w) {
              if (!Number.isInteger(i) || i < 0 || i >= n) err(id, `detective.wrong 的 ${i} 超出句子範圍 0～${n - 1}`);
              else if (!String((dt.explain || {})[i] || '').trim()) err(id, `detective 第 ${i} 句（從 0 起算）缺少 explain`);
            }
          }
          for (const k of Object.keys(dt.explain || {})) if (!(w || []).includes(+k)) warn(id, `detective.explain 的 ${k} 不在 wrong 裡`);
        }
        // 虛構與史實
        const ff = ch.factFiction;
        if (!Array.isArray(ff) || !ff.length) err(id, '缺少 factFiction');
        else {
          if (!ff.some(x => x.fact === true) || !ff.some(x => x.fact === false)) err(id, 'factFiction 史實（fact: true）和虛構（fact: false）都要有');
          for (const x of ff) {
            if (!x.text || typeof x.fact !== 'boolean') err(id, 'factFiction 每條都要有 text，fact 必須是 true／false');
            if (!x.note) warn(id, `factFiction「${x.text}」缺少 note`);
          }
          if (ff.length < 4 || ff.length > 6) warn(id, `factFiction ${ff.length} 條，指引建議 4–6 條`);
        }
      }
    }
    const missingCh = OUTLINE.filter(c => !seenCh.has(c));
    console.log(`歷史：${eras.size} 個分期、${events.size} 件事件、${hn} 題；故事 ${sn} 章（嵌入題 ${sq} 題）${missingCh.length ? `，尚未寫：${missingCh.join('、')}` : ''}`);
  }

  validateExam();
  validateCivics();
  return report(all);
}

// ---------- 會考真題：data/exam/（格式見 docs/會考真題檢測設計.md「資料格式」） ----------
// 結構問題是錯誤；缺解析是警告。manifest 列出但還沒寫好的年度檔只警告、略過（子代理還在寫）。
function validateExam() {
  const mp = path.join(DATA, 'exam/manifest.json');
  if (!fs.existsSync(mp)) { warn('exam', '沒有 data/exam/manifest.json，略過會考真題檢查'); return; }
  const man = readJSON('exam/manifest.json');
  if (!man) return;
  if (!Array.isArray(man.files)) { err('exam/manifest', 'files 必須是陣列'); return; }
  const concepts = readJSON('concepts.json'), units = readJSON('units.json');
  const hman = readJSON('history/manifest.json');
  const hev = hman && readJSON('history/' + hman.events), kpf = readJSON('history/kp.json');
  const conceptIds = new Set((concepts ? concepts.units : []).flatMap(u => u.concepts.map(c => c.id)));
  const scopes = new Set((units ? units.units : []).map(u => u.id));
  const eras = new Set(((hev && hev.eras) || []).map(e => e.id)), events = new Set(((hev && hev.events) || []).map(e => e.id));
  const kps = new Set(((kpf && kpf.points) || []).map(p => p.id));
  const GEO_SK = new Set(['讀圖', '計算', '原理應用', '區域比較', '跨科整合']);
  const HIST_SK = new Set(['時序', '因果', '比較', '變遷與延續', '史料判讀', '歷史解釋']);
  const CIV_SK = new Set(['概念辨析', '規範判斷', '經濟推理', '圖表判讀', '觀點評估']);
  const cfp = path.join(DATA, 'civics/concepts.json');
  const civ = fs.existsSync(cfp) ? JSON.parse(fs.readFileSync(cfp, 'utf8')) : { units: [] };
  const civUnits = new Map(civ.units.map(u => [u.id, u])), civConcepts = new Set(civ.units.flatMap(u => (u.concepts || []).map(c => c.id)));
  const pfp = path.join(DATA, 'civics/pairs.json');
  const civPairs = new Set(fs.existsSync(pfp) ? JSON.parse(fs.readFileSync(pfp, 'utf8')).pairs.map(p => p.id) : []);
  let civN = 0;
  const list = v => Array.isArray(v) ? v : v == null ? [] : [v];
  const imgOk = p => typeof p === 'string' && /^assets\/exam\//.test(p) && fs.existsSync(path.join(ROOT, p));
  const seen = new Set(), seenGroup = new Set();
  let n = 0, geo = 0, hist = 0, years = [];
  for (const rel of man.files) {
    const fp = path.join(DATA, 'exam', rel);
    if (!fs.existsSync(fp)) { warn('exam/' + rel, '列在 manifest 但檔案還不存在，先略過'); continue; }
    let f;
    try { f = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { err('exam/' + rel, `不是合法的 JSON：${e.message}`); continue; }
    const fid = 'exam/' + rel;
    if (!Number.isInteger(f.year)) err(fid, 'year 必須是整數年份');
    if (!f.source) err(fid, '缺少 source（出處）');
    if (!Array.isArray(f.items)) { err(fid, 'items 必須是陣列'); continue; }
    years.push(f.year);
    const groups = new Map();
    for (const g of list(f.groups)) {
      const gid = g && g.id ? g.id : fid + '#group';
      if (!g || !g.id) { err(fid, '題組沒有 id'); continue; }
      // 同一題組含不同科的小題：公民檔可以沿用史地檔的題組 id（網站會合併），但不可和題目 id 撞
      if (seen.has(g.id) && !seenGroup.has(g.id)) err(gid, 'id 重複');
      else if (groups.has(g.id)) err(gid, '同一個檔案裡題組 id 重複');
      seen.add(g.id); seenGroup.add(g.id); groups.set(g.id, g);
      if (!imgOk(g.img)) err(gid, `題組圖片不存在：${g.img}`);
      if (!Array.isArray(g.range) || g.range.length !== 2 || !(g.range[0] <= g.range[1])) err(gid, 'range 必須是 [起題號, 迄題號]');
      if (!g.text) warn(gid, '題組沒有 text（搜尋與無障礙用）');
    }
    const used = new Set(), nos = new Set();
    for (const it of f.items) {
      const id = it && it.id ? it.id : fid + '#item';
      if (!it || !it.id) { err(fid, '有題目沒有 id'); continue; }
      if (seen.has(it.id)) err(id, 'id 重複');
      seen.add(it.id); n++;
      if (it.year !== f.year) err(id, `year ${it.year} 和檔案的 ${f.year} 不一致`);
      if (!Number.isInteger(it.no) || it.no < 1 || it.no > 80) err(id, `題號 no 不合理：${it.no}`);
      else if (nos.has(it.no)) err(id, `題號 ${it.no} 重複`);
      nos.add(it.no);
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > 3) err(id, `answer 必須是 0–3，目前是 ${it.answer}`);
      if (!imgOk(it.img)) err(id, `題目圖片不存在：${it.img}`);
      if (it.status && !STATUS_X.has(it.status)) err(id, `status 必須是 待審／確認／退回`);
      if (it.group != null) {
        const g = groups.get(it.group);
        if (!g) err(id, `題組「${it.group}」不在這個檔案的 groups`);
        else { used.add(it.group); if (Array.isArray(g.range) && (it.no < g.range[0] || it.no > g.range[1])) err(id, `題號 ${it.no} 不在題組 ${it.group} 的範圍 ${g.range.join('–')}`); }
      }
      const sk = list(it.skill);
      if (!sk.length) err(id, 'skill 不可為空');
      if (!it.text) warn(id, '沒有 text（搜尋與無障礙用）');
      if (!String(it.explain || '').trim()) warn(id, '還沒有解析 explain');
      for (const a of list(it.also)) if (!['geo', 'hist', 'civ'].includes(a)) err(id, `also 只能是 geo／hist／civ：${a}`);
      if (it.subject === 'geo') {
        geo++;
        if (!list(it.concepts).length) err(id, '地理題 concepts 不可為空');
        for (const c of list(it.concepts)) if (!conceptIds.has(c)) err(id, `概念「${c}」不在 concepts.json`);
        if (it.scope && !scopes.has(it.scope)) err(id, `scope「${it.scope}」不是 units.json 的單元或區域 id`);
        if (!it.scope) warn(id, '地理題沒有 scope');
        for (const s of sk) if (!GEO_SK.has(s)) err(id, `地理 skill「${s}」不在五種能力內`);
      } else if (it.subject === 'hist') {
        hist++;
        if (!list(it.kp).length) err(id, '歷史題 kp 不可為空');
        for (const k of list(it.kp)) if (!kps.has(k)) err(id, `知識點「${k}」不在 history/kp.json`);
        if (it.era && !eras.has(it.era)) err(id, `era「${it.era}」不在 events.json 的分期`);
        if (!it.era) warn(id, '歷史題沒有 era');
        for (const e of list(it.eventIds)) if (!events.has(e)) err(id, `事件「${e}」不在 events.json`);
        for (const s of sk) if (!HIST_SK.has(s)) err(id, `歷史 skill「${s}」不在六種能力內`);
      } else if (it.subject === 'civ') {
        // 公民題：依公民的分類（領域、冊、單元、概念、能力）檢查
        civN++;
        if (!['社會', '政治', '法律', '經濟', '全球關聯'].includes(it.domain)) err(id, `公民題 domain「${it.domain}」不是五個領域之一`);
        if (!Number.isInteger(it.book) || it.book < 1 || it.book > 6) err(id, `公民題 book 必須是 1–6，目前是 ${it.book}`);
        if (!civUnits.has(it.unit)) err(id, `公民題 unit「${it.unit}」不在 civics/concepts.json`);
        else { const u = civUnits.get(it.unit); if (u.book !== it.book) warn(id, `book ${it.book} 和單元 ${it.unit} 的冊次 ${u.book} 不一致`); }
        // 對不到課本概念的真題先不標（之後補概念），只提醒
        if (!list(it.concepts).length) warn(id, '公民題還沒有對應的概念（concepts 是空的）');
        for (const c of list(it.concepts)) if (!civConcepts.has(c)) err(id, `概念「${c}」不在 civics/concepts.json`);
        if (it.confusablePair && !civPairs.has(it.confusablePair)) err(id, `confusablePair「${it.confusablePair}」不在 civics/pairs.json`);
        for (const s of sk) if (!CIV_SK.has(s)) err(id, `公民 skill「${s}」不在五種能力內`);
      } else err(id, `subject 只能是 geo、hist 或 civ，目前是「${it.subject}」`);
    }
    for (const gid of groups.keys()) if (!used.has(gid)) warn(gid, '題組沒有任何小題引用');
  }
  console.log(`會考真題：${[...new Set(years)].sort().join('、') || '（無）'} 年，共 ${n} 題（地理 ${geo}、歷史 ${hist}、公民 ${civN}）`);
}
const STATUS_X = new Set(['待審', '確認', '退回']);

// ---------- 公民：data/civics/（需求 §十二，依家長 115/10/29 決定調整） ----------
// 結構問題（缺標籤、id 不存在、法條格式、案件卡不完整、計算題算錯）是錯誤；風格（字數、迷思說話者集中、選項長度）是警告。
// manifest 列出但還沒寫好的檔案只警告、略過（寫手還在寫）。
const CIV_DOMAINS = ['社會', '政治', '法律', '經濟', '全球關聯'];
const CIV_SKILLS = new Set(['概念辨析', '規範判斷', '經濟推理', '圖表判讀', '觀點評估']);
// 條號：第12條、第12條之1、第153條第1項、第184條第1項第2款
const ARTICLE = /^第\d+條(之\d+)?(第\d+項)?(第\d+款)?$/;
// 「第1003-1條」是常見的簡寫，網站照樣顯示；檢查時只提醒改成「第1003條之1」
const ARTICLE_DASH = /^第\d+-\d+條(第\d+項)?(第\d+款)?$/;
const civRefDash = r => ARTICLE_DASH.test(typeof r === 'string' ? (r.match(/第.*$/) || [''])[0] : String((r && r.article) || '').trim());
function civRefOk(r) {
  if (civRefDash(r)) return true;
  if (typeof r === 'string') { const m = r.match(/^(.+?)(第\d+條.*)$/); return !!(m && m[1].trim() && ARTICLE.test(m[2])); }
  return !!(r && r.law && typeof r.article === 'string' && ARTICLE.test(r.article.trim()));
}
// 計算題的算式：「(500-300)×2」「機會成本＝300×2＝600」→ 取第一段能算的式子
function evalFormula(f) {
  const segs = String(f).replace(/[×xX＊]/g, '*').replace(/[÷／]/g, '/').replace(/[－−–]/g, '-').replace(/＋/g, '+').replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/,/g, '').split(/[=＝]/);
  for (const seg of segs) {
    const ex = seg.replace(/[^\d+\-*/().\s]/g, '').trim();
    if (!/[+\-*/]/.test(ex) || !/\d/.test(ex) || /^[+*/]|[+\-*/]$/.test(ex)) continue;
    try { const v = Function('"use strict";return (' + ex + ')')(); if (typeof v === 'number' && isFinite(v)) return v; } catch (e) { /* 換下一段 */ }
  }
  return null;
}
const numIn = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

function validateCivics() {
  const mp = path.join(DATA, 'civics/manifest.json');
  if (!fs.existsSync(mp)) { warn('civics', '沒有 data/civics/manifest.json，略過公民檢查'); return; }
  const man = readJSON('civics/manifest.json');
  if (!man) return;
  const soft = rel => { const p = path.join(DATA, 'civics', rel); if (!fs.existsSync(p)) { warn('civics/' + rel, '列在 manifest 但檔案還不存在，先略過'); return null; } return readJSON('civics/' + rel); };
  const cf = readJSON('civics/' + (man.concepts || 'concepts.json')), pf = readJSON('civics/' + (man.pairs || 'pairs.json')), chf = readJSON('civics/' + (man.characters || 'characters.json'));
  if (!cf || !pf || !chf) return;
  const units = new Map(cf.units.map(u => [u.id, u]));
  const concepts = new Map(cf.units.flatMap(u => (u.concepts || []).map(c => [c.id, u])));
  const pairs = new Map(pf.pairs.map(p => [p.id, p]));
  const chars = new Set(chf.characters.map(c => c.id));
  for (const p of pf.pairs) for (const c of p.concepts) if (!concepts.has(c)) err('civics/pairs', `混淆對 ${p.id} 的概念「${c}」不在 concepts.json`);
  const list = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
  const STATUS = new Set(['待審', '確認', '退回']);
  const seen = new Set();
  const len = s => String(Array.isArray(s) ? s.join('') : s || '').replace(/\s/g, '').length;
  const dashWarned = new Set();
  const dashCheck = (id, refs) => { for (const r of refs) if (civRefDash(r)) { const t = typeof r === 'string' ? r : r.law + r.article; if (!dashWarned.has(id + t)) { dashWarned.add(id + t); warn(id, `條號「${t}」建議寫成「第○條之○」`); } } };

  // 概念卡
  const cardIds = new Set();
  for (const rel of man.cards || []) {
    const f = soft(rel); if (!f) continue;
    for (const [k, c] of Object.entries(f.cards || {})) {
      if (!concepts.has(k)) err('civics/' + rel, `概念卡「${k}」不在 concepts.json`);
      if (!c || !c.text) err('civics/' + rel, `概念卡「${k}」沒有 text`);
      cardIds.add(k);
    }
  }

  // 一題的標籤（題庫題、魔王題組、故事嵌入題共用）
  function checkTags(id, q, opt) {
    opt = opt || {};
    if (!CIV_DOMAINS.includes(q.domain)) err(id, `domain「${q.domain}」不是五個領域之一`);
    if (!Number.isInteger(q.book) || q.book < 1 || q.book > 6) err(id, `book 必須是 1–6，目前是 ${q.book}`);
    if (!q.unit && !opt.boss) err(id, '缺少 unit');
    if (q.unit && !units.has(q.unit)) err(id, `unit「${q.unit}」不在 concepts.json`);
    else if (q.unit && units.get(q.unit).book !== q.book && !opt.boss) err(id, `book ${q.book} 和單元 ${q.unit} 的冊次 ${units.get(q.unit).book} 不一致`);
    if (!list(q.concepts).length) err(id, 'concepts 不可為空');
    for (const c of list(q.concepts)) if (!concepts.has(c)) err(id, `概念「${c}」不在 concepts.json`);
    if (!list(q.skill).length) err(id, '缺少 skill');
    for (const s of list(q.skill)) if (!CIV_SKILLS.has(s)) err(id, `skill「${s}」不在五種能力內`);
    if (q.confusablePair && !pairs.has(q.confusablePair)) err(id, `confusablePair「${q.confusablePair}」不在 pairs.json`);
    for (const [k, v] of Object.entries(q.optionPairs || {})) {
      if (v && !pairs.has(v)) err(id, `optionPairs 的「${v}」不在 pairs.json`);
      if (!Array.isArray(q.options) || !(+k >= 0 && +k < q.options.length)) err(id, `optionPairs 的選項 ${k} 超出範圍`);
    }
    for (const c of q.optionConcepts || []) if (c && !concepts.has(c)) err(id, `optionConcepts 的「${c}」不在 concepts.json`);
    if (q.status != null && !STATUS.has(q.status)) err(id, 'status 必須是 待審／確認／退回');
    // 法律題要有法條（條號格式要對）；其他領域有寫 legalRefs 也要格式正確
    const refs = list(q.legalRefs);
    if (q.domain === '法律' && !refs.length && !opt.noRefs) err(id, '法律題要有 legalRefs（法規名稱與條號，例如「民法第12條」）');
    for (const r of refs) if (!civRefOk(r)) err(id, `legalRefs 條號格式不對：${JSON.stringify(r)}（例：民法第12條、民法第153條第1項）`);
    dashCheck(id, refs);
    // 第六冊國際組織：家長決定依課本，查核日期只提醒
    if (q.book === 6 && q.unit === 'c6-4' && !q.checkedAt) warn(id, '第六冊國際組織題建議填 checkedAt（查核日期）');
    // 全球議題的數據：要有來源與年份（課本出處也可以）
    if (q.domain === '全球關聯' && /\d+(\.\d+)?\s*(%|％|億|萬人|萬噸|公噸|℃)/.test(JSON.stringify([q.stem || '', q.options || []])) && !/\d{3,4}/.test(String(q.source || '') + String(q.dataSource || '')))
      warn(id, '全球議題數據題要在 source 註明來源與年份（例：康軒國中公民 3下 第3課，或聯合國 2023）');
  }
  function checkChoiceQ(id, q) {
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length < 2) { err(id, '選項至少要 2 個'); return; }
    const texts = opts.map(o => typeof o === 'string' ? o : (o && o.text) || '');
    let ans = q.answer;
    if (!Number.isInteger(ans)) ans = opts.findIndex(o => o && o.correct === true);
    if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) err(id, `答案 ${q.answer} 不在選項範圍`);
    if (new Set(texts).size !== texts.length) err(id, '選項有重複');
    if (!q.explain) err(id, '缺少解析 explain');
    const L = texts.map(t => t.length);
    if (ans >= 0 && L.every(v => v > 0)) { const o = Math.max(...L.filter((_, i) => i !== ans)); if (L[ans] > o * 1.3 && L[ans] - o >= 4) warn(id, `正解（${L[ans]} 字）明顯比其他選項長（最長 ${o} 字）`); }
  }
  function checkBody(id, q) {
    const t = String(q.type || '');
    if (Array.isArray(q.parts)) {
      if (q.parts.length < 2) err(id, '有小題的題目至少要 2 小題');
      q.parts.forEach((p, k) => {
        const pid = `${id}#${k + 1}`;
        checkChoiceQ(pid, p);
        for (const c of list(p.concepts)) if (!concepts.has(c)) err(pid, `概念「${c}」不在 concepts.json`);
        if (p.confusablePair && !pairs.has(p.confusablePair)) err(pid, `confusablePair「${p.confusablePair}」不在 pairs.json`);
        for (const r of list(p.legalRefs)) if (!civRefOk(r)) err(pid, `legalRefs 條號格式不對：${JSON.stringify(r)}`);
        if (p.formula) checkCalc(pid, p);
      });
      return;
    }
    if (t === 'order' || (Array.isArray(q.items) && Array.isArray(q.answer))) {
      const n = (q.items || []).length, ok = Array.isArray(q.answer) && q.answer.length === n && [...q.answer].sort((a, b) => a - b).every((v, i) => v === i);
      if (n < 2 || !ok) err(id, '排序題的答案必須是 items 的完整排列');
      if (!q.explain) err(id, '缺少解析 explain');
      return;
    }
    if (t === 'match') {
      const ok = Array.isArray(q.answer) && q.answer.length === (q.left || []).length && q.answer.every(v => Number.isInteger(v) && v >= 0 && v < (q.right || []).length);
      if (!ok) err(id, '配對題的答案必須讓每個左項對到右項');
      if (!q.explain) err(id, '缺少解析 explain');
      return;
    }
    const calc = /calc|計算/.test(t);
    if (calc && !Array.isArray(q.options)) { if (numIn(q.answer) == null) err(id, '計算題（填答）的 answer 必須是數字'); if (!q.explain) err(id, '缺少解析 explain'); }
    else if (/price|direction|價格/.test(t) && !Array.isArray(q.options)) { if (!(q.targets || q.ask || q.directions || q.rows || (q.answer && typeof q.answer === 'object'))) err(id, '價格與數量判斷題要有 targets（項目與方向）或選項'); }
    else checkChoiceQ(id, q);
    if (calc || q.formula) checkCalc(id, q);
  }
  // 計算題：情境數值要由程式驗算（formula 算出來的數要等於正解裡的數）
  function checkCalc(id, q) {
    if (!q.formula) { if (/情境數值/.test(JSON.stringify(q))) warn(id, '標示情境數值的計算題沒有 formula，無法自動驗算'); return; }
    const v = evalFormula(q.formula);
    const o = Array.isArray(q.options) ? q.options[q.answer] : null;
    const ans = Array.isArray(q.options) ? numIn(typeof o === 'string' ? o : (o || {}).text) : numIn(q.answer);
    if (v == null) warn(id, `formula「${q.formula}」算不出來，無法自動驗算`);
    else if (ans == null) warn(id, '正解裡找不到數字，無法自動驗算');
    else if (Math.abs(v - ans) > (q.tolerance || 0) + 1e-6) err(id, `自動驗算失敗：formula「${q.formula}」＝${v}，正解卻是 ${ans}`);
  }

  // 題庫、魔王題組、案件
  let nq = 0, nb = 0, nc = 0;
  const byConcept = {}, pairItems = {};
  for (const rel of man.questions || []) {
    const f = soft(rel); if (!f) continue;
    const fid = 'civics/' + rel;
    if (/cases\.json$/.test(rel)) {
      for (const c of f.cases || f.questions || []) {
        const id = c && c.id ? c.id : fid + '#case';
        if (!c || !c.id) { err(fid, '有案件沒有 id'); continue; }
        if (seen.has(c.id)) err(id, 'id 重複'); seen.add(c.id); nc++;
        if (!(c.text || c.situation || c.scenario || c.stem)) err(id, '案件缺情境文字');
        let kraw = c.eventType || c.caseType || c.kind || c.category || [];
        if (kraw && typeof kraw === 'object' && !Array.isArray(kraw)) kraw = kraw.answer != null ? kraw.answer : [];
        const kind = [].concat(kraw).map(k => String(k).replace(/事件|案件/g, ''));
        if (!kind.length || !kind.every(k => ['民事', '刑事', '行政'].includes(k))) err(id, `事件類型必須是 民事／刑事／行政：${JSON.stringify(c.eventType || c.caseType || c.kind)}`);
        const r = c.remedy && typeof c.remedy === 'object' && !Array.isArray(c.remedy) ? c.remedy : null;
        const opts = (r && r.options) || c.remedyOptions || c.options;
        let ans = r ? (r.answer != null ? r.answer : r.correct) : (c.remedyAnswer != null ? c.remedyAnswer : c.answer);
        if (typeof ans === 'string' && Array.isArray(opts)) ans = opts.indexOf(ans);
        if (!Array.isArray(opts) || opts.length < 2) err(id, '救濟途徑至少要 2 個選項');
        else if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) err(id, '救濟途徑的正解不在選項範圍');
        if (!(c.explain || c.explanation)) err(id, '缺少解析');
        if (!list(c.legalRefs).length) err(id, '案件要有 legalRefs');
        for (const x of list(c.legalRefs)) if (!civRefOk(x)) err(id, `legalRefs 條號格式不對：${JSON.stringify(x)}`);
        for (const k of list(c.concepts)) if (!concepts.has(k)) err(id, `概念「${k}」不在 concepts.json`);
      }
      continue;
    }
    const boss = /boss[^/]*\.json$/.test(rel);
    for (const q of f.questions || []) {
      const id = q && q.id ? q.id : fid + '#q';
      if (!q || !q.id) { err(fid, '有題目沒有 id'); continue; }
      if (seen.has(q.id)) err(id, 'id 重複'); seen.add(q.id);
      if (boss) nb++; else nq++;
      if (!q.stem && !q.question) err(id, '缺少題幹 stem');
      if (!boss && f.book != null && q.book !== f.book) err(id, `book ${q.book} 和檔案的第 ${f.book} 冊不一致`);
      // 魔王題組的法條可以寫在小題裡
      checkTags(id, q, { boss, noRefs: boss && Array.isArray(q.parts) && q.parts.some(p => list(p.legalRefs).length) });
      if (boss && !Array.isArray(q.parts)) warn(id, '魔王題組通常要有 parts（一個情境連問）');
      checkBody(id, q);
      if (!boss) for (const c of list(q.concepts)) (byConcept[c] = byConcept[c] || []).push(q.id);
      if (Array.isArray(q.parts)) { if (q.confusablePair) pairItems[q.confusablePair] = 1; for (const p of q.parts) if (p.confusablePair) pairItems[p.confusablePair] = 1; }
    }
  }

  // 故事
  const speakers = {};
  let ns = 0;
  for (const rel of man.stories || []) {
    const f = soft(rel); if (!f) continue;
    const ch = f.chapter || f;
    const id = 'cstory:' + (ch.id || rel);
    if (!ch.id) { err('civics/' + rel, '章節沒有 id'); continue; }
    if (seen.has(id)) err(id, '章節 id 重複'); seen.add(id); ns++;
    const dk = { 社會: 'society', 政治: 'politics', 法律: 'law', 經濟: 'economy', 全球關聯: 'global' }[ch.domain];
    if (dk && !rel.startsWith(`stories/${dk}/`)) warn(id, `${ch.domain}的章節建議放在 stories/${dk}/`);
    if (!ch.title) err(id, '缺少 title');
    checkTags(id, Object.assign({}, ch, { skill: ch.skills || ch.skill, legalRefs: [] }), { noRefs: true });
    if (!list(ch.skills).length) err(id, '缺少 skills');
    for (const c of list(ch.characters)) if (!chars.has(c)) err(id, `角色「${c}」不在 characters.json`);
    if (!list(ch.characters).length) err(id, 'characters 不可為空');
    const pl = len(ch.paragraphs);
    if (!pl) err(id, '缺少開場 paragraphs');
    else if (pl < 250 || pl > 500) warn(id, `開場 ${pl} 字，需求建議 300–400 字`);
    // 判斷點
    const js = list(ch.judgment || ch.judgments);
    if (!js.length) err(id, '缺少判斷點 judgment');
    js.forEach((j, k) => {
      const jid = `${id}#判斷點${k + 1}`;
      if (!j.prompt) err(jid, '缺少 prompt');
      const opts = j.options || [];
      const right = opts.filter((o, i) => (o && o.correct === true) || i === j.answer).length;
      if (opts.length < 2 || right !== 1) err(jid, `判斷點要 2 個以上選項、剛好一個正確（目前 ${right} 個）`);
      if (!j.explain) err(jid, '判斷點缺少解析 explain');
      for (const r of list(j.legalRefs)) if (!civRefOk(r)) err(jid, `legalRefs 條號格式不對：${JSON.stringify(r)}`);
      if (j.confusablePair && !pairs.has(j.confusablePair)) err(jid, `confusablePair「${j.confusablePair}」不在 pairs.json`);
    });
    // 嵌入題（{lead, question, after}）
    const qs = list(ch.questions);
    if (!qs.length) err(id, '缺少嵌入題 questions');
    else if (qs.length < 2 || qs.length > 4) warn(id, `嵌入題 ${qs.length} 題，指引建議 2–4 題`);
    qs.forEach((s, k) => {
      const q = s && s.question && typeof s.question === 'object' ? s.question : s;
      const qid = q && q.id ? q.id : `${id}#嵌入題${k + 1}`;
      if (!q) { err(qid, '嵌入題是空的'); return; }
      if (q.id) { if (seen.has(q.id)) err(qid, 'id 重複'); seen.add(q.id); } else err(qid, '嵌入題沒有 id');
      const full = Object.assign({ domain: ch.domain, book: ch.book, unit: ch.unit, concepts: ch.concepts, skill: list(ch.skills)[0] }, q);
      checkTags(qid, full, { noRefs: true });
      checkBody(qid, full);
      if (Array.isArray(q.parts)) { if (q.confusablePair) pairItems[q.confusablePair] = 1; }
    });
    // 迷思糾錯
    const m = ch.misconception;
    if (!m) err(id, '缺少 misconception');
    else {
      const sp = m.speaker || m.character;
      if (!sp) err(id, 'misconception 缺說話角色 speaker');
      else if (!chars.has(sp)) err(id, `misconception 的說話角色「${sp}」不在 characters.json`);
      else speakers[sp] = (speakers[sp] || 0) + 1;
      if (!(m.quote || m.statement || m.text)) err(id, 'misconception 缺迷思句 quote');
      if (!(m.correction || m.correct)) err(id, 'misconception 缺正確說法 correction');
      if (!m.basis) err(id, 'misconception 缺依據 basis');
      if (Array.isArray(m.options) && !(Number.isInteger(m.answer) && m.answer >= 0 && m.answer < m.options.length)) err(id, 'misconception 的 answer 不在選項範圍');
      if (m.confusablePair && !pairs.has(m.confusablePair)) err(id, `misconception 的 confusablePair「${m.confusablePair}」不在 pairs.json`);
      for (const c of list(m.concepts)) if (!concepts.has(c)) err(id, `misconception 的概念「${c}」不在 concepts.json`);
    }
    if (!list(ch.fictionNotes).length) err(id, '缺少 fictionNotes（虛構與真實說明）');
    // 法條與案件卡
    const refs = list(ch.legalRefs);
    for (const r of refs) if (!civRefOk(r)) err(id, `legalRefs 條號格式不對：${JSON.stringify(r)}（例：民法第12條）`);
    dashCheck(id, refs);
    if (ch.domain === '法律') {
      if (!refs.length) err(id, '法律單元故事要有 legalRefs');
      const cc = ch.caseCard;
      if (!cc) err(id, '法律單元故事要有 caseCard');
      else for (const [k, n] of [['eventType', '事件類型'], ['authority', '主管機關'], ['procedure', '程序'], ['remedy', '救濟途徑'], ['outcome', '可能結果']]) if (!list(cc[k]).length) err(id, `caseCard 缺「${n}」（${k}）`);
    }
    if (!ch.comparison && !refs.length) warn(id, '沒有制度對照（comparison）也沒有 legalRefs');
  }
  // 每組混淆對至少一題並排辨析（有小題、標了 confusablePair）；題庫還沒寫時不檢查
  if (nq) for (const p of pf.pairs) if (!pairItems[p.id]) warn('civics/pairs', `混淆對 ${p.id}（${p.labels.join('／')}）還沒有並排辨析題（網站會改用兩題同對的選擇題並排）`);
  for (const [c, ids] of Object.entries(byConcept)) { if (ids.length < 2) warn(c, `公民概念只有 ${ids.length} 題，錯題回收時沒有題目可替換`); }
  // 迷思句說話者：同一人超過 25% 的章節要警示
  const tot = Object.values(speakers).reduce((a, b) => a + b, 0);
  if (tot >= 4) for (const [k, v] of Object.entries(speakers)) if (v / tot > 0.25) warn('civics/stories', `迷思句說話者過度集中：${k} 說了 ${v} / ${tot} 章（超過 25%）`);
  console.log(`公民：${units.size} 個單元、${concepts.size} 個概念、${pairs.size} 組混淆對；題目 ${nq} 題、魔王題組 ${nb} 組、案件 ${nc} 件、故事 ${ns} 章、概念卡 ${cardIds.size} 張`);
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
