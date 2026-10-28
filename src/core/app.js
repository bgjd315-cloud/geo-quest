// 主程式：社會科闖關首頁（選科目）、設定、家長頁入口與路由。
// 網址：#/hub 選科目；地理沿用舊網址（#/、#/unit/…、#/play/…）；歷史在 #/h/…；#/settings、#/parent 兩科共用。
(function () {
  const { esc, app, download, pickFile, today } = window.UI;
  const SUBJ = window.Subjects;
  const S = () => window.Store.get();
  const THEME = { geo: '#3d7a80', history: '#7a4e2d', exam: '#4a5a6a', hub: '#5b5a4a' };

  // 依科目換配色（body 的 class）與瀏覽器上方的顏色
  function setTheme(k) {
    document.body.className = 'subj-' + k;
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = THEME[k];
  }
  // 記住最後選的科目，下次直接打開
  function remember(k) { if (S().subject !== k) window.Store.set({ subject: k }); }
  const current = () => S().subject || 'geo';

  // 共用頁面（設定、家長頁）的頂端列：返回鍵＋科目切換
  function topbar(back) {
    return `<header class="top">${back ? `<a class="back" href="${back}">‹ 返回</a>` : '<span class="brand">社會科闖關</span>'}
      <nav><a href="#/hub">社會科</a><a href="${SUBJ[current()].home}">${SUBJ[current()].name}</a></nav></header>`;
  }

  function hub() {
    setTheme('hub');
    app().innerHTML = `<div class="page hub">
      <header class="hub-head"><h1>社會科闖關</h1><p>今天想練哪一科？</p></header>
      <section class="hub-list">${Object.entries(SUBJ).map(([k, s]) => `<a class="hub-card hub-${k} ${S().subject === k ? 'last' : ''}" href="${s.home}" data-k="${k}">
        <img src="${s.cover()}" alt="${esc(s.title)}"><div><span class="hub-subj">${s.name}</span><b>${s.book === false ? esc(s.title) : `《${esc(s.title)}》`}</b><small>${esc(s.blurb)}</small>${S().subject === k ? '<i>上次練到這裡</i>' : ''}</div></a>`).join('')}</section>
      <div class="row hub-foot"><a class="ghost btn" href="#/x/diag">學習診斷</a><a class="ghost btn" href="#/settings">設定與進度檔</a></div></div>`;
    app().querySelectorAll('.hub-card').forEach(a => a.addEventListener('click', () => remember(a.dataset.k)));
  }

  function settings() {
    setTheme(current());
    app().innerHTML = `${topbar(SUBJ[current()].home)}<div class="page settings"><h1>設定</h1>
      ${Object.entries(SUBJ).filter(([, s]) => s.hero).map(([k, s]) => `<section><h2>${s.name}・${s.hero.label}</h2><div class="heroes small">${['boy', 'girl'].map(h => `<button class="hero-pick ${s.hero.get() === h ? 'on' : ''}" data-k="${k}" data-h="${h}"><img src="${s.hero.img(h)}" alt=""></button>`).join('')}</div></section>`).join('')}
      <section><h2>換裝置時帶走進度</h2><p>匯出一個進度檔（JSON，地理、歷史和會考真題都在裡面），到新裝置按「匯入」選這個檔案即可。舊版只有地理的進度檔也可以匯入。</p>
        <div class="row"><button class="primary" id="exp">匯出進度檔</button><button class="ghost" id="imp">匯入進度或審題檔</button></div><p class="msg"></p></section>
      ${window.XData && window.XData.legendHTML && window.XData.items.length ? `<section><h2>標籤說明：會考出題率</h2>${window.XData.legendHTML()}<a class="ghost btn" href="#/x/stats">看考點分布</a></section>` : ''}
      <section><h2>家長</h2><a class="ghost btn" href="#/parent">進入家長頁</a></section>
      <section class="about"><h2>關於資料</h2>${Object.values(SUBJ).filter(s => s.about).map(s => `<p><b>${s.name}</b>：${esc(s.about)}</p>`).join('')}</section></div>`;
    app().querySelectorAll('.hero-pick').forEach(b => b.onclick = () => { SUBJ[b.dataset.k].hero.set(b.dataset.h); settings(); });
    app().querySelector('#exp').onclick = () => download(`社會科闖關進度_${today()}.json`, window.Store.exportProgress());
    app().querySelector('#imp').onclick = () => pickFile(o => { try { app().querySelector('.msg').textContent = window.Store.importFile(o); } catch (e) { app().querySelector('.msg').textContent = e.message; } });
  }

  // ---------- 路由 ----------
  function route() {
    const raw = location.hash;
    const [a, b, c, d] = raw.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    window.scrollTo(0, 0);
    // 沒有網址（直接打開網站）：回到上次的科目；第一次來就選科目
    if (raw === '' || raw === '#') {
      if (S().subject && SUBJ[S().subject]) { location.replace(SUBJ[S().subject].home); return; }
      return hub();
    }
    if (a === 'hub') return hub();
    if (a === 'settings') return settings();
    if (a === 'parent') { setTheme(current()); return window.Parent.view(b, topbar); }
    if (a === 'h') { remember('history'); setTheme('history'); return SUBJ.history.route(b, c, d); }
    // 會考真題（#/x/…）；學習診斷 #/x/diag 不改「上次的科目」
    if (a === 'x') { if (b !== 'diag') remember('exam'); setTheme('exam'); return SUBJ.exam.route(b, c, d); }
    remember('geo'); setTheme('geo');
    return SUBJ.geo.route(a, b, c);
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', async () => {
    try { await Promise.all(Object.values(SUBJ).map(s => s.load())); route(); }
    catch (e) { app().innerHTML = `<div class="page"><h1>載入失敗</h1><p>${esc(e.message)}</p><p class="hint">開發版要用本機伺服器開啟；或直接開 dist/ 裡的單一 HTML 檔。</p></div>`; }
  });
})();
