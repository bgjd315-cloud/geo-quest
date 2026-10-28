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

  window.XData = XData;
})();
