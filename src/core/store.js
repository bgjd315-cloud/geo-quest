// 進度儲存（localStorage）與共用資料讀取。
// 地理進度沿用舊版的最上層欄位（格式不變，舊進度檔可直接匯入）；歷史進度放在 history 底下。
// 單一 HTML 版會把所有資料檔放進 window.GEO_DATA、插畫放進 window.GEO_IMAGES；開發版用 fetch 讀 data/。
(function () {
  const KEY = 'geoquest.v1';
  // stories：故事章節完成紀錄 {章id: {done, ts}}；cards：故事解鎖的館藏卡（事件 id）
  const blankHistory = () => ({ hero: null, log: [], levels: {}, recycle: {}, introSeen: false, stories: {}, cards: [] });
  // 會考真題：log 每題作答 {id, ok, ts, mode, a}；sims 年度模擬成績 {年: [{score,total,ts,secs}]}；recycle 真題錯題 {題id: {streak, since}}
  const blankExam = () => ({ log: [], sims: {}, recycle: {} });
  const blank = () => ({ v: 1, hero: null, log: [], levels: {}, recycle: {}, review: {}, parentHash: null, introSeen: false, subject: null, history: blankHistory(), exam: blankExam() });
  // 缺的欄位補上預設值（舊版存檔沒有 history、subject、exam）
  const normalize = o => {
    const s = Object.assign(blank(), o);
    s.history = Object.assign(blankHistory(), o && o.history);
    const x = (o && o.exam) || {};
    s.exam = { log: Array.isArray(x.log) ? x.log : [], sims: x.sims && typeof x.sims === 'object' ? x.sims : {}, recycle: x.recycle && typeof x.recycle === 'object' ? x.recycle : {} };
    return s;
  };
  let mem = null;

  function load() {
    if (mem) return mem;
    try { mem = normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { mem = blank(); }
    return mem;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; }
    catch (e) { console.warn('無法寫入 localStorage', e); return false; }
  }

  // ---------- 一科的作答紀錄（地理＝最上層，歷史＝history） ----------
  function recordIn(p, entry) {
    p.log.push(Object.assign({ ts: Date.now() }, entry));
    if (p.log.length > 5000) p.log = p.log.slice(-5000);
    // 錯題回收：答錯就記下概念；同概念連續答對兩次才算過關
    for (const c of entry.c || []) {
      if (!entry.ok) p.recycle[c] = { streak: 0, since: Date.now() };
      else if (p.recycle[c]) {
        p.recycle[c].streak += 1;
        if (p.recycle[c].streak >= 2) delete p.recycle[c];
      }
    }
  }
  function finishIn(p, id, score, total, mode) {
    const prev = p.levels[id] || {};
    p.levels[id] = { done: true, best: Math.max(prev.best || 0, score / total), last: score / total, total, mode, ts: Date.now() };
  }
  // 給答題引擎用的介面：get() 取得該科進度，record／finishLevel 寫入
  const track = get => ({
    get,
    set(patch) { Object.assign(get(), patch); save(); },
    record(entry) { recordIn(get(), entry); save(); },
    finishLevel(id, score, total, mode) { finishIn(get(), id, score, total, mode); save(); }
  });

  // 會考真題的作答紀錄：錯題回收以「題目」為單位，連續答對兩次才移出（和網站錯題回收同一規則）
  const X = {
    get: () => load().exam,
    record(entry) {
      const x = load().exam;
      const e = Object.assign({ ts: Date.now() }, entry);
      x.log.push(e);
      if (x.log.length > 5000) x.log = x.log.slice(-5000);
      if (!e.ok) x.recycle[e.id] = { streak: 0, since: e.ts };
      else if (x.recycle[e.id]) { x.recycle[e.id].streak += 1; if (x.recycle[e.id].streak >= 2) delete x.recycle[e.id]; }
      save();
    },
    finishSim(year, score, total, secs) {
      const x = load().exam;
      (x.sims[year] = x.sims[year] || []).push({ score, total, ts: Date.now(), secs });
      save();
    }
  };

  const Store = Object.assign(track(load), {
    save,
    X,
    // 歷史進度
    H: track(() => load().history),
    // 家長審題：覆寫題目狀態（兩科共用，題目 id 不重複；只存在這台裝置，可匯出給 Claude 寫回題庫）
    setReview(id, patch) {
      const s = load();
      s.review[id] = Object.assign({}, s.review[id] || {}, patch, { ts: Date.now() });
      save();
    },
    exportProgress() {
      const s = load();
      return { type: 'geo-quest-progress', v: 2, exported: new Date().toISOString(), data: Object.assign({}, s, { parentHash: undefined }) };
    },
    exportReview() {
      return { type: 'geo-quest-review', exported: new Date().toISOString(), review: load().review };
    },
    importFile(obj) {
      if (obj && obj.type === 'geo-quest-progress') {
        const cur = load(), inc = obj.data || {};
        mem = normalize(Object.assign({}, inc, { parentHash: cur.parentHash }));
        // 舊版進度檔只有地理：這台裝置原本的歷史進度與科目選擇保留
        if (!inc.history) mem.history = cur.history;
        if (!inc.subject) mem.subject = cur.subject;
        // 沒有會考真題紀錄的舊進度檔：保留這台裝置原本的真題紀錄
        if (!inc.exam) mem.exam = cur.exam;
        save();
        const kept = [!inc.history && '歷史', !inc.exam && '會考真題'].filter(Boolean);
        return kept.length ? `進度已匯入（舊版進度檔沒有${kept.join('、')}的紀錄，這部分維持不變）` : '進度已匯入（地理＋歷史＋會考真題）';
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
  });

  // 簡單密碼雜湊（家長頁只是擋孩子誤入，不是資安防護）
  Store.hash = function (str) {
    let h = 5381;
    for (const ch of 'geo-quest:' + str) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
    return h.toString(36);
  };

  // ---------- 資料檔與插畫 ----------
  const Loader = {
    async get(p) {
      const pack = window.GEO_DATA;
      if (pack) { if (!(p in pack)) throw new Error('缺少資料檔 ' + p); return pack[p]; }
      const r = await fetch('data/' + p, { cache: 'no-cache' });
      if (!r.ok) throw new Error('讀不到 data/' + p);
      return r.json();
    },
    // dir：開發版的插畫資料夾（單一 HTML 版兩科插畫都在 GEO_IMAGES，檔名不重複）
    img(name, dir) {
      if (window.GEO_IMAGES) return window.GEO_IMAGES[name] || '';
      return dir + name + '.webp';
    },
    // 題目目前狀態：家長在這台裝置的審題結果優先，其次是題庫檔裡的狀態
    status(q) {
      const r = load().review[q.id];
      return (r && r.status) || q.status;
    }
  };

  window.Store = Store;
  window.Loader = Loader;
})();
