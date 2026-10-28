// 歷史資料載入：data/history/manifest.json → window.HData（分期、事件、題目），並把事件時間粗略換成年份給時間長廊用。
(function () {
  const HData = { files: {}, questions: [], byId: {}, error: null };
  const NOW = 2010;   // 時間長廊的右端；「1987～」這種沒有結束年的事件畫到這裡
  const MIN = -8000;  // 左端（舊石器）

  // ---------- 時間字串 → 年份（西元前用負數） ----------
  // 只求大概位置：「前 334」「1624」「1860 年代」「約前 11 世紀」「18 世紀末」「約 400 年前」「戰國」
  const NAMED = { 舊石器: MIN, 史前: MIN, 春秋: -600, 戰國: -350, 康熙: 1690 };
  function point(t, century) {
    t = String(t || '').replace(/^約/, '');
    let m;
    for (const [k, y] of Object.entries(NAMED)) if (t.startsWith(k)) return y;
    if ((m = t.match(/^(前)?(\d+)世紀(初|末)?/)) || (century && (m = t.match(/^(前)?(\d{1,2})$/)))) {
      const n = +m[2], base = m[1] ? -n * 100 : (n - 1) * 100;
      return base + (m[3] === '初' ? 10 : m[3] === '末' ? 90 : 50);
    }
    if ((m = t.match(/^(\d+)年前/))) return 2025 - +m[1];
    if ((m = t.match(/^(\d{3,4})年代/))) return +m[1] + 5;
    if ((m = t.match(/^(前)?(\d+)/))) return m[1] ? -m[2] : +m[2];
    return null;
  }
  // 「A～B」→ {from, to}；只有 A 時 to = from；「1987～」→ to = NOW
  function parseSpan(s) {
    s = String(s || '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/\s+/g, '');
    const [a, b] = s.split(/[～~]/);
    const cent = /世紀/.test(b || '');   // 「16～17 世紀初」「前 8～前 5 世紀」：前半也是世紀
    const from = point(a, cent);
    const to = b === undefined ? from : b === '' ? NOW : point(b);
    if (from == null && to == null) return null;
    return { from: from == null ? to : from, to: to == null ? from : to };
  }

  HData.load = async function () {
    const get = p => window.Loader.get('history/' + p);
    const man = await get('manifest.json');
    const ev = await get(man.events);
    const qfiles = await Promise.all((man.questions || []).map(get));
    HData.manifest = man;
    HData.lines = ev.lines; HData.themes = ev.themes; HData.skills = ev.skills; HData.periods = ev.periods;
    HData.eras = ev.eras; HData.events = ev.events;
    HData.lineById = Object.fromEntries(ev.lines.map(l => [l.id, l]));
    HData.eraById = Object.fromEntries(ev.eras.map(e => [e.id, e]));
    HData.eventById = Object.fromEntries(ev.events.map(e => [e.id, e]));
    // 分期與事件的年份範圍；事件時間讀不出來就放在所屬分期的中間
    for (const e of ev.eras) e._span = parseSpan(e.time) || { from: MIN, to: NOW };
    for (const e of ev.events) {
      const sp = parseSpan(e.time);
      const era = HData.eraById[e.era];
      e._span = sp || { from: (era._span.from + era._span.to) / 2, to: (era._span.from + era._span.to) / 2, guess: true };
    }
    HData.bands = ev.periods.map(p => ({ name: p.name, from: p.from ? point(p.from) : MIN, to: p.to ? point(p.to) : NOW }));
    // 題目：格式比照地理，另有 theme、era、skill、eventIds。沒寫 status 一律當「待審」
    HData.questions = [];
    (man.questions || []).forEach((p, i) => {
      for (const q of qfiles[i].questions || []) {
        const era = HData.eraById[q.era];
        HData.questions.push(Object.assign({
          _file: 'history/' + p,
          status: '待審',
          unit: era ? `${HData.lineById[era.line].wing}・${era.name}` : '歷史',
          // 錯題回收以事件為單位；沒有標事件就用分期
          concepts: q.eventIds && q.eventIds.length ? q.eventIds : [q.era]
        }, q));
      }
    });
    HData.byId = Object.fromEntries(HData.questions.map(q => [q.id, q]));
    return HData;
  };
  HData.img = name => window.Loader.img(name, 'assets/history/web/');
  HData.status = q => window.Loader.status(q);
  // 只有家長「確認」過的題目才會出現在闖關中
  HData.live = () => HData.questions.filter(q => HData.status(q) === '確認');
  HData.liveOfEra = id => HData.live().filter(q => q.era === id);
  HData.liveOfEvent = id => HData.live().filter(q => (q.eventIds || []).includes(id));
  HData.parseSpan = parseSpan;
  HData.MIN = MIN; HData.NOW = NOW;

  window.HData = HData;
})();
