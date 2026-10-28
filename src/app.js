// 主程式：路由與各頁面。
(function () {
  const esc = window.Charts.esc;
  const app = () => document.getElementById('app');
  const S = () => window.Store.get();
  const D = () => window.Data;

  // ---------- 統計 ----------
  function stats() {
    const cell = {};   // concept|region → {n, ok}
    const byQ = {};
    for (const e of S().log) {
      for (const c of e.c || []) {
        const k = c + '|' + e.r;
        cell[k] = cell[k] || { n: 0, ok: 0 };
        cell[k].n++; if (e.ok) cell[k].ok++;
      }
      byQ[e.q] = e;
    }
    return { cell, byQ };
  }
  function conceptAcc(st, c) {
    let n = 0, ok = 0;
    for (const [k, v] of Object.entries(st.cell)) if (k.startsWith(c + '|')) { n += v.n; ok += v.ok; }
    return n ? ok / n : null;
  }
  // 掌握：通論題答對過，且（若有區域題）至少一個區域題答對過
  function mastered(c) {
    const live = D().live().filter(q => q.concepts.includes(c));
    const hasRegion = live.some(q => q.region !== '通論');
    let gen = false, reg = false;
    for (const e of S().log) if (e.ok && (e.c || []).includes(c)) { if (e.r === '通論') gen = true; else reg = true; }
    return gen && (!hasRegion || reg);
  }
  function weakest(n) {
    const st = stats();
    const live = D().live();
    const cs = [...new Set(live.flatMap(q => q.concepts))];
    const rec = S().recycle;
    return cs.map(c => ({ c, acc: conceptAcc(st, c), pending: !!rec[c] }))
      .filter(x => x.pending || (x.acc != null && x.acc < 0.8))
      .sort((a, b) => (b.pending - a.pending) || ((a.acc ?? 1) - (b.acc ?? 1)))
      .slice(0, n);
  }
  function unitProgress(u) {
    const lv = u.levels.map(l => l.id).concat(u.boss ? [u.boss.id] : []);
    if (!lv.length) return null;
    return lv.filter(id => S().levels[id] && S().levels[id].done).length / lv.length;
  }

  // ---------- 共用 ----------
  function bird(text, pose) {
    return `<div class="talk"><img src="${D().img('bird_' + (pose || 'idle'))}" alt="阿鵲"><div class="bubble">${text}</div></div>`;
  }
  function heroImg(pose) { const h = S().hero || 'boy'; return D().img(`hero_${h}_${pose || 'idle'}`); }
  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">萬象地圖冊</span>'}
      <nav><a href="#/weak">弱點地圖</a><a href="#/settings">設定</a></nav></header>`;
  }
  function download(name, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function pickFile(cb) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { cb(JSON.parse(r.result)); } catch (e) { alert('讀檔失敗：' + e.message); } }; r.readAsText(f); };
    i.click();
  }
  const today = () => new Date().toISOString().slice(0, 10);

  // 區域遠征沒有插畫，用程式畫的迷你地圖當封面（反白該區域）
  const mapCache = {};
  function miniMap(u) {
    if (mapCache[u.id]) return mapCache[u.id];
    const base = D().files['basemap/world-countries-ne50m.json'];
    const svg = u.bbox ? window.Charts.regionMap(base, { bbox: u.bbox, highlight: u.highlight, mini: true, width: 360 })
      : window.Charts.polarMap(base, { pole: 'N', edge: 55, highlight: u.highlight, points: [] });
    return (mapCache[u.id] = svg);
  }
  const isExp = u => u.kind === 'expedition';
  function coverHTML(u, img) {
    return isExp(u) ? `<div class="mapcover">${miniMap(u)}</div>` : `<img src="${D().img(img || u.cover)}" alt="">`;
  }
  const title = u => u.island || u.name;
  const hasLive = u => { const ids = u.levels.map(l => l.id); return D().live().some(q => ids.includes(q.level)); };

  // ---------- 頁面 ----------
  const views = {};

  views.hero = () => {
    app().innerHTML = `<div class="page intro">
      <img class="intro-bg" src="${D().img('home_atlas')}" alt="">
      <div class="intro-card">
        <h1>萬象地圖冊</h1>
        <p>地理研究所的《萬象地圖冊》會自己長出地圖。一陣迷霧吹過，書頁上的島嶼全都變淡了。</p>
        <p>你是新來的見習測繪員。每讀懂一張圖、想通一個原理，就有一座島重新浮現。</p>
        ${bird('我是阿鵲，會一路陪你。先選一位測繪員吧！', 'happy')}
        <div class="heroes">${['boy', 'girl'].map(h => `<button class="hero-pick" data-h="${h}"><img src="${D().img(`hero_${h}_idle`)}" alt=""><span>${h === 'boy' ? '測繪員・男' : '測繪員・女'}</span></button>`).join('')}</div>
      </div></div>`;
    app().querySelectorAll('.hero-pick').forEach(b => b.onclick = () => { window.Store.set({ hero: b.dataset.h, introSeen: true }); location.hash = '#/'; });
  };

  views.home = () => {
    if (!S().hero) return views.hero();
    const units = D().units.filter(u => !isExp(u));
    const exps = D().units.filter(isExp);
    const weak = weakest(3);
    const live = D().live();
    // 首頁圖上 ①～⑥ 島嶼的位置（百分比，對應 home_atlas）
    const SPOT = { map: [27, 26], climate: [27, 47], landform: [56, 43], hydro: [72, 54], pop: [50, 70], industry: [84, 78] };
    app().innerHTML = `${topbar()}<div class="page home">
      <div class="atlas">
        <img src="${D().img('home_atlas')}" alt="萬象地圖冊">
        ${units.map(u => { const p = unitProgress(u); const [x, y] = SPOT[u.id]; const open = hasLive(u); return `<a class="spot ${open ? '' : 'closed'}" style="left:${x}%;top:${y}%" href="${open ? '#/unit/' + u.id : 'javascript:void 0'}" title="${esc(u.island)}"><span>${esc(u.island)}</span>${open ? `<i>${Math.round((p || 0) * 100)}%</i>` : '<i>即將開放</i>'}</a>`; }).join('')}
      </div>
      ${bird(live.length ? (weak.length ? '今天要不要先補一補這幾個地方？' : '想去哪座島都可以，慢慢來。') : '題目還在等家長審題，審好之後島嶼就會打開。', weak.length ? 'hint' : 'idle')}
      ${weak.length ? `<section class="today"><h2>今天建議練習</h2><div class="chips">${weak.map(w => `<span class="chip">${esc(D().conceptName[w.c])}${w.acc != null ? `・${Math.round(w.acc * 100)}%` : ''}</span>`).join('')}</div><a class="primary btn" href="#/weakplay">開始 8 題弱點練習</a></section>` : ''}
      <h2 class="sec">通論六島</h2>
      <section class="unit-list">${units.map(u => unitCard(u)).join('')}</section>
      <h2 class="sec">遠征航線</h2>
      ${bird('通論島上學到的原理，要帶出海用在世界各地。答錯時，我會先帶你回去複習原理。')}
      ${['第三冊', '第四冊', '第五冊'].map(v => `<h3 class="vol">${v}</h3><section class="unit-list exp">${exps.filter(u => u.volume === v).map(u => unitCard(u)).join('')}</section>`).join('')}
    </div>`;
  };

  function unitCard(u) {
    const p = unitProgress(u), open = hasLive(u);
    return `<a class="unit-card ${open ? '' : 'closed'} ${isExp(u) ? 'expcard' : ''}" href="${open ? '#/unit/' + u.id : 'javascript:void 0'}">${coverHTML(u)}<div><b>${isExp(u) ? '' : u.no + '．'}${esc(title(u))}</b><span>${esc(isExp(u) ? u.volume + '・區域遠征' : u.name)}</span><div class="bar"><i style="width:${Math.round((p || 0) * 100)}%"></i></div><small>${open ? `進度 ${Math.round((p || 0) * 100)}%` : '即將開放'}</small></div></a>`;
  }

  views.unit = (id) => {
    const u = D().units.find(x => x.id === id);
    if (!u) return views.home();
    const live = D().live();
    const cnt = lid => live.filter(q => q.level === lid).length;
    const allDone = u.levels.every(l => S().levels[l.id] && S().levels[l.id].done);
    app().innerHTML = `${topbar('#/')}<div class="page unit">
      <div class="cover ${isExp(u) ? 'expcover' : ''}">${coverHTML(u)}<h1>${esc(title(u))}<small>${esc(isExp(u) ? u.volume + '・區域遠征' : u.name)}</small></h1></div>
      ${bird(esc(u.story))}
      <div class="levels">${u.levels.map((l, i) => { const r = S().levels[l.id]; return `<div class="level">${coverHTML(u, l.banner)}<div class="linfo"><b>第 ${i + 1} 關</b><span>${esc(l.name)}</span><small>${cnt(l.id)} 題可練習${r ? `・最佳 ${Math.round(r.best * 100)}%` : ''}</small></div><div class="lbtn"><a class="primary btn" href="#/play/${l.id}/practice">練習</a><a class="ghost btn" href="#/play/${l.id}/sim">模擬</a></div></div>`; }).join('')}
        ${u.boss ? `<div class="level boss ${allDone ? '' : 'dim'}">${u.boss.image ? `<img src="${D().img(u.boss.image)}" alt="">` : coverHTML(u)}<div class="linfo"><b>${isExp(u) ? '區域魔王關' : '魔王關'}</b><span>${esc(u.boss.name)}</span><small>${allDone ? `${cnt(u.boss.id)} 題` : '完成前面的關卡後挑戰'}</small></div><div class="lbtn">${allDone ? `<a class="primary btn" href="#/play/${u.boss.id}/practice">挑戰</a><a class="ghost btn" href="#/play/${u.boss.id}/sim">模擬</a>` : ''}</div></div>` : ''}
      </div>
      <a class="ghost btn wide" href="#/play/${u.id}-all/sim">單元模擬測驗（計時 20 題）</a>
    </div>`;
  };

  function levelInfo(lid) {
    for (const u of D().units) {
      const l = u.levels.find(x => x.id === lid);
      if (l) return { u, l, boss: false };
      if (u.boss && u.boss.id === lid) return { u, l: { id: lid, name: u.boss.name, banner: u.boss.image || u.cover }, boss: true };
      if (lid === u.id + '-all') return { u, l: { id: lid, name: u.name + '單元模擬測驗', banner: u.cover }, all: true };
    }
    return null;
  }

  views.play = (lid, mode) => {
    const info = levelInfo(lid);
    if (!info) return views.home();
    const live = D().live();
    const pool = info.all ? live.filter(q => q.unit === info.u.name) : live.filter(q => q.level === lid);
    const intro = info.boss ? `<div class="boss-intro">${info.u.boss.image ? `<img src="${D().img(info.u.boss.image)}" alt="">` : ''}<p>${esc(info.u.boss.intro)}</p></div>` : '';
    app().innerHTML = `<div class="page play"><div class="banner ${isExp(info.u) ? 'expbanner' : ''}">${coverHTML(info.u, info.l.banner)}<h2>${esc(info.l.name)}</h2><span class="mode">${mode === 'sim' ? '模擬模式・計時，交卷後看解析' : '練習模式・不計時，即時解析'}</span></div>${intro}<div class="runbox"></div></div>`;
    window.Quiz.run(app().querySelector('.runbox'), {
      pool, mode, size: info.all ? 20 : info.boss ? 8 : 10,
      onQuit: () => { location.hash = '#/unit/' + info.u.id; },
      onEnd: sum => { window.Store.finishLevel(lid, sum.got, sum.total || 1, mode); views.result(sum, info); }
    });
  };

  views.weakplay = () => {
    const weak = weakest(3).map(w => w.c);
    const live = D().live();
    const pool = live.filter(q => q.concepts.some(c => weak.includes(c)));
    app().innerHTML = `<div class="page play"><div class="banner plain"><h2>弱點練習</h2><span class="mode">${weak.map(c => esc(D().conceptName[c])).join('、')}</span></div><div class="runbox"></div></div>`;
    window.Quiz.run(app().querySelector('.runbox'), {
      pool, mode: 'practice', size: 8,
      onQuit: () => { location.hash = '#/'; },
      onEnd: sum => views.result(sum, null)
    });
  };

  views.cell = (concept, region) => {
    const live = D().live();
    const pool = live.filter(q => q.concepts.includes(concept) && q.region === region);
    app().innerHTML = `<div class="page play"><div class="banner plain"><h2>${esc(D().conceptName[concept])} × ${esc(region)}</h2><span class="mode">練習模式</span></div>${window.Quiz.cardHTML(concept)}<div class="runbox"></div></div>`;
    window.Quiz.run(app().querySelector('.runbox'), { pool, mode: 'practice', size: 8, onQuit: () => { location.hash = '#/weak'; }, onEnd: sum => views.result(sum, null) });
  };

  views.result = (sum, info) => {
    const pct = sum.total ? Math.round(sum.got / sum.total * 100) : 0;
    const good = pct >= 80;
    const back = info ? '#/unit/' + info.u.id : '#/';
    app().innerHTML = `${topbar(back)}<div class="page result">
      <div class="score-hero"><img src="${heroImg(good ? 'happy' : 'think')}" alt=""><div><div class="big">${sum.got} / ${sum.total}</div><div>${pct}%${sum.timeUp ? '・時間到' : ''}・用時 ${Math.floor(sum.seconds / 60)} 分 ${sum.seconds % 60} 秒</div></div></div>
      ${bird(good ? (info && info.boss ? '魔王散去了！這座島的地圖又清楚了一些。' : '很穩！地圖冊上的線條又多了一些。') : '錯的題目我都記下來了，之後會換個樣子再出現，連續答對兩次就算過關。', good ? 'happy' : 'hint')}
      ${sum.mode === 'sim' ? `<h3>逐題解析</h3><div class="review">${window.Quiz.reviewList(sum.results)}</div>` : ''}
      <div class="row"><a class="primary btn" href="${back}">回到${info ? esc(info.u.island) : '首頁'}</a></div></div>`;
  };

  // 弱點地圖：概念 × 區域矩陣
  function matrixHTML(clickable) {
    const st = stats();
    const live = D().live();
    const regions = D().regions.map(r => r.name).filter(r => live.some(q => q.region === r) || r === '通論');
    const rows = D().concepts.units.flatMap(u => u.concepts.filter(c => live.some(q => q.concepts.includes(c.id))).map(c => ({ u, c })));
    if (!rows.length) return '<p class="empty">還沒有已確認的題目。</p>';
    const color = v => v == null ? 'none' : v >= 0.8 ? 'g' : v >= 0.6 ? 'y' : 'r';
    let h = `<div class="mx-wrap"><table class="mx"><thead><tr><th>概念</th>${regions.map(r => `<th>${esc(r)}</th>`).join('')}<th>掌握</th></tr></thead><tbody>`;
    for (const { c } of rows) {
      h += `<tr><th>${esc(c.name)}</th>`;
      for (const r of regions) {
        const has = live.some(q => q.region === r && q.concepts.includes(c.id));
        const v = st.cell[c.id + '|' + r];
        const acc = v ? v.ok / v.n : null;
        h += has ? `<td class="c-${color(acc)}">${clickable ? `<a href="#/cell/${c.id}/${encodeURIComponent(r)}">` : ''}${acc == null ? '·' : Math.round(acc * 100)}${clickable ? '</a>' : ''}</td>` : '<td class="na"></td>';
      }
      h += `<td>${mastered(c.id) ? '★' : ''}</td></tr>`;
    }
    h += '</tbody></table></div><p class="legend"><span class="c-g">≥80%</span><span class="c-y">60–79%</span><span class="c-r">&lt;60%</span><span class="c-none">還沒練</span>★＝通論題與區域題都答對過</p>';
    return h;
  }

  views.weak = () => {
    const weak = weakest(3);
    app().innerHTML = `${topbar('#/')}<div class="page weak"><h1>弱點地圖</h1>
      ${weak.length ? `<section class="today"><h2>最弱的三個概念</h2><ol>${weak.map(w => `<li>${esc(D().conceptName[w.c])}：${w.acc == null ? '待回收' : Math.round(w.acc * 100) + '%'}${w.pending ? '（錯題回收中）' : ''}</li>`).join('')}</ol><a class="primary btn" href="#/weakplay">練習這三個</a></section>` : bird('目前沒有明顯的弱點，繼續保持。')}
      <p class="hint">點任何一格，就能直接練習那個組合。</p>${matrixHTML(true)}</div>`;
  };

  views.settings = () => {
    app().innerHTML = `${topbar('#/')}<div class="page settings"><h1>設定</h1>
      <section><h2>測繪員</h2><div class="heroes small">${['boy', 'girl'].map(h => `<button class="hero-pick ${S().hero === h ? 'on' : ''}" data-h="${h}"><img src="${D().img(`hero_${h}_idle`)}" alt=""></button>`).join('')}</div></section>
      <section><h2>換裝置時帶走進度</h2><p>匯出一個進度檔（JSON），到新裝置按「匯入」選這個檔案即可。</p>
        <div class="row"><button class="primary" id="exp">匯出進度檔</button><button class="ghost" id="imp">匯入進度或審題檔</button></div><p class="msg"></p></section>
      <section><h2>家長</h2><a class="ghost btn" href="#/parent">進入家長頁</a></section>
      <section class="about"><h2>關於資料</h2><p>溫雨圖：交通部中央氣象署氣候平年值 1991–2020。臺灣與世界底圖：Natural Earth。等高線圖為練習用虛構地形。插畫為故事用原創圖。</p></section></div>`;
    app().querySelectorAll('.hero-pick').forEach(b => b.onclick = () => { window.Store.set({ hero: b.dataset.h }); views.settings(); });
    app().querySelector('#exp').onclick = () => download(`地理闖關進度_${today()}.json`, window.Store.exportProgress());
    app().querySelector('#imp').onclick = () => pickFile(o => { try { app().querySelector('.msg').textContent = window.Store.importFile(o); } catch (e) { app().querySelector('.msg').textContent = e.message; } });
  };

  // ---------- 家長頁 ----------
  let parentOK = false;
  views.parent = (tab) => {
    if (!parentOK) return parentLogin();
    tab = tab || 'progress';
    const tabs = { progress: '進度', matrix: '弱點矩陣', wrong: '近期錯題', review: '審題' };
    app().innerHTML = `${topbar('#/settings')}<div class="page parent"><h1>家長頁</h1>
      <nav class="tabs">${Object.entries(tabs).map(([k, v]) => `<a class="${k === tab ? 'on' : ''}" href="#/parent/${k}">${v}</a>`).join('')}</nav><div class="pbody"></div></div>`;
    const body = app().querySelector('.pbody');
    if (tab === 'progress') parentProgress(body);
    if (tab === 'matrix') body.innerHTML = matrixHTML(false);
    if (tab === 'wrong') parentWrong(body);
    if (tab === 'review') parentReview(body);
  };

  function parentLogin() {
    const has = !!S().parentHash;
    app().innerHTML = `${topbar('#/settings')}<div class="page parent"><h1>家長頁</h1>
      <p>${has ? '請輸入家長密碼。' : '第一次使用，請設定一組家長密碼（只存在這台裝置）。'}</p>
      <input type="password" id="pw" inputmode="numeric" autocomplete="off" placeholder="密碼">
      ${has ? '' : '<input type="password" id="pw2" autocomplete="off" placeholder="再輸入一次">'}
      <div class="row"><button class="primary" id="go">${has ? '進入' : '設定並進入'}</button></div><p class="msg"></p></div>`;
    app().querySelector('#go').onclick = () => {
      const v = app().querySelector('#pw').value;
      const msg = app().querySelector('.msg');
      if (!v) { msg.textContent = '請輸入密碼'; return; }
      if (!has) {
        if (v !== app().querySelector('#pw2').value) { msg.textContent = '兩次輸入不一樣'; return; }
        window.Store.set({ parentHash: window.Store.hash(v) });
      } else if (window.Store.hash(v) !== S().parentHash) { msg.textContent = '密碼不對'; return; }
      parentOK = true; views.parent();
    };
  }

  function parentProgress(body) {
    const live = D().live();
    const log = S().log;
    const days = [...new Set(log.map(e => new Date(e.ts).toISOString().slice(0, 10)))];
    body.innerHTML = `<p>累計作答 ${log.length} 次，練習天數 ${days.length} 天，最近一次 ${log.length ? new Date(log[log.length - 1].ts).toLocaleString('zh-TW') : '—'}。</p>
      <table class="plist"><thead><tr><th>單元／關卡</th><th>可用題數</th><th>最佳</th><th>最近</th></tr></thead><tbody>
      ${D().units.filter(u => u.levels.length).map(u => `<tr class="uh"><th colspan="4">${esc(u.island)}・${esc(u.name)}</th></tr>` + u.levels.concat(u.boss ? [{ id: u.boss.id, name: u.boss.name }] : []).map(l => { const r = S().levels[l.id]; return `<tr><td>${esc(l.name)}</td><td>${live.filter(q => q.level === l.id).length}</td><td>${r ? Math.round(r.best * 100) + '%' : '—'}</td><td>${r ? new Date(r.ts).toLocaleDateString('zh-TW') : '—'}</td></tr>`; }).join('')).join('')}
      </tbody></table>
      <h3>錯題回收中的概念</h3><p>${Object.keys(S().recycle).map(c => esc(D().conceptName[c] || c)).join('、') || '沒有'}</p>`;
  }

  function parentWrong(body) {
    const wrong = S().log.filter(e => !e.ok).slice(-30).reverse();
    if (!wrong.length) { body.innerHTML = '<p class="empty">最近沒有錯題。</p>'; return; }
    body.innerHTML = wrong.map(e => { const q = D().byId[e.q]; if (!q) return ''; const stem = e.part != null ? q.parts[e.part].stem : q.stem; return `<div class="wrong-row"><small>${new Date(e.ts).toLocaleString('zh-TW')}・${esc(q.id)}${e.part != null ? ` 第${e.part + 1}小題` : ''}・${esc((e.c || []).map(c => D().conceptName[c]).join('、'))}</small><div>${esc(stem)}</div></div>`; }).join('');
  }

  function parentReview(body) {
    const qs = D().questions;
    const st = q => D().status(q);
    const units = [...new Set(qs.map(q => q.unit))];
    let filter = { status: '待審', unit: '' };
    const draw = () => {
      const list = qs.filter(q => (!filter.status || st(q) === filter.status) && (!filter.unit || q.unit === filter.unit));
      const n = s => qs.filter(q => st(q) === s).length;
      body.innerHTML = `<div class="rfilter">
          <select id="fs"><option value="">全部狀態</option>${['待審', '確認', '退回'].map(s => `<option ${filter.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <select id="fu"><option value="">全部單元</option>${units.map(u => `<option ${filter.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
          <span>待審 ${n('待審')}・確認 ${n('確認')}・退回 ${n('退回')}</span></div>
        <div class="row batch"><label><input type="checkbox" id="all"> 全選這頁</label><button class="primary" id="bok">勾選的確認</button><button class="ghost" id="bno">勾選的退回</button></div>
        <div class="row"><button class="ghost" id="rexp">匯出審題結果</button><button class="ghost" id="rimp">匯入審題結果</button></div>
        <p class="hint">審題結果存在這台裝置。若孩子用別台裝置，請匯出後在那台匯入，或把檔案交給 Claude 寫回題庫。</p>
        <div class="rlist">${list.map(q => `<details class="rq s-${st(q)}"><summary><input type="checkbox" class="sel" data-id="${q.id}"> <b>${esc(q.id)}</b> <span class="tag">${esc(st(q))}</span>${S().review[q.id] && S().review[q.id].flag ? '<span class="tag flag">已標記問題</span>' : ''} ${esc(q.stem.slice(0, 40))}…</summary>
          <div class="rmeta">單元：${esc(q.unit)}｜關卡：${esc(q.level)}｜區域：${esc(q.region)}｜概念：${q.concepts.map(c => esc(D().conceptName[c] || c)).join('、')}<br>題型：${esc(window.Quiz.typeName(q.type))}｜依據：${esc(q.source)}</div>
          <div class="rpreview" data-id="${q.id}"></div>
          <div class="row"><button class="primary one" data-id="${q.id}" data-s="確認">確認</button><button class="ghost one" data-id="${q.id}" data-s="退回">退回</button><button class="ghost flagbtn" data-id="${q.id}">標記問題（立即下架）</button></div>
          ${S().review[q.id] && S().review[q.id].note ? `<p class="note">備註：${esc(S().review[q.id].note)}</p>` : ''}</details>`).join('') || '<p class="empty">沒有符合的題目。</p>'}</div>`;
      body.querySelector('#fs').onchange = e => { filter.status = e.target.value; draw(); };
      body.querySelector('#fu').onchange = e => { filter.unit = e.target.value; draw(); };
      body.querySelector('#all').onchange = e => body.querySelectorAll('.sel').forEach(c => c.checked = e.target.checked);
      const batch = s => { body.querySelectorAll('.sel:checked').forEach(c => window.Store.setReview(c.dataset.id, { status: s })); draw(); };
      body.querySelector('#bok').onclick = () => batch('確認');
      body.querySelector('#bno').onclick = () => batch('退回');
      body.querySelector('#rexp').onclick = () => download(`地理闖關審題結果_${today()}.json`, window.Store.exportReview());
      body.querySelector('#rimp').onclick = () => pickFile(o => { try { alert(window.Store.importFile(o)); draw(); } catch (e) { alert(e.message); } });
      body.querySelectorAll('.one').forEach(b => b.onclick = () => { window.Store.setReview(b.dataset.id, { status: b.dataset.s }); draw(); });
      body.querySelectorAll('.flagbtn').forEach(b => b.onclick = () => {
        const note = prompt('這題有什麼問題？（會一起存下來，方便修正）', '');
        if (note === null) return;
        window.Store.setReview(b.dataset.id, { status: '退回', flag: true, note });
        draw();
      });
      // 展開時才預覽題目（含答案與解析）
      body.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
        const box = d.querySelector('.rpreview');
        if (!d.open || box.dataset.done) return;
        box.dataset.done = '1';
        const q = D().byId[box.dataset.id];
        window.Quiz.renderItem(box, q, { mode: 'practice' }, () => { });
        box.insertAdjacentHTML('beforeend', `<div class="answer-key">${answerKey(q)}</div>`);
      }));
    };
    draw();
  }

  function answerKey(q) {
    const M = ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ', 'Ⓔ', 'Ⓕ'];
    const opt = o => typeof o === 'string' ? o : (o.text || '（圖）');
    if (q.parts) return q.parts.map((p, k) => `<p><b>第${k + 1}小題答案：</b>${esc(opt(p.options[p.answer]))}<br>${esc(p.explain)}</p>`).join('');
    if (q.type === 'order') return `<p><b>答案：</b>${esc(q.answer.map(i => q.items[i]).join(' → '))}<br>${esc(q.explain)}</p>`;
    if (q.type === 'match') return `<p><b>答案：</b>${esc(q.left.map((l, i) => `${l} → ${q.right[q.answer[i]]}`).join('；'))}<br>${esc(q.explain)}</p>`;
    return `<p><b>答案：</b>${esc(opt(q.options[q.answer]))}<br>${esc(q.explain)}</p>`;
  }

  // ---------- 路由 ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b, c] = h.split('/').map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (!S().hero && a !== 'parent' && a !== 'settings') return views.hero();
    if (a === 'unit') return views.unit(b);
    if (a === 'play') return views.play(b, c === 'sim' ? 'sim' : 'practice');
    if (a === 'weakplay') return views.weakplay();
    if (a === 'cell') return views.cell(b, c);
    if (a === 'weak') return views.weak();
    if (a === 'settings') return views.settings();
    if (a === 'parent') return views.parent(b);
    return views.home();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', async () => {
    try { await window.Data.load(); route(); }
    catch (e) { app().innerHTML = `<div class="page"><h1>載入失敗</h1><p>${esc(e.message)}</p><p class="hint">開發版要用本機伺服器開啟；或直接開 dist/ 裡的單一 HTML 檔。</p></div>`; }
  });
})();
