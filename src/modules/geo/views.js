// 地理模組《萬象地圖冊》：首頁單元地圖、單元頁、作答、弱點地圖，以及家長頁的地理部分。
(function () {
  const { esc, app } = window.UI;
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
      .sort((a, b) => (b.pending - a.pending) || ((a.acc == null ? 1 : a.acc) - (b.acc == null ? 1 : b.acc)))
      .slice(0, n);
  }
  function unitProgress(u) {
    const lv = u.levels.map(l => l.id).concat(u.boss ? [u.boss.id] : []);
    if (!lv.length) return null;
    return lv.filter(id => S().levels[id] && S().levels[id].done).length / lv.length;
  }

  // ---------- 共用 ----------
  const bird = (text, pose) => window.UI.talk(D().img('bird_' + (pose || 'idle')), '阿鵲', text);
  function heroImg(pose) { const h = S().hero || 'boy'; return D().img(`hero_${h}_${pose || 'idle'}`); }
  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">萬象地圖冊</span>'}
      <nav><a href="#/hub">社會科</a><a href="#/weak">弱點地圖</a><a href="#/settings">設定</a></nav></header>`;
  }

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
  // img === 'map'：遠征的關卡卡片用迷你地圖，看得出是哪個區域；其他情況用插畫
  function coverHTML(u, img) {
    if (isExp(u) && (img === 'map' || !u.cover)) return `<div class="mapcover">${miniMap(u)}</div>`;
    return `<img src="${D().img(img && img !== 'map' ? img : u.cover)}" alt="">`;
  }
  const title = u => u.island || u.name;
  const hasLive = u => { const ids = u.levels.map(l => l.id); return D().live().some(q => ids.includes(q.level)); };
  // 會考出題率（算法在 exam/data.js 的 XData，全站共用）
  const XD = () => window.XData && window.XData.shareHTML ? window.XData : null;
  const unitShareHTML = u => XD() ? XD().shareHTML(XD().unitShare(u.id)) : '';
  const levelShareHTML = l => XD() ? XD().shareHTML(XD().levelShare(l.id)) : '';

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
    app().querySelectorAll('.hero-pick').forEach(b => b.onclick = () => { window.Store.set({ hero: b.dataset.h, introSeen: true }); if (location.hash === '#/') views.home(); else location.hash = '#/'; });
  };

  views.home = () => {
    if (!S().hero) return views.hero();
    const units = D().units.filter(u => !isExp(u) && u.kind !== 'homecoming');
    const homes = D().units.filter(u => u.kind === 'homecoming');
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
      <div class="ship"><img src="${D().img('exp_ship')}" alt="研究船出海"></div>
      ${bird('通論島上學到的原理，要帶出海用在世界各地。答錯時，我會先帶你回去複習原理。')}
      ${['第三冊', '第四冊', '第五冊'].map(v => `<h3 class="vol">${v}</h3><section class="unit-list exp">${exps.filter(u => u.volume === v).map(u => unitCard(u)).join('')}</section>`).join('')}
      ${homes.length ? `<h2 class="sec">回到家鄉</h2>
      ${bird('繞完世界一圈，研究船回到臺灣了。這一站在第六冊：讀懂家鄉的地名和餐桌。')}
      <section class="unit-list">${homes.map(u => unitCard(u)).join('')}</section>` : ''}
    </div>`;
  };

  function unitCard(u) {
    const p = unitProgress(u), open = hasLive(u);
    return `<a class="unit-card ${open ? '' : 'closed'} ${isExp(u) ? 'expcard' : ''}" href="${open ? '#/unit/' + u.id : 'javascript:void 0'}">${coverHTML(u)}<div><b>${isExp(u) ? '' : u.no + '．'}${esc(title(u))}</b><span>${esc(isExp(u) ? u.volume + '・區域遠征' : u.name)}</span><div class="bar"><i style="width:${Math.round((p || 0) * 100)}%"></i></div><small>${open ? `進度 ${Math.round((p || 0) * 100)}%` : '即將開放'}</small>${unitShareHTML(u)}</div></a>`;
  }

  views.unit = (id) => {
    const u = D().units.find(x => x.id === id);
    if (!u) return views.home();
    const live = D().live();
    const cnt = lid => live.filter(q => q.level === lid).length;
    const allDone = u.levels.every(l => S().levels[l.id] && S().levels[l.id].done);
    app().innerHTML = `${topbar('#/')}<div class="page unit">
      <div class="cover ${isExp(u) ? 'expcover' : ''}">${coverHTML(u)}<h1>${esc(title(u))}<small>${esc(isExp(u) ? u.volume + '・區域遠征' : u.name)}</small></h1></div>
      <p class="unit-xsh">${unitShareHTML(u)}</p>
      ${bird(esc(u.story))}
      <div class="levels">${u.levels.map((l, i) => { const r = S().levels[l.id]; return `<div class="level">${coverHTML(u, isExp(u) ? 'map' : l.banner)}<div class="linfo"><b>第 ${i + 1} 關</b><span>${esc(l.name)}</span><small>${cnt(l.id)} 題可練習${r ? `・最佳 ${Math.round(r.best * 100)}%` : ''}</small>${levelShareHTML(l)}</div><div class="lbtn"><a class="primary btn" href="#/play/${l.id}/practice">練習</a><a class="ghost btn" href="#/play/${l.id}/sim">模擬</a></div></div>`; }).join('')}
        ${u.boss ? `<div class="level boss ${allDone ? '' : 'dim'}">${u.boss.image ? `<img src="${D().img(u.boss.image)}" alt="">` : coverHTML(u)}<div class="linfo"><b>${isExp(u) ? '區域魔王關' : '魔王關'}</b><span>${esc(u.boss.name)}</span><small>${allDone ? `${cnt(u.boss.id)} 題` : '完成前面的關卡後挑戰'}</small></div><div class="lbtn">${allDone ? `<a class="primary btn" href="#/play/${u.boss.id}/practice">挑戰</a><a class="ghost btn" href="#/play/${u.boss.id}/sim">模擬</a>` : ''}</div></div>` : ''}
      </div>
      <a class="ghost btn wide" href="#/play/${u.id}-all/sim">單元模擬測驗（計時 20 題）</a>
      ${examKpHTML(u)}
    </div>`;
  };

  // 這座島（或遠征區域）的觀念在會考的出題率（考過的才列；點了練那個觀念的真題）
  function examKpHTML(u) {
    const XD = window.XData;
    if (!XD || !XD.chip) return '';
    const ids = new Set(((D().concepts.units.find(x => x.id === u.id) || {}).concepts || []).map(c => c.id));
    const lv = new Set(u.levels.map(l => l.id).concat(u.boss ? [u.boss.id] : []));
    for (const q of D().live()) if (lv.has(q.level)) q.concepts.forEach(c => ids.add(c));
    const ks = [...ids].map(c => [c, XD.count('geo:' + c)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    return ks.length ? `<div class="x-kps"><span class="x-kps-h">這裡的會考考點</span>${ks.map(([c, n]) => `<a class="x-kpchip" href="#/x/kp/${encodeURIComponent(c)}">${esc(D().conceptName[c] || c)}${XD.chip(n, { short: true })}<small class="x-kpn">${n} 題</small></a>`).join('')}</div>` : '';
  }

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
    app().innerHTML = `<div class="page play"><div class="banner">${coverHTML(info.u, isExp(info.u) ? info.u.cover : info.l.banner)}<h2>${esc(info.l.name)}</h2><span class="mode">${mode === 'sim' ? '模擬模式・計時，交卷後看解析' : '練習模式・不計時，即時解析'}</span></div>${intro}<div class="runbox"></div></div>`;
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
      h += `<tr><th>${esc(c.name)}${XD() ? XD().chipKey('geo:' + c.id, { short: true }) : ''}</th>`;
      for (const r of regions) {
        const has = live.some(q => q.region === r && q.concepts.includes(c.id));
        const v = st.cell[c.id + '|' + r];
        const acc = v ? v.ok / v.n : null;
        h += has ? `<td class="c-${color(acc)}">${clickable ? `<a href="#/cell/${c.id}/${encodeURIComponent(r)}">` : ''}${acc == null ? '·' : Math.round(acc * 100)}${clickable ? '</a>' : ''}</td>` : '<td class="na"></td>';
      }
      h += `<td>${mastered(c.id) ? '★' : ''}</td></tr>`;
    }
    h += '</tbody></table></div><p class="legend"><span class="c-g">≥80%</span><span class="c-y">60–79%</span><span class="c-r">&lt;60%</span><span class="c-none">還沒練</span>★＝通論題與區域題都答對過</p>' + (XD() ? `<p class="legend">概念後面的小標籤＝會考出題率：${XD().TIERS.map(t => XD().chip(t.min, { short: true }) + esc(t.min >= 5 ? '5 題以上' : t.min === 2 ? '2–4 題' : t.min === 1 ? '1 題' : '沒考過')).join('　')}</p>` : '');
    return h;
  }

  views.weak = () => {
    const weak = weakest(3);
    app().innerHTML = `${topbar('#/')}<div class="page weak"><h1>弱點地圖</h1>
      ${weak.length ? `<section class="today"><h2>最弱的三個概念</h2><ol>${weak.map(w => `<li>${esc(D().conceptName[w.c])}：${w.acc == null ? '待回收' : Math.round(w.acc * 100) + '%'}${w.pending ? '（錯題回收中）' : ''}</li>`).join('')}</ol><a class="primary btn" href="#/weakplay">練習這三個</a></section>` : bird('目前沒有明顯的弱點，繼續保持。')}
      <p class="hint">點任何一格，就能直接練習那個組合。</p>${matrixHTML(true)}</div>`;
  };

  // ---------- 家長頁的地理部分（core/parent.js 呼叫） ----------
  const parent = {
    progressHTML() {
      const live = D().live();
      return `<table class="plist"><thead><tr><th>單元／關卡</th><th>可用題數</th><th>最佳</th><th>最近</th></tr></thead><tbody>
        ${D().units.filter(u => u.levels.length).map(u => `<tr class="uh"><th colspan="4">${esc(u.island)}・${esc(u.name)}</th></tr>` + u.levels.concat(u.boss ? [{ id: u.boss.id, name: u.boss.name }] : []).map(l => { const r = S().levels[l.id]; return `<tr><td>${esc(l.name)}</td><td>${live.filter(q => q.level === l.id).length}</td><td>${r ? Math.round(r.best * 100) + '%' : '—'}</td><td>${r ? new Date(r.ts).toLocaleDateString('zh-TW') : '—'}</td></tr>`; }).join('')).join('')}
        </tbody></table>
        <h3>錯題回收中的概念</h3><p>${Object.keys(S().recycle).map(c => esc(D().conceptName[c] || c)).join('、') || '沒有'}</p>`;
    },
    matrixHTML: () => matrixHTML(false),
    log: () => S().log,
    tagsOf: e => (e.c || []).map(c => D().conceptName[c]).join('、'),
    // 審題清單：依單元分組
    questions: () => D().questions,
    groupOf: q => q.unit,
    metaHTML: q => `單元：${esc(q.unit)}｜關卡：${esc(q.level)}｜區域：${esc(q.region)}｜概念：${q.concepts.map(c => esc(D().conceptName[c] || c)).join('、')}`
  };

  // ---------- 路由（網址沿用舊版：#/、#/unit/…、#/play/…） ----------
  function route(a, b, c) {
    if (!S().hero) return views.hero();
    if (a === 'unit') return views.unit(b);
    if (a === 'play') return views.play(b, c === 'sim' ? 'sim' : 'practice');
    if (a === 'weakplay') return views.weakplay();
    if (a === 'cell') return views.cell(b, c);
    if (a === 'weak') return views.weak();
    return views.home();
  }

  window.Subjects.geo = {
    name: '地理', title: '萬象地圖冊', home: '#/', cover: () => D().img('home_atlas'),
    blurb: '見習測繪員和臺灣藍鵲阿鵲，讀懂圖表、想通原理，讓七座島與世界航線重新浮現。',
    load: () => D().load(), route, parent,
    hero: { label: '測繪員', img: h => D().img(`hero_${h}_idle`), get: () => S().hero, set: h => window.Store.set({ hero: h }) },
    about: '溫雨圖：交通部中央氣象署氣候平年值 1991–2020、WMO 1991–2020。人口金字塔：聯合國 WPP 2024。底圖：Natural Earth。等高線圖為練習用虛構地形。'
  };
})();
