// 學習診斷（三方資料合併）：會考真題作答＋地理原創題作答＋歷史原創題作答。
// 入口：#/x/diag（社會科首頁、會考真題）與家長頁的「學習診斷」分頁。可列印。
// 需加強的觀念：真題＋原創題合計作答 ≥ 3 次且答對率 < 70%；優先度 ＝（1 − 答對率）×（1 ＋ 會考 5 年出現次數 ÷ 5）。
(function () {
  const { esc } = window.UI;
  const X = () => window.XData;
  const list = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const LET = ['A', 'B', 'C', 'D'];

  const SKILL_TIPS = {
    讀圖: '先讀圖名、圖例、單位、座標，再找最高、最低與變化趨勢。',
    計算: '寫出公式與單位，再代入數字；算完回頭看單位和數量級合不合理。',
    原理應用: '先說出原理名稱（例如季風、地形雨、區位因素），再把題目情境的線索一一套進去。',
    區域比較: '用「位置、氣候、地形、產業」四格表，把兩個區域並排對照。',
    跨科整合: '先分清楚題目哪一段考地理、哪一段考歷史，各自判斷後再合起來。',
    時序: '到時間長廊三線並排看，記「誰先誰後」，不記年份。',
    因果: '用「背景 → 事件 → 結果 → 影響」四格整理。',
    比較: '先找出比較的項目（時間、地點、對象），再逐項列出相同與不同。',
    變遷與延續: '把同一件事的「之前」和「之後」並排，圈出改變了什麼、什麼沒變。',
    史料判讀: '先看出處與立場，再判斷一手或二手，最後才讀內容。',
    歷史解釋: '分清「事實」和「看法」，找出作者用了哪些證據支持看法。'
  };

  // ---------- 統計 ----------
  function collect() {
    const pts = {}, skills = {}, subj = { geo: { xn: 0, xok: 0, sn: 0, sok: 0 }, hist: { xn: 0, xok: 0, sn: 0, sok: 0 } };
    const pt = k => pts[k] = pts[k] || { key: k, xn: 0, xok: 0, sn: 0, sok: 0, last: null, skills: {} };
    const sk = s => skills[s] = skills[s] || { n: 0, ok: 0, xn: 0, xok: 0 };
    const wrongAt = (p, ts, w) => { if (!p.last || ts > p.last.ts) p.last = Object.assign({ ts }, w); };
    // 真題
    for (const e of window.Store.X.get().log) {
      const it = X().byId[e.id];
      if (!it) continue;
      const S = subj[it.subject]; if (S) { S.xn++; if (e.ok) S.xok++; }
      for (const s of it.skill) { const v = sk(s); v.n++; v.xn++; if (e.ok) { v.ok++; v.xok++; } }
      for (const k of X().keysOf(it)) {
        const p = pt(k); p.xn++; if (e.ok) p.xok++;
        else wrongAt(p, e.ts || 0, { item: it, a: e.a });
        for (const s of it.skill) { p.skills[s] = p.skills[s] || { n: 0, ok: 0 }; p.skills[s].n++; if (e.ok) p.skills[s].ok++; }
      }
    }
    // 地理原創題（作答紀錄的 c 就是概念 id；地理原創題沒有標能力）
    const D = window.Data;
    for (const e of window.Store.get().log) {
      subj.geo.sn++; if (e.ok) subj.geo.sok++;
      for (const c of e.c || []) {
        const p = pt('geo:' + c); p.sn++; if (e.ok) p.sok++;
        else wrongAt(p, e.ts || 0, { q: D && D.byId[e.q], part: e.part });
      }
    }
    // 歷史原創題（作答紀錄的 c 是事件 id；知識點要從題目的 kp 找）
    const H = window.HData;
    if (H && H.anyQ) for (const e of window.Store.H.get().log) {
      const q = H.anyQ(e.q);
      if (!q) continue;
      subj.hist.sn++; if (e.ok) subj.hist.sok++;
      const qs = list(q.skill);
      for (const s of qs) { const v = sk(s); v.n++; if (e.ok) v.ok++; }
      for (const k of list(q.kp)) {
        const p = pt('hist:' + k); p.sn++; if (e.ok) p.sok++;
        else wrongAt(p, e.ts || 0, { q, part: e.part });
        for (const s of qs) { p.skills[s] = p.skills[s] || { n: 0, ok: 0 }; p.skills[s].n++; if (e.ok) p.skills[s].ok++; }
      }
    }
    for (const p of Object.values(pts)) {
      p.n = p.xn + p.sn; p.ok = p.xok + p.sok; p.acc = p.n ? p.ok / p.n : null;
      p.appear = X().count(p.key);
      p.priority = p.acc == null ? 0 : (1 - p.acc) * (1 + p.appear / 5);
    }
    return { pts, skills, subj };
  }
  function weakPoints(st) {
    st = st || collect();
    return Object.values(st.pts).filter(p => p.n >= 3 && p.acc < 0.7).sort((a, b) => b.priority - a.priority || b.appear - a.appear);
  }
  // 這個弱點最該用哪一種讀題方法：作答過的能力裡答對率最低的；沒有紀錄就用真題最常標的能力
  function skillOf(p) {
    const tried = Object.entries(p.skills || {}).filter(([, v]) => v.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    if (tried.length) return tried[0][0];
    const cnt = {};
    for (const it of X().itemsOf(p.key)) for (const s of it.skill) cnt[s] = (cnt[s] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
    const { subj, id } = X().split(p.key);
    return subj === 'hist' ? (X().kp[id] || {}).skill || null : null;
  }

  // ---------- 加強建議 ----------
  function mnemonic(key) {
    const { subj, id } = X().split(key);
    if (subj === 'geo') { const c = window.Data.cards[id]; return c && c.tip ? c.tip : ''; }
    const H = window.HData;
    for (const e of (X().kp[id] || {}).events || []) { const c = H && H.cards && H.cards[e]; if (c && c.tip) return c.tip; }
    return '';
  }
  function retestItems(key) {
    const last = {};
    for (const e of window.Store.X.get().log) last[e.id] = e.ok;
    return X().itemsOf(key).filter(it => last[it.id] !== true);
  }
  function suggestHTML(p, compact) {
    const key = p.key, E = window.Exam;
    const lv = X().siteLevel(key), sts = X().storiesOf(key), geo = X().split(key).subj === 'geo';
    const tip = mnemonic(key), s = skillOf(p), re = retestItems(key);
    return `<ol class="dg-steps">
      <li><b>先補觀念</b>：<a href="${E.cardHref(key)}">${geo ? '原理卡' : '館藏卡'}・${esc(X().name(key))}</a>${tip ? `<br><span class="dg-tip">口訣：${esc(tip)}</span>` : ''}</li>
      <li><b>再練原創題</b>：${lv ? `<a href="${lv.href}">${esc(lv.name)}</a>，建議做 8–10 題` : '網站還沒有這個觀念的原創題'}${sts.length ? `；故事：${sts.slice(0, 2).map(ch => `<a href="#/h/story/${encodeURIComponent(ch.id)}">${esc(ch.title || ch.id)}</a>`).join('、')}` : ''}</li>
      <li><b>回測真題</b>：${X().count(key) ? `<a href="${E.keyHref(key)}">知識點練習（${X().count(key)} 題）</a>${re.length ? `，還沒做或做錯的有 ${re.length} 題${compact ? '' : `：${re.slice(0, 4).map(it => `${it.year} 年第 ${it.no} 題`).join('、')}${re.length > 4 ? '…' : ''}`}` : '，都做對過了'}` : '5 年會考沒有考過，練原創題就好'}</li>
      ${s && SKILL_TIPS[s] ? `<li><b>讀題方法（${esc(s)}）</b>：${esc(SKILL_TIPS[s])}</li>` : ''}</ol>`;
  }
  function lastWrongHTML(p) {
    const w = p.last;
    if (!w) return '—';
    const d = new Date(w.ts).toLocaleDateString('zh-TW');
    if (w.item) return `<a href="${window.Exam.keyHref(p.key)}">${esc(X().label(w.item))}</a>（${d}${w.a != null ? `，選 ${LET[w.a]}，正解 ${LET[w.item.answer]}` : '，未作答'}）`;
    if (w.q) { const stem = w.part != null && w.q.parts ? w.q.parts[w.part].stem : w.q.stem; return `原創題 ${esc(w.q.id)}：${esc(String(stem || '').slice(0, 40))}…（${d}）`; }
    return '—';
  }

  // ---------- 圖 ----------
  const barColor = a => a == null ? 'none' : a >= 0.8 ? 'g' : a >= 0.6 ? 'y' : 'r';
  function barRow(label, ok, n, extra) {
    const a = n ? ok / n : null;
    return `<div class="dg-bar"><span class="dg-bl">${esc(label)}</span><span class="dg-track"><i class="c-${barColor(a)}" style="width:${a == null ? 0 : Math.max(2, a * 100)}%"></i></span><span class="dg-bv">${n ? `${pct(ok, n)}%` : '—'}<small>${n ? ` ${ok}/${n}` : ' 未作答'}${extra || ''}</small></span></div>`;
  }
  // 年度模擬分數趨勢：每年一條小折線（最近 8 次）
  function trendSVG(rs) {
    const W = 180, Hh = 44, L = rs.slice(-8);
    const xs = i => L.length === 1 ? W / 2 : 8 + i * (W - 16) / (L.length - 1);
    const ys = r => Hh - 6 - (r.score / r.total) * (Hh - 12);
    const pts = L.map((r, i) => `${xs(i).toFixed(1)},${ys(r).toFixed(1)}`).join(' ');
    return `<svg class="dg-trend" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="分數趨勢"><line x1="0" x2="${W}" y1="${ys({ score: 7, total: 10 })}" y2="${ys({ score: 7, total: 10 })}" class="dg-ref"/><polyline points="${pts}" class="dg-line"/>${L.map((r, i) => `<circle cx="${xs(i)}" cy="${ys(r)}" r="3" class="dg-dot"/>`).join('')}</svg>`;
  }

  // ---------- 完整報告 ----------
  function html() {
    const st = collect(), weak = weakPoints(st);
    const xlog = window.Store.X.get().log, sims = window.Store.X.get().sims;
    const nAll = xlog.length + st.subj.geo.sn + st.subj.hist.sn;
    const simYears = Object.keys(sims).filter(y => (sims[y] || []).length).sort();
    const weakSkills = Object.entries(st.skills).filter(([, v]) => v.n >= 3 && v.ok / v.n < 0.7).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    const today = new Date().toLocaleDateString('zh-TW');
    const head = `<div class="dg-head"><h1>學習診斷</h1><p class="hint">${today}・合併「會考真題」與網站原創題（地理、歷史）的作答紀錄</p>
      <div class="row no-print"><button class="primary dg-print">列印報告</button>${simYears.length ? '' : '<a class="ghost btn" href="#/x">去做年度模擬</a>'}</div></div>`;
    if (nAll < 10) {
      return `${head}<div class="dg-empty"><p>目前只有 ${nAll} 筆作答紀錄，還看不出哪裡需要加強。</p><p>建議先做一次<a href="#/x">年度模擬</a>（一整年的地理＋歷史，大約 40 分鐘），做完就能看到第一份診斷。平常在地理、歷史闖關的作答也會一起算進來。</p></div>`;
    }
    const subjRow = (name, s) => `<div class="dg-subj"><b>${name}</b>${barRow('真題', s.xok, s.xn)}${barRow('原創題', s.sok, s.sn)}</div>`;
    const skillRows = skills => skills.map(s => { const v = st.skills[s] || { n: 0, ok: 0, xn: 0 }; return barRow(s, v.ok, v.n, v.n && v.xn < v.n ? `<em>（真題 ${v.xn}）</em>` : ''); }).join('');
    return `${head}
      <section class="dg-sec"><h2 class="sec">一、總覽</h2>
        <h3>年度模擬分數</h3>
        ${simYears.length ? `<div class="dg-sims">${simYears.map(y => { const rs = sims[y], l = rs[rs.length - 1], b = rs.reduce((m, r) => r.score / r.total > m.score / m.total ? r : m, rs[0]); return `<div class="dg-sim"><b>${y} 年</b>${trendSVG(rs)}<small>最近 ${l.score}/${l.total}（${pct(l.score, l.total)}%）・最佳 ${pct(b.score, b.total)}%・${rs.length} 次</small></div>`; }).join('')}</div><p class="hint">虛線是 70% 的位置。</p>` : '<p class="hint">還沒做過年度模擬。做一次就能看到分數趨勢。</p>'}
        <h3>地理與歷史答對率</h3>${subjRow('地理', st.subj.geo)}${subjRow('歷史', st.subj.hist)}
        <h3>能力答對率</h3>
        <div class="dg-skills"><div><h4>地理</h4>${skillRows(X().GEO_SKILLS)}<p class="hint">地理原創題沒有標能力，地理能力只看真題。</p></div><div><h4>歷史</h4>${skillRows(X().HIST_SKILLS)}</div></div>
        <p class="legend"><span class="c-g">≥80%</span><span class="c-y">60–79%</span><span class="c-r">&lt;60%</span></p>
      </section>
      <section class="dg-sec"><h2 class="sec">二、需加強的觀念</h2>
        <p class="hint">列入條件：真題和原創題合計作答至少 3 次、答對率低於 70%。排序＝（1 − 答對率）×（1 ＋ 會考 5 年出現次數 ÷ 5），常考的觀念排前面。</p>
        ${weak.length ? `<ol class="dg-weak">${weak.slice(0, 10).map(p => `<li class="dg-pt">
          <div class="dg-pth"><b>${esc(X().name(p.key))}</b><span class="tag">${X().split(p.key).subj === 'geo' ? '地理' : '歷史'}</span>${p.appear ? `<span class="x-badge">會考 5 年出現 ${p.appear} 次</span>` : '<span class="tag soft">會考未考過</span>'}</div>
          <div class="dg-acc">答對率 <b>${pct(p.ok, p.n)}%</b>（真題 ${p.xn ? `${p.xok}/${p.xn}` : '—'}・原創題 ${p.sn ? `${p.sok}/${p.sn}` : '—'}）</div>
          <div class="dg-last">最近一次答錯：${lastWrongHTML(p)}</div>
          <div class="dg-sug"><h4>加強建議</h4>${suggestHTML(p)}</div></li>`).join('')}</ol>${weak.length > 10 ? `<p class="hint">另有 ${weak.length - 10} 個觀念也低於 70%，先把上面這些補好。</p>` : ''}`
        : `<p>目前沒有符合條件的弱點${xlog.length < 20 ? '；真題作答還不多，做一次年度模擬會更準' : ''}。繼續保持！</p>`}
      </section>
      <section class="dg-sec"><h2 class="sec">三、讀題方法</h2>
        ${weakSkills.length ? `<p class="hint">這幾種能力的答對率低於 70%，讀題時試試這樣做：</p><ul class="dg-tips">${weakSkills.map(([s, v]) => `<li><b>${esc(s)}</b>（${pct(v.ok, v.n)}%）：${esc(SKILL_TIPS[s] || '')}${X().itemsOfSkill(s).length ? ` <a class="no-print" href="#/x/skill/${encodeURIComponent(s)}">練${esc(s)}題</a>` : ''}</li>`).join('')}</ul>` : '<p>各種能力目前都在 70% 以上（或作答還不到 3 次）。</p>'}
      </section>
      <section class="dg-sec dg-plan"><h2 class="sec">四、下週練習計畫</h2>
        <ol>${weak.slice(0, 3).map(p => `<li>${esc(X().name(p.key))}：看卡 → 原創題 8–10 題 → 回測真題</li>`).join('') || '<li>做一次還沒做過的年度模擬</li>'}<li>錯題重做：把真題錯題做到連對兩次（目前 ${Object.keys(window.Store.X.get().recycle).filter(id => X().byId[id]).length} 題）</li></ol>
        <p class="dg-sign">孩子：＿＿＿＿＿＿　家長：＿＿＿＿＿＿</p>
      </section>`;
  }
  function render(el) {
    el.innerHTML = `<div class="dg">${html()}</div>`;
    const b = el.querySelector('.dg-print');
    if (b) b.onclick = () => { el.querySelectorAll('details').forEach(d => d.open = true); window.print(); };
  }

  // ---------- 年度模擬交卷後的簡版診斷 ----------
  function miniHTML(results) {
    const m = {};
    for (const { it, ok } of results) for (const k of X().keysOf(it)) {
      const p = m[k] = m[k] || { key: k, n: 0, ok: 0, skills: {} };
      p.n++; if (ok) p.ok++;
      for (const s of it.skill) { p.skills[s] = p.skills[s] || { n: 0, ok: 0 }; p.skills[s].n++; if (ok) p.skills[s].ok++; }
    }
    const top = Object.values(m).filter(p => p.ok < p.n).map(p => Object.assign(p, { appear: X().count(p.key), priority: (p.n - p.ok) * (1 + X().count(p.key) / 5) }))
      .sort((a, b) => b.priority - a.priority).slice(0, 3);
    if (!top.length) return `<h2 class="sec">簡版診斷</h2><p>這一年的題目全部答對，太厲害了！可以換一年再挑戰。</p>`;
    return `<h2 class="sec">簡版診斷：先補這 ${top.length} 個觀念</h2>
      <ol class="dg-weak">${top.map(p => `<li class="dg-pt"><div class="dg-pth"><b>${esc(X().name(p.key))}</b>${p.appear ? `<span class="x-badge">會考 5 年出現 ${p.appear} 次</span>` : ''}</div>
        <div class="dg-acc">這次 ${p.ok}/${p.n} 題答對</div>${suggestHTML(p, true)}</li>`).join('')}</ol>`;
  }

  window.Diagnosis = { collect, weakPoints, html, render, miniHTML, SKILL_TIPS };
})();
