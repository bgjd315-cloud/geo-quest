// 兩科共用的小工具：跳脫、嚮導對話泡泡、下載與選檔、科目註冊表。
(function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 嚮導對話：地理是阿鵲、歷史是阿斑，各科傳入自己的圖
  function talk(src, alt, text) {
    return `<div class="talk"><img src="${src}" alt="${esc(alt)}"><div class="bubble">${text}</div></div>`;
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
  const app = () => document.getElementById('app');

  // 各科模組在這裡登記：{ name, title, home(首頁網址), cover(), load(), route(片段), heroes, parent }
  const Subjects = {};

  window.UI = { esc, talk, download, pickFile, today, app };
  window.Subjects = Subjects;
})();
