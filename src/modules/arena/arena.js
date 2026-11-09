// 競技場（#/arena/…）：網站裡唯一計時的地方。原本的闖關仍不計時、即時解析。
// 兩種模式：限時挑戰（90 秒內盡量答對，連對加分）、生存挑戰（3 條命，每題 20 秒）。
// 題目：地理、歷史、公民已上線的單選題（不含圖表、題組，題幹 160 字內），可選單科或混合。
// 虛擬對手：故事角色七階，打敗一位解鎖下一位。同學挑戰：同一組題目（同一個種子），用連結或挑戰碼傳給同學。
// 競技場作答不影響各科的掌握度與錯題回收；會算進經驗值與今天的題數。結束後可看答錯題目的解析。
(function () {
  const { esc, app } = window.UI;
  const Store = window.Store, Game = window.Game;
  const G = () => Store.G();
  const Q = () => window.Quiz;

  const MODES = {
    T: { name: '限時挑戰', short: '限時', secs: 90, desc: '90 秒內盡量答對，連續答對有加分。' },
    S: { name: '生存挑戰', short: '生存', lives: 3, per: 20, desc: '3 條命，每題 20 秒，答錯或超時扣一命。' }
  };
  const POOLS = { mix: '三科混合', geo: '地理', his: '歷史', civ: '公民' };
  const SUBJ_TAG = { geo: '地理', his: '歷史', civ: '公民' };
  const RANKS = ['銅牌', '銀牌', '金牌', '白金', '鑽石', '大師', '傳說'];
  // 七位對手：T＝限時挑戰分數、S＝生存挑戰答對題數
  // img：沿用三科故事的角色插畫（葛老師是競技場用 Canva AI 新畫的）；沒有圖時只顯示名字
  const RIVALS = [
    { n: '小安', who: '青禾里的鄰居', T: 300, S: 3, say: '我剛滿 18 歲，社會科還記得一點點！', img: ['char_xiaoan', 'assets/civics/web/'] },
    { n: '阿鵲', who: '萬象地圖冊的臺灣藍鵲', T: 600, S: 6, say: '地圖上的每個角落，我都飛過喔。', img: ['bird_happy', 'assets/web/'], animal: true },
    { n: '阿晴', who: '青禾里的國三生', T: 900, S: 10, say: '我們同年級，來比比看！', img: ['aqing_happy', 'assets/civics/web/'] },
    { n: '阿斑', who: '時光檔案館的石虎', T: 1300, S: 15, say: '年代順序，可是我的看家本領。', img: ['aban_happy', 'assets/history/web/'], animal: true },
    { n: '林姐', who: '巷口早餐店老闆', T: 1700, S: 20, say: '做生意要算得快，答題也一樣。', img: ['char_linjie', 'assets/civics/web/'] },
    { n: '吳律師', who: '社區法律服務站志工', T: 2200, S: 30, say: '證據會說話，選項也是。', img: ['char_wulawyer', 'assets/civics/web/'] },
    { n: '葛老師', who: '時空調查局的老調查員', T: 2700, S: 40, say: '能走到這裡，你已經很了不起了。', img: ['rival_ge', 'assets/arena/web/'] }
  ];
  // 對手頭像：人物立繪取上半身，動物取全身；圖讀不到就移除，只留色塊
  const face = r => r && r.img ? `<span class="ar-face ${r.animal ? 'animal' : ''}"><img src="${window.Loader.img(r.img[0], r.img[1])}" alt="" loading="lazy" onerror="this.remove()"></span>` : '';
  const heroImg = () => window.Loader.img('arena_hero', 'assets/arena/web/');

  // ---------- 題庫 ----------
  const suitable = q => !q.parts && !q.figure && Array.isArray(q.options) && q.options.length >= 2 && q.options.every(o => typeof o === 'string')
    && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length && !['click', 'order', 'match', 'clue'].includes(q.type) && String(q.stem || '').length <= 160;
  let cache = null;
  function allItems() {
    if (cache) return cache;
    const src = [['geo', window.Data && window.Data.live ? window.Data.live() : []],
      ['his', window.HData && window.HData.live ? window.HData.live() : []],
      ['civ', window.CData && window.CData.live ? window.CData.live() : []]];
    cache = [];
    for (const [s, qs] of src) for (const q of qs) if (suitable(q)) cache.push({ q, s });
    cache.sort((a, b) => a.q.id < b.q.id ? -1 : a.q.id > b.q.id ? 1 : 0);
    return cache;
  }
  const poolItems = p => allItems().filter(x => p === 'mix' || x.s === p);
  // 題庫指紋：題數（兩台裝置題庫版本不同時提醒）
  const finger = p => poolItems(p).length % 1296;

  // 可重現的亂數（同一個種子＝同一組題目、同一個選項順序）
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function seededShuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const newSeed = () => Math.floor(Math.random() * 60466176);   // 36^5，挑戰碼 5 碼
  const seedStr = s => s.toString(36).toUpperCase().padStart(5, '0');
  function deck(pool, seed) {
    const r = rng(seed);
    return seededShuffle(poolItems(pool), r).map((x, i) => {
      const keep = Q().keepOrder(x.q.options);
      const order = keep ? x.q.options.map((_, k) => k) : seededShuffle(x.q.options.map((_, k) => k), rng(seed + 7919 * (i + 1)));
      return Object.assign({ order }, x);
    });
  }

  // ---------- 挑戰碼 ----------
  // 短碼：T-MIX-3K9F2（模式-範圍-種子），同學輸入後作答同一組題目
  const shortCode = (m, p, s) => `${m}-${p.toUpperCase()}-${seedStr(s)}`;
  function parseShort(str) {
    const m = String(str || '').trim().toUpperCase().match(/^([TS])[-\s]?(MIX|GEO|HIS|CIV)[-\s]?([0-9A-Z]{1,5})$/);
    if (!m) return null;
    const s = parseInt(m[3], 36);
    return isFinite(s) ? { m: m[1], p: m[2].toLowerCase(), s } : null;
  }
  // 連結碼：放了發起人的暱稱與成績，對方打開就能直接對決
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function encodeVs(o) { return b64e(JSON.stringify([1, o.m, o.p, o.s, o.n, o.sc, o.c, o.a, o.f])); }
  // 從別人傳來的連結解出資料：每個欄位都檢查型別與範圍，暱稱另外清理
  function decodeVs(code) {
    try {
      const a = JSON.parse(b64d(String(code)));
      if (!Array.isArray(a) || a[0] !== 1) return null;
      const [, m, p, s, n, sc, c, ans, f] = a;
      const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
      if (!MODES[m] || !POOLS[p] || !int(s, 60466175) || !int(sc, 99999) || !int(c, 9999) || !int(ans, 9999) || !int(f, 1295)) return null;
      return { m, p, s, n: Game.cleanName(n) || '同學', sc, c, a: ans, f };
    } catch (e) { return null; }
  }
  // 分享連結一律指向線上網站（從 dist 單一檔開啟時，file:// 連結傳給別人打不開）
  const SITE = 'https://bgjd315-cloud.github.io/geo-quest/';
  const base = () => /^https?:/.test(location.protocol) ? location.origin + location.pathname : SITE;

  // ---------- 進行中的一場（換頁時停止計時） ----------
  let stopper = null;
  function stop() { if (stopper) { stopper(); stopper = null; } }
  window.addEventListener('hashchange', stop);

  const fmtStem = s => Q().fmt(s);
  const rivalIdx = (m, score) => { let k = -1; RIVALS.forEach((r, i) => { if (score >= r[m]) k = i; }); return k; };
  const scoreText = (m, sc) => m === 'T' ? `${sc} 分` : `答對 ${sc} 題`;

  function topbar(back) {
    return `<header class="top"><a class="back" href="${back || '#/hub'}">‹ 返回</a><nav><a href="#/hub">首頁</a><a href="#/me">我的戰績</a></nav></header>`;
  }

  // ---------- 大廳 ----------
  function lobby(msg) {
    const g = G(), a = g.arena;
    const ladder = m => {
      const beat = a.beat[m] != null ? a.beat[m] : -1;
      return `<ol class="ar-ladder">${RIVALS.map((r, i) => `<li class="${i <= beat ? 'beat' : i === beat + 1 ? 'next' : 'lock'}">
        <span class="ar-rank r${i}">${RANKS[i]}</span>${face(r)}<b>${esc(r.n)}</b><small>${esc(r.who)}</small><em>${scoreText(m, r[m])}</em>${i <= beat ? '<i>已擊敗</i>' : i === beat + 1 ? '<i>下一位</i>' : ''}</li>`).join('')}</ol>`;
    };
    const best = m => Object.keys(POOLS).map(p => { const b = a.best[`${m}-${p}`]; return `<span>${POOLS[p]}：<b>${b ? scoreText(m, b.score) : '—'}</b></span>`; }).join('');
    app().innerHTML = `${topbar('#/hub')}<div class="page arena">
      <header class="ar-hero"><img class="ar-hero-bg" src="${heroImg()}" alt="" onerror="this.remove()"><h1>競技場</h1><p>這裡是唯一會計時的地方。原本的闖關照舊慢慢練、看解析；想衝分數、打敗對手，就來這裡。</p></header>
      ${msg ? `<p class="ar-msg">${esc(msg)}</p>` : ''}
      <h2 class="hub-sec">選範圍</h2>
      <div class="ar-pools">${Object.entries(POOLS).map(([k, v]) => `<button class="ar-pool ${k === lobby.pool ? 'on' : ''}" data-p="${k}">${v}<small>${poolItems(k).length} 題</small></button>`).join('')}</div>
      <h2 class="hub-sec">選模式</h2>
      <div class="ar-modes">${Object.entries(MODES).map(([k, v]) => `<button class="ar-mode ar-${k}" data-m="${k}"><b>${v.name}</b><small>${v.desc}</small><span class="ar-best">${best(k)}</span></button>`).join('')}</div>
      <h2 class="hub-sec">對手階梯・限時挑戰</h2>${ladder('T')}
      <h2 class="hub-sec">對手階梯・生存挑戰</h2>${ladder('S')}
      <h2 class="hub-sec">同學的挑戰碼</h2>
      <div class="ar-code"><input id="ar-code" placeholder="例如 T-MIX-3K9F2，或貼上挑戰連結" autocomplete="off"><button class="primary" id="ar-go">開始</button></div>
      <p class="hint">同學傳給你的挑戰碼或連結：你們會作答同一組題目，最後比分數。</p></div>`;
    const ap = app();
    ap.querySelectorAll('.ar-pool').forEach(b => b.onclick = () => { lobby.pool = b.dataset.p; lobby(); });
    ap.querySelectorAll('.ar-mode').forEach(b => b.onclick = () => { location.hash = `#/arena/play/${b.dataset.m}-${lobby.pool}-${seedStr(newSeed())}`; });
    ap.querySelector('#ar-go').onclick = () => {
      const v = ap.querySelector('#ar-code').value.trim();
      const link = v.match(/#\/arena\/vs\/([A-Za-z0-9_-]+)/);
      if (link && decodeVs(link[1])) { location.hash = '#/arena/vs/' + link[1]; return; }
      const sc = parseShort(v);
      if (sc) { location.hash = `#/arena/play/${sc.m}-${sc.p}-${seedStr(sc.s)}`; return; }
      lobby('看不懂這個挑戰碼，請再確認一次（格式像 T-MIX-3K9F2）。');
    };
  }
  lobby.pool = 'mix';

  // ---------- 對決頁：打開同學傳來的連結 ----------
  function vsPage(code) {
    const o = decodeVs(code);
    if (!o) return lobby('這個挑戰連結壞掉了，請同學重新傳一次。');
    const diff = finger(o.p) !== o.f;
    app().innerHTML = `${topbar('#/arena')}<div class="page arena"><section class="ar-vs">
      <p class="ar-vs-from"><b>${esc(o.n)}</b> 向你下戰帖！</p>
      <div class="ar-vs-card"><span>${MODES[o.m].name}・${POOLS[o.p]}</span><b>${scoreText(o.m, o.sc)}</b><small>答對 ${o.c} 題／作答 ${o.a} 題</small></div>
      <p>你會作答和 ${esc(o.n)} 一模一樣的題目。${esc(MODES[o.m].desc)}</p>
      ${diff ? '<p class="ar-msg">你們的題庫版本不一樣（可能有人還沒更新網站），題目可能不完全相同，比分僅供參考。</p>' : ''}
      <div class="row"><button class="primary" id="ar-accept">接受挑戰</button><a class="ghost btn" href="#/arena">先不要</a></div></section></div>`;
    app().querySelector('#ar-accept').onclick = () => play(o.m, o.p, o.s, o);
  }

  // ---------- 作答 ----------
  function play(m, p, seed, vs) {
    stop();
    const mode = MODES[m];
    if (!mode || !POOLS[p]) return lobby();
    const cards = deck(p, seed);
    if (!cards.length) return lobby('這個範圍目前沒有可以用的題目。');
    const st = { i: 0, score: 0, combo: 0, maxCombo: 0, correct: 0, answered: 0, lives: mode.lives || 0, wrong: [], over: false };
    let timer = null, waitT = null, endAt = 0, qEnd = 0;
    stopper = () => { clearInterval(timer); clearTimeout(waitT); st.over = true; };

    app().innerHTML = `<div class="page arena ar-play"><header class="ar-hud">
        <a class="back" href="#/arena">‹ 離開</a>
        <span class="ar-tag">${mode.short}・${POOLS[p]}</span>
        <span class="ar-sc"><b id="ar-score">0</b><small>${m === 'T' ? '分' : '題'}</small></span>
        ${m === 'S' ? `<span class="ar-lives" id="ar-lives">${'<i></i>'.repeat(mode.lives)}</span>` : ''}
      </header>
      <div class="ar-time"><i id="ar-bar"></i></div><div class="ar-combo" id="ar-combo"></div>
      ${vs ? `<p class="ar-vsline">對手 <b>${esc(vs.n)}</b>：${scoreText(vs.m, vs.sc)}</p>` : nextRivalLine(m)}
      <div class="ar-q" id="ar-q"></div></div>`;
    const $ = id => app().querySelector('#' + id);

    function tick() {
      if (st.over) return;
      const now = Date.now();
      if (m === 'T') {
        const left = Math.max(0, endAt - now);
        $('ar-bar').style.width = (left / (mode.secs * 1000) * 100) + '%';
        $('ar-bar').classList.toggle('low', left < 15000);
        if (left <= 0) finish();
      } else {
        const left = Math.max(0, qEnd - now);
        $('ar-bar').style.width = (left / (mode.per * 1000) * 100) + '%';
        $('ar-bar').classList.toggle('low', left < 5000);
        if (left <= 0 && !$('ar-q').dataset.locked) answer(-1);
      }
    }
    function show() {
      if (st.over) return;
      if (st.i >= cards.length) return finish();
      const c = cards[st.i], q = c.q;
      const el = $('ar-q');
      delete el.dataset.locked;
      el.innerHTML = `<div class="qmeta"><span class="tag">${SUBJ_TAG[c.s]}</span><span class="tag soft">第 ${st.i + 1} 題</span></div>
        <div class="stem">${fmtStem(q.stem)}</div>
        <div class="opts">${c.order.map((k, n) => `<button class="opt" data-i="${k}"><b>${'ⒶⒷⒸⒹⒺⒻ'[n]}</b> ${esc(q.options[k])}</button>`).join('')}</div>`;
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
      if (m === 'S') qEnd = Date.now() + mode.per * 1000;
    }
    function answer(i) {
      const el = $('ar-q');
      if (st.over || el.dataset.locked) return;
      el.dataset.locked = '1';
      const c = cards[st.i], q = c.q, ok = i === q.answer;
      st.answered++;
      el.querySelectorAll('.opt').forEach(b => {
        const k = +b.dataset.i; b.disabled = true;
        if (k === i) b.classList.add(ok ? 'right' : 'wrong');
        if (k === q.answer) b.classList.add('right');
      });
      if (ok) {
        st.correct++; st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo);
        st.score += m === 'T' ? 100 + Math.min(st.combo - 1, 5) * 20 : 1;
        const cb = $('ar-combo');
        if (st.combo >= 3) { cb.textContent = `${st.combo} 連對！${m === 'T' && st.combo >= 2 ? `＋${Math.min(st.combo - 1, 5) * 20}` : ''}`; cb.className = 'ar-combo show'; }
        else cb.className = 'ar-combo';
      } else {
        st.combo = 0; $('ar-combo').className = 'ar-combo';
        st.wrong.push({ c, chosen: i });
        if (m === 'S') {
          st.lives--;
          const lv = $('ar-lives'); if (lv) lv.innerHTML = '<i></i>'.repeat(st.lives) + '<i class="lost"></i>'.repeat(mode.lives - st.lives);
          if (i < 0) el.insertAdjacentHTML('beforeend', '<p class="ar-timeout">時間到！</p>');
        }
      }
      $('ar-score').textContent = st.score;
      st.i++;
      waitT = setTimeout(() => { if (m === 'S' && st.lives <= 0) finish(); else show(); }, ok ? 450 : 1300);
    }
    function finish() {
      if (st.over) return;
      st.over = true; clearInterval(timer); clearTimeout(waitT); stopper = null;
      result(m, p, seed, vs, st);
    }

    // 倒數 3、2、1 再開始
    const el = $('ar-q');
    let n = 3;
    el.innerHTML = `<div class="ar-count">${n}</div>`;
    const cd = setInterval(() => {
      if (st.over) return clearInterval(cd);
      n--;
      if (n > 0) { el.innerHTML = `<div class="ar-count">${n}</div>`; return; }
      clearInterval(cd);
      endAt = Date.now() + (mode.secs || 0) * 1000;
      show();
      timer = setInterval(tick, 100);
    }, 700);
    const prevStop = stopper; stopper = () => { clearInterval(cd); prevStop(); };
  }
  function nextRivalLine(m) {
    const beat = G().arena.beat[m] != null ? G().arena.beat[m] : -1, r = RIVALS[beat + 1];
    return r ? `<p class="ar-vsline">${face(r)}挑戰 <b>${esc(r.n)}</b>（${RANKS[beat + 1]}）：${scoreText(m, r[m])}</p>` : '<p class="ar-vsline">你已經打敗所有對手，挑戰自己的最佳紀錄吧！</p>';
  }

  // ---------- 結果 ----------
  function result(m, p, seed, vs, st) {
    const g = G(), a = g.arena, key = `${m}-${p}`;
    const prevBest = a.best[key], isBest = !prevBest || st.score > prevBest.score;
    if (isBest) a.best[key] = { score: st.score, correct: st.correct, answered: st.answered, ts: Date.now() };
    a.runs++;
    a.maxCombo = Math.max(a.maxCombo || 0, st.maxCombo);
    const before = a.beat[m] != null ? a.beat[m] : -1, reach = rivalIdx(m, st.score);
    const newly = reach > before ? RIVALS.slice(before + 1, reach + 1) : [];
    if (reach > before) a.beat[m] = reach;
    let vsTxt = '';
    if (vs) {
      const win = st.score > vs.sc, tie = st.score === vs.sc;
      if (win) a.won++;
      vsTxt = `<div class="ar-duel ${win ? 'win' : tie ? 'tie' : 'lose'}"><div><small>你</small><b>${scoreText(m, st.score)}</b></div><em>${win ? '勝' : tie ? '平手' : '敗'}</em><div><small>${esc(vs.n)}</small><b>${scoreText(vs.m, vs.sc)}</b></div></div>`;
    }
    // 經驗值：答對 6、答錯 1；每打敗一位新對手 ＋30
    const xp = st.correct * 6 + (st.answered - st.correct) + newly.length * 30;
    Store.save();
    Game.addArena(st.answered, st.correct, xp);

    const next = RIVALS[(a.beat[m] != null ? a.beat[m] : -1) + 1];
    const wrongs = st.wrong.map(({ c, chosen }) => `<details class="ar-wrong"><summary><span class="tag">${SUBJ_TAG[c.s]}</span> ${esc(c.q.stem.length > 40 ? c.q.stem.slice(0, 40) + '…' : c.q.stem)}</summary>
      <div class="stem">${fmtStem(c.q.stem)}</div>
      <p>${chosen >= 0 ? `你選：<span class="bad">${esc(c.q.options[chosen])}</span><br>` : '<span class="bad">時間到，沒有作答</span><br>'}正解：<span class="good">${esc(c.q.options[c.q.answer])}</span></p>
      ${c.q.explain ? `<div class="explain">${fmtStem(c.q.explain)}</div>` : ''}</details>`).join('');
    app().innerHTML = `${topbar('#/arena')}<div class="page arena"><section class="ar-result">
      <p class="ar-tag">${MODES[m].name}・${POOLS[p]}</p>
      <div class="ar-big">${m === 'T' ? `<b>${st.score}</b><small>分</small>` : `<b>${st.score}</b><small>題</small>`}</div>
      ${isBest && st.score > 0 ? '<p class="ar-pb">個人最佳紀錄！</p>' : prevBest ? `<p class="hint">個人最佳：${scoreText(m, prevBest.score)}</p>` : ''}
      <div class="ar-line"><span>答對 <b>${st.correct}</b>／${st.answered}</span><span>最多連對 <b>${st.maxCombo}</b></span><span>經驗值 <b>＋${xp}</b></span></div>
      ${vsTxt}
      ${newly.length ? `<div class="ar-beat">${newly.map(r => `<p>${face(r)}你打敗了 <b>${esc(r.n)}</b>，升上「${RANKS[RIVALS.indexOf(r)]}」！</p>`).join('')}</div>`
        : next ? `<p class="ar-nextr">${face(next)}下一位對手 <b>${esc(next.n)}</b>：「${esc(next.say)}」　目標 ${scoreText(m, next[m])}</p>` : ''}
      <div class="row ar-actions"><button class="primary" id="ar-again">再玩一次</button><button class="ghost" id="ar-share">挑戰同學</button><a class="ghost btn" href="#/arena">回競技場</a></div>
      <div id="ar-sharebox"></div>
      ${wrongs ? `<h2>答錯的題目（點開看解析）</h2>${wrongs}` : st.answered ? '<p class="ar-pb">全部答對！</p>' : ''}
    </section></div>`;
    const ap = app();
    ap.querySelector('#ar-again').onclick = () => { location.hash = `#/arena/play/${m}-${p}-${seedStr(newSeed())}`; };
    ap.querySelector('#ar-share').onclick = () => shareBox(m, p, seed, st);
  }

  // ---------- 挑戰同學：先問暱稱，再產生連結與短碼 ----------
  function shareBox(m, p, seed, st) {
    const box = app().querySelector('#ar-sharebox');
    if (!G().name) {
      box.innerHTML = `<div class="ar-share"><label>先取個暱稱（同學會看到，請不要用全名）<input id="ar-name" maxlength="10" placeholder="例如：小明"></label><button class="primary" id="ar-ok">確定</button></div>`;
      box.querySelector('#ar-ok').onclick = () => {
        const n = Game.cleanName(box.querySelector('#ar-name').value);
        if (!n) return;
        G().name = n; Store.save(); shareBox(m, p, seed, st);
      };
      return;
    }
    const code = encodeVs({ m, p, s: seed, n: G().name, sc: st.score, c: st.correct, a: st.answered, f: finger(p) });
    const url = `${base()}#/arena/vs/${code}`, short = shortCode(m, p, seed);
    const text = `我在「世界解鎖中」競技場（${MODES[m].name}・${POOLS[p]}）${m === 'T' ? `拿到 ${st.score} 分` : `連續答對到第 ${st.score} 題`}，敢來挑戰嗎？`;
    G().arena.sent++; Store.save(); Game.check(null);
    box.innerHTML = `<div class="ar-share"><p>${esc(text)}</p>
      <div class="ar-short"><small>挑戰碼</small><b>${short}</b></div>
      <input readonly value="${esc(url)}" id="ar-url">
      <div class="row"><button class="primary" id="ar-send">${navigator.share ? '分享給同學' : '複製連結'}</button><button class="ghost" id="ar-copy">複製挑戰碼</button></div>
      <p class="hint">同學打開連結會看到你的分數，作答同一組題目；只傳挑戰碼的話，請同學在競技場輸入，你們再互相比成績。</p></div>`;
    const copy = (s, btn) => {
      const done = () => { btn.textContent = '已複製'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, () => fallback(s, done));
      else fallback(s, done);
    };
    const fallback = (s, done) => { const t = box.querySelector('#ar-url'); const old = t.value; t.value = s; t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* 手動複製 */ } t.value = old; };
    box.querySelector('#ar-send').onclick = e => {
      if (navigator.share) navigator.share({ title: '世界解鎖中・競技場挑戰', text, url }).catch(() => {});
      else copy(`${text}\n${url}`, e.target);
    };
    box.querySelector('#ar-copy').onclick = e => copy(short, e.target);
  }

  // ---------- 路由：#/arena、#/arena/play/<模式-範圍-種子>、#/arena/vs/<連結碼> ----------
  function route(b, c) {
    stop();
    if (b === 'play') {
      const mm = String(c || '').match(/^([TS])-(mix|geo|his|civ)-([0-9A-Z]{1,5})$/i);
      if (mm) return play(mm[1].toUpperCase(), mm[2].toLowerCase(), parseInt(mm[3], 36));
    }
    if (b === 'vs' && c) return vsPage(c);
    return lobby();
  }
  window.Arena = { route, RIVALS, MODES, POOLS, _deck: deck, _decodeVs: decodeVs, _encodeVs: encodeVs, _parseShort: parseShort };
})();
