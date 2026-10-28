// 截圖用的假進度（只寫進截圖用的瀏覽器）：地理原創題、會考真題都有作答，讓弱點地圖、診斷、出題率有內容
(() => {
  const T = 1792500000000;
  const s = { v: 1, hero: 'girl', log: [], levels: {}, recycle: {}, review: {}, parentHash: null, introSeen: true, subject: 'geo',
    history: { hero: null, log: [], levels: {}, recycle: {}, introSeen: false, stories: {}, cards: [] },
    exam: { log: [], sims: {}, recycle: {} } };
  let k = 0;
  // 地理：前五冊多數已練；氣候地形雨、人口結構、等高線較弱
  const weak = ['clim-orographic', 'pop-structure', 'map-contour', 'clim-monsoon'];
  for (const q of Data.live()) {
    if (!/^(map|climate|landform|hydro|pop|industry|eu|na|nea|sea|cn)-/.test(q.level)) continue;
    k++;
    const w = q.concepts.some(c => weak.includes(c));
    const ok = w ? (k % 3 === 0) : (k % 6 !== 0);
    s.log.push({ q: q.id, ok, c: q.concepts, r: q.region, m: k % 5 ? 'practice' : 'sim', ts: T + k * 1000 });
  }
  for (const c of weak) s.recycle[c] = { streak: c === 'clim-monsoon' ? 1 : 0, since: T };
  const done = ['map-1', 'map-2', 'map-3', 'map-4', 'climate-1', 'climate-2', 'climate-3', 'landform-1', 'landform-2', 'hydro-1', 'pop-1', 'industry-1', 'eu-1', 'na-1', 'nea-1', 'sea-1', 'cn-1'];
  done.forEach((id, i) => s.levels[id] = { done: true, best: 0.6 + (i % 4) * 0.1, last: 0.6 + (i % 4) * 0.1, total: 10, ts: T });
  // 會考真題：地理題做過大部分，歷史題做一些
  let j = 0;
  for (const it of XData.items) {
    j++;
    if (it.subject === 'hist' && j % 3) continue;
    const key = (it.concepts || []).join(',');
    const w = /contour|orographic|pop-structure|timezone|monsoon/.test(key);
    const ok = w ? j % 3 === 0 : j % 5 !== 0;
    s.exam.log.push({ id: it.id, ok, ts: T + 9e6 + j * 1000, mode: j % 2 ? 'sim' : 'kp', a: ok ? it.answer : (it.answer + 1) % 4 });
    if (!ok) s.exam.recycle[it.id] = { streak: 0, since: T };
  }
  s.exam.sims = { 113: [{ score: 14, total: 19, ts: T + 8e6, secs: 1320 }], 114: [{ score: 15, total: 19, ts: T + 8.5e6, secs: 1250 }], 115: [{ score: 13, total: 18, ts: T + 9e6, secs: 1400 }] };
  localStorage.setItem('geoquest.v1', JSON.stringify(s));
})()
