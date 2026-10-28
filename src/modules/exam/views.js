// 會考真題模組：首頁、年度模擬（#/x/sim/<年>）、知識點練習（#/x/kp/<id>）、能力練習（#/x/skill/<能力>）、
// 錯題重做（#/x/redo）、考點分布（#/x/stats）、觀念卡（#/x/card/<id>）、學習診斷（#/x/diag，內容在 core/diagnosis.js）。
// 題目是官方試題本的截圖，作答只有 A～D 四個按鈕；答錯時沿用網站的補救流程：觀念卡 → 一題網站原創題 → 回到真題。
(function () {
  const { esc, app } = window.UI;
  const X = () => window.XData;
  const P = () => window.Store.X.get();
  const LET = ['A', 'B', 'C', 'D'];
  const SUBJ_NAME = { geo: '地理', hist: '歷史', civ: '公民' };
  const CARD_NAME = { geo: '原理卡', hist: '館藏卡', civ: '概念卡' };
  const SUBJS = () => ['geo', 'hist', 'civ'].filter(s => X().items.some(it => it.subject === s));
  const subjList = () => SUBJS().map(s => SUBJ_NAME[s]).join('＋');
  const YEARS = [111, 112, 113, 114, 115];
  const fmt = s => esc(s || '').replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">會考真題</span>'}
      <nav><a href="#/hub">社會科</a><a href="#/x/stats">考點</a><a href="#/x/diag">診斷</a></nav></header>`;
  }

  // ---------- 題目圖片與放大檢視 ----------
  const imgHTML = (p, alt, cls) => p ? `<img class="x-img ${cls || ''}" loading="lazy" decoding="async" src="${esc(X().img(p))}" alt="${esc(alt || '題目圖片')}" title="點一下放大">` : '';
  function figHTML(it) {
    const g = it.group && X().groups[it.group];
    const gr = g && Array.isArray(g.range) ? `第 ${g.range[0]}–${g.range[1]} 題共用` : '題組共用';
    return `${g ? `<div class="x-group"><div class="x-cap">題組材料・${gr}</div>${imgHTML(g.img, g.text, 'x-gimg')}</div>` : ''}${imgHTML(it.img, it.text)}`;
  }
  // 點圖片 → 全螢幕檢視：雙指縮放、滾輪縮放、＋－按鈕；放大後用捲動移動
  function openViewer(src, alt) {
    const box = document.createElement('div');
    box.className = 'x-viewer';
    box.innerHTML = `<div class="x-vbar"><button class="x-vz" data-z="-1" aria-label="縮小">－</button><button class="x-vz" data-z="0">整張</button><button class="x-vz" data-z="1" aria-label="放大">＋</button><button class="x-vclose" aria-label="關閉">關閉 ×</button></div>
      <div class="x-vscroll"><img src="${esc(src)}" alt="${esc(alt || '')}"></div>`;
    document.body.appendChild(box);
    document.body.classList.add('x-noscroll');
    const sc = box.querySelector('.x-vscroll'), im = box.querySelector('img');
    let z = 1;
    const setZ = (nz, cx, cy) => {
      nz = Math.min(5, Math.max(1, nz));
      const r = sc.getBoundingClientRect();
      cx = cx == null ? r.width / 2 : cx - r.left; cy = cy == null ? r.height / 2 : cy - r.top;
      const fx = (sc.scrollLeft + cx) / (sc.scrollWidth || 1), fy = (sc.scrollTop + cy) / (sc.scrollHeight || 1);
      z = nz; im.style.width = (z * 100) + '%';
      sc.scrollLeft = fx * sc.scrollWidth - cx; sc.scrollTop = fy * sc.scrollHeight - cy;
    };
    const close = () => { box.remove(); document.body.classList.remove('x-noscroll'); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // 手機上一打開就放大到字看得清楚（約 2.2 倍），從左上角開始讀
    if (sc.clientWidth < 600) { z = 2.2; im.style.width = '220%'; sc.scrollLeft = 0; sc.scrollTop = 0; }
    box.querySelector('.x-vclose').onclick = close;
    box.querySelectorAll('.x-vz').forEach(b => b.onclick = () => setZ(b.dataset.z === '0' ? 1 : z * (b.dataset.z === '1' ? 1.5 : 1 / 1.5)));
    sc.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey && z === 1 && e.deltaY > 0) return; e.preventDefault(); setZ(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
    // 雙指縮放（pointer events；單指交給原生捲動）
    const pts = new Map(); let d0 = 0, z0 = 1;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    sc.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = z; } });
    sc.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0) { const [a, b] = [...pts.values()]; setZ(z0 * dist() / d0, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up);
    // 雙擊切換放大
    im.addEventListener('dblclick', e => setZ(z > 1 ? 1 : 2.5, e.clientX, e.clientY));
  }
  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest('img.x-img');
    if (im) openViewer(im.currentSrc || im.src, im.alt);
  });

  // ---------- 標籤與連結 ----------
  const keyHref = key => `#/x/kp/${encodeURIComponent(X().split(key).id)}`;
  const cardHref = key => `#/x/card/${encodeURIComponent(X().split(key).id)}`;
  function chipsHTML(it) {
    const keys = X().keysOf(it);
    return `<div class="chips x-chips">${keys.map(k => `<a class="chip" href="${keyHref(k)}">${esc(X().name(k))} ${X().chipKey(k, { short: true })}</a>`).join('')}
      ${it.skill.map(s => `<a class="chip soft" href="#/x/skill/${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
      ${keys.length ? `<div class="x-links">${keys.slice(0, 2).map(k => `<a href="${cardHref(k)}">看${CARD_NAME[X().split(k).subj]}：${esc(short(X().name(k)))}</a>`).join('')}${siteLinks(keys[0])}</div>` : ''}`;
  }
  function siteLinks(key) {
    const lv = X().siteLevel(key);
    return lv ? `<a href="${lv.href}">網站關卡：${esc(lv.name)}</a>` : '';
  }
  const short = (s, n) => { s = String(s || ''); n = n || 16; return s.length > n ? s.slice(0, n) + '…' : s; };
  const metaHTML = it => `<div class="qmeta"><span class="tag">${SUBJ_NAME[it.subject] || ''}</span><span class="tag soft">${esc(X().label(it))}</span>${it.group ? '<span class="tag soft">題組</span>' : ''}</div>`;

  // 觀念卡：地理＝原理卡（共用元件），歷史＝會考知識點＋相關事件的館藏卡
  function cardFor(key) {
    const { subj, id } = X().split(key);
    if (subj === 'geo') return window.Quiz.cardHTML(id);
    if (subj === 'civ') return window.Subjects.civics ? window.Subjects.civics.card(id) : `<div class="card"><h3>${esc(X().name(key))}</h3></div>`;
    const kp = X().kp[id] || { name: id, events: [] };
    const H = window.HData, hc = window.Subjects.history && window.Subjects.history.card;
    const evs = (kp.events || []).filter(e => H && H.eventById && H.eventById[e]).slice(0, 3);
    return `<div class="card x-kpcard"><div class="card-kicker">會考知識點</div><h3>${esc(kp.name)}</h3>${kp.skill ? `<p class="hint">常考能力：${esc(kp.skill)}</p>` : ''}<p class="xf-line">${X().chipKey(key)}</p></div>
      ${hc ? evs.map(e => hc(e)).join('') : ''}`;
  }

  // ---------- 一題的作答元件（練習用：作答後立即顯示解析） ----------
  function renderItem(el, it, done) {
    el.innerHTML = `${metaHTML(it)}<div class="x-fig">${figHTML(it)}</div>
      <div class="x-opts">${LET.map((l, i) => `<button class="x-opt" data-i="${i}">${l}</button>`).join('')}</div><div class="feedback"></div>`;
    el.querySelectorAll('.x-opt').forEach(b => b.onclick = () => {
      if (el.dataset.locked) return;
      el.dataset.locked = '1';
      const i = +b.dataset.i, ok = i === it.answer;
      el.querySelectorAll('.x-opt').forEach(x => { x.disabled = true; const k = +x.dataset.i; if (k === i) x.classList.add(ok ? 'right' : 'wrong', 'chosen'); if (k === it.answer) x.classList.add('right'); });
      el.querySelector('.feedback').innerHTML = `<div class="explain ${ok ? 'good' : 'bad'}"><div class="verdict">${ok ? '答對了' : `再想想看：正解是 ${LET[it.answer]}`}</div><p>${fmt(it.explain || '（解析撰寫中）')}</p></div>${chipsHTML(it)}`;
      done(ok, i);
    });
  }

  const views = {};

  // ---------- 首頁 ----------
  views.home = () => {
    const sims = P().sims, redo = Object.keys(P().recycle).filter(id => X().byId[id]).length;
    const n = s => X().items.filter(it => it.subject === s).length;
    app().innerHTML = `${topbar('#/hub')}<div class="page x-home">
      <h1>會考真題</h1>
      <p class="hint">111–115 年國中教育會考社會科的${SUBJS().map(s => SUBJ_NAME[s]).join('、')}題，共 ${X().items.length} 題（${SUBJS().map(s => `${SUBJ_NAME[s]} ${n(s)}`).join('、')}），照原卷截圖呈現；解析是我們自己寫的。</p>
      ${X().missing.length ? `<p class="hint x-wait">還在準備：${X().missing.map(p => esc(p.replace('.json', ' 年'))).join('、')}</p>` : ''}
      <div class="x-modes">
        <a class="x-mode" href="#x-years"><b>年度模擬</b><small>整年${subjList()}，計時</small></a>
        <a class="x-mode" href="#/x/kp"><b>知識點練習</b><small>同一觀念 5 年的真題</small></a>
        <a class="x-mode" href="#/x/skill"><b>能力練習</b><small>讀圖、史料判讀…跨年度</small></a>
        <a class="x-mode" href="#/x/redo"><b>錯題重做</b><small>${redo ? `${redo} 題待重做` : '目前沒有錯題'}</small></a>
      </div>
      <div class="row"><a class="ghost btn" href="#/x/stats">考點分布</a><a class="ghost btn" href="#/x/diag">學習診斷</a></div>
      <h2 class="sec" id="x-years">年度模擬</h2>
      <div class="x-years">${YEARS.map(y => {
        const its = X().yearItems(y), s = sims[y] || [];
        const best = s.reduce((m, r) => !m || r.score / r.total > m.score / m.total ? r : m, null);
        if (!its.length) return `<div class="x-year off"><b>${y} 年</b><span class="hint">資料準備中</span></div>`;
        return `<div class="x-year"><div><b>${y} 年</b><small>${SUBJS().map(s => `${SUBJ_NAME[s]} ${its.filter(i => i.subject === s).length}`).join('・')} 題・限時 ${Math.round(its.length * 75 / 60)} 分</small>
          <small>${best ? `最佳 ${best.score} / ${best.total}（${pct(best.score, best.total)}%）・做過 ${s.length} 次` : '還沒做過'}</small></div><a class="primary btn" href="#/x/sim/${y}">開始</a></div>`;
      }).join('')}</div>
      <p class="hint">試題來源：國中教育會考 111–115 年社會科試題本與參考答案（心測中心）。依著作權法第 9 條，依法令舉行的考試試題不是著作權的標的。</p>
    </div>`;
    const a = app().querySelector('a[href="#x-years"]');
    a.onclick = e => { e.preventDefault(); document.getElementById('x-years').scrollIntoView({ behavior: 'smooth' }); };
  };

  // ---------- 年度模擬 ----------
  views.sim = y => {
    const items = X().yearItems(y);
    if (!items.length) return views.home();
    const limit = items.length * 75;
    const ans = {};
    let at = 0, used = 0, since = Date.now(), paused = false, timer = null, over = false;
    app().innerHTML = `<div class="page play x-sim"><div class="banner plain"><h2>${y} 年會考・${subjList()}</h2><span class="mode">模擬模式・共 ${items.length} 題，限時 ${Math.round(limit / 60)} 分鐘，交卷後看解析</span></div>
      <div class="run">
        <div class="runbar"><button class="ghost quit">離開</button><div class="progress"><div class="fill"></div></div><div class="count"></div><div class="clock"></div><button class="ghost x-pause">暫停</button></div>
        <div class="x-stage"></div>
        <div class="x-nav"><button class="ghost x-prev">‹ 上一題</button><button class="ghost x-next">下一題 ›</button></div>
        <details class="x-palette"><summary>題號表（點題號跳題）</summary><div class="x-pal"></div></details>
        <div class="row x-submitrow"><button class="primary x-submit">交卷</button></div><div class="x-confirm"></div>
      </div><div class="x-paused" hidden><div><p>已暫停，計時停止。</p><button class="primary x-resume">繼續作答</button></div></div></div>`;
    const $ = s => app().querySelector(s);
    const stage = $('.x-stage'), clock = $('.clock');
    const elapsed = () => used + (paused ? 0 : (Date.now() - since) / 1000);
    const tick = () => {
      const left = Math.max(0, Math.round(limit - elapsed()));
      clock.textContent = mmss(left);
      clock.classList.toggle('low', left < 120);
      if (left === 0 && !over) submit(true);
    };
    timer = setInterval(tick, 1000); tick();
    const stop = () => { clearInterval(timer); window.removeEventListener('hashchange', stop); };
    window.addEventListener('hashchange', stop);
    $('.x-pause').onclick = () => { used = elapsed(); paused = true; $('.x-paused').hidden = false; stage.classList.add('x-blur'); };
    $('.x-resume').onclick = () => { since = Date.now(); paused = false; $('.x-paused').hidden = true; stage.classList.remove('x-blur'); };
    $('.quit').onclick = () => { location.hash = '#/x'; };
    $('.x-prev').onclick = () => { if (at > 0) { at--; show(); } };
    $('.x-next').onclick = () => { if (at < items.length - 1) { at++; show(); } };
    $('.x-submit').onclick = () => {
      const left = items.filter(it => ans[it.id] == null).length;
      if (!left) return submit(false);
      $('.x-confirm').innerHTML = `<div class="explain bad"><p>還有 ${left} 題沒作答，沒作答的算答錯。確定要交卷嗎？</p><div class="row"><button class="primary x-yes">確定交卷</button><button class="ghost x-no">回去作答</button></div></div>`;
      $('.x-yes').onclick = () => submit(false);
      $('.x-no').onclick = () => { $('.x-confirm').innerHTML = ''; const k = items.findIndex(it => ans[it.id] == null); if (k >= 0) { at = k; show(); } };
    };
    function palette() {
      $('.x-pal').innerHTML = items.map((it, k) => `<button class="x-pn ${ans[it.id] != null ? 'done' : ''} ${k === at ? 'now' : ''}" data-k="${k}">${it.no}</button>`).join('');
      app().querySelectorAll('.x-pn').forEach(b => b.onclick = () => { at = +b.dataset.k; show(); });
    }
    function show() {
      const it = items[at], done = Object.keys(ans).length;
      $('.count').textContent = `${at + 1} / ${items.length}`;
      $('.fill').style.width = (done / items.length * 100) + '%';
      $('.x-prev').disabled = at === 0; $('.x-next').disabled = at === items.length - 1;
      stage.innerHTML = `<div class="item x-item">${metaHTML(it).replace(`<span class="tag soft">${esc(X().label(it))}</span>`, `<span class="tag soft">第 ${it.no} 題</span>`)}<div class="x-fig">${figHTML(it)}</div>
        <div class="x-opts">${LET.map((l, i) => `<button class="x-opt ${ans[it.id] === i ? 'chosen' : ''}" data-i="${i}">${l}</button>`).join('')}</div>
        <p class="hint">選好後可以再改；全部做完按「交卷」。</p></div>`;
      stage.querySelectorAll('.x-opt').forEach(b => b.onclick = () => {
        ans[it.id] = +b.dataset.i;
        stage.querySelectorAll('.x-opt').forEach(x => x.classList.toggle('chosen', x === b));
        palette();
        $('.fill').style.width = (Object.keys(ans).length / items.length * 100) + '%';
        if (at < items.length - 1) setTimeout(() => { if (items[at] === it) { at++; show(); } }, 280);
      });
      palette();
      window.scrollTo(0, 0);
    }
    function submit(timeUp) {
      if (over) return;
      over = true; stop();
      const secs = Math.round(Math.min(limit, elapsed()));
      const results = items.map(it => ({ it, a: ans[it.id], ok: ans[it.id] === it.answer }));
      for (const r of results) window.Store.X.record({ id: r.it.id, ok: r.ok, mode: 'sim', a: r.a == null ? null : r.a });
      const score = results.filter(r => r.ok).length;
      window.Store.X.finishSim(y, score, items.length, secs);
      views.simResult(y, results, { score, total: items.length, secs, timeUp });
    }
    show();
  };

  views.simResult = (y, results, sum) => {
    const p = pct(sum.score, sum.total);
    const by = s => { const r = results.filter(x => x.it.subject === s); return `${r.filter(x => x.ok).length} / ${r.length}`; };
    const prev = (P().sims[y] || []).slice(0, -1);
    app().innerHTML = `${topbar('#/x')}<div class="page result x-result">
      <div class="score-hero x-score"><div><div class="big">${sum.score} / ${sum.total}</div><div>${p}%${sum.timeUp ? '・時間到' : ''}・用時 ${Math.floor(sum.secs / 60)} 分 ${sum.secs % 60} 秒</div><div class="hint">${SUBJS().map(s => `${SUBJ_NAME[s]} ${by(s)}`).join('・')}${prev.length ? `・上次 ${prev[prev.length - 1].score} / ${prev[prev.length - 1].total}` : ''}</div></div></div>
      <section class="x-mini">${window.Diagnosis.miniHTML(results)}</section>
      <h2 class="sec">逐題解析</h2>
      <div class="row"><label class="x-only"><input type="checkbox" id="x-wrongonly"> 只看答錯的題目（${results.filter(r => !r.ok).length} 題）</label></div>
      <div class="x-review">${results.map(reviewHTML).join('')}</div>
      <div class="row"><a class="primary btn" href="#/x">回到會考真題</a><a class="ghost btn" href="#/x/diag">完整學習診斷</a></div></div>`;
    window.scrollTo(0, 0);
    app().querySelector('#x-wrongonly').onchange = e => app().querySelector('.x-review').classList.toggle('wrong-only', e.target.checked);
  };

  function reviewHTML({ it, a, ok }) {
    return `<div class="x-rv ${ok ? 'good' : 'bad'}"><div class="x-rvh"><b>第 ${it.no} 題</b><span class="x-mark">${ok ? '○ 答對' : '× 答錯'}</span><span class="tag">${SUBJ_NAME[it.subject]}</span></div>
      <div class="x-fig">${figHTML(it)}</div>
      <p class="x-ans">你的答案：<b>${a == null ? '未作答' : LET[a]}</b>　正解：<b>${LET[it.answer]}</b></p>
      <div class="explain ${ok ? 'good' : 'bad'}"><p>${fmt(it.explain || '（解析撰寫中）')}</p></div>${chipsHTML(it)}</div>`;
  }

  // ---------- 練習（知識點／能力／錯題重做）：答錯 → 觀念卡 → 網站原創題 → 回到真題 ----------
  function practice(cfg) {
    const queue = cfg.items.map(it => ({ kind: 'x', it }));
    const usedSite = new Set();
    let idx = 0, got = 0, total = 0;
    const wrong = [];
    app().innerHTML = `<div class="page play x-practice"><div class="banner plain"><h2>${esc(cfg.title)}</h2><span class="mode">${esc(cfg.sub || '練習模式・不計時，即時解析')}</span></div>${cfg.headHTML || ''}
      <div class="run"><div class="runbar"><button class="ghost quit">離開</button><div class="progress"><div class="fill"></div></div><div class="count"></div></div>
      <div class="x-stage"></div><div class="nav"><button class="primary next" disabled>下一題</button></div></div></div>`;
    const $ = s => app().querySelector(s);
    const stage = $('.x-stage'), next = $('.next');
    $('.quit').onclick = () => { location.hash = cfg.back || '#/x'; };
    if (!queue.length) { stage.innerHTML = `<p class="empty">${esc(cfg.empty || '目前沒有題目。')}</p>`; next.parentNode.hidden = true; return; }

    function remedy(it) {
      const key = cfg.key && X().keysOf(it).includes(cfg.key) ? cfg.key : X().keysOf(it)[0];
      if (!key) return;
      const later = [{ kind: 'card', key }];
      const pool = X().siteQuestions(key);
      const plain = pool.filter(q => !q.parts && !usedSite.has(q.id));
      const cand = window.Quiz.shuffle(plain.length ? plain : pool.filter(q => !usedSite.has(q.id)));
      if (cand[0]) { usedSite.add(cand[0].id); later.push({ kind: 'site', q: cand[0], key }); }
      queue.splice(idx + 1, 0, ...later);
      const nx = queue[idx + 1 + later.length];
      if (nx) nx.again = true;
    }
    function show() {
      const item = queue[idx];
      const tq = queue.filter(x => x.kind === 'x').length, dq = queue.slice(0, idx).filter(x => x.kind === 'x').length;
      $('.count').textContent = `${Math.min(dq + 1, tq)} / ${tq}`;
      $('.fill').style.width = (dq / tq * 100) + '%';
      next.disabled = true;
      next.textContent = idx === queue.length - 1 ? '完成' : '下一題';
      window.scrollTo(0, 0);
      if (item.kind === 'card') {
        stage.innerHTML = `<div class="remedy-tag">補救 1／先補觀念</div><p>這題考的觀念是「${esc(X().name(item.key))}」。先看一下這張卡，再試一題網站的原創題。</p>${cardFor(item.key)}`;
        next.disabled = false; next.textContent = queue[idx + 1] && queue[idx + 1].kind === 'site' ? '試一題原創題' : idx === queue.length - 1 ? '完成' : '回到真題';
        return;
      }
      const box = document.createElement('div');
      box.className = 'item';
      if (item.kind === 'site') {
        stage.innerHTML = `<div class="remedy-tag">補救 2／網站原創題・同一觀念</div>`;
        stage.appendChild(box);
        const sj = X().split(item.key).subj, geo = sj === 'geo';
        const T = geo ? window.Store : sj === 'civ' ? window.Store.C : window.Store.H;
        const q = item.q;
        window.Quiz.renderItem(box, q, { mode: 'practice' }, r => {
          if (q.parts) r.parts.forEach((ok, k) => T.record({ q: q.id, part: k, ok, c: q.parts[k].concepts || q.concepts, r: q.region, m: 'exam-remedy' }));
          else T.record(Object.assign({ q: q.id, ok: r.ok, c: q.concepts, m: 'exam-remedy' }, geo ? { r: q.region } : {}));
          if (sj === 'civ' && window.CivicsStats) window.CivicsStats.afterAnswer(q, r);
          next.disabled = false; next.textContent = idx === queue.length - 1 ? '完成' : '回到真題';
        });
        return;
      }
      const it = item.it;
      stage.innerHTML = item.again ? '<div class="remedy-tag">回到真題</div>' : '';
      stage.appendChild(box);
      box.classList.add('x-item');
      renderItem(box, it, (ok, a) => {
        total++; if (ok) got++; else wrong.push(it);
        window.Store.X.record({ id: it.id, ok, mode: cfg.mode, a });
        if (!ok) remedy(it);
        next.disabled = false;
        if (!ok && queue[idx + 1] && queue[idx + 1].kind === 'card') next.textContent = '先補觀念';
        else next.textContent = idx === queue.length - 1 ? '完成' : '下一題';
      });
    }
    next.onclick = () => { if (idx >= queue.length - 1) finish(); else { idx++; show(); } };
    function finish() {
      app().innerHTML = `${topbar(cfg.back || '#/x')}<div class="page result"><div class="score-hero x-score"><div><div class="big">${got} / ${total}</div><div>${pct(got, total)}%・${esc(cfg.title)}</div></div></div>
        ${wrong.length ? `<p>答錯的題目已收進「錯題重做」，之後連續答對兩次才算過關。</p><div class="chips">${wrong.map(it => `<span class="chip">${esc(X().label(it))}</span>`).join('')}</div>` : '<p>全部答對，很穩！</p>'}
        <div class="row"><a class="primary btn" href="${cfg.back || '#/x'}">回去</a><a class="ghost btn" href="#/x/diag">學習診斷</a></div></div>`;
    }
    show();
  }

  // 沒做過、做錯過的題目排前面
  function prioritize(items) {
    const seen = {};
    for (const e of P().log) seen[e.id] = (seen[e.id] || 0) + (e.ok ? 1 : -2);
    return window.Quiz.shuffle(items).sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0));
  }

  views.kp = id => {
    if (!id) return views.kpList();
    const key = X().keyOf(id);
    const items = X().itemsOf(key);
    const lv = X().siteLevel(key);
    practice({
      title: X().name(key), sub: `知識點練習・5 年真題 ${items.length} 題`, key, mode: 'kp', back: '#/x/kp',
      items, empty: '5 年會考還沒有考過這個知識點。',
      headHTML: `<p class="xf-line x-kphead">${X().chipKey(key)}<span>${esc(X().tier(X().count(key)).desc)}</span></p><div class="row x-headlinks"><a class="ghost btn" href="${cardHref(key)}">先看觀念卡</a>${lv ? `<a class="ghost btn" href="${lv.href}">網站關卡</a>` : ''}</div>`
    });
  };
  views.skill = s => {
    if (!s) return views.skillList();
    const items = prioritize(X().itemsOfSkill(s)).slice(0, 10);
    practice({ title: s + '題', sub: `能力練習・跨年度，每回 10 題（共 ${X().itemsOfSkill(s).length} 題）`, mode: 'skill', back: '#/x/skill', items, empty: '還沒有標這個能力的題目。', headHTML: `<p class="hint x-tip">讀題方法：${esc(window.Diagnosis.SKILL_TIPS[s] || '')}</p>` });
  };
  views.redo = () => {
    const ids = Object.keys(P().recycle).filter(id => X().byId[id]);
    const items = ids.map(id => X().byId[id]).sort((a, b) => P().recycle[a.id].streak - P().recycle[b.id].streak).slice(0, 10);
    practice({ title: '錯題重做', sub: `真題錯題 ${ids.length} 題・連續答對兩次才算過關`, mode: 'redo', back: '#/x', items, empty: '目前沒有真題錯題。做一次年度模擬或知識點練習吧！' });
  };

  // 知識點清單（地理／歷史分開，依 5 年出現次數排序）
  function rankRows(subj) {
    const keys = Object.keys(X().appear).filter(k => X().split(k).subj === subj).sort((a, b) => X().count(b) - X().count(a) || X().name(a).localeCompare(X().name(b)));
    return keys;
  }
  views.kpList = () => {
    const done = {}; for (const e of P().log) { const it = X().byId[e.id]; if (it) for (const k of X().keysOf(it)) { done[k] = done[k] || { n: 0, ok: 0 }; done[k].n++; if (e.ok) done[k].ok++; } }
    const sec = subj => { const ks = rankRows(subj); return `<h2 class="sec">${SUBJ_NAME[subj]}</h2>${ks.length ? `<div class="x-kplist">${ks.map(k => `<a class="x-kprow" href="${keyHref(k)}"><span>${esc(X().name(k))}</span><small>${X().chipKey(k, { short: true })} ${X().count(k)} 題${done[k] ? `・答對 ${pct(done[k].ok, done[k].n)}%` : ''}</small></a>`).join('')}</div>` : '<p class="empty">資料準備中。</p>'}`; };
    app().innerHTML = `${topbar('#/x')}<div class="page"><h1>知識點練習</h1><p class="hint">點一個知識點，練 5 年來考過它的所有真題。答錯時會先看觀念卡，再做一題網站原創題，最後回到真題。標籤是會考出題率：${X().TIERS.filter(t => t.min).map(t => `${X().chip(t.min, { short: true })} ${t.min >= 5 ? '5 題以上' : t.min === 2 ? '2–4 題' : '1 題'}`).join('、')}。</p>${sec('geo')}${sec('hist')}${sec('civ')}</div>`;
  };
  views.skillList = () => {
    const sec = (name, skills) => `<h2 class="sec">${name}</h2><div class="x-kplist">${skills.map(s => { const n = X().itemsOfSkill(s).length; return n ? `<a class="x-kprow" href="#/x/skill/${encodeURIComponent(s)}"><span>${esc(s)}</span><small>${n} 題</small></a>` : `<div class="x-kprow off"><span>${esc(s)}</span><small>沒有題目</small></div>`; }).join('')}</div>`;
    app().innerHTML = `${topbar('#/x')}<div class="page"><h1>能力練習</h1><p class="hint">同一種能力的真題跨年度一起練，每回 10 題，沒做過和做錯的優先。</p>${sec('地理', X().GEO_SKILLS)}${sec('歷史', X().HIST_SKILLS)}${sec('公民', X().CIV_SKILLS)}</div>`;
  };

  // ---------- 考點分布 ----------
  // 排序：出題率（預設）或課本順序；可勾選列出 5 年沒考過的觀念
  const statsOpt = { sort: 'freq', zero: false };
  function allKeys(subj) {
    if (subj === 'geo') return ((window.Data && window.Data.concepts && window.Data.concepts.units) || []).flatMap(u => u.concepts.map(c => 'geo:' + c.id));
    if (subj === 'civ') return ((window.CData && window.CData.units) || []).flatMap(u => (u.concepts || []).map(c => 'civ:' + c.id));
    return X().kpList.map(p => 'hist:' + p.id);
  }
  function statKeys(subj) {
    const book = allKeys(subj), seen = new Set(book);
    // 標籤檔沒有、但真題標到的（理論上不會有）放最後
    const extra = Object.keys(X().appear).filter(k => X().split(k).subj === subj && !seen.has(k));
    let ks = book.concat(extra);
    if (!statsOpt.zero) ks = ks.filter(k => X().count(k));
    if (statsOpt.sort === 'freq') ks = ks.map((k, i) => [k, i]).sort((a, b) => X().count(b[0]) - X().count(a[0]) || a[1] - b[1]).map(x => x[0]);
    return ks;
  }
  views.stats = () => {
    const years = YEARS.filter(y => X().yearItems(y).length);
    const sec = subj => {
      const ks = statKeys(subj);
      if (!ks.length) return `<h2 class="sec">${SUBJ_NAME[subj]}</h2><p class="empty">資料準備中。</p>`;
      const ranked = rankRows(subj);
      const max = X().count(ranked[0]) || 1;
      const top = ranked.slice(0, 10);
      const heat = n => n ? `h${Math.min(4, n)}` : '';
      const tc = {}; for (const k of allKeys(subj)) { const t = X().tier(X().count(k)).name; tc[t] = (tc[t] || 0) + 1; }
      return `<h2 class="sec">${SUBJ_NAME[subj]}：高頻考點排行</h2>
        <p class="hint x-tiersum">${X().TIERS.map(t => `${X().chip(t.min, { short: true })} ${tc[t.name] || 0} 個`).join('　')}</p>
        <ol class="x-rank">${top.map(k => { const lv = X().siteLevel(k); return `<li><div class="x-rk"><a href="${keyHref(k)}">${esc(X().name(k))} ${X().chipKey(k, { short: true })}</a><span class="x-bar"><i style="width:${X().count(k) / max * 100}%"></i></span><b>${X().count(k)}</b></div>
          <div class="x-links"><a href="${keyHref(k)}">練真題</a><a href="${cardHref(k)}">${CARD_NAME[subj]}</a>${lv ? `<a href="${lv.href}">網站關卡</a>` : ''}</div></li>`; }).join('')}</ol>
        <h3>${SUBJ_NAME[subj]}：知識點 × 年份</h3>
        <div class="mx-wrap"><table class="x-heat"><thead><tr><th>知識點</th><th>出題率</th>${years.map(y => `<th>${y}</th>`).join('')}<th>合計</th><th>網站</th></tr></thead><tbody>
        ${ks.map(k => { const lv = X().siteLevel(k), ay = X().appearYear[k] || {}, n = X().count(k); return `<tr${n ? '' : ' class="x-zero"'}><th>${n ? `<a href="${keyHref(k)}">${esc(short(X().name(k), 18))}</a>` : esc(short(X().name(k), 18))}</th><td class="xf-cell">${X().chip(n, { short: true })}</td>${years.map(y => `<td class="${heat(ay[y] || 0)}">${ay[y] || ''}</td>`).join('')}<td><b>${n}</b></td><td>${lv ? `<a href="${lv.href}">關卡</a>` : `<a href="${cardHref(k)}">卡</a>`}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    };
    app().innerHTML = `${topbar('#/x')}<div class="page x-stats"><h1>考點分布</h1>
      <p class="hint">統計 ${years.length ? `${years[0]}–${years[years.length - 1]}` : ''} 年會考社會科的${SUBJS().map(s => SUBJ_NAME[s]).join('、')}題（一題標了幾個知識點就各算一次）。點知識點可以練它的真題。</p>
      ${X().legendHTML()}
      <div class="x-sort"><span>表格排序：</span><button class="ghost ${statsOpt.sort === 'freq' ? 'on' : ''}" data-sort="freq">出題率高→低</button><button class="ghost ${statsOpt.sort === 'book' ? 'on' : ''}" data-sort="book">課本順序</button>
        <label><input type="checkbox" class="x-zerobox" ${statsOpt.zero ? 'checked' : ''}> 列出沒考過的觀念</label></div>
      ${sec('geo')}${sec('hist')}${sec('civ')}<p class="legend x-legend"><span class="h1">1</span><span class="h2">2</span><span class="h3">3</span><span class="h4">4+</span>＝該年出現題數</p></div>`;
    app().querySelectorAll('.x-sort button').forEach(b => b.onclick = () => { statsOpt.sort = b.dataset.sort; keepScroll(views.stats); });
    app().querySelector('.x-zerobox').onchange = e => { statsOpt.zero = e.target.checked; keepScroll(views.stats); };
  };
  const keepScroll = f => { const y = window.scrollY; f(); window.scrollTo(0, y); };

  // ---------- 觀念卡 ----------
  views.card = id => {
    const key = X().keyOf(id), lv = X().siteLevel(key), sts = X().storiesOf(key);
    app().innerHTML = `${topbar('#/x')}<div class="page x-cardpage">${cardFor(key)}
      <div class="row">${X().count(key) ? `<a class="primary btn" href="${keyHref(key)}">練這個觀念的真題（${X().count(key)} 題）</a>` : ''}${lv ? `<a class="ghost btn" href="${lv.href}">網站關卡：${esc(lv.name)}</a>` : ''}</div>
      ${sts.length ? `<p class="hint">相關故事：${sts.map(ch => `<a href="${ch._href || '#/h/story/' + encodeURIComponent(ch.id)}">${esc(ch.title || ch.id)}</a>`).join('、')}</p>` : ''}</div>`;
  };

  views.diag = () => {
    app().innerHTML = `${topbar('#/x')}<div class="page x-diagpage"></div>`;
    window.Diagnosis.render(app().querySelector('.x-diagpage'));
  };

  function route(a, b) {
    if (X().error && !X().items.length && a !== 'diag') { app().innerHTML = `${topbar('#/hub')}<div class="page"><h1>會考真題</h1><p class="empty">真題資料讀不到：${esc(X().error)}</p></div>`; return; }
    if (a === 'sim') return b ? views.sim(+b) : views.home();
    if (a === 'kp') return views.kp(b);
    if (a === 'skill') return views.skill(b);
    if (a === 'redo') return views.redo();
    if (a === 'stats') return views.stats();
    if (a === 'card') return views.card(b);
    if (a === 'diag') return views.diag();
    return views.home();
  }

  // 首頁卡片的封面：程式畫的答案卡（沒有插畫）
  const COVER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#e7eaee"/><rect x="40" y="22" width="150" height="160" rx="6" fill="#fff" stroke="#9aa6b2"/>${[0, 1, 2, 3, 4, 5, 6].map(r => [0, 1, 2, 3].map(c => `<rect x="${62 + c * 28}" y="${40 + r * 20}" width="18" height="10" rx="2" fill="${(r * 3 + c * 5) % 4 === 1 ? '#4a5a6a' : '#fff'}" stroke="#9aa6b2"/>`).join('')).join('')}<circle cx="232" cy="92" r="34" fill="none" stroke="#b5523b" stroke-width="6"/><text x="232" y="104" font-size="34" text-anchor="middle" fill="#b5523b" font-family="sans-serif" font-weight="700">會</text></svg>`);

  window.Subjects.exam = {
    name: '會考真題', title: '111–115 年地理＋歷史＋公民', book: false, home: '#/x', cover: () => COVER,
    blurb: '歷屆會考原題：年度模擬、知識點與能力練習；答錯就回網站補觀念。',
    load: () => X().load(), route,
    about: '會考真題：國中教育會考 111–115 年社會科試題本與參考答案（心測中心），收地理、歷史、公民題；依著作權法第 9 條，依法令舉行之考試試題不是著作權的標的。解析由本站自行撰寫。'
  };
  window.Exam = { views, cardFor, renderItem, figHTML, keyHref, cardHref };
})();
