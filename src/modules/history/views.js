// 歷史模組《時光檔案館》：見習檔案員選角、大廳（三個館區）、館區頁、時間長廊、整理檔案（作答）。
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
        return `<a class="wing-card" href="#/h/wing/${l.id}"><img src="${H().img(WINGS[l.id])}" alt=""><div><b>${esc(l.wing)}</b><span>${esc(l.name)}・${eras.length} 個時代・${evs.length} 份檔案</span><small>${n ? `${n} 題可整理` : '籌備中'}</small></div></a>`;
      }).join('')}</section>
      <h2 class="sec">時間長廊</h2>
      <a class="corridor-card" href="#/h/timeline"><img src="${H().img('hist_corridor')}" alt="時間長廊"><span>三排書架並排：臺灣、東亞、世界。可以縮放，看看同一個時候各地發生什麼事。</span></a>
    </div>`;
  };

  // 館區：列出各時代與其中的事件
  views.wing = id => {
    const line = H().lineById[id];
    if (!line) return views.hall();
    app().innerHTML = `${topbar('#/h')}<div class="page wing">
      <div class="cover"><img src="${H().img(WINGS[id])}" alt=""><h1>${esc(line.wing)}<small>${esc(line.name)}</small></h1></div>
      ${aban(`${esc(line.wing)}有 ${erasOfLine(id).length} 個時代的櫃子。每個櫃子的檔案歸好位，長廊就亮一段。`)}
      <div class="era-list">${erasOfLine(id).map(era => {
        const n = H().liveOfEra(era.id).length, r = P().levels[era.id];
        return `<details class="era" ${n ? 'open' : ''}><summary><b>${esc(era.name)}</b><span class="era-time">${esc(era.time)}</span><span class="tag soft">${esc(era.lessons)}</span>${n ? `<span class="tag">${n} 題</span>` : '<span class="tag wait">籌備中</span>'}</summary>
          ${n ? `<div class="row"><a class="primary btn" href="#/h/play/${era.id}/practice">整理這個櫃子</a><a class="ghost btn" href="#/h/play/${era.id}/sim">模擬</a>${r ? `<small>最佳 ${Math.round(r.best * 100)}%</small>` : ''}</div>` : ''}
          <ul class="ev-list">${eventsOfEra(era.id).map(e => { const k = H().liveOfEvent(e.id).length; return `<li><span class="ev-time">${esc(e.time === '—' ? '—' : e.time)}</span><span class="ev-name">${esc(e.name)}</span>${k ? `<span class="tag">${k} 題</span>` : '<span class="tag wait">籌備中</span>'}</li>`; }).join('')}</ul>
        </details>`;
      }).join('')}</div>
    </div>`;
  };

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
      track: window.Store.H, live: H().live(), guide: H().img('aban_hint'), card: cardHTML,
      onQuit: () => { location.hash = '#/h/wing/' + line.id; },
      onEnd: sum => { window.Store.H.finishLevel(eraId, sum.got, sum.total || 1, mode); views.result(sum, line); }
    });
  };

  // 館藏卡（錯題補救時顯示；concept 是事件 id 或分期 id）
  function cardHTML(id) {
    const ev = H().eventById[id], era = H().eraById[ev ? ev.era : id];
    if (!era) return `<div class="card"><p>這張館藏卡還在準備中。</p></div>`;
    return `<div class="card"><div class="card-kicker">館藏卡</div><h3>${esc(ev ? ev.name : era.name)}</h3><p>${esc(ev ? ev.time : era.time)}・${esc(era.name)}</p>${ev ? `<div class="chips">${ev.themes.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}</div>`;
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

  // ---------- 家長頁的歷史部分 ----------
  const parent = {
    progressHTML() {
      if (H().error) return '<p class="empty">歷史資料載入失敗。</p>';
      return `<table class="plist"><thead><tr><th>館區／時代</th><th>可用題數</th><th>最佳</th><th>最近</th></tr></thead><tbody>
        ${H().lines.map(l => `<tr class="uh"><th colspan="4">${esc(l.wing)}</th></tr>` + erasOfLine(l.id).map(e => { const r = P().levels[e.id]; return `<tr><td>${esc(e.name)}</td><td>${H().liveOfEra(e.id).length}</td><td>${r ? Math.round(r.best * 100) + '%' : '—'}</td><td>${r ? new Date(r.ts).toLocaleDateString('zh-TW') : '—'}</td></tr>`; }).join('')).join('')}
        </tbody></table>
        <h3>待修復檔案（錯題回收中）</h3><p>${Object.keys(P().recycle).map(id => esc((H().eventById[id] || H().eraById[id] || { name: id }).name)).join('、') || '沒有'}</p>`;
    },
    log: () => P().log,
    tagsOf: e => (e.c || []).map(id => (H().eventById[id] || H().eraById[id] || { name: id }).name).join('、'),
    questions: () => H().questions,
    groupOf: q => q.unit,
    metaHTML: q => `時代：${esc(q.unit)}｜主題：${esc([].concat(q.theme || []).join('、'))}｜能力：${esc([].concat(q.skill || []).join('、'))}｜事件：${esc((q.eventIds || []).map(id => (H().eventById[id] || { name: id }).name).join('、') || '—')}`
  };

  function route(a, b, c) {
    if (H().error) { app().innerHTML = `${topbar('#/hub')}<div class="page"><h1>歷史資料載入失敗</h1><p>${esc(H().error)}</p></div>`; return; }
    if (!P().hero) return views.hero();
    if (a === 'wing') return views.wing(b);
    if (a === 'timeline') return views.timeline();
    if (a === 'play') return views.play(b, c === 'sim' ? 'sim' : 'practice');
    return views.hall();
  }

  window.Subjects.history = {
    name: '歷史', title: '時光檔案館', home: '#/h', cover: () => H().img('hist_hall'),
    blurb: '見習檔案員和石虎阿斑，把被時間蛀蟲咬亂的檔案歸回正確的年代，讓時間長廊重新亮燈。',
    load: () => H().load().catch(e => { H().error = e.message; console.warn('歷史資料載入失敗', e); }),
    route, parent,
    hero: { label: '檔案員', img: h => H().img(`arch_${h}_idle`), get: () => P().hero, set: h => window.Store.H.set({ hero: h }) },
    about: '歷史事件與分期依康軒國中歷史課本整理。插畫為故事用原創圖。'
  };
})();
