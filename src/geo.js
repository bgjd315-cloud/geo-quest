// 共用運算：網頁與 scripts/validate.js 都使用這一份，確保題目答案與畫出來的圖一致。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeoCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---------- 虛構地形 ----------
  // terrain: { size:[w,h], base, interval, features:[...] }
  // feature 種類：
  //   peak   {x,y,h,r}              高斯山峰
  //   ridge  {x1,y1,x2,y2,h,w}      沿線段的長條隆起（山脊）
  //   valley {x1,y1,x2,y2,d,w}      沿線段的長條凹陷（河谷）
  //   slope  {gx,gy}                整體傾斜：每單位距離升高 gx、gy 公尺
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx, qy = y1 + t * dy;
    return { d: Math.hypot(px - qx, py - qy), t };
  }

  function elevation(T, x, y) {
    let z = T.base || 0;
    for (const f of T.features) {
      if (f.type === 'peak') {
        const d2 = (x - f.x) ** 2 + (y - f.y) ** 2;
        z += f.h * Math.exp(-d2 / (2 * f.r * f.r));
      } else if (f.type === 'ridge' || f.type === 'valley') {
        const s = segDist(x, y, f.x1, f.y1, f.x2, f.y2);
        // 沿線段由起點往終點逐漸降低，像從山頂延伸出去的山脊或河谷
        const along = f.taper ? 1 - f.taper * s.t : 1;
        const amp = f.type === 'ridge' ? f.h : -f.d;
        z += amp * along * Math.exp(-(s.d * s.d) / (2 * f.w * f.w));
      } else if (f.type === 'slope') {
        z += (f.gx || 0) * x + (f.gy || 0) * y;
      }
    }
    return z;
  }

  function grid(T, step) {
    const [W, H] = T.size;
    const nx = Math.round(W / step) + 1, ny = Math.round(H / step) + 1;
    const g = [];
    for (let j = 0; j < ny; j++) {
      const row = [];
      for (let i = 0; i < nx; i++) row.push(elevation(T, i * step, j * step));
      g.push(row);
    }
    return { g, nx, ny, step };
  }

  // 等高線：marching squares，回傳 {level, segs:[[x1,y1,x2,y2],...]}
  function contours(T, step) {
    step = step || 1;
    const { g, nx, ny } = grid(T, step);
    let lo = Infinity, hi = -Infinity;
    for (const r of g) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const iv = T.interval;
    const out = [];
    for (let L = Math.ceil(lo / iv) * iv; L <= hi; L += iv) {
      const segs = [];
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], d = g[j + 1][i];
        const pts = [];
        const edge = (v1, v2, x1, y1, x2, y2) => {
          if ((v1 < L) !== (v2 < L)) {
            const t = (L - v1) / (v2 - v1);
            pts.push([(x1 + t * (x2 - x1)) * step, (y1 + t * (y2 - y1)) * step]);
          }
        };
        edge(a, b, i, j, i + 1, j);
        edge(b, c, i + 1, j, i + 1, j + 1);
        edge(c, d, i + 1, j + 1, i, j + 1);
        edge(d, a, i, j + 1, i, j);
        if (pts.length === 2) segs.push([...pts[0], ...pts[1]]);
        else if (pts.length === 4) { segs.push([...pts[0], ...pts[1]]); segs.push([...pts[2], ...pts[3]]); }
      }
      if (segs.length) out.push({ level: L, segs });
    }
    return out;
  }

  function profile(T, p, q, n) {
    n = n || 80;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push({ t, z: elevation(T, p.x + t * (q.x - p.x), p.y + t * (q.y - p.y)) });
    }
    return pts;
  }

  // 平均坡度：兩點間高差 / 水平距離（地圖單位）
  function slopeBetween(T, p, q) {
    return Math.abs(elevation(T, q.x, q.y) - elevation(T, p.x, p.y)) / Math.hypot(q.x - p.x, q.y - p.y);
  }

  // ---------- 方位 ----------
  // 地圖座標：x 向東、y 向南（螢幕座標）。回傳從 a 看 b 的八方位或十六方位
  const DIR8 = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  const DIR16 = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
  function bearing(a, b) {
    const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360;
    return deg;
  }
  function direction(a, b, n) {
    const deg = bearing(a, b);
    if (n === 16) return DIR16[Math.round(deg / 22.5) % 16];
    return DIR8[Math.round(deg / 45) % 8];
  }

  // ---------- 時區（以經度推算標準時區，國中課本的算法） ----------
  // lon：東經為正、西經為負
  function zoneOf(lon) { return Math.round(lon / 15); }
  // 已知 A 地時間，求 B 地時間（回傳 {h, dayShift}）
  function timeAt(lonA, hourA, lonB) {
    let h = hourA + zoneOf(lonB) - zoneOf(lonA);
    let day = 0;
    while (h < 0) { h += 24; day -= 1; }
    while (h >= 24) { h -= 24; day += 1; }
    return { h, day };
  }

  // ---------- 氣候資料統計 ----------
  function climateStats(s) {
    const t = s.temp, p = s.precip;
    const maxT = Math.max(...t), minT = Math.min(...t);
    const wet = p.indexOf(Math.max(...p)) + 1, dry = p.indexOf(Math.min(...p)) + 1;
    const summer = p[4] + p[5] + p[6] + p[7] + p[8];          // 5–9 月
    const winter = p[9] + p[10] + p[11] + p[0] + p[1] + p[2] + p[3]; // 10–4 月
    return {
      tempAvg: s.tempAvg, precipTotal: s.precipTotal,
      annualRange: +(maxT - minT).toFixed(1),
      warmest: t.indexOf(maxT) + 1, coldest: t.indexOf(minT) + 1,
      wettest: wet, driest: dry,
      janTemp: t[0], julTemp: t[6], janPrecip: p[0], julPrecip: p[6],
      summerShare: +(summer / (summer + winter)).toFixed(3),
      alt: s.alt, lat: s.lat
    };
  }

  return { elevation, contours, profile, slopeBetween, bearing, direction, DIR8, DIR16, zoneOf, timeAt, climateStats };
});
