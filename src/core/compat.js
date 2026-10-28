// 舊版瀏覽器相容（最先載入）：iOS 12–13 的 Safari 少了幾個新函式，這裡補上；
// 任何程式錯誤或載入太久，都把原因顯示在畫面上，不會一直停在「載入中」。
(function () {
  if (!Object.fromEntries) {
    Object.fromEntries = function (it) { var o = {}; Array.from(it).forEach(function (p) { o[p[0]] = p[1]; }); return o; };
  }
  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', { configurable: true, writable: true, value: function (d) {
      d = d === undefined ? 1 : d;
      return d < 1 ? this.slice() : this.reduce(function (a, x) { return a.concat(Array.isArray(x) ? x.flat(d - 1) : x); }, []);
    } });
  }
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true, value: function (f, t) { return this.map(f, t).flat(); } });
  }

  function show(msg) {
    var app = document.getElementById('app');
    if (!app || !/載入中/.test(app.textContent)) return;   // 已經畫出頁面就不打擾
    app.innerHTML = '<div style="padding:2em 1.2em;line-height:1.8;text-align:center"><h2>網站沒有順利打開</h2>' +
      '<p>' + msg + '</p><p style="color:#777;font-size:.9em">瀏覽器：' + navigator.userAgent.replace(/[<>&]/g, '') + '</p>' +
      '<p><button onclick="location.reload()" style="font-size:1.1em;padding:.5em 1.5em">重新整理</button></p>' +
      '<p style="color:#777;font-size:.9em">如果一直打不開，請截圖這個畫面。iPhone／iPad 請先到「設定 → 一般 → 軟體更新」更新系統。</p></div>';
  }
  window.addEventListener('error', function (e) {
    show('程式錯誤：' + String(e.message || e.error || '未知錯誤').replace(/[<>&]/g, ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; show('資料載入失敗：' + String((r && r.message) || r || '未知錯誤').replace(/[<>&]/g, ''));
  });
  setTimeout(function () { show('等了 25 秒還沒載入完成，可能是網路太慢。'); }, 25000);
})();
