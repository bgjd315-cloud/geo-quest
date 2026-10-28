// 公民模組《青禾里》：首頁（五個領域）、領域頁（依冊次列單元＋魔王題組）、單元頁（故事引入 → 概念闖關 → 並排辨析 → 公民筆記）、
// 故事（#/c/story/<章id>）、闖關（#/c/play/<單元>/<practice|sim>）、並排辨析（#/c/pair/<單元|all>）、魔王題組（#/c/boss/<領域|cross>）、
// 案件分流挑戰（#/c/cases）、公民筆記（#/c/notes）、弱點分析（#/c/weak、#/c/cell/<領域>/<能力>）、衝刺模式（#/c/sprint）、人物介紹（#/c/people）。
(function () {
  const { esc, app } = window.UI;
  const C = () => window.CData;
  const P = () => window.Store.C.get();
  const T = () => window.Store.C;
  const ST = () => window.CivicsStats;
  const Q = () => window.Quiz;
  const fmt = s => esc(s || '').replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const paras = v => window.CData.paraList(v).map(t => `<p>${esc(t)}</p>`).join('');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const XD = () => window.XData && window.XData.civShare ? window.XData : null;

  // ---------- 插畫（沒有圖就用色塊、文字替代） ----------
  function pic(name, cls, fallback) {
    const src = C().imgSrc(name);
    const fb = `<span class="c-fb ${cls || ''}">${fallback || ''}</span>`;
    if (!src) return fb;
    return `<img class="${cls || ''}" src="${src}" alt="" onerror="var n=this.nextElementSibling;if(n)n.hidden=false;this.remove()"><span class="c-fb ${cls || ''}" hidden>${fallback || ''}</span>`;
  }
  // 角色頭像：阿晴用 aqing_<表情>，其他人 char_<id>；沒有圖時顯示名字裡的一個字
  const AVA = { aqing: '晴', dad: '爸', mom: '媽', grandma: '嬤', xiaoan: '安', linjie: '林', ruanayi: '阮', chenbobo: '陳', wulawyer: '吳', cand_jiang: '江', cand_zheng: '鄭' };
  function ava(key, pose, cls) {
    const c = C().charOf(key), id = c ? c.id : key;
    const name = id === 'aqing' ? 'aqing_' + (pose || 'idle') : 'char_' + id;
    return `<span class="c-ava c-ava-${esc(id)} ${cls || ''}">${pic(name, 'c-ava-img', `<b>${esc(AVA[id] || String((c && c.name) || key || '？').slice(-1))}</b>`)}</span>`;
  }
  const guide = (text, pose) => `<div class="talk c-talk">${ava('aqing', pose)}<div class="bubble">${text}</div></div>`;
  // 角色說的話（迷思句、對話）：頭像＋名字＋泡泡
  function sayHTML(key, text) {
    const c = C().charOf(key);
    return `<div class="talk c-talk c-say">${ava(key)}<div class="bubble"><small class="c-who">${esc(c ? c.name : key || '')}</small>「${esc(String(text || '').replace(/^「|」$/g, ''))}」</div></div>`;
  }
  // 嚮導圖給答題引擎（要一個圖片網址）：確定有插畫才用，否則用程式畫的頭像
  const AQ_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e3f1e8" stroke="#2e7d5b" stroke-width="3"/><text x="32" y="42" font-size="28" text-anchor="middle" fill="#2e7d5b" font-family="sans-serif" font-weight="700">晴</text></svg>');
  const guideImg = pose => C().imgKnown('aqing_' + (pose || 'think')) || AQ_SVG;
  const notice = () => `<p class="c-notice">${esc(C().notice || '故事人物為虛構')}</p>`;

  // 領域：配色、代表字、封面
  const DOM = { 社會: { k: 'society', ch: '社' }, 政治: { k: 'politics', ch: '政' }, 法律: { k: 'law', ch: '法' }, 經濟: { k: 'economy', ch: '經' }, 全球關聯: { k: 'global', ch: '全' } };
  const domCover = (d, cls) => pic('dom_' + DOM[d].k, 'c-domimg ' + (cls || ''), `<span class="c-domfb c-d-${DOM[d].k}"><b>${DOM[d].ch}</b><small>${esc(d)}</small></span>`);
  const chapterImg = u => 'ch_' + String(u || '').replace(/-/g, '_');

  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">青禾里</span>'}
      <nav><a href="#/hub">社會科</a><a href="#/c/notes">筆記</a><a href="#/c/weak">弱點</a><a href="#/settings">設定</a></nav></header>`;
  }

  // ---------- 進度 ----------
  const storyDone = id => !!(P().stories[id] && P().stories[id].done);
  const questDone = id => !!(P().levels[id] && P().levels[id].done);
  const hasContent = u => !!(C().liveOfUnit(u.id).length || C().chapterOfUnit(u.id));
  // 一個單元完成：有題目的要闖過、有故事的要讀完
  function unitDone(u) {
    const ch = C().chapterOfUnit(u.id);
    if (!hasContent(u)) return false;
    return (!C().liveOfUnit(u.id).length || questDone(u.id)) && (!ch || !C().chapterPlayable(ch) || storyDone(ch.id));
  }
  function unitProgress(u) {
    const steps = [];
    const ch = C().chapterOfUnit(u.id);
    if (ch) steps.push(storyDone(ch.id));
    if (C().liveOfUnit(u.id).length) steps.push(questDone(u.id));
    return steps.length ? steps.filter(Boolean).length / steps.length : 0;
  }
  // 領域完成：有內容的單元全部完成（至少一個單元有內容）
  function domainDone(d) {
    const us = C().unitsOfDomain(d).filter(hasContent);
    return us.length > 0 && us.every(unitDone);
  }
  // 魔王題組：單一領域的在該領域完成後開放；跨領域的在相關領域至少完成兩個（只列兩個就要兩個都完成）後開放
  // 題組屬於主領域：主領域完成就開放；有相關領域（跨領域）的，相關的領域中完成兩個也開放
  function bossOpen(q) {
    const ds = q.domains && q.domains.length ? q.domains : [q.domain];
    return domainDone(q.domain) || (ds.length > 1 && ds.filter(domainDone).length >= 2);
  }
  const bossesOf = d => C().liveBoss().filter(q => q.domain === d);
  const crossBosses = () => C().liveBoss().filter(q => (q.domains || []).length > 1);
  const myCards = () => P().cards || [];
  function collect(ids) {
    const have = new Set(myCards());
    const fresh = ids.filter(c => C().conceptName[c] && !have.has(c));
    if (fresh.length) T().set({ cards: myCards().concat(fresh) });
    return fresh;
  }

  // ---------- 概念卡（公民筆記） ----------
  function cardHTML(id) {
    const c = C().cards[id], k = C().concepts[id];
    const name = C().conceptName[id] || id;
    const u = C().unitById[C().conceptUnit[id]];
    const xc = window.XData && window.XData.chipKey ? window.XData.chipKey('civ:' + id) : '';
    const pairs = C().pairs.filter(p => p.concepts.includes(id));
    const body = c ? `<p>${fmt(c.text)}</p>${c.tip ? `<p class="tip">${fmt(c.tip)}</p>` : ''}`
      : k ? `<p>${esc(k.definition || '')}</p>${k.keyPoints ? `<p class="tip">判斷要點：${esc(k.keyPoints)}</p>` : ''}${k.misconception ? `<p class="c-mis">常見誤解：${esc(k.misconception)}</p>` : ''}` : '<p>這張概念卡還在準備中。</p>';
    return `<div class="card c-card"><div class="card-kicker">概念卡${xc}</div><h3>${esc((c && c.title) || name)}</h3>${u ? `<p class="hint">${esc(u.domain)}・${esc(u.volume)} ${esc(u.lesson)}〈${esc(u.title)}〉</p>` : ''}${body}
      ${pairs.length ? `<div class="c-cardpairs">${pairs.map(p => `<span class="chip">易混淆：${esc(p.labels.join('／'))}</span>`).join('')}</div>` : ''}</div>`;
  }

  const views = {};

  // ---------- 首頁 ----------
  views.home = () => {
    const live = C().live();
    const open = ST().openPairs(), weak = ST().weakConcepts(3);
    const nCh = C().chapters.filter(C().chapterPlayable).length;
    app().innerHTML = `${topbar()}<div class="page c-home">
      <div class="c-banner">${pic('civ_home', 'c-banner-img', bannerSVG())}<div class="c-banner-t"><h1>青禾里</h1><p>${esc(C().setting || '虛構社區')}</p></div></div>
      ${notice()}
      ${guide(live.length || nCh ? `我是阿晴，住在青禾里二鄰。巷口早餐店、里辦公處、法律服務站……每天都有和公民課有關的事。${open.length ? `你有 ${open.length} 組容易混淆的概念還沒分清楚，要不要先去並排辨析？` : '想從哪個領域開始？'}` : '我是阿晴。青禾里的故事和題目還在整理中，整理好就會出現在這裡。', open.length ? 'think' : 'idle')}
      <h2 class="sec">五個領域</h2>
      <section class="c-domains">${C().DOMAINS.map(d => {
        const us = C().unitsOfDomain(d), done = us.filter(unitDone).length, n = live.filter(q => q.domain === d).length;
        const books = [...new Set(us.map(u => u.book))];
        return `<a class="c-dom c-d-${DOM[d].k}" href="#/c/d/${DOM[d].k}">${domCover(d)}<div><b>${esc(d)}</b><span>第${books.join('、')}冊・${us.length} 個單元</span><div class="bar"><i style="width:${pct(done, us.length)}%"></i></div><small>${n ? `${n} 題・完成 ${done}/${us.length} 單元` : '內容準備中'}${domainDone(d) ? '・魔王題組已開放' : ''}</small>${XD() ? XD().shareHTML(XD().civShare('dom', d)) : ''}</div></a>`;
      }).join('')}</section>
      ${weak.length ? `<section class="today"><h2>今天建議練習</h2><div class="chips">${weak.map(w => `<span class="chip">${esc(C().conceptName[w.c])}${w.acc != null ? `・${Math.round(w.acc * 100)}%` : ''}</span>`).join('')}</div><a class="primary btn" href="#/c/sprint">衝刺模式（每天 15 題）</a></section>` : ''}
      <h2 class="sec">工具</h2>
      <section class="c-tools">
        <a class="c-tool" href="#/c/sprint"><b>衝刺模式</b><small>每天 15 題：弱點、混淆、近期錯題</small></a>
        <a class="c-tool" href="#/c/pair/all"><b>並排辨析</b><small>${open.length ? `${open.length} 組待解除` : '目前沒有混淆紀錄'}</small></a>
        <a class="c-tool" href="#/c/cases">${pic('civ_cases', 'c-toolimg', '<i class="c-icon c-icon-case"></i>')}<b>案件分流挑戰</b><small>${C().liveCases().length ? `連續 10 案：分類型、找救濟` : '案件準備中'}</small></a>
        <a class="c-tool" href="#/c/notes">${pic('civ_notebook', 'c-toolimg', '<i class="c-icon c-icon-note"></i>')}<b>公民筆記</b><small>已收 ${myCards().length} 張概念卡</small></a>
        <a class="c-tool" href="#/c/weak"><b>弱點分析</b><small>領域 × 能力矩陣</small></a>
        <a class="c-tool" href="#/c/people"><b>人物介紹</b><small>青禾里的鄰居們</small></a>
      </section>
      ${crossBosses().length ? `<h2 class="sec">跨領域魔王題組</h2>${crossHTML()}` : ''}
    </div>`;
  };
  function crossHTML() {
    const bs = crossBosses();
    const open = bs.filter(bossOpen);
    return `<div class="c-bossbox">${pic('boss_cross', 'c-bossimg', '<b>跨</b>')}<div><p>${bs.length} 組跨領域情境（例如法律＋政治＋經濟）。主領域完成、或相關領域完成兩個，就開放。</p>
      <p class="hint">${bs.map(q => `${esc(q.domains.join('＋'))}${bossOpen(q) ? '（已開放）' : ''}`).join('・')}</p>
      ${open.length ? `<a class="primary btn" href="#/c/boss/cross">挑戰（${open.length} 組）</a>` : '<span class="tag wait">完成兩個相關領域後開放</span>'}</div></div>`;
  }
  // 首頁橫幅的替代圖：程式畫的社區（山、房子、樹）
  function bannerSVG() {
    return `<svg class="c-svgbanner" viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="cg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f5"/><stop offset="1" stop-color="#eef8f1"/></linearGradient></defs>
      <rect width="640" height="260" fill="url(#cg-sky)"/><circle cx="540" cy="58" r="26" fill="#fff4c9"/>
      <path d="M0 170 Q120 110 240 160 T480 150 T640 140 V260 H0Z" fill="#9fd1a9"/><path d="M0 200 Q160 160 320 196 T640 186 V260 H0Z" fill="#6fb487"/>
      ${[[70, 150, 54, 46], [140, 160, 40, 36], [400, 146, 60, 52], [470, 160, 44, 38], [300, 156, 50, 42]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${['#fffaf0', '#f4e6c8', '#fffaf0', '#e9f2fb', '#f8efe0'][i]}" stroke="#5c8a70"/><path d="M${x - 4} ${y} L${x + w / 2} ${y - 18} L${x + w + 4} ${y}Z" fill="${['#d98c3a', '#3a7bc4', '#2e8f5b', '#6a55a8', '#c9783a'][i]}"/>`).join('')}
      ${[[230, 190], [370, 186], [560, 182], [30, 192]].map(([x, y]) => `<circle cx="${x}" cy="${y - 16}" r="14" fill="#3f9a63"/><rect x="${x - 2}" y="${y - 4}" width="4" height="14" fill="#7a5a3a"/>`).join('')}
      <rect x="0" y="236" width="640" height="24" fill="#d9d2c0"/></svg>`;
  }

  // ---------- 領域頁 ----------
  views.domain = key => {
    const d = C().domainOfKey(key);
    if (!d) return views.home();
    const us = C().unitsOfDomain(d), books = [...new Set(us.map(u => u.book))].sort();
    const bs = bossesOf(d), open = domainDone(d);
    app().innerHTML = `${topbar('#/c')}<div class="page c-domain c-d-${key}">
      <div class="cover c-cover">${domCover(d, 'c-cover-img')}<h1>${esc(d)}<small>${us.length} 個單元</small></h1></div>
      ${XD() ? `<p class="unit-xsh">${XD().shareHTML(XD().civShare('dom', d))}</p>` : ''}
      ${guide(`每個單元的順序是：先讀故事，再闖概念關；如果有搞混的概念，會多一關並排辨析；最後概念卡收進公民筆記。${d === '法律' ? '法律單元的故事最後還有一張「案件卡」。' : ''}`)}
      ${books.map(b => `<h2 class="sec">第${b}冊<small>　${esc((us.find(u => u.book === b) || {}).volume || '')}</small></h2>
        <section class="c-units">${us.filter(u => u.book === b).map(unitCard).join('')}</section>`).join('')}
      <h2 class="sec">${esc(d)}魔王題組</h2>
      <div class="c-bossbox">${pic('boss_' + key, 'c-bossimg', `<b>${DOM[d].ch}</b>`)}<div>${bs.length ? `<p>跨冊整合題組 ${bs.length} 組。${open ? '' : '這個領域的單元全部完成後開放。'}</p>${bs.some(bossOpen) ? `<div class="row"><a class="primary btn" href="#/c/boss/${key}">挑戰</a><a class="ghost btn" href="#/c/boss/${key}/sim">模擬</a></div>` : `<span class="tag wait">完成 ${us.filter(unitDone).length} / ${us.filter(hasContent).length} 單元</span>`}` : '<p class="hint">魔王題組還在準備中。</p>'}</div></div>
      ${crossBosses().some(q => q.domains.includes(d)) ? `<h2 class="sec">跨領域魔王題組</h2>${crossHTML()}` : ''}
    </div>`;
  };
  function unitCard(u) {
    const n = C().liveOfUnit(u.id).length, ch = C().chapterOfUnit(u.id), p = unitProgress(u);
    return `<a class="c-unit ${hasContent(u) ? '' : 'closed'}" href="#/c/u/${u.id}"><span class="c-unit-no">${esc(u.lesson.replace('第', '').replace('課', ''))}</span><div><b>${esc(u.title)}</b>
      <span>${ch ? `〈${esc(ch.title)}〉` : '故事準備中'}・${n ? `${n} 題` : '題目準備中'}</span><div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div>
      ${unitDone(u) ? '<small class="c-done">完成</small>' : ''}${XD() ? XD().shareHTML(XD().civShare('unit', u.id)) : ''}</div></a>`;
  }

  // ---------- 單元頁：故事引入 → 概念闖關 → 並排辨析 → 公民筆記 ----------
  const quizSize = u => u.book === 6 ? 8 : 10;
  const pairsOfUnit = u => { const ids = new Set((u.concepts || []).map(c => c.id)); return ST().openPairs().filter(p => C().pairById[p.id].concepts.some(c => ids.has(c))); };
  views.unit = id => {
    const u = C().unitById[id];
    if (!u) return views.home();
    const key = DOM[u.domain].k, ch = C().chapterOfUnit(id), n = C().liveOfUnit(id).length, r = P().levels[id];
    const pairs = pairsOfUnit(u), have = new Set(myCards()), cs = u.concepts || [];
    const m = ST().mastery();
    app().innerHTML = `${topbar('#/c/d/' + key)}<div class="page c-unitpage c-d-${key}">
      <header class="c-uhead"><small>${esc(u.domain)}・第${u.book}冊（${esc(u.volume)}）${esc(u.lesson)}</small><h1>${esc(u.title)}</h1>
        <p class="hint">${(u.sections || []).map(esc).join('　')}</p>${XD() ? XD().shareHTML(XD().civShare('unit', id)) : ''}</header>
      <ol class="c-steps">
        <li class="c-step ${ch && storyDone(ch.id) ? 'done' : ''}"><span class="c-sn">1</span><div><b>故事引入</b>
          ${ch ? `<p>〈${esc(ch.title)}〉${(ch.characters || []).map(k => esc(C().charName(k))).join('、')}</p><div class="row"><a class="primary btn" href="#/c/story/${encodeURIComponent(ch.id)}">${storyDone(ch.id) ? '再讀一次' : '開始讀'}</a>${storyDone(ch.id) ? '<small class="c-done">讀完了</small>' : '<small>約 8–10 分鐘</small>'}</div>` : '<p class="hint">這一課的故事還在撰寫中，可以先闖關。</p>'}</div></li>
        <li class="c-step ${questDone(id) ? 'done' : ''}"><span class="c-sn">2</span><div><b>概念闖關</b>
          ${n ? `<p>${n} 題可練習，每回 ${Math.min(n, quizSize(u))} 題${r ? `・最佳 ${Math.round(r.best * 100)}%` : ''}</p><div class="row"><a class="primary btn" href="#/c/play/${id}/practice">練習</a><a class="ghost btn" href="#/c/play/${id}/sim">模擬</a></div>` : '<p class="hint">題目準備中。</p>'}</div></li>
        <li class="c-step ${pairs.length ? 'alert' : ''}"><span class="c-sn">3</span><div><b>並排辨析</b>
          ${pairs.length ? `<p>你把這些概念搞混過：${pairs.map(p => `<span class="chip">${esc(C().pairLabel(p.id))}</span>`).join('')}</p><a class="primary btn" href="#/c/pair/${id}">去分清楚</a>` : '<p class="hint">目前沒有混淆紀錄。答錯時如果選到容易混淆的另一個概念，這一關就會出現。</p>'}</div></li>
        <li class="c-step"><span class="c-sn">4</span><div><b>公民筆記</b>
          <div class="chips">${cs.map(c => `<span class="chip ${have.has(c.id) ? 'on' : 'off'}">${have.has(c.id) ? '' : '未收・'}${esc(c.name)}${m.has(c.id) ? '・★' : ''}</span>`).join('')}</div>
          <p class="hint">讀完故事、闖完關，概念卡就會收進筆記。★＝闖關題和情境題（或故事嵌入題）都答對過，算掌握。</p><a class="ghost btn" href="#/c/notes#${id}">打開公民筆記</a></div></li>
      </ol>
      ${examKpHTML(u)}
    </div>`;
  };
  // 這一課的會考考點（考過的才列）
  function examKpHTML(u) {
    const X = window.XData;
    if (!X || !X.chip) return '';
    const ks = (u.concepts || []).map(c => [c, X.count('civ:' + c.id)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    return ks.length ? `<div class="x-kps"><span class="x-kps-h">這裡的會考考點</span>${ks.map(([c, n]) => `<a class="x-kpchip" href="#/x/kp/${encodeURIComponent(c.id)}">${esc(c.name)}${X.chip(n, { short: true })}<small class="x-kpn">${n} 題</small></a>`).join('')}</div>` : '';
  }

  // ---------- 闖關（共用答題引擎） ----------
  function runQuiz(o) {
    app().innerHTML = `<div class="page play c-play"><div class="banner plain c-bannerbar"><h2>${esc(o.title)}</h2><span class="mode">${o.mode === 'sim' ? '模擬模式・計時，交卷後看解析' : esc(o.sub || '練習模式・不計時，即時解析')}</span></div>${o.headHTML || ''}<div class="runbox"></div></div>`;
    window.Quiz.run(app().querySelector('.runbox'), {
      pool: o.pool, mode: o.mode || 'practice', size: o.size || 10,
      track: window.Store.C, live: C().live(), guide: guideImg('think'), card: cardHTML, cardFirst: true,
      cardIntro: '阿晴翻開筆記：先看一下這張概念卡，再試一題同概念的題目。',
      onAnswer: (q, r) => ST().afterAnswer(q, r),
      onQuit: () => { location.hash = o.back; },
      onEnd: sum => { if (o.onEnd) o.onEnd(sum); result(sum, o); }
    });
  }
  views.play = (id, mode) => {
    const u = C().unitById[id];
    if (!u) return views.home();
    runQuiz({ title: u.title, mode, pool: C().liveOfUnit(id), size: quizSize(u), back: '#/c/u/' + id,
      onEnd: sum => { T().finishLevel(id, sum.got, sum.total || 1, mode); sum.fresh = collect((u.concepts || []).map(c => c.id)); } });
  };
  function result(sum, o) {
    const p = pct(sum.got, sum.total), good = p >= 80;
    const open = ST().openPairs();
    app().innerHTML = `${topbar(o.back)}<div class="page result c-result">
      <div class="score-hero"><div class="c-score-ava">${ava('aqing', good ? 'happy' : 'think', 'big')}</div><div><div class="big">${sum.got} / ${sum.total}</div><div>${p}%${sum.timeUp ? '・時間到' : ''}・用時 ${Math.floor(sum.seconds / 60)} 分 ${sum.seconds % 60} 秒</div></div></div>
      ${guide(good ? '很穩！這些概念你已經能用在生活情境裡了。' : '錯的概念我記下來了，之後會換一題再出現，連續答對兩次就算過關。', good ? 'happy' : 'think')}
      ${sum.fresh && sum.fresh.length ? `<p class="c-fresh">${sum.fresh.length} 張概念卡收進公民筆記：${sum.fresh.map(c => esc(C().conceptName[c])).join('、')}</p>` : ''}
      ${open.length ? `<p class="c-alert">有 ${open.length} 組概念被你搞混過：${open.slice(0, 3).map(x => esc(C().pairLabel(x.id))).join('、')}。<a href="#/c/pair/all">去並排辨析</a></p>` : ''}
      ${sum.mode === 'sim' ? `<h3>逐題解析</h3><div class="review">${window.Quiz.reviewList(sum.results)}</div>` : ''}
      <div class="row"><a class="primary btn" href="${o.back}">回去</a><a class="ghost btn" href="#/c/notes">公民筆記</a></div></div>`;
  }

  // ---------- 並排辨析（只在有混淆紀錄時出現） ----------
  views.pair = scope => {
    const u = C().unitById[scope];
    const list = u ? pairsOfUnit(u) : ST().openPairs();
    const back = u ? '#/c/u/' + u.id : '#/c';
    const items = list.map(p => ST().contrastFor(p.id)).filter(Boolean);
    const lack = list.filter(p => !ST().contrastFor(p.id));
    if (!list.length || !items.length) {
      app().innerHTML = `${topbar(back)}<div class="page"><h1>並排辨析</h1>${guide(list.length ? `這幾組（${lack.map(p => esc(C().pairLabel(p.id))).join('、')}）的辨析題還在準備中。` : '目前沒有搞混的概念。答錯時如果選到容易混淆的另一個概念，就會記在這裡。', 'idle')}<div class="row"><a class="primary btn" href="${back}">回去</a></div></div>`;
      return;
    }
    runQuiz({ title: '並排辨析', sub: '同一情境改一個條件：每組都答對，才算解除這組混淆', pool: items, size: items.length, back,
      headHTML: `<div class="c-pairlist">${list.map(p => { const pr = C().pairById[p.id]; return `<div class="c-pairrow"><b>${esc(pr.labels.join('／'))}</b><small>搞混 ${p.n} 次</small></div>`; }).join('')}</div>`,
      onEnd: sum => { sum.cleared = list.filter(p => P().confusions[p.id] && P().confusions[p.id].cleared).length; } });
  };

  // ---------- 魔王題組 ----------
  views.boss = (key, mode) => {
    const cross = key === 'cross', d = cross ? null : C().domainOfKey(key);
    if (!cross && !d) return views.home();
    const pool = (cross ? crossBosses() : bossesOf(d)).filter(bossOpen);
    const back = cross ? '#/c' : '#/c/d/' + key;
    if (!pool.length) { app().innerHTML = `${topbar(back)}<div class="page"><h1>魔王題組</h1>${guide(cross ? '跨領域魔王題組要先完成兩個相關領域。' : `${esc(d)}的單元全部完成後才會開放。`, 'think')}<div class="row"><a class="primary btn" href="${back}">回去</a></div></div>`; return; }
    runQuiz({ title: cross ? '跨領域魔王題組' : `${d}魔王題組`, mode: mode === 'sim' ? 'sim' : 'practice', pool, size: Math.min(8, pool.length), back,
      headHTML: `<div class="c-bossintro">${pic(cross ? 'boss_cross' : 'boss_' + key, 'c-bossimg', `<b>${cross ? '跨' : DOM[d].ch}</b>`)}<p>一個情境同時用到好幾冊的概念。先想清楚每一小題考的是哪一冊、哪一個制度，再作答。</p></div>`,
      onEnd: sum => T().finishLevel(cross ? 'cross-boss' : key + '-boss', sum.got, sum.total || 1, mode) });
  };

  // ---------- 弱點分析：領域 × 能力矩陣、最常混淆的三組 ----------
  function matrixHTML(clickable) {
    const cell = ST().matrix(), live = C().live();
    const color = v => v == null ? 'none' : v >= 0.8 ? 'g' : v >= 0.6 ? 'y' : 'r';
    let h = `<div class="mx-wrap"><table class="mx c-mx"><thead><tr><th>領域＼能力</th>${C().SKILLS.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>`;
    for (const d of C().DOMAINS) {
      h += `<tr><th>${esc(d)}</th>`;
      for (const s of C().SKILLS) {
        const has = live.some(q => q.domain === d && q.skill.includes(s));
        const v = cell[d + '|' + s], acc = v ? v.ok / v.n : null;
        const txt = acc == null ? '·' : Math.round(acc * 100);
        h += has ? `<td class="c-${color(acc)}">${clickable ? `<a href="#/c/cell/${DOM[d].k}/${encodeURIComponent(s)}">${txt}</a>` : txt}${v ? `<small>${v.n}</small>` : ''}</td>` : '<td class="na"></td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div><p class="legend"><span class="c-g">≥80%</span><span class="c-y">60–79%</span><span class="c-r">&lt;60%</span><span class="c-none">還沒練</span>小字＝作答次數；空白＝沒有這種題目</p>';
  }
  function topPairsHTML() {
    const tp = ST().topPairs(3);
    return tp.length ? `<ol class="c-toppairs">${tp.map(p => { const pr = C().pairById[p.id]; return `<li><b>${esc(pr.labels.join('／'))}</b>　搞混 ${p.n} 次${p.cleared ? '・<span class="c-done">已解除</span>' : '・<span class="c-warn">待解除</span>'}<br><small>${esc(pr.rule || '')}</small></li>`; }).join('')}</ol>` : '<p class="hint">還沒有混淆紀錄。</p>';
  }
  views.weak = () => {
    const weak = ST().weakConcepts(5);
    app().innerHTML = `${topbar('#/c')}<div class="page c-weak"><h1>弱點分析</h1>
      <h2 class="sec">領域 × 能力</h2><p class="hint">點任何一格，就能直接練那個組合。</p>${matrixHTML(true)}
      <h2 class="sec">最常混淆的三組</h2>${topPairsHTML()}${ST().openPairs().length ? '<a class="primary btn" href="#/c/pair/all">去並排辨析</a>' : ''}
      <h2 class="sec">最弱的概念</h2>${weak.length ? `<ol>${weak.map(w => `<li>${esc(C().conceptName[w.c])}：${w.acc == null ? '待回收' : Math.round(w.acc * 100) + '%'}${w.pending ? '（錯題回收中）' : ''}</li>`).join('')}</ol><a class="primary btn" href="#/c/sprint">衝刺模式</a>` : guide('目前沒有明顯的弱點，繼續保持。', 'happy')}</div>`;
  };
  views.cell = (key, skill) => {
    const d = C().domainOfKey(key);
    if (!d) return views.weak();
    runQuiz({ title: `${d} × ${skill}`, pool: C().live().filter(q => q.domain === d && q.skill.includes(skill)), size: 8, back: '#/c/weak' });
  };

  // ---------- 衝刺模式 ----------
  // 需求原訂：116/4/16 起開放（第一至五冊），116/5/8 畢業考後加入第六冊；
  // 家長 115/10/29 決定讓孩子依自己的計畫練習，所以衝刺模式隨時可用、六冊都納入。每天 15 題，只出弱點概念、未解除的混淆對與近期錯題，不上新內容。
  function sprintIds() {
    const today = window.UI.today();
    const sp = P().sprint;
    if (sp && sp.date === today && Array.isArray(sp.ids)) return sp;
    const live = C().live(), byId = Object.fromEntries(live.map(q => [q.id, q]));
    const ids = [];
    const add = q => { if (q && !ids.includes(q.id) && ids.length < 15) ids.push(q.id); };
    // 1. 未解除的混淆對：該對的題目
    for (const p of ST().openPairs()) Q().shuffle(live.filter(q => q.confusablePair === p.id || Object.values(q.optionPairs || {}).includes(p.id))).slice(0, 2).forEach(add);
    // 2. 弱點概念
    for (const w of ST().weakConcepts(8)) Q().shuffle(live.filter(q => q.concepts.includes(w.c))).slice(0, 2).forEach(add);
    // 3. 近期錯題（最近 40 筆答錯的題庫題）
    P().log.filter(e => !e.ok).slice(-40).reverse().forEach(e => add(byId[e.q]));
    const sp2 = { date: today, ids, done: false };
    T().set({ sprint: sp2 });
    return sp2;
  }
  views.sprint = () => {
    const sp = sprintIds(), pool = sp.ids.map(id => C().byId[id]).filter(q => q && C().isLive(C().status(q)));
    if (!pool.length) { app().innerHTML = `${topbar('#/c')}<div class="page"><h1>衝刺模式</h1>${guide('目前沒有弱點、混淆或近期錯題可以衝刺。先去各領域闖關，做過的題目才會進來。', 'happy')}<div class="row"><a class="primary btn" href="#/c">回青禾里</a></div></div>`; return; }
    runQuiz({ title: '衝刺模式', sub: `今天 ${pool.length} 題：弱點概念、待解除的混淆、近期錯題${sp.done ? '（今天已做過一輪，可以再練）' : ''}`, pool, size: 15, back: '#/c',
      onEnd: () => T().set({ sprint: Object.assign({}, P().sprint, { done: true }) }) });
  };

  // ---------- 案件分流挑戰 ----------
  views.cases = () => {
    const all = C().liveCases().filter(c => c.kind.length && c.options.length && c.answer >= 0);
    const back = '#/c';
    if (!all.length) { app().innerHTML = `${topbar(back)}<div class="page"><h1>案件分流挑戰</h1>${guide('吳律師的法律服務站還在整理案件，整理好就能挑戰。', 'think')}<div class="row"><a class="primary btn" href="${back}">回青禾里</a></div></div>`; return; }
    const seen = {}; for (const e of P().log) if (e.m === 'cases') seen[e.q] = (seen[e.q] || 0) + (e.ok ? 1 : -2);
    const list = Q().shuffle(all).sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0)).slice(0, 10);
    const res = [];
    let at = 0;
    app().innerHTML = `${topbar(back)}<div class="page c-cases"><div class="banner plain c-bannerbar"><h2>案件分流挑戰</h2><span class="mode">連續 ${list.length} 案：先判斷事件類型，再選救濟途徑</span></div>
      <div class="run"><div class="runbar"><a class="ghost btn quit" href="${back}">離開</a><div class="progress"><div class="fill"></div></div><div class="count"></div></div><div class="stage"></div>
      <div class="nav"><button class="primary next" disabled>下一案</button></div></div></div>`;
    const stage = app().querySelector('.stage'), next = app().querySelector('.next');
    function show() {
      const c = list[at], pick = new Set();
      app().querySelector('.count').textContent = `${at + 1} / ${list.length}`;
      app().querySelector('.fill').style.width = pct(at, list.length) + '%';
      next.disabled = true; next.textContent = at === list.length - 1 ? '看結果' : '下一案';
      window.scrollTo(0, 0);
      stage.innerHTML = `<div class="item c-case"><div class="qmeta"><span class="tag">案件 ${at + 1}</span><span class="tag soft">吳律師的法律服務站</span></div><div class="stem">${fmt(c.text)}</div>
        <div class="c-cstep"><b>① 這是什麼事件？</b>${c.kind.length > 1 ? '<small>（可以複選）</small>' : ''}<div class="c-kinds">${C().CASE_KINDS.map(k => `<button class="c-kind" data-k="${k}">${k}</button>`).join('')}</div><button class="primary c-kgo" disabled>確定</button><div class="c-kfb"></div></div>
        <div class="c-cstep c-rstep" hidden><b>② 可以怎麼救濟？</b><div class="opts">${Q().shuffle(c.options.map((_, i) => i)).map((i, n) => `<button class="opt" data-i="${i}"><b>${'ⒶⒷⒸⒹⒺⒻ'[n]}</b> ${esc(c.options[i])}</button>`).join('')}</div></div><div class="feedback"></div></div>`;
      const kgo = stage.querySelector('.c-kgo');
      let kindOk = false;
      stage.querySelectorAll('.c-kind').forEach(b => b.onclick = () => {
        if (kgo.dataset.done) return;
        if (c.kind.length === 1) pick.clear();
        pick.has(b.dataset.k) ? pick.delete(b.dataset.k) : pick.add(b.dataset.k);
        stage.querySelectorAll('.c-kind').forEach(x => x.classList.toggle('on', pick.has(x.dataset.k)));
        kgo.disabled = !pick.size;
      });
      kgo.onclick = () => {
        kgo.dataset.done = '1'; kgo.remove();
        kindOk = pick.size === c.kind.length && c.kind.every(k => pick.has(k));
        stage.querySelectorAll('.c-kind').forEach(x => { x.disabled = true; if (c.kind.includes(x.dataset.k)) x.classList.add('right'); else if (pick.has(x.dataset.k)) x.classList.add('wrong'); });
        stage.querySelector('.c-kfb').innerHTML = `<p class="${kindOk ? 'c-ok' : 'c-ng'}">${kindOk ? '類型判斷正確' : `正解：${c.kind.join('＋')}事件`}${c.authority ? `・主管／受理機關：${esc(c.authority)}` : ''}</p>`;
        stage.querySelector('.c-rstep').hidden = false;
      };
      stage.querySelectorAll('.c-rstep .opt').forEach(b => b.onclick = () => {
        if (stage.dataset.locked === String(at)) return;
        stage.dataset.locked = String(at);
        const i = +b.dataset.i, rok = i === c.answer, ok = kindOk && rok;
        stage.querySelectorAll('.c-rstep .opt').forEach(x => { x.disabled = true; const n = +x.dataset.i; if (n === i) x.classList.add(rok ? 'right' : 'wrong'); if (n === c.answer) x.classList.add('right'); });
        stage.querySelector('.feedback').innerHTML = `<div class="explain ${ok ? 'good' : 'bad'}"><div class="verdict">${ok ? '分流正確' : kindOk ? '類型對了，救濟途徑再想想' : rok ? '救濟途徑對了，事件類型再想想' : '再想想看'}</div><p>${fmt(c.explain)}</p>${c.legalRefs.length ? `<p class="c-refs">依據：${c.legalRefs.map(r => esc(C().refText(r))).join('、')}</p>` : ''}</div>`;
        res.push({ c, ok, kindOk, rok });
        T().record({ q: c.id, ok, c: c.concepts, m: 'cases' });
        next.disabled = false;
      });
    }
    next.onclick = () => { if (at < list.length - 1) { at++; show(); } else finish(); };
    function finish() {
      const got = res.filter(r => r.ok).length;
      const by = k => { const r = res.filter(x => x.c.kind.includes(k)); return r.length ? `${k} ${r.filter(x => x.ok).length}/${r.length}` : ''; };
      T().finishLevel('cases', got, res.length || 1, 'practice');
      app().innerHTML = `${topbar(back)}<div class="page result c-result"><h1>案件分流挑戰</h1>
        <div class="score-hero"><div class="c-score-ava">${pic('civ_cases', 'c-toolimg', '<i class="c-icon c-icon-case"></i>')}</div><div><div class="big">${got} / ${res.length}</div><div>類型判斷 ${res.filter(r => r.kindOk).length}・救濟途徑 ${res.filter(r => r.rok).length}</div><div class="hint">${C().CASE_KINDS.map(by).filter(Boolean).join('・')}</div></div></div>
        ${guide(got >= res.length * 0.8 ? '分流得很準！先分民事、刑事、行政，救濟途徑就跟著出來了。' : '口訣：民事找和解、調解、民事訴訟；刑事找告訴、偵查、刑事訴訟；行政找訴願、行政訴訟。', got >= res.length * 0.8 ? 'happy' : 'think')}
        <ol class="c-caselist">${res.map(r => `<li class="${r.ok ? 'good' : 'bad'}">${r.ok ? '○' : '×'} ${esc(String(r.c.text).slice(0, 36))}…<small>${esc(r.c.kind.join('＋'))}・${esc(r.c.options[r.c.answer])}</small></li>`).join('')}</ol>
        <div class="row"><a class="primary btn" href="#/c/cases">再挑戰 10 案</a><a class="ghost btn" href="${back}">回青禾里</a></div></div>`;
      window.scrollTo(0, 0);
    }
    show();
  };

  // ---------- 公民筆記 ----------
  views.notes = () => {
    const have = new Set(myCards()), m = ST().mastery();
    const total = C().units.reduce((s, u) => s + (u.concepts || []).length, 0);
    app().innerHTML = `${topbar('#/c')}<div class="page c-notes">
      <div class="c-noteshead">${pic('civ_notebook', 'c-noteimg', '<i class="c-icon c-icon-note"></i>')}<div><h1>公民筆記</h1><p class="hint">已收 ${have.size} / ${total} 張・掌握（★）${[...have].filter(m.has).length} 個</p></div></div>
      ${guide(have.size ? '點一張卡就能再讀一次。★＝闖關題和情境題都答對過。' : '筆記還是空的。讀完一章故事、或闖完一課的概念關，概念卡就會收進來。', have.size ? 'happy' : 'idle')}
      ${C().DOMAINS.map(d => `<h2 class="sec">${esc(d)}</h2>${C().unitsOfDomain(d).map(u => { const cs = u.concepts || []; return `<h3 id="${u.id}" class="c-noteunit">${esc(u.volume)} ${esc(u.lesson)}　${esc(u.title)}<small>　${cs.filter(c => have.has(c.id)).length}/${cs.length}</small></h3>
        <div class="album-grid">${cs.map(c => have.has(c.id) ? `<button class="cc on" data-id="${esc(c.id)}"><b>${esc(c.name)}</b><small>${m.has(c.id) ? '★ 掌握' : '已收'}</small></button>` : `<div class="cc off"><b>？</b><small>${esc(u.title)}</small></div>`).join('')}</div>`; }).join('')}`).join('')}
      <div class="cc-sheet" hidden></div></div>`;
    const sheet = app().querySelector('.cc-sheet');
    app().querySelectorAll('.cc.on').forEach(b => b.onclick = () => {
      sheet.hidden = false;
      sheet.innerHTML = `<button class="ghost cc-close" aria-label="關閉">×</button>${cardHTML(b.dataset.id)}`;
      sheet.querySelector('.cc-close').onclick = () => { sheet.hidden = true; };
    });
    const h = decodeURIComponent((location.hash.split('#')[2] || ''));
    if (h && document.getElementById(h)) setTimeout(() => document.getElementById(h).scrollIntoView(), 0);
  };

  // ---------- 人物介紹 ----------
  views.people = () => {
    app().innerHTML = `${topbar('#/c')}<div class="page c-people"><h1>青禾里的人們</h1>${notice()}
      <p class="hint">${esc(C().setting || '')}。每一章的迷思句由不同的人說出（阿晴也會說錯），大家一起把觀念弄清楚。</p>
      <div class="c-plist">${C().characters.map(c => `<div class="c-person">${ava(c.id, c.id === 'aqing' ? 'happy' : null, 'big')}<div><b>${esc(c.name)}</b>${c.fullName && c.fullName !== c.name ? `<small>${esc(c.fullName)}</small>` : ''}<span class="tag soft">${esc(c.role || '')}${c.age ? `・${c.age} 歲` : ''}</span><p>${esc(c.background || '')}</p></div></div>`).join('')}</div></div>`;
  };

  window.CivicsUI = { sayHTML, ava, guide, pic, cardHTML, notice, views, topbar, DOM, chapterImg, collect, storyDone, unitDone, domainDone, matrixHTML, topPairsHTML, guideImg, unitProgress, questDone };
})();
