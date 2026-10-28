// 進度儲存（localStorage）與資料載入。
// 單一 HTML 版會把所有資料檔放進 window.GEO_DATA；開發版用 fetch 讀 data/ 底下的檔案。
(function () {
  const KEY = 'geoquest.v1';
  const blank = () => ({ v: 1, hero: null, log: [], levels: {}, recycle: {}, review: {}, parentHash: null, introSeen: false });
  let mem = null;

  function load() {
    if (mem) return mem;
    try { mem = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { mem = blank(); }
    return mem;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; }
    catch (e) { console.warn('無法寫入 localStorage', e); return false; }
  }

  const Store = {
    get: load,
    save,
    set(patch) { Object.assign(load(), patch); save(); },
    record(entry) {
      const s = load();
      s.log.push(Object.assign({ ts: Date.now() }, entry));
      if (s.log.length > 5000) s.log = s.log.slice(-5000);
      // 錯題回收：答錯就記下概念；同概念連續答對兩次才算過關
      for (const c of entry.c || []) {
        if (!entry.ok) s.recycle[c] = { streak: 0, since: Date.now() };
        else if (s.recycle[c]) {
          s.recycle[c].streak += 1;
          if (s.recycle[c].streak >= 2) delete s.recycle[c];
        }
      }
      save();
    },
    finishLevel(id, score, total, mode) {
      const s = load();
      const prev = s.levels[id] || {};
      s.levels[id] = { done: true, best: Math.max(prev.best || 0, score / total), last: score / total, total, mode, ts: Date.now() };
      save();
    },
    // 家長審題：覆寫題目狀態（只存在這台裝置；可匯出給 Claude 寫回題庫）
    setReview(id, patch) {
      const s = load();
      s.review[id] = Object.assign({}, s.review[id] || {}, patch, { ts: Date.now() });
      save();
    },
    exportProgress() {
      const s = load();
      return { type: 'geo-quest-progress', exported: new Date().toISOString(), data: Object.assign({}, s, { parentHash: undefined }) };
    },
    exportReview() {
      return { type: 'geo-quest-review', exported: new Date().toISOString(), review: load().review };
    },
    importFile(obj) {
      if (obj && obj.type === 'geo-quest-progress') {
        const keep = load().parentHash;
        mem = Object.assign(blank(), obj.data, { parentHash: keep });
        save();
        return '進度已匯入';
      }
      if (obj && obj.type === 'geo-quest-review') {
        const s = load();
        for (const [id, r] of Object.entries(obj.review || {})) {
          if (!s.review[id] || (s.review[id].ts || 0) < (r.ts || 0)) s.review[id] = r;
        }
        save();
        return '審題結果已匯入';
      }
      throw new Error('看不懂這個檔案：不是本網站匯出的進度或審題檔');
    },
    reset() { const keep = load().parentHash; mem = Object.assign(blank(), { parentHash: keep }); save(); }
  };

  // 簡單密碼雜湊（家長頁只是擋孩子誤入，不是資安防護）
  Store.hash = function (str) {
    let h = 5381;
    for (const ch of 'geo-quest:' + str) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
    return h.toString(36);
  };

  // ---------- 資料載入 ----------
  const Data = { files: {} };
  Data.load = async function () {
    const pack = window.GEO_DATA;
    const get = async p => {
      if (pack) { if (!(p in pack)) throw new Error('缺少資料檔 ' + p); return pack[p]; }
      const r = await fetch('data/' + p, { cache: 'no-cache' });
      if (!r.ok) throw new Error('讀不到 data/' + p);
      return r.json();
    };
    const man = await get('manifest.json');
    const all = [].concat(man.core, man.figures, man.cards, man.questions);
    await Promise.all(all.map(async p => { Data.files[p] = await get(p); }));
    Data.manifest = man;
    Data.concepts = Data.files['concepts.json'];
    Data.regions = Data.files['regions.json'].regions;
    Data.units = Data.files['units.json'].units;
    Data.conceptName = {};
    Data.conceptUnit = {};
    for (const u of Data.concepts.units) for (const c of u.concepts) { Data.conceptName[c.id] = c.name; Data.conceptUnit[c.id] = u.id; }
    Data.cards = {};
    for (const p of man.cards) Object.assign(Data.cards, Data.files[p].cards);
    Data.questions = [];
    for (const p of man.questions) for (const q of Data.files[p].questions) Data.questions.push(Object.assign({ _file: p }, q));
    Data.byId = Object.fromEntries(Data.questions.map(q => [q.id, q]));
    Data.images = window.GEO_IMAGES || null;
    return Data;
  };
  Data.img = function (name) {
    if (Data.images) return Data.images[name] || '';
    return 'assets/web/' + name + '.webp';
  };
  // 題目目前狀態：家長在這台裝置的審題結果優先，其次是題庫檔裡的狀態
  Data.status = function (q) {
    const r = load().review[q.id];
    return (r && r.status) || q.status;
  };
  Data.live = function () { return Data.questions.filter(q => Data.status(q) === '確認'); };

  window.Store = Store;
  window.Data = Data;
})();
