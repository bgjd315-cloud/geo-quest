// 會考真題資料：data/exam/manifest.json 列出的年度檔 → window.XData。
// 列出但還沒寫好（讀不到）的年度檔會略過並在主控台警告，不影響其他功能。
// 也載入 data/history/kp.json（歷史會考知識點），並統計每個知識點 5 年出現幾次。
(function () {
  const XData = { years: [], items: [], byId: {}, groups: {}, kp: {}, kpList: [], appear: {}, appearYear: {}, missing: [], error: null };
  const GEO_SKILLS = ['讀圖', '計算', '原理應用', '區域比較', '跨科整合'];
  const HIST_SKILLS = ['時序', '因果', '比較', '變遷與延續', '史料判讀', '歷史解釋'];
  XData.GEO_SKILLS = GEO_SKILLS; XData.HIST_SKILLS = HIST_SKILLS;
  const list = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];

  XData.load = async function () {
    const get = window.Loader.get;
    const kpf = await get('history/kp.json').catch(e => { console.warn('讀不到 history/kp.json', e); return { points: [] }; });
    XData.kpList = kpf.points || [];
    XData.kp = Object.fromEntries(XData.kpList.map(p => [p.id, p]));
    let man;
    try { man = await get('exam/manifest.json'); } catch (e) { XData.error = e.message; console.warn('讀不到 exam/manifest.json', e); return XData; }
    const files = await Promise.all((man.files || []).map(p => get('exam/' + p).then(f => ({ p, f })).catch(e => { console.warn(`會考真題檔還沒準備好，先略過：exam/${p}`); XData.missing.push(p); return null; })));
    XData.items = []; XData.groups = {}; XData.years = [];
    for (const r of files) {
      if (!r || !r.f || !Array.isArray(r.f.items)) continue;
      const y = r.f.year;
      XData.years.push(y);
      for (const g of r.f.groups || []) XData.groups[g.id] = g;
      for (const raw of r.f.items) {
        if (!raw || !raw.id || XData.byId[raw.id] || raw.status === '退回') continue;
        const it = Object.assign({}, raw, { year: raw.year || y, skill: list(raw.skill), concepts: list(raw.concepts), kp: list(raw.kp), eventIds: list(raw.eventIds) });
        XData.items.push(it);
        XData.byId[it.id] = it;
      }
    }
    XData.years.sort((a, b) => a - b);
    XData.items.sort((a, b) => a.year - b.year || a.no - b.no);
    // 出現次數：每題每個知識點算一次；鍵是 geo:<概念id> 或 hist:<kp id>
    XData.appear = {}; XData.appearYear = {};
    for (const it of XData.items) for (const k of keysOf(it)) {
      XData.appear[k] = (XData.appear[k] || 0) + 1;
      const ay = XData.appearYear[k] = XData.appearYear[k] || {};
      ay[it.year] = (ay[it.year] || 0) + 1;
    }
    return XData;
  };

  // 一題的知識點鍵：地理用 concepts，歷史用 kp
  function keysOf(it) {
    return it.subject === 'hist' ? it.kp.map(k => 'hist:' + k) : it.concepts.map(c => 'geo:' + c);
  }
  XData.keysOf = keysOf;
  // 知識點鍵 ↔ 網址用的 id：網址只放 id，地理概念 id 與歷史 kp id 不會撞名（kp 是 tw01、ea14、x06 這種）
  XData.keyOf = id => (window.Data && window.Data.conceptName && window.Data.conceptName[id]) ? 'geo:' + id : 'hist:' + id;
  XData.split = key => { const i = key.indexOf(':'); return { subj: key.slice(0, i), id: key.slice(i + 1) }; };
  XData.name = key => {
    const { subj, id } = XData.split(key);
    if (subj === 'geo') return (window.Data.conceptName || {})[id] || id;
    return (XData.kp[id] || { name: id }).name;
  };
  XData.count = key => XData.appear[key] || 0;
  XData.yearItems = y => XData.items.filter(it => it.year === +y);
  XData.itemsOf = key => XData.items.filter(it => keysOf(it).includes(key));
  XData.itemsOfSkill = s => XData.items.filter(it => it.skill.includes(s));
  XData.label = it => `${it.year} 年會考社會科第 ${it.no} 題`;

  // 題目圖片：開發版與 GitHub Pages 根目錄用相對路徑；單一 HTML 版若有內嵌就用內嵌，沒有就從上一層（dist/ 的外面）讀
  XData.img = p => {
    if (!p) return '';
    if (window.GEO_EXAM_IMAGES && window.GEO_EXAM_IMAGES[p]) return window.GEO_EXAM_IMAGES[p];
    return (window.GEO_EXAM_BASE || '') + p;
  };

  // ---------- 和網站原創內容的對應 ----------
  // 地理：含這個概念的已確認題目最多的一般關卡（不挑魔王關）；歷史：含這個 kp 的題目最多的時代櫃子
  XData.siteLevel = key => {
    const { subj, id } = XData.split(key);
    const tally = {};
    if (subj === 'geo') {
      for (const q of window.Data.live()) if (q.concepts.includes(id) && !/-boss$/.test(q.level)) tally[q.level] = (tally[q.level] || 0) + 1;
      const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      if (!best) return null;
      const u = window.Data.units.find(u => u.levels.some(l => l.id === best[0]));
      const l = u && u.levels.find(l => l.id === best[0]);
      return { href: `#/play/${best[0]}/practice`, name: l ? `${u.island || u.name}・${l.name}` : best[0], n: best[1], unitHref: u ? '#/unit/' + u.id : null };
    }
    const H = window.HData;
    if (!H || !H.live) return null;
    for (const q of H.live()) if ((q.kp || []).includes(id)) tally[q.era] = (tally[q.era] || 0) + 1;
    let best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    // 題庫沒有標這個 kp：改用 kp 對應事件所屬的時代
    if (!best) { const ev = ((XData.kp[id] || {}).events || []).map(e => H.eventById[e]).find(Boolean); if (ev) best = [ev.era, 0]; }
    if (!best) return null;
    const era = H.eraById[best[0]];
    return era ? { href: `#/h/play/${era.id}/practice`, name: era.name, n: best[1], unitHref: '#/h/wing/' + era.line } : null;
  };
  // 網站上同一知識點的原創題（已確認）
  XData.siteQuestions = key => {
    const { subj, id } = XData.split(key);
    if (subj === 'geo') return window.Data.live().filter(q => q.concepts.includes(id) && !/-boss$/.test(q.level));
    const H = window.HData;
    return H && H.live ? H.live().filter(q => (q.kp || []).includes(id)) : [];
  };
  // 歷史：事件和 kp 對應事件重疊的故事章節（家長確認過的）
  XData.storiesOf = key => {
    const { subj, id } = XData.split(key);
    const H = window.HData;
    if (subj !== 'hist' || !H || !H.chapters) return [];
    const evs = new Set((XData.kp[id] || {}).events || []);
    return H.chapters.filter(ch => H.chapterPlayable(ch) && (ch.eventIds || []).some(e => evs.has(e)));
  };
  // 某個歷史時代涵蓋的 kp（館區頁顯示「會考 5 年出現 N 次」用）
  XData.kpOfEra = eraId => {
    const H = window.HData;
    if (!H || !H.eventById) return [];
    return XData.kpList.filter(p => (p.events || []).some(e => H.eventById[e] && H.eventById[e].era === eraId));
  };
  XData.kpOfEvent = evId => XData.kpList.filter(p => (p.events || []).includes(evId));

  // ---------- 會考出題率（全站共用：所有「出題率」標籤都從這裡算） ----------
  // 單一觀念（地理概念 id／歷史 kp id）：5 年真題被標到幾次 → 分級
  //   高 ≥5（平均每年 1 題以上）、中 2–4、低 1、未考 0
  const TIERS = [
    { k: 'hi', name: '高', min: 5, desc: '5 年考 5 題以上，平均每年至少 1 題' },
    { k: 'mid', name: '中', min: 2, desc: '5 年考 2–4 題' },
    { k: 'lo', name: '低', min: 1, desc: '5 年只考過 1 題' },
    { k: 'none', name: '未考', min: 0, desc: '5 年都沒考過（課本有教，仍要會）' }
  ];
  XData.TIERS = TIERS;
  XData.tier = n => TIERS.find(t => (n || 0) >= t.min);
  const nYears = () => XData.years.length || 5;
  XData.nYears = nYears;
  const esc0 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // 小標籤「出題率 高・5 年 7 題」；opt.short → 只顯示「高」（表格用）
  XData.chip = (n, opt) => {
    n = n || 0; opt = opt || {};
    const t = XData.tier(n);
    const tip = `會考出題率${t.name}：${nYears()} 年會考共 ${n} 題（${t.desc}）`;
    const txt = opt.short ? t.name : `出題率 ${t.name}${n ? `・${nYears()} 年 ${n} 題` : ''}`;
    return `<span class="xf xf-${t.k}${opt.short ? ' xf-s' : ''}" title="${esc0(tip)}">${txt}</span>`;
  };
  XData.chipKey = (key, opt) => XData.chip(XData.count(key), opt);
  // 歷史事件：取它所屬各 kp 的最高次數
  XData.eventCount = evId => XData.kpOfEvent(evId).reduce((m, p) => Math.max(m, XData.count('hist:' + p.id)), 0);
  // 原創題（地理或歷史）：題目各觀念的最高次數。歷史題看 kp，再加上事件所屬的 kp
  XData.questionCount = q => {
    if (!q) return 0;
    if (q.era) {
      let m = 0;
      for (const k of q.kp || []) m = Math.max(m, XData.count('hist:' + k));
      for (const e of q.eventIds || []) m = Math.max(m, XData.eventCount(e));
      return m;
    }
    const cs = new Set(q.concepts || []);
    for (const p of q.parts || []) for (const c of p.concepts || []) cs.add(c);
    return [...cs].reduce((m, c) => Math.max(m, XData.count('geo:' + c)), 0);
  };

  // 區塊出題率：所有真題中，有幾 % 落在這個島／遠征／關卡／時代／館區
  //   地理島嶼：題目概念屬於這座島（concepts.json），或 scope ＝ 這座島
  //   地理遠征：scope ＝ 這個區域
  //   關卡：題目概念屬於這一關原創題用到的（本島）概念；遠征關卡另外要 scope 相同
  //   歷史時代：題目 era ＝ 該時代，或題目 kp 的事件落在該時代；館區同理看 line
  // 高頻：同一組裡的前幾名（島嶼 3、遠征 3、時代 5、館區 1），和下一名同分就不算
  let AGG = null;
  XData.share = n => XData.items.length ? n / XData.items.length * 100 : 0;
  XData.pctText = n => { const p = XData.share(n); return p >= 10 || p === 0 ? Math.round(p) + '%' : p.toFixed(1) + '%'; };
  function hotOf(map, ids, k) {
    const v = ids.map(id => map[id].n).sort((a, b) => b - a);
    const cut = v[k] == null ? 0 : v[k];
    for (const id of ids) map[id].hot = map[id].n > 0 && map[id].n > cut;
  }
  function buildAgg() {
    const D = window.Data, H = window.HData;
    const A = { unit: {}, level: {}, era: {}, wing: {} };
    const geo = XData.items.filter(it => it.subject === 'geo'), hist = XData.items.filter(it => it.subject === 'hist');
    if (D && D.units) {
      const cu = D.conceptUnit || {};
      for (const u of D.units) {
        const exp = u.kind === 'expedition';
        A.unit[u.id] = { n: geo.filter(it => it.scope === u.id || (!exp && it.concepts.some(c => cu[c] === u.id))).length };
        for (const l of u.levels) {
          let cs = new Set();
          for (const q of D.questions) if (q.level === l.id) for (const c of q.concepts || []) cs.add(c);
          if (!exp) { const own = [...cs].filter(c => cu[c] === u.id); if (own.length) cs = new Set(own); }
          A.level[l.id] = { n: geo.filter(it => (!exp || it.scope === u.id) && it.concepts.some(c => cs.has(c))).length };
        }
      }
      hotOf(A.unit, D.units.filter(u => u.kind !== 'expedition').map(u => u.id), 3);
      hotOf(A.unit, D.units.filter(u => u.kind === 'expedition').map(u => u.id), 3);
    }
    if (H && H.eras && H.eventById) {
      const he = hist.map(it => {
        const s = new Set(it.era ? [it.era] : []);
        for (const k of it.kp) for (const e of (XData.kp[k] || {}).events || []) if (H.eventById[e]) s.add(H.eventById[e].era);
        return s;
      });
      for (const e of H.eras) A.era[e.id] = { n: he.filter(s => s.has(e.id)).length };
      for (const l of H.lines) A.wing[l.id] = { n: he.filter(s => [...s].some(x => H.eraById[x] && H.eraById[x].line === l.id)).length };
      hotOf(A.era, H.eras.map(e => e.id), 5);
      hotOf(A.wing, H.lines.map(l => l.id), 1);
    }
    return A;
  }
  XData.agg = () => AGG || (AGG = buildAgg());
  const aggOf = (kind, id) => (XData.agg()[kind] || {})[id] || { n: 0, hot: false };
  XData.unitShare = id => aggOf('unit', id);
  XData.levelShare = id => aggOf('level', id);
  XData.eraShare = id => aggOf('era', id);
  XData.wingShare = id => aggOf('wing', id);
  // 「會考出題率 X%」＋（前幾名）「高頻」
  XData.shareHTML = s => {
    if (!XData.items.length || !s) return '';
    return `<span class="xsh" title="111–115 年會考地理、歷史共 ${XData.items.length} 題，有 ${s.n} 題考到這裡"><span class="xsh-t">會考出題率 ${XData.pctText(s.n)}</span>${s.hot ? '<span class="xhot">高頻</span>' : ''}</span>`;
  };
  // 圖例（考點分布頁、設定頁）
  XData.legendHTML = () => `<div class="xf-legend"><p><b>會考出題率</b>：統計 111–115 年會考社會科的地理、歷史題（共 ${XData.items.length} 題），看每個觀念被考到幾題。</p>
    <ul>${TIERS.map(t => `<li>${XData.chip(t.min, { short: true })}<span>${esc0(t.desc)}</span></li>`).join('')}</ul>
    <p class="hint">島嶼、關卡、時代、館區上的「會考出題率 X%」＝這 ${XData.items.length} 題中有幾 % 考到那裡；「高頻」是同一類裡考最多的幾個。</p></div>`;

  window.XData = XData;
})();
