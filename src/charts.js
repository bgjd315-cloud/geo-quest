// 繪圖元件：一律依資料檔用程式畫成 SVG，不使用網路圖片。
// 每個函式回傳 SVG 字串；可點選的點帶有 data-pick 屬性，由 quiz.js 接手互動。
(function () {
  const G = window.GeoCalc;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  function frame(w, h, body, cls) {
    return `<svg class="fig ${cls || ''}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
  }

  // ---------- 溫雨圖 ----------
  // 固定刻度（-10～35°C、0～700 mm），讓不同測站可以互相比較
  function climograph(st, title, opt) {
    opt = opt || {};
    const W = 340, H = 260, L = 40, R = 300, T = 30, B = 220;
    const tMin = -10, tMax = 35;
    // 降水刻度預設 0～700 mm；同一組圖若有月份超過，就整組一起放大，維持可比較
    const pMax = opt.pMax || Math.max(700, Math.ceil(Math.max(...st.precip) / 100) * 100);
    const x = i => L + (i + 0.5) * (R - L) / 12;
    const yT = v => B - (v - tMin) / (tMax - tMin) * (B - T);
    const yP = v => B - v / pMax * (B - T);
    let s = `<rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" class="plot"/>`;
    for (let v = tMin; v <= tMax; v += 5) {
      s += `<line x1="${L}" x2="${R}" y1="${yT(v)}" y2="${yT(v)}" class="gridline"/>`;
      s += `<text x="${L - 5}" y="${yT(v) + 4}" class="tick" text-anchor="end">${v}</text>`;
    }
    for (let v = 0; v <= pMax; v += 100) s += `<text x="${R + 5}" y="${yP(v) + 4}" class="tick">${v}</text>`;
    const bw = (R - L) / 12 * 0.62;
    st.precip.forEach((p, i) => { s += `<rect x="${x(i) - bw / 2}" y="${yP(p)}" width="${bw}" height="${B - yP(p)}" class="pbar"/>`; });
    s += `<polyline points="${st.temp.map((t, i) => `${x(i)},${yT(t)}`).join(' ')}" class="tline"/>`;
    st.temp.forEach((t, i) => { s += `<circle cx="${x(i)}" cy="${yT(t)}" r="2.6" class="tdot"/>`; });
    MONTHS.forEach((m, i) => { s += `<text x="${x(i)}" y="${B + 14}" class="tick" text-anchor="middle">${m}</text>`; });
    s += `<text x="${L - 30}" y="${T - 12}" class="axis">氣溫(℃)</text><text x="${R + 2}" y="${T - 12}" class="axis" text-anchor="middle">降水量(mm)</text>`;
    s += `<text x="${(L + R) / 2}" y="${B + 30}" class="axis" text-anchor="middle">月</text>`;
    s += `<text x="${(L + R) / 2}" y="${T - 12}" class="title" text-anchor="middle">${esc(title)}</text>`;
    if (!opt.hideTotals) s += `<text x="${L + 6}" y="${T + 14}" class="note">年均溫 ${st.tempAvg}℃　年降水量 ${st.precipTotal.toLocaleString()} mm</text>`;
    return frame(W, H + 12, s, 'climo');
  }

  // ---------- 臺灣測站分布圖（Natural Earth 底圖＋氣象署測站座標） ----------
  function twMap(basemap, stations, opt) {
    opt = opt || {};
    // 等距圓柱投影；經度方向乘上 cos(23.5°)，臺灣形狀才不會被拉寬
    const lon0 = 118.9, lon1 = 122.9, lat0 = 21.8, lat1 = 25.5;
    const H = 370, W = Math.round(H / (lat1 - lat0) * (lon1 - lon0) * Math.cos(23.5 * Math.PI / 180));
    const px = lon => (lon - lon0) / (lon1 - lon0) * W;
    const py = lat => (lat1 - lat) / (lat1 - lat0) * H;
    let s = `<rect width="${W}" height="${H}" class="sea"/>`;
    for (const p of basemap.polygons) {
      if (p.bbox[0] < 119 && !opt.showKinmen) continue; // 金門在圖框外
      s += `<path d="M${p.ring.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join('L')}Z" class="land"/>`;
    }
    // 北回歸線
    s += `<line x1="0" x2="${W}" y1="${py(23.44)}" y2="${py(23.44)}" class="tropic"/><text x="${W - 4}" y="${py(23.44) - 4}" class="tick" text-anchor="end">北回歸線</text>`;
    for (const st of stations) {
      const cx = px(st.lon), cy = py(st.lat);
      s += `<g ${opt.pick ? `data-pick="${esc(st.label)}" class="pickable"` : ''}><circle cx="${cx}" cy="${cy}" r="5" class="stn"/>`;
      const dx = st.dx != null ? st.dx : 8, dy = st.dy || 0;
      s += `<text x="${cx + dx}" y="${cy + 4 + dy}" class="stnlabel" text-anchor="${dx < 0 ? 'end' : dx === 0 ? 'middle' : 'start'}">${esc(st.label)}${st.value != null ? ' ' + esc(st.value) : ''}</text></g>`;
    }
    s += `<text x="${W - 6}" y="${H - 8}" class="src" text-anchor="end">底圖：Natural Earth</text>`;
    s += `<g transform="translate(22,34)"><path d="M0,-14 L5,4 L0,0 L-5,4Z" class="north"/><text y="-17" class="tick" text-anchor="middle">北</text></g>`;
    return frame(W, H, s, 'twmap');
  }

  // ---------- 等高線地形圖（虛構地形） ----------
  function contourMap(T, opt) {
    opt = opt || {};
    const S = 3.2, W = T.size[0] * S, H = T.size[1] * S;
    const cs = G.contours(T, 1);
    let s = `<rect width="${W}" height="${H}" class="paper"/>`;
    const labeled = new Set(), placed = [];
    for (const c of cs) {
      const index = c.level % 100 === 0;
      let d = '';
      for (const [x1, y1, x2, y2] of c.segs) d += `M${(x1 * S).toFixed(1)},${(y1 * S).toFixed(1)}L${(x2 * S).toFixed(1)},${(y2 * S).toFixed(1)}`;
      s += `<path d="${d}" class="${index ? 'cline index' : 'cline'}"/>`;
      if (index && opt.values !== false && !labeled.has(c.level)) {
        // 高度數字放在離標記點、圖框和其他數字都遠一點的地方
        const marks = Object.entries(T.points).filter(([k]) => (opt.points || []).includes(k)).map(([, p]) => p);
        const far = ([x, y]) => x > 6 && x < T.size[0] - 6 && y > 6 && y < T.size[1] - 8 && marks.every(p => Math.hypot(p.x - x, p.y - y) > 12) && placed.every(p => Math.hypot(p[0] - x, p[1] - y) > 10);
        const seg = [0.37, 0.12, 0.62, 0.85, 0.25, 0.5, 0.75].map(f => c.segs[Math.floor(c.segs.length * f)]).find(far);
        labeled.add(c.level);
        if (seg) { placed.push(seg); s += `<text x="${seg[0] * S}" y="${seg[1] * S + 3}" class="clabel" text-anchor="middle">${c.level}</text>`; }
      }
    }
    if (opt.line) {
      const [a, b] = opt.line.map(k => T.points[k]);
      s += `<line x1="${a.x * S}" y1="${a.y * S}" x2="${b.x * S}" y2="${b.y * S}" class="pline"/>`;
    }
    for (const k of opt.points || []) {
      const p = T.points[k];
      s += `<g ${opt.pick ? `data-pick="${esc(k)}" class="pickable"` : ''}><circle cx="${p.x * S}" cy="${p.y * S}" r="${opt.pick ? 9 : 5}" class="pt"/><text x="${p.x * S + 9}" y="${p.y * S - 7}" class="ptlabel">${esc(k)}</text></g>`;
    }
    s += `<g transform="translate(${W - 22},34)"><path d="M0,-14 L5,4 L0,0 L-5,4Z" class="north"/><text y="-18" class="tick" text-anchor="middle">北</text></g>`;
    s += `<text x="6" y="${H - 8}" class="src">${esc(T.name)}（等高距 ${T.interval} 公尺）</text>`;
    return frame(W, H, s, 'contour');
  }

  function profileChart(T, from, to, opt) {
    opt = opt || {};
    const p = T.points[from], q = T.points[to];
    const pts = G.profile(T, p, q, 90);
    const W = 300, H = 130, L = 34, R = 290, Tp = 12, B = 108;
    const zMax = opt.zMax || 1200;
    const X = t => L + t * (R - L), Y = z => B - z / zMax * (B - Tp);
    let s = `<rect x="${L}" y="${Tp}" width="${R - L}" height="${B - Tp}" class="plot"/>`;
    for (let z = 0; z <= zMax; z += 300) s += `<text x="${L - 4}" y="${Y(z) + 4}" class="tick" text-anchor="end">${z}</text><line x1="${L}" x2="${R}" y1="${Y(z)}" y2="${Y(z)}" class="gridline"/>`;
    s += `<path d="M${X(0)},${B}${pts.map(o => `L${X(o.t).toFixed(1)},${Y(o.z).toFixed(1)}`).join('')}L${X(1)},${B}Z" class="ground"/>`;
    s += `<text x="${L}" y="${B + 16}" class="tick">${esc(opt.leftLabel || '')}</text><text x="${R}" y="${B + 16}" class="tick" text-anchor="end">${esc(opt.rightLabel || '')}</text>`;
    return frame(W, H + 10, s, 'profile');
  }

  // ---------- 虛構街道網格圖 ----------
  function townGrid(M, opt) {
    opt = opt || {};
    const C = 64, L = 26, Tp = 22, n = M.cols.length, m = M.rows.length;
    const W = L + n * C + 20, H = Tp + m * C + 46;
    let s = `<rect x="${L}" y="${Tp}" width="${n * C}" height="${m * C}" class="paper"/>`;
    s += `<path d="M${L + n * C - 18},${Tp} Q${L + n * C - 4},${Tp + m * C * 0.4} ${L + n * C - 14},${Tp + m * C} L${L + n * C},${Tp + m * C} L${L + n * C},${Tp}Z" class="sea"/>`;
    for (let i = 0; i <= n; i++) s += `<line x1="${L + i * C}" x2="${L + i * C}" y1="${Tp}" y2="${Tp + m * C}" class="gridline strong"/>`;
    for (let j = 0; j <= m; j++) s += `<line x1="${L}" x2="${L + n * C}" y1="${Tp + j * C}" y2="${Tp + j * C}" class="gridline strong"/>`;
    M.cols.forEach((c, i) => { s += `<text x="${L + (i + 0.5) * C}" y="${Tp - 6}" class="axis" text-anchor="middle">${c}</text>`; });
    M.rows.forEach((r, j) => { s += `<text x="${L - 8}" y="${Tp + (j + 0.5) * C + 5}" class="axis" text-anchor="middle">${r}</text>`; });
    for (const lm of M.landmarks) {
      if (opt.hide && opt.hide.includes(lm.name)) continue;
      const cx = L + lm.x * C, cy = Tp + lm.y * C;
      s += `<g ${opt.pick ? `data-pick="${esc(lm.name)}" class="pickable"` : ''}><circle cx="${cx}" cy="${cy - 6}" r="13" class="lmbg"/><text x="${cx}" y="${cy - 1}" class="lmicon" text-anchor="middle">${esc(lm.icon)}</text><text x="${cx}" y="${cy + 20}" class="lmname" text-anchor="middle">${esc(lm.name)}</text></g>`;
    }
    const sb = Tp + m * C + 22;
    s += `<line x1="${L}" x2="${L + C}" y1="${sb}" y2="${sb}" class="scalebar"/><line x1="${L}" x2="${L}" y1="${sb - 4}" y2="${sb + 4}" class="scalebar"/><line x1="${L + C}" x2="${L + C}" y1="${sb - 4}" y2="${sb + 4}" class="scalebar"/>`;
    s += `<text x="${L + C + 8}" y="${sb + 4}" class="tick">${M.cellMeters} 公尺</text>`;
    s += `<g transform="translate(${W - 34},${sb})"><path d="M0,-14 L5,4 L0,0 L-5,4Z" class="north"/><text x="10" y="2" class="tick">北</text></g>`;
    s += `<text x="${L + n * C}" y="${H - 4}" class="src" text-anchor="end">${esc(M.name)}（故事用虛構地圖）</text>`;
    return frame(W, H, s, 'town');
  }

  // ---------- 經緯網（Natural Earth 陸地輪廓） ----------
  function graticule(land, points, opt) {
    opt = opt || {};
    const W = 360, H = 190, X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H;
    let s = `<rect width="${W}" height="${H}" class="sea"/>`;
    if (land && opt.land !== false) for (const r of land.rings) s += `<path d="M${r.map(([lo, la]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join('L')}Z" class="land"/>`;
    for (let lon = -180; lon <= 180; lon += 30) s += `<line x1="${X(lon)}" x2="${X(lon)}" y1="0" y2="${H}" class="${lon === 0 ? 'prime' : 'grat'}"/>`;
    for (let lat = -90; lat <= 90; lat += 30) s += `<line y1="${Y(lat)}" y2="${Y(lat)}" x1="0" x2="${W}" class="${lat === 0 ? 'prime' : 'grat'}"/>`;
    if (opt.tropics) for (const lat of [23.5, -23.5, 66.5, -66.5]) s += `<line y1="${Y(lat)}" y2="${Y(lat)}" x1="0" x2="${W}" class="tropic"/>`;
    for (let lon = -120; lon <= 120; lon += 60) s += `<text x="${X(lon)}" y="${H + 11}" class="tick" text-anchor="middle">${Math.abs(lon)}°${lon < 0 ? 'W' : lon > 0 ? 'E' : ''}</text>`;
    for (let lat = -60; lat <= 60; lat += 30) s += `<text x="-3" y="${Y(lat) + 3}" class="tick" text-anchor="end">${Math.abs(lat)}°${lat < 0 ? 'S' : lat > 0 ? 'N' : ''}</text>`;
    for (const p of points || []) {
      s += `<g ${opt.pick ? `data-pick="${esc(p.label)}" class="pickable"` : ''}><circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${opt.pick ? 7 : 4}" class="pt"/><text x="${X(p.lon) + 6}" y="${Y(p.lat) - 5}" class="ptlabel">${esc(p.label)}</text></g>`;
    }
    s += `<text x="${W - 4}" y="${H - 4}" class="src" text-anchor="end">陸地輪廓：Natural Earth</text>`;
    return `<svg class="fig grat-fig" viewBox="-26 -4 ${W + 32} ${H + 18}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  // ---------- 區域地圖（Natural Earth 國界） ----------
  // opt: {bbox:[lon0,lat0,lon1,lat1], highlight:[ADM0_A3...], points:[{label,lat,lon,dx,dy}], pick, width, mini}
  // bbox 的經度可以超過 180（跨換日線的太平洋島嶼），負經度會自動加 360
  function regionMap(base, opt) {
    const [lon0, lat0, lon1, lat1] = opt.bbox;
    const wrap = lon1 > 180;
    const fix = lon => (wrap && lon < 0 ? lon + 360 : lon);
    const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
    const W = opt.width || 360, H = Math.round(W * (lat1 - lat0) / ((lon1 - lon0) * k));
    const X = lon => (fix(lon) - lon0) / (lon1 - lon0) * W, Y = lat => (lat1 - lat) / (lat1 - lat0) * H;
    const hl = new Set(opt.highlight || []);
    let s = `<rect width="${W}" height="${H}" class="sea"/>`;
    for (const c of base.countries) for (const r of c.rings) {
      let minx = 999, maxx = -999, miny = 999, maxy = -999;
      for (const [lo, la] of r) { const x = fix(lo); minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, la); maxy = Math.max(maxy, la); }
      if (maxx < lon0 - 2 || minx > lon1 + 2 || maxy < lat0 - 2 || miny > lat1 + 2) continue;
      if (wrap && maxx - minx > 180) continue; // 跨換日線的大陸輪廓在這種圖框裡會畫歪，略過
      s += `<path d="M${r.map(([lo, la]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join('L')}Z" class="${hl.has(c.a3) ? 'land hl' : 'land'}"/>`;
    }
    if (opt.tropics) for (const lat of [23.44, -23.44, 66.56, -66.56, 0]) if (lat > lat0 && lat < lat1) s += `<line x1="0" x2="${W}" y1="${Y(lat)}" y2="${Y(lat)}" class="${lat === 0 ? 'prime' : 'tropic'}"/>`;
    if (!opt.mini) {
      for (const p of opt.points || []) {
        // 靠右的點把標籤放左邊，避免被圖框切掉
        const cx = X(p.lon), cy = Y(p.lat), dx = p.dx != null ? p.dx : (cx > W * 0.8 ? -7 : 7), dy = p.dy || (cy < 12 ? 8 : 0);
        s += `<g ${opt.pick ? `data-pick="${esc(p.label)}" class="pickable"` : ''}><circle cx="${cx}" cy="${cy}" r="${opt.pick ? 7 : 4.5}" class="stn"/><text x="${cx + dx}" y="${cy + 4 + dy}" class="stnlabel" text-anchor="${dx < 0 ? 'end' : dx === 0 ? 'middle' : 'start'}">${esc(p.label)}${p.value != null ? ' ' + esc(p.value) : ''}</text></g>`;
      }
      for (const t of opt.texts || []) s += `<text x="${X(t.lon)}" y="${Y(t.lat)}" class="maptext" text-anchor="middle">${esc(t.text)}</text>`;
      s += `<g transform="translate(14,${H - 10})"><path d="M0,-14 L5,4 L0,0 L-5,4Z" class="north"/><text x="9" y="2" class="tick">北</text></g>`;
      s += `<text x="${W - 4}" y="${H - 4}" class="src" text-anchor="end">底圖：Natural Earth</text>`;
    }
    return frame(W, H, s, opt.mini ? 'regionmap mini' : 'regionmap');
  }

  // ---------- 極區地圖（以極點為中心的方位等距投影） ----------
  // opt: {pole:'N'|'S', edge: 地圖外緣緯度（絕對值）, highlight, points}
  function polarMap(base, opt) {
    const S = opt.pole === 'S' ? -1 : 1, edge = opt.edge || 50, R = 170, C = 180;
    const P = (lon, lat) => {
      const r = (90 - S * lat) / (90 - edge) * R, a = lon * Math.PI / 180;
      // 北極圖：0 度經線朝下（同課本）；南極圖：0 度經線朝上
      return [C + r * Math.sin(a), C + S * r * Math.cos(a)];
    };
    const hl = new Set(opt.highlight || []);
    let s = `<circle cx="${C}" cy="${C}" r="${R}" class="sea"/><clipPath id="pc${S}"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath><g clip-path="url(#pc${S})">`;
    for (const c of base.countries) for (const r of c.rings) {
      if (!r.some(([, la]) => S * la > edge - 15)) continue;
      s += `<path d="M${r.map(([lo, la]) => P(lo, Math.max(-90, Math.min(90, la))).map(v => v.toFixed(1)).join(',')).join('L')}Z" class="${hl.has(c.a3) ? 'land hl' : 'land'}"/>`;
    }
    for (let lat = edge; lat < 90; lat += 10) { const [, y] = P(0, S * lat); s += `<circle cx="${C}" cy="${C}" r="${Math.abs(y - C)}" class="${Math.abs(lat - 66.56) < 1 ? 'tropic' : 'grat'}"/>`; }
    const [, yc] = P(0, S * 66.56); s += `<circle cx="${C}" cy="${C}" r="${Math.abs(yc - C)}" class="tropic"/>`;
    for (let lon = 0; lon < 360; lon += 30) { const [x, y] = P(lon, S * edge); s += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" class="grat"/>`; }
    s += `</g>`;
    for (const p of opt.points || []) {
      const [cx, cy] = P(p.lon, p.lat), dx = p.dx != null ? p.dx : 7;
      s += `<g ${opt.pick ? `data-pick="${esc(p.label)}" class="pickable"` : ''}><circle cx="${cx}" cy="${cy}" r="${opt.pick ? 7 : 4.5}" class="stn"/><text x="${cx + dx}" y="${cy + 4 + (p.dy || 0)}" class="stnlabel" text-anchor="${dx < 0 ? 'end' : 'start'}">${esc(p.label)}</text></g>`;
    }
    for (const t of opt.texts || []) { const [x, y] = P(t.lon, t.lat); s += `<text x="${x}" y="${y}" class="maptext" text-anchor="middle">${esc(t.text)}</text>`; }
    s += `<text x="${C}" y="${C + 4}" class="tick" text-anchor="middle">${S > 0 ? '北極點' : '南極點'}</text>`;
    s += `<text x="${C + R - 4}" y="${C - Math.abs(yc - C) - 4}" class="tick" text-anchor="end">${S > 0 ? '北極圈' : '南極圈'}</text>`;
    s += `<text x="${2 * C - 4}" y="${2 * C - 2}" class="src" text-anchor="end">底圖：Natural Earth</text>`;
    return frame(2 * C, 2 * C, s, 'polarmap');
  }

  // ---------- 人口金字塔（聯合國 WPP，5 歲一組，85 歲以上合併） ----------
  function pyramid(g, title, opt) {
    opt = opt || {};
    // 原始資料 0-4 … 80-84 共 17 組，85 歲以上（85-89、90-94、95-99、100+）合併成一組
    const merge = a => a.slice(0, 17).concat([a.slice(17).reduce((x, y) => x + y, 0)]);
    const m = merge(g.male), f = merge(g.female), n = m.length;
    const tot = m.reduce((a, b) => a + b, 0) + f.reduce((a, b) => a + b, 0);
    const pm = m.map(v => v / tot * 100), pf = f.map(v => v / tot * 100);
    const maxP = opt.maxPct || Math.max(8, Math.ceil(Math.max(...pm, ...pf)));
    const W = 300, H = 250, Cx = W / 2, T = 26, B = 220, bh = (B - T) / n, half = W / 2 - 34;
    const sx = v => v / maxP * half;
    let s = `<rect width="${W}" height="${H}" class="paper"/>`;
    s += `<text x="${Cx}" y="16" class="title" text-anchor="middle">${esc(title)}</text>`;
    for (let i = 0; i < n; i++) {
      const y = B - (i + 1) * bh;
      s += `<rect x="${Cx - 14 - sx(pm[i])}" y="${y + 0.5}" width="${sx(pm[i])}" height="${bh - 1}" class="pm"/>`;
      s += `<rect x="${Cx + 14}" y="${y + 0.5}" width="${sx(pf[i])}" height="${bh - 1}" class="pf"/>`;
      if (i % 3 === 0 || i === n - 1) s += `<text x="${Cx}" y="${y + bh - 2}" class="tick" text-anchor="middle">${i === n - 1 ? '85+' : i * 5}</text>`;
    }
    // 15 歲、65 歲分界線
    for (const a of [15, 65]) { const y = B - (a / 5) * bh; s += `<line x1="${Cx - half - 14}" x2="${Cx + half + 14}" y1="${y}" y2="${y}" class="agebreak"/><text x="${W - 4}" y="${y - 2}" class="tick" text-anchor="end">${a}歲</text>`; }
    for (const v of [0, maxP / 2, maxP]) {
      s += `<text x="${Cx - 14 - sx(v)}" y="${B + 13}" class="tick" text-anchor="middle">${v}</text><text x="${Cx + 14 + sx(v)}" y="${B + 13}" class="tick" text-anchor="middle">${v}</text>`;
    }
    s += `<text x="${Cx - 60}" y="${B + 27}" class="axis" text-anchor="middle">男（%）</text><text x="${Cx + 60}" y="${B + 27}" class="axis" text-anchor="middle">女（%）</text>`;
    return frame(W, H + 14, s, 'pyramid');
  }

  // ---------- 原理示意圖（概念示意，不含數據） ----------
  const DIAGRAMS = {
    // 迎風坡與背風坡
    orographic: o => frame(320, 170, `
      <rect width="320" height="170" class="sky"/>
      <path d="M0,150 L110,150 L170,52 L230,150 L320,150 L320,170 L0,170Z" class="mountain"/>
      <path d="M10,120 C60,118 100,110 140,72" class="wind" marker-end="url(#ar)"/>
      <path d="M200,72 C230,100 260,118 310,122" class="wind dry" marker-end="url(#ar)"/>
      <ellipse cx="130" cy="58" rx="34" ry="16" class="cloud"/>
      ${[112, 122, 132, 142].map(x => `<line x1="${x}" y1="76" x2="${x - 4}" y2="96" class="rain"/>`).join('')}
      <text x="12" y="110" class="tick">潮溼空氣</text><text x="250" y="112" class="tick">乾熱空氣</text>
      <text x="122" y="140" class="ptlabel">${o.a || '迎風坡'}</text><text x="196" y="140" class="ptlabel">${o.b || '背風坡'}</text>
      <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" class="arrowhead"/></marker></defs>`, 'diagram'),
    // 對流雨、鋒面雨、地形雨
    raintypes: () => frame(360, 150, `
      <rect width="360" height="150" class="sky"/>
      <g><rect x="0" y="120" width="110" height="30" class="ground2"/><circle cx="30" cy="22" r="10" class="sun"/>
        <path d="M55,118 L55,70" class="wind" marker-end="url(#ar2)"/><ellipse cx="55" cy="55" rx="28" ry="14" class="cloud"/>
        <text x="55" y="145" class="tick" text-anchor="middle">對流雨</text></g>
      <g transform="translate(125,0)"><rect x="0" y="120" width="110" height="30" class="ground2"/>
        <path d="M0,118 L110,60" class="front"/><text x="80" y="110" class="tick">冷空氣</text><text x="6" y="70" class="tick">暖空氣</text>
        <ellipse cx="62" cy="48" rx="34" ry="13" class="cloud"/><text x="55" y="145" class="tick" text-anchor="middle">鋒面雨</text></g>
      <g transform="translate(250,0)"><path d="M0,120 L55,62 L110,120 L110,150 L0,150Z" class="mountain"/>
        <path d="M2,108 C20,104 34,94 44,76" class="wind" marker-end="url(#ar2)"/><ellipse cx="40" cy="58" rx="24" ry="11" class="cloud"/>
        <text x="55" y="145" class="tick" text-anchor="middle">地形雨</text></g>
      <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" class="arrowhead"/></marker></defs>`, 'diagram'),
    // 氣壓與風：由高壓吹向低壓
    pressure: o => frame(320, 140, `
      <rect width="320" height="140" class="sky"/>
      <circle cx="70" cy="70" r="42" class="hi"/><text x="70" y="78" class="big" text-anchor="middle">${o.a || '高'}</text>
      <circle cx="250" cy="70" r="42" class="lo"/><text x="250" y="78" class="big" text-anchor="middle">${o.b || '低'}</text>
      <path d="M118,70 L196,70" class="wind" marker-end="url(#ar3)"/><text x="157" y="60" class="tick" text-anchor="middle">${o.c || '風'}</text>
      <defs><marker id="ar3" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" class="arrowhead"/></marker></defs>`, 'diagram'),
    // 天氣圖符號（甲：冷鋒、乙：暖鋒、丙：滯留鋒、丁：低氣壓）——位置可由 o.order 打散
    fronts: o => {
      const kinds = o.order || ['cold', 'warm', 'stat', 'low'];
      const labels = ['甲', '乙', '丙', '丁'];
      const draw = (k, x) => {
        if (k === 'cold') return `<path d="M${x},30 L${x + 60},30" class="fcold"/>${[0, 20, 40].map(d => `<path d="M${x + d + 4},30 L${x + d + 12},18 L${x + d + 16},30Z" class="fcoldm"/>`).join('')}`;
        if (k === 'warm') return `<path d="M${x},30 L${x + 60},30" class="fwarm"/>${[8, 30, 52].map(d => `<path d="M${x + d - 7},30 A7,7 0 0 1 ${x + d + 7},30Z" class="fwarmm"/>`).join('')}`;
        if (k === 'stat') return `<path d="M${x},30 L${x + 60},30" class="fstat"/><path d="M${x + 6},30 L${x + 14},18 L${x + 18},30Z" class="fcoldm"/><path d="M${x + 26},30 A7,7 0 0 0 ${x + 40},30Z" class="fwarmm"/><path d="M${x + 44},30 L${x + 52},18 L${x + 56},30Z" class="fcoldm"/>`;
        if (k === 'low') return `<text x="${x + 30}" y="36" class="big lo-t" text-anchor="middle">低</text>`;
        if (k === 'high') return `<text x="${x + 30}" y="36" class="big hi-t" text-anchor="middle">高</text>`;
        if (k === 'typhoon') return `<g transform="translate(${x + 30},28)"><circle r="6" class="tyc"/><path d="M0,-6 C10,-6 14,-14 8,-20" class="tyarm"/><path d="M0,6 C-10,6 -14,14 -8,20" class="tyarm"/></g>`;
        return '';
      };
      return frame(360, 70, `<rect width="360" height="70" class="paper"/>` + kinds.map((k, i) => `<g ${o.pick ? `data-pick="${labels[i]}" class="pickable"` : ''}>${draw(k, 14 + i * 88)}<text x="${44 + i * 88}" y="60" class="ptlabel" text-anchor="middle">${labels[i]}</text></g>`).join(''), 'diagram');
    },
    // 太陽直射與南北半球季節
    season: o => frame(320, 170, `
      <rect width="320" height="170" class="sky"/>
      <circle cx="160" cy="88" r="62" class="globe"/>
      ${[[23.5, 'tropic'], [0, 'prime'], [-23.5, 'tropic'], [66.5, 'grat'], [-66.5, 'grat']].map(([lat, c]) => { const y = 88 - Math.sin(lat * Math.PI / 180) * 62, w = Math.cos(lat * Math.PI / 180) * 62; return `<line x1="${160 - w}" x2="${160 + w}" y1="${y}" y2="${y}" class="${c}"/>`; }).join('')}
      <text x="226" y="${88 - Math.sin(23.5 * Math.PI / 180) * 62 + 4}" class="tick">北回歸線 23.5°N</text>
      <text x="226" y="92" class="tick">赤道 0°</text>
      <text x="226" y="${88 + Math.sin(23.5 * Math.PI / 180) * 62 + 4}" class="tick">南回歸線 23.5°S</text>
      ${(() => { const lat = o.lat != null ? o.lat : 23.5, r = lat * Math.PI / 180, y = 88 - Math.sin(r) * 62, x = 160 - Math.cos(r) * 62;
        return [-8, 0, 8].map(d => `<line x1="10" y1="${y + d}" x2="${160 - Math.sqrt(62 * 62 - (88 - y - d) ** 2) - 1}" y2="${y + d}" class="ray"/>`).join('') + `<circle cx="${x}" cy="${y}" r="4" class="sun"/><text x="10" y="${y - 14}" class="tick">太陽光（${o.label || '直射此緯度'}）</text>`; })()}`, 'diagram'),
    // 季風：冬吹東北、夏吹西南（臺灣附近示意）
    monsoon: o => frame(320, 150, `
      <rect width="320" height="150" class="sea"/>
      <path d="M0,0 L120,0 L105,40 L80,90 L40,150 L0,150Z" class="land"/><text x="20" y="40" class="tick">大陸</text>
      <path d="M200,50 C206,62 210,80 204,104 C198,96 194,74 200,50Z" class="land"/><text x="214" y="82" class="tick">${o.island || '島'}</text>
      <path d="M292,22 L222,62" class="wind w-cold" marker-end="url(#ar4)"/><text x="232" y="16" class="tick">${o.a || '冬季風向'}</text>
      <path d="M150,138 L188,100" class="wind w-warm" marker-end="url(#ar4)"/><text x="104" y="146" class="tick">${o.b || '夏季風向'}</text>
      <text x="262" y="132" class="tick">海洋</text>
      <defs><marker id="ar4" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" class="arrowhead"/></marker></defs>`, 'diagram'),
    // 方位（八方位羅盤）
    compass: () => frame(200, 200, `<circle cx="100" cy="100" r="80" class="globe"/>${G.DIR8.map((d, i) => { const a = i * 45 * Math.PI / 180; return `<line x1="100" y1="100" x2="${100 + Math.sin(a) * 70}" y2="${100 - Math.cos(a) * 70}" class="${i % 2 ? 'grat' : 'prime'}"/><text x="${100 + Math.sin(a) * 88}" y="${104 - Math.cos(a) * 88}" class="tick" text-anchor="middle">${d}</text>`; }).join('')}`, 'diagram'),
    // 時區：每 15 度一個時區
    timezone: () => frame(340, 90, `<rect width="340" height="90" class="paper"/>${Array.from({ length: 13 }, (_, i) => { const lon = -180 + i * 30, x = 10 + i * 26.6; return `<line x1="${x}" x2="${x}" y1="20" y2="62" class="${lon === 0 ? 'prime' : 'grat'}"/><text x="${x}" y="76" class="tick" text-anchor="middle">${lon === 0 ? '0°' : Math.abs(lon) + (lon < 0 ? 'W' : 'E')}</text><text x="${x}" y="14" class="tick" text-anchor="middle">${lon / 15 > 0 ? '+' : ''}${lon / 15}</text>`; }).join('')}<text x="170" y="88" class="src" text-anchor="middle">上排：與倫敦相差的時數（每 15 度差 1 小時）</text>`, 'diagram')
  };

  function diagram(id, o) { return (DIAGRAMS[id] || (() => ''))(o || {}); }

  window.Charts = { climograph, twMap, contourMap, profileChart, townGrid, graticule, regionMap, polarMap, pyramid, diagram, esc };
})();
