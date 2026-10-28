// 時間長廊：臺灣、東亞、世界三排書架並列，可縮放（雙指、按鈕、滑桿）與左右捲動。
// 年代不等比例：史前、上古壓縮，近代、現代放寬，背景色帶是分期。
(function () {
  const { esc } = window.UI;
  const H = () => window.HData;
  // 各分期在縮放 1 倍時的寬度（px）
  const WIDTH = { 史前時代: 140, 上古: 760, 中古: 460, 近代: 460, 現代: 1500 };
  const LANE_NAME = { tw: '臺灣', ea: '東亞', w: '世界' };
  const ROW = 26, HEAD = 46, PAD = 10;
  const Z_MIN = 0.3, Z_MAX = 3;
  let zoom = 0.6, centerYear = 1600;   // 離開再回來時保持上次的位置

  // ---------- 年份 ↔ 橫向位置（分段線性） ----------
  function scale() {
    let x = 0;
    const segs = H().bands.map(b => { const w = (WIDTH[b.name] || 400) * zoom; const s = { b, x0: x, w }; x += w; return s; });
    const seg = y => segs.find(s => y < s.b.to) || segs[segs.length - 1];
    const X = y => { y = Math.max(H().MIN, Math.min(H().NOW, y)); const s = seg(y); return s.x0 + (y - s.b.from) / (s.b.to - s.b.from) * s.w; };
    const Y = px => { const s = segs.find(s => px < s.x0 + s.w) || segs[segs.length - 1]; return s.b.from + (px - s.x0) / s.w * (s.b.to - s.b.from); };
    return { segs, X, Y, width: x };
  }
  const yearText = y => y < 0 ? `前 ${-Math.round(y)}` : String(Math.round(y));
  // 標籤用短名：取「：」「（」之前，最多 10 字
  const short = n => { const s = n.split(/[：（(]/)[0]; return s.length > 10 ? s.slice(0, 10) + '…' : s; };

  // 事件狀態：未練／練習中／已掌握（答對兩次以上且不在錯題回收中）
  function status(id) {
    const p = window.Store.H.get();
    let ok = 0, n = 0;
    for (const e of p.log) if ((e.c || []).includes(id)) { n++; if (e.ok) ok++; }
    if (!n) return 'none';
    return ok >= 2 && !p.recycle[id] ? 'done' : 'doing';
  }

  function layout(sc) {
    const lanes = [];
    let top = HEAD;
    for (const line of H().lines) {
      const evs = H().events.filter(e => e.line === line.id)
        .map(e => { const x = sc.X(e._span.from), x2 = sc.X(e._span.to); return { e, x, x2, w: short(e.name).length * 12 + 18 }; })
        .sort((a, b) => a.x - b.x);
      const ends = [];   // 每一列目前最右邊的位置
      for (const it of evs) {
        const right = Math.max(it.x + it.w, it.x2) + 4;
        let r = ends.findIndex(end => end <= it.x);
        if (r < 0) { r = ends.length; ends.push(0); }
        ends[r] = right; it.row = r;
      }
      const h = Math.max(1, ends.length) * ROW + PAD * 2 + 14;
      lanes.push({ line, evs, top, h });
      top += h;
    }
    return { lanes, height: top + 8 };
  }

  function ticks(sc) {
    let h = '';
    for (const s of sc.segs) {
      const pxPerYear = s.w / (s.b.to - s.b.from);
      const step = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(v => v * pxPerYear >= 64) || 5000;
      for (let y = Math.ceil(s.b.from / step) * step; y < s.b.to; y += step) {
        const x = sc.X(y);
        if (x - s.x0 < 24) continue;   // 太靠近分期邊界就略過，避免和分期名稱重疊
        h += `<div class="tl-tick" style="left:${x}px"><span>${yearText(y)}</span></div>`;
      }
    }
    return h;
  }

  function canvasHTML() {
    const sc = scale(), L = layout(sc);
    let h = sc.segs.map((s, i) => `<div class="tl-band b${i}" style="left:${s.x0}px;width:${s.w}px"><b>${esc(s.b.name)}</b></div>`).join('') + ticks(sc);
    for (const lane of L.lanes) {
      h += `<div class="tl-lane l-${lane.line.id}" style="top:${lane.top}px;height:${lane.h}px"></div>`;
      for (const it of lane.evs) {
        const y = lane.top + PAD + 14 + it.row * ROW;
        if (it.x2 - it.x > 6) h += `<div class="tl-span l-${lane.line.id}" style="left:${it.x}px;width:${it.x2 - it.x}px;top:${y + ROW - 7}px"></div>`;
        h += `<button class="tl-ev s-${status(it.e.id)} ${it.e._span.guess ? 'guess' : ''}" data-id="${it.e.id}" style="left:${it.x - 5}px;top:${y}px"><i></i>${esc(short(it.e.name))}</button>`;
      }
    }
    return { html: h, width: sc.width, height: L.height, lanes: L.lanes, sc };
  }

  function render(root, opts) {
    root.innerHTML = `<div class="tl">
      <div class="tl-tools"><button class="ghost" data-z="-1" aria-label="縮小">－</button>
        <input type="range" min="0" max="100" class="tl-zoom" aria-label="縮放"><button class="ghost" data-z="1" aria-label="放大">＋</button></div>
      <div class="tl-wrap"><div class="tl-scroll"><div class="tl-canvas"></div></div><div class="tl-names"></div></div>
      <p class="legend tl-legend"><span class="s-none"><i></i>還沒練</span><span class="s-doing"><i></i>練習中</span><span class="s-done"><i></i>已掌握</span><span class="guess"><i></i>時間不明，放在分期中間</span></p>
      <div class="tl-sheet" hidden></div></div>`;
    const scroller = root.querySelector('.tl-scroll'), canvas = root.querySelector('.tl-canvas');
    const slider = root.querySelector('.tl-zoom'), names = root.querySelector('.tl-names'), sheet = root.querySelector('.tl-sheet');
    // 滑桿 0–100 對應縮放倍數（對數刻度）
    const toSlider = z => Math.round(Math.log(z / Z_MIN) / Math.log(Z_MAX / Z_MIN) * 100);
    const fromSlider = v => Z_MIN * Math.pow(Z_MAX / Z_MIN, v / 100);
    let cur = null;

    function draw(keepCenter) {
      if (keepCenter !== false && cur) centerYear = cur.sc.Y(scroller.scrollLeft + scroller.clientWidth / 2);
      cur = canvasHTML();
      canvas.style.width = cur.width + 'px'; canvas.style.height = cur.height + 'px';
      canvas.innerHTML = cur.html;
      names.innerHTML = cur.lanes.map(l => `<span style="top:${l.top + 4}px">${LANE_NAME[l.line.id]}</span>`).join('');
      scroller.scrollLeft = cur.sc.X(centerYear) - scroller.clientWidth / 2;
      slider.value = toSlider(zoom);
    }
    const setZoom = z => { z = Math.max(Z_MIN, Math.min(Z_MAX, z)); if (Math.abs(z - zoom) < 0.001) return; centerYear = cur.sc.Y(scroller.scrollLeft + scroller.clientWidth / 2); zoom = z; draw(false); };
    root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => setZoom(zoom * (b.dataset.z > 0 ? 1.4 : 1 / 1.4)));
    slider.oninput = () => setZoom(fromSlider(+slider.value));
    scroller.addEventListener('scroll', () => { centerYear = cur.sc.Y(scroller.scrollLeft + scroller.clientWidth / 2); }, { passive: true });

    // 雙指縮放
    const pts = new Map();
    let pinch = null, raf = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    scroller.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) pinch = { d: dist(), z: zoom }; });
    scroller.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) { const z = pinch.z * dist() / pinch.d; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setZoom(z)); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    scroller.addEventListener('pointerup', up); scroller.addEventListener('pointercancel', up);
    // 電腦：Ctrl＋滾輪縮放
    scroller.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

    // 點事件：顯示名稱、時間、分期、主題
    canvas.addEventListener('click', e => {
      const b = e.target.closest('.tl-ev'); if (!b) return;
      const ev = H().eventById[b.dataset.id], era = H().eraById[ev.era], line = H().lineById[ev.line];
      const n = H().liveOfEvent(ev.id).length;
      sheet.hidden = false;
      sheet.innerHTML = `<button class="ghost tl-close" aria-label="關閉">×</button>
        <div class="card-kicker">${esc(line.wing)}・館藏卡</div><h3>${esc(ev.name)}</h3>
        <p class="tl-meta"><b>時間</b>${esc(ev.time === '—' ? '課本未標年代' : ev.time)}${ev._span.guess ? '（約略放在分期中間）' : ''}<br>
        <b>分期</b>${esc(era.name)}（${esc(era.time)}・${esc(era.lessons)}）</p>
        <div class="chips">${(ev.themes || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
        ${n ? `<a class="primary btn" href="#/h/play/${ev.era}/practice">整理這個時代的檔案（${n} 題）</a>` : '<p class="hint">這份檔案的題目籌備中。</p>'}`;
      sheet.querySelector('.tl-close').onclick = () => { sheet.hidden = true; };
      opts && opts.onPick && opts.onPick(ev);
    });

    draw(false);
  }

  window.Timeline = { render };
})();
