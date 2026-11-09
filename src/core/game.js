// 成長系統（各科共用）：經驗值與等級、每日題數與連續練習天數、徽章、提示泡泡、首頁戰績卡、「我的戰績」頁 #/me。
// 每次作答由 Store.onAnswer 通知（地理、歷史、公民、會考真題都算）；競技場的成績另外由 arena 呼叫 Game.addArena。
// 第一次載入時，從各科既有的作答紀錄補算經驗值與每日題數，舊進度不會歸零。
(function () {
  const { esc } = window.UI;
  const Store = window.Store;
  const G = () => Store.G();

  // ---------- 規則 ----------
  const XP_OK = 10, XP_TRY = 2;          // 答對 10 點；答錯也有 2 點（有練就有收穫）
  const STREAK_MIN = 10;                 // 一天練滿 10 題才算「連續練習」的一天
  const GOALS = [10, 20, 30, 50];
  const SUBJ_NAME = { geo: '地理', history: '歷史', civics: '公民', exam: '會考真題', arena: '競技場' };
  // 升到下一級需要的經驗值：100、140、180…（每級多 40）
  const need = L => 100 + 40 * (L - 1);
  const TITLES = [[1, '見習生'], [5, '探索者'], [10, '解謎者'], [15, '遠征隊員'], [20, '博學家'], [30, '社會科大師'], [40, '傳奇']];
  function levelOf(xp) {
    let L = 1, rest = Math.max(0, Math.floor(xp || 0));
    while (rest >= need(L)) { rest -= need(L); L++; }
    return { level: L, into: rest, next: need(L), title: TITLES.filter(t => L >= t[0]).pop()[1] };
  }

  // 本地日期（臺灣時間），不用 UTC，免得晚上八點後算到隔天
  const dayKey = d => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shift = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
  const todayKey = () => dayKey();
  const todayCount = () => G().days[todayKey()] || 0;
  // 連續天數：從今天往前數；今天還沒滿 10 題時從昨天數（今天還有機會延續）
  function streak() {
    const days = G().days;
    let k = todayKey(), n = 0;
    if ((days[k] || 0) < STREAK_MIN) k = shift(k, -1);
    while ((days[k] || 0) >= STREAK_MIN) { n++; k = shift(k, -1); }
    return n;
  }
  function bestStreak() {
    const keys = Object.keys(G().days).filter(k => G().days[k] >= STREAK_MIN).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) { cur = prev && shift(prev, 1) === k ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
    return best;
  }
  const totals = () => {
    let n = 0, ok = 0;
    for (const v of Object.values(G().subj)) { n += v.n || 0; ok += v.ok || 0; }
    return { n, ok };
  };
  const goalDays = () => Object.values(G().days).filter(v => v >= G().goal).length;

  // ---------- 徽章 ----------
  const S = () => Store.get();
  const subjOk = k => (G().subj[k] && G().subj[k].ok) || 0;
  const BADGES = [
    { id: 'first', name: '第一步', desc: '答對第 1 題', test: () => totals().ok >= 1 },
    { id: 'q100', name: '百題達人', desc: '累積練習 100 題', test: () => totals().n >= 100 },
    { id: 'q500', name: '五百題', desc: '累積練習 500 題', test: () => totals().n >= 500 },
    { id: 'q1000', name: '千題俱樂部', desc: '累積練習 1000 題', test: () => totals().n >= 1000 },
    { id: 'q3000', name: '題海航行家', desc: '累積練習 3000 題', test: () => totals().n >= 3000 },
    { id: 's3', name: '三天不間斷', desc: '連續 3 天每天練滿 10 題', test: () => bestStreak() >= 3 },
    { id: 's7', name: '一週全勤', desc: '連續 7 天每天練滿 10 題', test: () => bestStreak() >= 7 },
    { id: 's14', name: '兩週全勤', desc: '連續 14 天每天練滿 10 題', test: () => bestStreak() >= 14 },
    { id: 's30', name: '整月全勤', desc: '連續 30 天每天練滿 10 題', test: () => bestStreak() >= 30 },
    { id: 'goal10', name: '目標達成者', desc: '達成每日目標 10 天', test: () => goalDays() >= 10 },
    { id: 'd100', name: '爆肝的一天', desc: '一天練習 100 題', test: () => Object.values(G().days).some(v => v >= 100) },
    { id: 'geo200', name: '地圖通', desc: '地理答對 200 題', test: () => subjOk('geo') >= 200 },
    { id: 'his200', name: '時光旅人', desc: '歷史答對 200 題', test: () => subjOk('history') >= 200 },
    { id: 'civ200', name: '青禾里好鄰居', desc: '公民答對 200 題', test: () => subjOk('civics') >= 200 },
    { id: 'sim1', name: '模擬考實戰', desc: '完成一次會考年度模擬', test: () => Object.keys(S().exam.sims || {}).length > 0 },
    { id: 'lv10', name: '十級解謎者', desc: '升到第 10 級', test: () => levelOf(G().xp).level >= 10 },
    { id: 'arena1', name: '初登競技場', desc: '完成一場競技場挑戰', test: () => G().arena.runs >= 1 },
    { id: 'rival3', name: '連過三關', desc: '在任一競技模式擊敗第 3 位對手', test: () => Object.values(G().arena.beat).some(v => v >= 2) },
    { id: 'rivalAll', name: '競技場傳說', desc: '在任一競技模式擊敗全部 7 位對手', test: () => Object.values(G().arena.beat).some(v => v >= 6) },
    { id: 'combo10', name: '十連對', desc: '競技場連續答對 10 題', test: () => G().arena.maxCombo >= 10 },
    { id: 'combo20', name: '二十連對', desc: '競技場連續答對 20 題', test: () => G().arena.maxCombo >= 20 },
    { id: 'send', name: '下戰帖', desc: '發起一次同學挑戰', test: () => G().arena.sent >= 1 },
    { id: 'won', name: '迎戰勝利', desc: '接受同學挑戰並贏過對方', test: () => G().arena.won >= 1 }
  ];

  // ---------- 提示泡泡（不發聲，2.6 秒後淡出；同時多則依序排隊） ----------
  const queue = [];
  let showing = false;
  function toast(html, kind) {
    queue.push({ html, kind });
    if (!showing) next();
  }
  function next() {
    const t = queue.shift();
    if (!t) { showing = false; return; }
    showing = true;
    const el = document.createElement('div');
    el.className = 'g-toast ' + (t.kind || '');
    el.innerHTML = t.html;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => { el.remove(); next(); }, 300); }, 2600);
  }

  // 檢查新徽章與升級；quiet＝補算舊紀錄時不跳提示
  function check(beforeLevel, quiet) {
    const g = G(), now = Date.now(), got = [];
    for (const b of BADGES) if (!g.badges[b.id] && b.test()) { g.badges[b.id] = now; got.push(b); }
    const L = levelOf(g.xp).level;
    Store.save();
    if (quiet) return;
    if (beforeLevel != null && L > beforeLevel) toast(`<b>升級！</b> 第 ${L} 級・${esc(levelOf(g.xp).title)}`, 'lv');
    for (const b of got) toast(`${badgeIcon(b.id, true)}<span><b>獲得徽章</b>${esc(b.name)}</span>`, 'badge');
  }

  // ---------- 記錄 ----------
  function count(subj, ok, n) {
    const g = G(), k = todayKey();
    g.days[k] = (g.days[k] || 0) + (n || 1);
    const s = g.subj[subj] = g.subj[subj] || { n: 0, ok: 0 };
    s.n += n || 1;
    if (ok) s.ok += typeof ok === 'number' ? ok : 1;
  }
  function onAnswer(subj, ok) {
    const g = G(), before = levelOf(g.xp).level, prevToday = todayCount();
    count(subj, ok);
    g.xp += ok ? XP_OK : XP_TRY;
    if (prevToday < g.goal && todayCount() >= g.goal) toast(`<b>今天的目標達成了</b> ${g.goal} 題`, 'goal');
    check(before);
  }
  // 競技場一場結束：作答數、答對數、這場給的經驗值（arena.js 算好）
  function addArena(n, ok, xp) {
    const g = G(), before = levelOf(g.xp).level, prevToday = todayCount();
    if (n > 0) count('arena', ok, n);
    g.xp += Math.max(0, Math.round(xp || 0));
    if (prevToday < g.goal && todayCount() >= g.goal) toast(`<b>今天的目標達成了</b> ${g.goal} 題`, 'goal');
    check(before);
  }

  // 第一次使用：從各科舊作答紀錄補算（只做一次）
  function seed() {
    const s = S(), g = s.game;
    if (g.seeded) return;
    const logs = [['geo', s.log], ['history', s.history.log], ['civics', s.civics.log], ['exam', s.exam.log]];
    for (const [subj, log] of logs) for (const e of log || []) {
      if (!e || !e.ts) continue;
      const k = dayKey(new Date(e.ts));
      g.days[k] = (g.days[k] || 0) + 1;
      const t = g.subj[subj] = g.subj[subj] || { n: 0, ok: 0 };
      t.n++; if (e.ok) t.ok++;
      g.xp += e.ok ? XP_OK : XP_TRY;
    }
    g.seeded = true;
    check(null, true);
  }

  // 每天只保留最近 400 天的題數（存檔不會越來越大）
  function trim() {
    const g = G(), keys = Object.keys(g.days).sort();
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete g.days[k];
  }

  // ---------- 畫面 ----------
  // 徽章圖示：程式畫的圓形章，依 id 換顏色與符號
  const ICON = {
    first: ['#4f8a4a', '1'], q100: ['#3d7a80', '100'], q500: ['#3b6ea8', '500'], q1000: ['#6a4c93', '千'], q3000: ['#2f3a40', '海'],
    s3: ['#c48a2c', '3'], s7: ['#c48a2c', '7'], s14: ['#b5523b', '14'], s30: ['#b5523b', '30'], goal10: ['#4f8a4a', '◎'], d100: ['#b5523b', '百'],
    geo200: ['#3d7a80', '地'], his200: ['#a8743f', '史'], civ200: ['#2e7d5b', '公'], sim1: ['#4a5a6a', '考'], lv10: ['#6a4c93', '10'],
    arena1: ['#8a3b5c', '競'], rival3: ['#8a3b5c', '三'], rivalAll: ['#5b3a8a', '冠'], combo10: ['#c48a2c', '10'], combo20: ['#b5523b', '20'],
    send: ['#3b6ea8', '戰'], won: ['#4f8a4a', '勝']
  };
  function badgeIcon(id, on) {
    const [c, t] = ICON[id] || ['#6b7378', '?'];
    const fill = on ? c : '#d8d2c4', fs = t.length >= 3 ? 11 : t.length === 2 ? 14 : 17;
    return `<svg class="g-badge-ic" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="${fill}"/><circle cx="20" cy="20" r="14.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="2 2.4"/><text x="20" y="${20 + fs * .36}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff">${esc(t)}</text></svg>`;
  }
  function ring(v, max, label) {
    const r = 21, c = 2 * Math.PI * r, p = Math.min(1, max ? v / max : 0);
    return `<svg class="g-ring" viewBox="0 0 52 52" aria-label="${esc(label)}"><circle cx="26" cy="26" r="${r}" fill="none" stroke="#e3dccd" stroke-width="6"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="${p >= 1 ? '#4f8a4a' : '#c48a2c'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/><text x="26" y="24" text-anchor="middle" font-size="12" font-weight="800" fill="#2f3a40">${v}</text><text x="26" y="36" text-anchor="middle" font-size="9" fill="#6b7378">/${max}</text></svg>`;
  }
  // 首頁戰績卡
  function hubHTML() {
    const g = G(), lv = levelOf(g.xp), st = streak(), td = todayCount();
    const nb = Object.keys(g.badges).length;
    const hint = td >= g.goal ? '今天的目標完成了，想衝分數就去競技場！'
      : td >= STREAK_MIN || !st ? `今天再練 ${g.goal - td} 題就達成目標`
      : `今天練滿 ${STREAK_MIN} 題就能延續連續紀錄`;
    return `<section class="g-card">
      <a class="g-me" href="#/me">
        <div class="g-lv"><small>Lv</small><b>${lv.level}</b></div>
        <div class="g-info"><b>${esc(lv.title)}</b><div class="g-xpbar"><i style="width:${Math.round(lv.into / lv.next * 100)}%"></i></div><small>再 ${lv.next - lv.into} 點經驗值升級・徽章 ${nb}/${BADGES.length}</small></div>
        <div class="g-streak ${st ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6 1 2.6 2 3 0-3.2-.4-6 .8-9.2z"/></svg><b>${st}</b><small>連續天</small></div>
        ${ring(td, g.goal, '今天的題數')}
      </a>
      <p class="g-hint">${esc(hint)}</p>
      <a class="g-arena-btn" href="#/arena"><span class="g-arena-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12v3a6 6 0 0 1-4 5.7V14h3v3H7v-3h3v-2.3A6 6 0 0 1 6 6z" /><rect x="5" y="18" width="14" height="3" rx="1"/></svg></span><span><b>競技場</b><small>限時挑戰・打敗對手・挑戰同學</small></span><i>›</i></a>
    </section>`;
  }

  // 「我的戰績」頁
  function mePage(topbar) {
    const g = G(), lv = levelOf(g.xp), tot = totals();
    const keys = []; for (let i = 13; i >= 0; i--) keys.push(shift(todayKey(), -i));
    const mx = Math.max(g.goal, ...keys.map(k => g.days[k] || 0));
    const bars = keys.map(k => { const v = g.days[k] || 0; return `<div class="g-bar ${v >= g.goal ? 'met' : v >= STREAK_MIN ? 'ok' : ''}" title="${k}：${v} 題"><i style="height:${Math.round(v / mx * 100)}%"></i><small>${+k.slice(8)}</small></div>`; }).join('');
    const subjRows = Object.entries(g.subj).filter(([, v]) => v.n).map(([k, v]) => `<tr><td>${esc(SUBJ_NAME[k] || k)}</td><td>${v.n}</td><td>${v.ok}</td><td>${Math.round(v.ok / v.n * 100)}%</td></tr>`).join('');
    window.UI.app().innerHTML = `${topbar('#/hub')}<div class="page g-me-page">
      <h1>我的戰績</h1>
      <section class="g-lvcard"><div class="g-lv big"><small>Lv</small><b>${lv.level}</b></div><div><b class="g-title">${esc(lv.title)}</b><div class="g-xpbar"><i style="width:${Math.round(lv.into / lv.next * 100)}%"></i></div><small>經驗值 ${g.xp}・再 ${lv.next - lv.into} 點升到第 ${lv.level + 1} 級</small></div></section>
      <section class="g-stats">
        <div><b>${streak()}</b><small>目前連續天數</small></div><div><b>${bestStreak()}</b><small>最長連續天數</small></div>
        <div><b>${tot.n}</b><small>累積題數</small></div><div><b>${tot.n ? Math.round(tot.ok / tot.n * 100) : 0}%</b><small>答對率</small></div>
      </section>
      <h2>最近 14 天</h2>
      <div class="g-bars">${bars}</div>
      <p class="hint">綠色＝達成每日目標（${g.goal} 題）；黃色＝練滿 ${STREAK_MIN} 題，算進連續天數。</p>
      ${subjRows ? `<h2>各科題數</h2><table class="g-table"><tr><th>科目</th><th>題數</th><th>答對</th><th>答對率</th></tr>${subjRows}</table>` : ''}
      <h2>徽章 ${Object.keys(g.badges).length}/${BADGES.length}</h2>
      <div class="g-badges">${BADGES.map(b => `<div class="g-badge ${g.badges[b.id] ? 'on' : ''}">${badgeIcon(b.id, !!g.badges[b.id])}<b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
      <h2>設定</h2>
      <section class="g-set"><label>每日目標
        <select id="g-goal">${GOALS.map(n => `<option value="${n}" ${g.goal === n ? 'selected' : ''}>${n} 題</option>`).join('')}</select></label>
        <label>挑戰同學時顯示的暱稱 <input id="g-name" maxlength="10" placeholder="例如：小明" value="${esc(g.name || '')}"></label>
        <p class="hint">暱稱只會放進你傳給同學的挑戰連結，不會上傳到任何地方。請不要用全名。</p></section>
      <div class="row"><a class="primary btn" href="#/arena">去競技場</a><a class="ghost btn" href="#/hub">回首頁</a></div></div>`;
    const ap = window.UI.app();
    ap.querySelector('#g-goal').onchange = e => { G().goal = +e.target.value; Store.save(); };
    ap.querySelector('#g-name').onchange = e => { G().name = cleanName(e.target.value); e.target.value = G().name; Store.save(); };
  }
  // 暱稱：去掉前後空白與控制字元，最多 10 字
  const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 10).trim();

  Store.onAnswer(onAnswer);
  window.Game = { levelOf, streak, bestStreak, todayCount, totals, BADGES, badgeIcon, toast, addArena, hubHTML, mePage, cleanName, check, init() { seed(); trim(); Store.save(); } };
})();
