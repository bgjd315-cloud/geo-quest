// 歷史模組《時光檔案館》：見習檔案員選角、大廳（三個館區）、館區頁、時間長廊、整理檔案（作答）、故事閱讀（#/h/story/<章id>）、館藏卡收藏冊（#/h/cards）。
// 網址都在 #/h/ 底下，不和地理的 #/unit/…、#/play/… 衝突。
(function () {
  const { esc, app } = window.UI;
  const H = () => window.HData;
  const P = () => window.Store.H.get();
  const WINGS = { tw: 'wing_tw', ea: 'wing_ea', w: 'wing_w' };

  // ---------- 共用 ----------
  const aban = (text, pose) => window.UI.talk(H().img('aban_' + (pose || 'idle')), '阿斑', text);
  const heroImg = pose => H().img(`arch_${P().hero || 'boy'}_${pose || 'idle'}`);
  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">時光檔案館</span>'}
      <nav><a href="#/hub">社會科</a><a href="#/h/timeline">時間長廊</a><a href="#/settings">設定</a></nav></header>`;
  }
  const eventsOfEra = id => H().events.filter(e => e.era === id);
  const erasOfLine = id => H().eras.filter(e => e.line === id);
  // 會考出題率（算法在 exam/data.js 的 XData，全站共用）
  const XD = () => window.XData && window.XData.shareHTML ? window.XData : null;

  const views = {};

  views.hero = () => {
    app().innerHTML = `<div class="page intro hintro">
      <img class="intro-bg" src="${H().img('hist_hall')}" alt="">
      <div class="intro-card">
        <h1>時光檔案館</h1>
        <p>城裡有一座老檔案館，收著從史前到冷戰的家書、契約、報紙和舊物。某天夜裡，「時間蛀蟲」把檔案咬亂了：清代的地契夾進日治的報紙裡，羅馬的錢幣滾到了宋朝的櫃子上。</p>
        <p>你是新來的見習檔案員。讀懂每一份史料，把它歸回正確的年代；每歸對一批，長廊就會重新亮起一段燈。</p>
        ${aban('我是阿斑，住在書架之間，鼻子很靈，聞得出哪份檔案「年代不對」。先選一位檔案員吧！', 'happy')}
        <div class="heroes">${['boy', 'girl'].map(h => `<button class="hero-pick" data-h="${h}"><img src="${H().img(`arch_${h}_idle`)}" alt=""><span>${h === 'boy' ? '檔案員・男' : '檔案員・女'}</span></button>`).join('')}</div>
      </div></div>`;
    app().querySelectorAll('.hero-pick').forEach(b => b.onclick = () => {
      window.Store.H.set({ hero: b.dataset.h, introSeen: true });
      if (location.hash === '#/h') views.hall(); else location.hash = '#/h';
    });
  };

  // 大廳：三道門通往三個館區，另有時間長廊
  views.hall = () => {
    const live = H().live();
    app().innerHTML = `${topbar()}<div class="page hall">
      <div class="hall-cover"><img src="${H().img('hist_hall')}" alt="時光檔案館大廳"></div>
      ${aban(live.length ? '今天想整理哪一館的檔案？' : '館裡的檔案還在等家長審過，審好之後櫃子就會打開。先去時間長廊逛逛吧！', live.length ? 'idle' : 'hint')}
      <h2 class="sec">三個館區</h2>
      <section class="wing-list">${H().lines.map(l => {
        const eras = erasOfLine(l.id), evs = H().events.filter(e => e.line === l.id);
        const n = live.filter(q => eras.some(e => e.id === q.era)).length;
        return `<a class="wing-card" href="#/h/wing/${l.id}"><img src="${H().img(WINGS[l.id])}" alt=""><div><b>${esc(l.wing)}</b><span>${esc(l.name)}・${eras.length} 個時代・${evs.length} 份檔案</span><small>${n ? `${n} 題可整理` : '籌備中'}${storyCount(l.id)}</small>${XD() ? XD().shareHTML(XD().wingShare(l.id)) : ''}</div></a>`;
      }).join('')}</section>
      <h2 class="sec">時間長廊</h2>
      <a class="corridor-card" href="#/h/timeline"><img src="${H().img('hist_corridor')}" alt="時間長廊"><span>三排書架並排：臺灣、東亞、世界。可以縮放，看看同一個時候各地發生什麼事。</span></a>
      <h2 class="sec">館藏卡收藏冊</h2>
      <a class="album-link" href="#/h/cards"><b>打開收藏冊</b><span>讀完故事會解鎖館藏卡，已收藏 ${myCards().length} 張</span></a>
    </div>`;
  };

  // 館區：列出各時代與其中的事件
  views.wing = id => {
    const line = H().lineById[id];
    if (!line) return views.hall();
    app().innerHTML = `${topbar('#/h')}<div class="page wing">
      <div class="cover"><img src="${H().img(WINGS[id])}" alt=""><h1>${esc(line.wing)}<small>${esc(line.name)}</small></h1></div>
      ${XD() ? `<p class="unit-xsh">${XD().shareHTML(XD().wingShare(id))}</p>` : ''}
      ${aban(`${esc(line.wing)}有 ${erasOfLine(id).length} 個時代的櫃子。每個櫃子的檔案歸好位，長廊就亮一段。`)}
      ${storySection(id)}
      <h2 class="sec">時代櫃子</h2>
      <div class="era-list">${erasOfLine(id).map(era => {
        const n = H().liveOfEra(era.id).length, r = P().levels[era.id];
        return `<details class="era" ${n ? 'open' : ''}><summary><b>${esc(era.name)}</b><span class="era-time">${esc(era.time)}</span><span class="tag soft">${esc(era.lessons)}</span>${n ? `<span class="tag">${n} 題</span>` : '<span class="tag wait">籌備中</span>'}${XD() ? XD().shareHTML(XD().eraShare(era.id)) : ''}</summary>
          ${n ? `<div class="row"><a class="primary btn" href="#/h/play/${era.id}/practice">整理這個櫃子</a><a class="ghost btn" href="#/h/play/${era.id}/sim">模擬</a>${r ? `<small>最佳 ${Math.round(r.best * 100)}%</small>` : ''}</div>` : ''}
          ${xkpHTML(era.id)}
          <ul class="ev-list">${eventsOfEra(era.id).map(e => { const k = H().liveOfEvent(e.id).length; return `<li><span class="ev-time">${esc(e.time === '—' ? '—' : e.time)}</span><span class="ev-name">${esc(e.name)}</span>${k ? `<span class="tag">${k} 題</span>` : '<span class="tag wait">籌備中</span>'}</li>`; }).join('')}</ul>
        </details>`;
      }).join('')}</div>
    </div>`;
  };

  // 時代櫃子裡的會考知識點與出題率（考過的才列，點了練那個知識點的真題）
  function xkpHTML(eraId) {
    const XD = window.XData;
    if (!XD || !XD.kpOfEra || !XD.chip) return '';
    const ks = XD.kpOfEra(eraId).map(p => [p, XD.count('hist:' + p.id)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    return ks.length ? `<div class="x-kps"><span class="x-kps-h">這裡的會考考點</span>${ks.map(([p, n]) => `<a class="x-kpchip" href="#/x/kp/${encodeURIComponent(p.id)}" title="${esc(p.name)}">${esc(p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name)}${XD.chip(n, { short: true })}<small class="x-kpn">${n} 題</small></a>`).join('')}</div>` : '';
  }

  views.timeline = () => {
    app().innerHTML = `${topbar('#/h')}<div class="page timeline"><h1>時間長廊</h1>
      ${aban('雙指或按 ＋－ 可以縮放，左右滑動看不同時代。點一份檔案，看它是什麼時候、屬於哪個時代。')}
      <div class="tl-root"></div></div>`;
    window.Timeline.render(app().querySelector('.tl-root'));
  };

  // 整理檔案：一個時代＝一個櫃子，題目用共用答題引擎
  views.play = (eraId, mode) => {
    const era = H().eraById[eraId];
    if (!era) return views.hall();
    const line = H().lineById[era.line];
    app().innerHTML = `<div class="page play"><div class="banner"><img src="${H().img(WINGS[era.line])}" alt=""><h2>${esc(era.name)}</h2><span class="mode">${mode === 'sim' ? '模擬模式・計時，交卷後看解析' : '練習模式・不計時，即時解析'}</span></div><div class="runbox"></div></div>`;
    window.Quiz.run(app().querySelector('.runbox'), {
      pool: H().liveOfEra(eraId), mode, size: 10,
      track: window.Store.H, live: H().live(), guide: H().img('aban_hint'), card: cardHTML, cardFirst: true, cardIntro: '阿斑找到這份檔案的館藏卡，先讀一下，再整理一份。',
      onQuit: () => { location.hash = '#/h/wing/' + line.id; },
      onEnd: sum => { window.Store.H.finishLevel(eraId, sum.got, sum.total || 1, mode); views.result(sum, line); }
    });
  };

  // 館藏卡（錯題補救時顯示；concept 是事件 id 或分期 id）
  function cardHTML(id) {
    const ev = H().eventById[id], era = H().eraById[ev ? ev.era : id];
    if (!era) return `<div class="card"><p>這張館藏卡還在準備中。</p></div>`;
    const c = ev && H().cards[ev.id];
    const body = c ? `<p>${esc(c.text).replace(/\n/g, '<br>')}</p>${c.tip ? `<p class="tip">${esc(c.tip)}</p>` : ''}` : '';
    // 會考出題率：事件的等級＝它所屬各 kp 的最高次數；下面列出考過的 kp
    const X = XD();
    const xk = ev && X ? X.kpOfEvent(ev.id).map(p => [p, X.count('hist:' + p.id)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]) : [];
    const xb = xk.length ? `<div class="xf-evline">${xk.map(([p, n]) => `<span class="xf-ev">${X.chip(n, { short: true })}<small>${esc(p.name)}（${n} 題）</small></span>`).join('')}</div>` : '';
    const kick = ev && X ? X.chip(X.eventCount(ev.id)) : era && !ev && X ? X.shareHTML(X.eraShare(era.id)) : '';
    return `<div class="card"><div class="card-kicker">館藏卡${kick}</div><h3>${esc(c ? c.title : ev ? ev.name : era.name)}</h3><p>${esc(ev ? ev.time : era.time)}・${esc(era.name)}</p>${body}${ev ? `<div class="chips">${ev.themes.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}${xb}</div>`;
  }

  views.result = (sum, line) => {
    const pct = sum.total ? Math.round(sum.got / sum.total * 100) : 0;
    const good = pct >= 80, back = '#/h/wing/' + line.id;
    app().innerHTML = `${topbar(back)}<div class="page result">
      <div class="score-hero"><img src="${heroImg(good ? 'happy' : 'think')}" alt=""><div><div class="big">${sum.got} / ${sum.total}</div><div>${pct}%${sum.timeUp ? '・時間到' : ''}・用時 ${Math.floor(sum.seconds / 60)} 分 ${sum.seconds % 60} 秒</div></div></div>
      ${aban(good ? '這一批檔案都歸位了，長廊又亮了一段！' : '放錯的檔案我先收進「待修復」，之後換個樣子再出現，修好兩次就歸檔。', good ? 'happy' : 'hint')}
      ${sum.mode === 'sim' ? `<h3>逐題解析</h3><div class="review">${window.Quiz.reviewList(sum.results)}</div>` : ''}
      <div class="row"><a class="primary btn" href="${back}">回到${esc(line.wing)}</a></div></div>`;
  };

  // ---------- 故事 ----------
  // 每章：阿斑叼來檔案 → 開場 → 時代選擇 → 場景＋嵌入題 → 時代錯置偵探 → 虛構與史實 → 結尾 → 解鎖館藏卡
  const eraName = id => (H().eraById[id] || { name: id || '—' }).name;
  const paras = s => String(s || '').split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('');
  const storyDone = id => !!(P().stories && P().stories[id] && P().stories[id].done);
  const myCards = () => P().cards || [];
  const unlockOf = ch => (ch.unlock && ch.unlock.length ? ch.unlock : ch.eventIds || []).filter(id => H().eventById[id]);
  function storyCount(line) {
    const chs = H().chaptersOfLine(line), n = chs.filter(H().chapterPlayable).length;
    return chs.length ? `・故事 ${n ? `${n} 章可讀` : '待審中'}` : '';
  }
  function storyProgressText() {
    const chs = H().chapters;
    if (!chs.length) return '故事還在撰寫中。';
    const done = chs.filter(c => storyDone(c.id));
    return `共 ${chs.length} 章，家長確認 ${chs.filter(H().chapterPlayable).length} 章，孩子讀完 ${done.length} 章${done.length ? `（${done.map(c => esc(c.id)).join('、')}）` : ''}；館藏卡已收藏 ${myCards().length} 張。`;
  }

  // 館區頁的「故事」區塊
  function storySection(line) {
    const info = H().storyLines[line], chs = H().chaptersOfLine(line);
    const title = info && info.title ? `故事・${esc(info.title)}` : '故事';
    if (!chs.length) return `<h2 class="sec">${title}</h2><p class="hint story-empty">這一館的故事還在撰寫中。</p>`;
    return `<h2 class="sec">${title}</h2><div class="story-list">${chs.map(ch => {
      const ok = H().chapterPlayable(ch), done = storyDone(ch.id);
      const inner = `<span class="st-no">${esc(ch.id)}</span><span class="st-main"><b>${esc(ch.title || ch.id)}</b><small>${esc(eraName(ch.era))}</small></span>${done ? '<span class="st-badge done">✓ 讀完</span>' : ok ? '<span class="st-badge go">開始讀</span>' : '<span class="st-badge lock">待審中</span>'}`;
      return ok ? `<a class="st-card${done ? ' done' : ''}" href="#/h/story/${encodeURIComponent(ch.id)}">${inner}</a>` : `<div class="st-card locked" aria-disabled="true">${inner}</div>`;
    }).join('')}</div>`;
  }

  views.story = id => {
    const ch = H().chapterById[id];
    if (!ch) return views.hall();
    const line = H().lineById[ch._line] || { wing: '館區', id: ch._line };
    const back = '#/h/wing/' + line.id;
    if (!H().chapterPlayable(ch)) {
      app().innerHTML = `${topbar(back)}<div class="page story"><h1>${esc(ch.title || ch.id)}</h1>${aban('這份檔案還在等家長審過，審好之後就能讀了。', 'hint')}<div class="row"><a class="primary btn" href="${back}">回到${esc(line.wing)}</a></div></div>`;
      return;
    }
    const dt = ch.detective && Array.isArray(ch.detective.sentences) && ch.detective.sentences.length ? ch.detective : null;
    const steps = [['doc', '檔案'], ['opening', '開場'], ['era', '歸檔'],
      ...ch.scenes.map((_, k) => ['scene' + k, '場景 ' + (k + 1)]),
      ...(dt ? [['detective', '偵探']] : []), ...(ch.factFiction.length ? [['ff', '史實']] : []),
      ['ending', '結尾'], ['unlock', '館藏卡']];
    const score = { got: 0, total: 0 };
    let at = 0;

    app().innerHTML = `${topbar(back)}<div class="page story">
      <header class="st-head"><small>${esc(line.wing)}・${esc(ch.id)}・${esc(eraName(ch.era))}</small><h1>${esc(ch.title || ch.id)}</h1>
        <ol class="st-dots">${steps.map(([, n], i) => `<li data-i="${i}" title="${esc(n)}"></li>`).join('')}</ol><div class="st-step"></div></header>
      <div class="st-stage"></div>
      <div class="st-nav"><button class="primary st-next" disabled>繼續</button></div></div>`;
    const stage = app().querySelector('.st-stage'), next = app().querySelector('.st-next');
    const ready = label => { next.disabled = false; if (label) next.textContent = label; };

    function show() {
      const [k, name] = steps[at];
      app().querySelectorAll('.st-dots li').forEach((li, i) => li.className = i < at ? 'past' : i === at ? 'now' : '');
      app().querySelector('.st-step').textContent = `${at + 1} / ${steps.length}・${name}`;
      next.disabled = true; next.textContent = '繼續';
      next.parentNode.hidden = k === 'unlock';
      window.scrollTo(0, 0);
      if (k === 'doc') {
        stage.innerHTML = `${aban(`我從書架縫裡叼來一份被時間蛀蟲咬過的檔案。讀讀看，它是哪個年代的？`, 'hint')}
          <div class="st-doc"><span class="card-kicker">檔案</span><p>${esc(ch.doc || '一份沒有標年代的舊檔案')}</p></div>`;
        ready('打開檔案');
      } else if (k === 'opening') {
        stage.innerHTML = `<article class="st-text">${paras(ch.opening)}</article>`;
        ready('把它歸檔');
      } else if (k === 'era') eraStep();
      else if (k.startsWith('scene')) sceneStep(+k.slice(5));
      else if (k === 'detective') detectiveStep();
      else if (k === 'ff') ffStep();
      else if (k === 'ending') {
        stage.innerHTML = `<article class="st-text st-ending">${paras(ch.ending)}</article>${score.total ? `<p class="hint">這一章的嵌入題答對 ${score.got} / ${score.total}。答錯的事件已收進「待修復」，之後會換一題再出現。</p>` : ''}`;
        ready('收進檔案館');
      } else if (k === 'unlock') unlockStep();
    }
    next.onclick = () => { if (at < steps.length - 1) { at++; show(); } };

    // 時代選擇：每個選項都有回饋，選對才能繼續
    function eraStep() {
      const ec = ch.eraChoice || { options: [] };
      stage.innerHTML = `<div class="item st-era"><div class="stem">${esc(ec.prompt || '這份檔案應該放進哪一個時代的櫃子？')}</div>
        <div class="opts">${window.Quiz.shuffle(ec.options.map((o, i) => i)).map(i => `<button class="opt" data-i="${i}">${esc(ec.options[i].text)}</button>`).join('')}</div><div class="feedback"></div></div>`;
      stage.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const o = ec.options[+b.dataset.i];
        b.disabled = true;
        b.classList.add(o.correct ? 'right' : 'wrong');
        stage.querySelector('.feedback').innerHTML = `<div class="explain ${o.correct ? 'good' : 'bad'}"><div class="verdict">${o.correct ? '歸檔正確' : '這個櫃子不對，再找找線索'}</div><p>${esc(o.feedback || '')}</p></div>`;
        if (o.correct) { stage.querySelectorAll('.opt').forEach(x => x.disabled = true); ready(); }
      });
    }

    // 場景：故事段落＋嵌入題（共用答題元件；記進歷史作答紀錄，答錯的事件進錯題回收）
    function sceneStep(k) {
      const s = ch.scenes[k], q = s.question;
      stage.innerHTML = `<article class="st-text">${paras(s.text)}</article>${q ? '<div class="st-qhead">檔案員的判斷</div><div class="item st-q"></div>' : ''}`;
      if (!q) { ready(); return; }
      window.Quiz.renderItem(stage.querySelector('.st-q'), q, { mode: 'practice' }, r => {
        const T = window.Store.H;
        if (q.parts) r.parts.forEach((ok, j) => T.record({ q: q.id, part: j, ok, c: q.parts[j].concepts || q.concepts, m: 'story' }));
        else T.record({ q: q.id, ok: r.ok, c: q.concepts, m: 'story' });
        score.total += 1; if (r.ok) score.got += 1;
        ready(r.ok ? '繼續故事' : '看懂了，繼續故事');
      });
    }

    // 時代錯置偵探：點出不屬於這個時代的句子
    function detectiveStep() {
      const wrong = new Set((dt.wrong || []).map(Number));
      const picked = new Set();
      stage.innerHTML = `${aban(esc(dt.intro || '這段文字裡混進了不屬於這個時代的東西，把它們找出來！'), 'hint')}
        <p class="hint">點選你覺得「時代不對」的句子（共 ${wrong.size} 處），再按「檢查」。</p>
        <div class="dt-box">${dt.sentences.map((t, i) => `<button class="dt-s" data-i="${i}">${esc(t)}</button>`).join('')}</div>
        <div class="row"><button class="primary dt-check">檢查</button></div><div class="dt-result"></div>`;
      stage.querySelectorAll('.dt-s').forEach(b => b.onclick = () => {
        const i = +b.dataset.i;
        picked.has(i) ? picked.delete(i) : picked.add(i);
        b.classList.toggle('on', picked.has(i));
      });
      stage.querySelector('.dt-check').onclick = e => {
        e.target.remove();
        let found = 0;
        stage.querySelectorAll('.dt-s').forEach(b => {
          const i = +b.dataset.i, w = wrong.has(i), p = picked.has(i);
          b.disabled = true;
          b.classList.add(w && p ? 'hit' : w ? 'miss' : p ? 'false' : 'plain');
          if (w && p) found++;
        });
        const extra = [...picked].filter(i => !wrong.has(i)).length;
        stage.querySelector('.dt-result').innerHTML = `<div class="explain ${found === wrong.size && !extra ? 'good' : 'bad'}"><div class="verdict">找到 ${found} / ${wrong.size} 處${extra ? `，另有 ${extra} 句其實沒有問題` : ''}</div>
          <ul class="dt-explain">${[...wrong].sort((a, b) => a - b).map(i => `<li><b>「${esc(dt.sentences[i] || '')}」</b><br>${esc((dt.explain || {})[i] || '')}</li>`).join('')}</ul></div>`;
        ready();
      };
    }

    // 虛構與史實：先自己分類，再揭曉並看課本怎麼說
    function ffStep() {
      const items = ch.factFiction, pick = {};
      stage.innerHTML = `${aban('故事裡有真的歷史，也有編出來的人物和情節。你分得出來嗎？')}
        <div class="ff-list">${items.map((it, i) => `<div class="ff-row" data-i="${i}"><p>${esc(it.text)}</p><div class="ff-btns"><button class="ff-b" data-v="1">史實</button><button class="ff-b" data-v="0">虛構</button></div><div class="ff-note"></div></div>`).join('')}</div>
        <div class="row"><button class="primary ff-reveal" disabled>揭曉</button></div>`;
      const reveal = stage.querySelector('.ff-reveal');
      stage.querySelectorAll('.ff-row').forEach(row => row.querySelectorAll('.ff-b').forEach(b => b.onclick = () => {
        pick[row.dataset.i] = b.dataset.v === '1';
        row.querySelectorAll('.ff-b').forEach(x => x.classList.toggle('on', x === b));
        reveal.disabled = Object.keys(pick).length < items.length;
      }));
      reveal.onclick = () => {
        reveal.remove();
        let ok = 0;
        stage.querySelectorAll('.ff-row').forEach(row => {
          const it = items[+row.dataset.i], right = pick[row.dataset.i] === !!it.fact;
          if (right) ok++;
          row.classList.add(right ? 'good' : 'bad');
          row.querySelectorAll('.ff-b').forEach(x => x.disabled = true);
          row.querySelector('.ff-note').innerHTML = `<b>${it.fact ? '史實' : '虛構'}</b>${right ? '' : '（你選錯了）'}：${esc(it.note || '')}`;
        });
        stage.insertAdjacentHTML('beforeend', `<p class="hint">分對 ${ok} / ${items.length} 條。</p>`);
        ready();
      };
    }

    // 解鎖館藏卡：記下讀完與收藏
    function unlockStep() {
      const ids = unlockOf(ch);
      const have = new Set(myCards());
      const fresh = ids.filter(x => !have.has(x));
      const stories = Object.assign({}, P().stories, { [ch.id]: { done: true, ts: Date.now(), got: score.got, total: score.total } });
      window.Store.H.set({ stories, cards: myCards().concat(fresh) });
      stage.innerHTML = `${aban(fresh.length ? `這份檔案歸檔完成！${fresh.length} 張館藏卡收進你的收藏冊了。` : '這份檔案歸檔完成！這幾張館藏卡你之前已經收藏過了。', 'happy')}
        <div class="unlock-cards">${ids.map(x => `<div class="unlock-card${fresh.includes(x) ? ' new' : ''}">${fresh.includes(x) ? '<span class="new-tag">新收藏</span>' : ''}${cardHTML(x)}</div>`).join('')}</div>
        <div class="row"><a class="primary btn" href="${back}">回到${esc(line.wing)}</a><a class="ghost btn" href="#/h/cards">看收藏冊</a></div>`;
    }

    show();
  };

  // 館藏卡收藏冊：依三條線分組；沒解鎖的顯示空卡位
  views.cards = () => {
    const have = new Set(myCards());
    const groups = H().lines.map(l => ({ l, evs: H().events.filter(e => e.line === l.id && (H().cards[e.id] || have.has(e.id))).sort((a, b) => have.has(b.id) - have.has(a.id)) }));
    const total = groups.reduce((s, g) => s + g.evs.length, 0);
    app().innerHTML = `${topbar('#/h')}<div class="page album"><h1>館藏卡收藏冊</h1>
      ${aban(have.size ? `你已經收藏了 ${have.size} 張館藏卡。點一張卡就能再讀一次。` : '收藏冊還是空的。到館區讀完一章故事，就能解鎖那個時代的館藏卡。', have.size ? 'happy' : 'idle')}
      <p class="hint">已收藏 ${have.size} / ${total} 張</p>
      ${groups.map(({ l, evs }) => `<h2 class="sec">${esc(l.wing)}<small>　${evs.filter(e => have.has(e.id)).length} / ${evs.length}</small></h2>
        <div class="album-grid">${evs.map(e => have.has(e.id)
          ? `<button class="cc on" data-id="${esc(e.id)}"><b>${esc((H().cards[e.id] || {}).title || e.name)}</b><small>${esc(e.time)}</small></button>`
          : `<div class="cc off"><b>？</b><small>${esc(eraName(e.era))}</small></div>`).join('')}</div>`).join('')}
      <div class="cc-sheet" hidden></div></div>`;
    const sheet = app().querySelector('.cc-sheet');
    app().querySelectorAll('.cc.on').forEach(b => b.onclick = () => {
      sheet.hidden = false;
      sheet.innerHTML = `<button class="ghost cc-close" aria-label="關閉">×</button>${cardHTML(b.dataset.id)}`;
      sheet.querySelector('.cc-close').onclick = () => { sheet.hidden = true; };
    });
  };

  // 家長頁：一章全部內容一次攤開（嵌入題的位置留給 parent.js 用答題元件畫）
  function storyPreviewHTML(ch) {
    const len = s => String(s || '').replace(/\s/g, '').length;
    const ec = ch.eraChoice || { options: [] }, dt = ch.detective || { sentences: [], wrong: [] };
    const wrong = new Set((dt.wrong || []).map(Number));
    return `<div class="sp">
      <h4>檔案</h4><p>${esc(ch.doc || '—')}</p>
      <h4>開場 <small>${len(ch.opening)} 字</small></h4><div class="sp-text">${paras(ch.opening)}</div>
      <h4>時代選擇</h4><p>${esc(ec.prompt || '')}</p>
      <ul class="sp-opts">${ec.options.map(o => `<li class="${o.correct ? 'ok' : ''}">${o.correct ? '✓ ' : ''}${esc(o.text)}<small>（${esc(eraName(o.era))}）</small><br><span class="hint">${esc(o.feedback || '')}</span></li>`).join('')}</ul>
      ${ch.scenes.map((s, k) => `<h4>場景 ${k + 1} <small>${len(s.text)} 字</small></h4><div class="sp-text">${paras(s.text)}</div>${s.question ? `<div class="sp-q" data-k="${k}"></div>` : '<p class="hint">（沒有嵌入題）</p>'}`).join('')}
      <h4>時代錯置偵探</h4><p>${esc(dt.intro || '')}</p>
      <ol class="sp-dt">${(dt.sentences || []).map((t, i) => `<li class="${wrong.has(i) ? 'bad' : ''}">${esc(t)}${wrong.has(i) ? `<br><span class="hint">錯置：${esc((dt.explain || {})[i] || '（缺說明）')}</span>` : ''}</li>`).join('')}</ol>
      <h4>虛構與史實</h4><ul class="sp-ff">${ch.factFiction.map(it => `<li><span class="tag ${it.fact ? '' : 'soft'}">${it.fact ? '史實' : '虛構'}</span> ${esc(it.text)}<br><span class="hint">${esc(it.note || '')}</span></li>`).join('')}</ul>
      <h4>結尾 <small>${len(ch.ending)} 字</small></h4><div class="sp-text">${paras(ch.ending)}</div>
      <h4>解鎖館藏卡</h4><p>${unlockOf(ch).map(id => esc(H().eventById[id].name)).join('、') || '—'}</p></div>`;
  }


  // ---------- 家長頁的歷史部分 ----------
  const parent = {
    progressHTML() {
      if (H().error) return '<p class="empty">歷史資料載入失敗。</p>';
      return `<table class="plist"><thead><tr><th>館區／時代</th><th>可用題數</th><th>最佳</th><th>最近</th></tr></thead><tbody>
        ${H().lines.map(l => `<tr class="uh"><th colspan="4">${esc(l.wing)}</th></tr>` + erasOfLine(l.id).map(e => { const r = P().levels[e.id]; return `<tr><td>${esc(e.name)}</td><td>${H().liveOfEra(e.id).length}</td><td>${r ? Math.round(r.best * 100) + '%' : '—'}</td><td>${r ? new Date(r.ts).toLocaleDateString('zh-TW') : '—'}</td></tr>`; }).join('')).join('')}
        </tbody></table>
        <h3>故事</h3><p>${storyProgressText()}</p>
        <h3>待修復檔案（錯題回收中）</h3><p>${Object.keys(P().recycle).map(id => esc((H().eventById[id] || H().eraById[id] || { name: id }).name)).join('、') || '沒有'}</p>`;
    },
    log: () => P().log,
    tagsOf: e => (e.c || []).map(id => (H().eventById[id] || H().eraById[id] || { name: id }).name).join('、'),
    questions: () => H().questions,
    groupOf: q => q.unit,
    find: id => H().anyQ(id),
    stories: () => H().chapters,
    storyKey: id => H().storyKey(id),
    storyStatus: ch => H().chapterStatus(ch),
    storyGroupOf: ch => (H().lineById[ch._line] || { wing: '其他' }).wing,
    storyMetaHTML: ch => `${esc(ch.id)}｜${esc(eraName(ch.era))}｜主題：${esc([].concat(ch.themes || []).join('、'))}｜能力：${esc([].concat(ch.skills || []).join('、'))}｜事件：${esc((ch.eventIds || []).map(id => (H().eventById[id] || { name: id }).name).join('、') || '—')}`,
    storyPreviewHTML,
    metaHTML: q => `時代：${esc(q.unit)}｜主題：${esc([].concat(q.theme || []).join('、'))}｜能力：${esc([].concat(q.skill || []).join('、'))}｜事件：${esc((q.eventIds || []).map(id => (H().eventById[id] || { name: id }).name).join('、') || '—')}`
  };

  function route(a, b, c) {
    if (H().error) { app().innerHTML = `${topbar('#/hub')}<div class="page"><h1>歷史資料載入失敗</h1><p>${esc(H().error)}</p></div>`; return; }
    if (!P().hero) return views.hero();
    if (a === 'wing') return views.wing(b);
    if (a === 'timeline') return views.timeline();
    if (a === 'story') return views.story(b);
    if (a === 'cards') return views.cards();
    if (a === 'play') return views.play(b, c === 'sim' ? 'sim' : 'practice');
    return views.hall();
  }

  window.Subjects.history = {
    name: '歷史', title: '時光檔案館', home: '#/h', cover: () => H().img('hist_hall'),
    blurb: '見習檔案員和石虎阿斑，把被時間蛀蟲咬亂的檔案歸回正確的年代，讓時間長廊重新亮燈。',
    load: () => H().load().catch(e => { H().error = e.message; console.warn('歷史資料載入失敗', e); }),
    route, parent, card: cardHTML,
    hero: { label: '檔案員', img: h => H().img(`arch_${h}_idle`), get: () => P().hero, set: h => window.Store.H.set({ hero: h }) },
    about: '歷史事件與分期依康軒國中歷史課本整理。插畫為故事用原創圖。'
  };
})();
