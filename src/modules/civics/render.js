// 公民題型元件（登記到共用答題引擎 Quiz.RENDERERS）：並排辨析、計算題、價格與數量判斷、迷思糾錯、觀點評估。
// 另有公民的統計：混淆紀錄、掌握判定、領域 × 能力矩陣。網址與頁面在 views.js。
(function () {
  const { esc } = window.UI;
  const Q = window.Quiz;
  const C = () => window.CData;
  const P = () => window.Store.C.get();
  const fmt = Q.fmt;
  const MARK = ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ', 'Ⓔ', 'Ⓕ'];
  const ABC = ['A', 'B', 'C', 'D', 'E', 'F'];
  Object.assign(Q.TYPE_NAME, { scenario: '情境判斷', contrast: '並排辨析', price: '價格與數量判斷', calc: '計算題', myth: '迷思糾錯', view: '觀點評估' });
  const optText = o => typeof o === 'string' ? o : (o && o.text) || '';

  // ---------- 並排辨析：同一情境只改一個條件，每個小情境都答對才算過 ----------
  Q.RENDERERS.contrast = function (el, q, ctx, done, head) {
    if (!Array.isArray(q.parts) || !q.parts.length) return false;
    const sim = ctx.mode === 'sim';
    // 各小情境的選項相同時，用同一個順序，方便對照
    const same = q.parts.every(p => JSON.stringify(p.options) === JSON.stringify(q.parts[0].options));
    const ord0 = Q.shuffle(q.parts[0].options.map((_, i) => i));
    const fixed = q.parts[0].options.every(o => typeof o === 'string' && o.length <= 2);
    const ordOf = p => same ? (fixed ? p.options.map((_, i) => i) : ord0) : Q.shuffle(p.options.map((_, i) => i));
    const pair = q.confusablePair && C().pairById[q.confusablePair];
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem || '同一個情境，每次只改一個條件，判斷答案會不會跟著改變。')}</div>
      ${pair ? `<p class="c-pairtag">易混淆：<b>${esc(pair.labels.join('／'))}</b></p>` : ''}
      <div class="c-twins">${q.parts.map((p, k) => `<div class="c-twin" data-k="${k}"><div class="c-twin-h">情境 ${ABC[k]}${k ? '・改一個條件' : ''}</div>
        <div class="pstem">${fmt(p.stem)}</div><div class="opts">${ordOf(p).map((i, n) => `<button class="opt" data-i="${i}"><b>${MARK[n]}</b> ${esc(optText(p.options[i]))}</button>`).join('')}</div><div class="feedback"></div></div>`).join('')}</div>
      <div class="c-twin-sum"></div>`;
    const res = [];
    el.querySelectorAll('.c-twin').forEach(d => d.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (d.dataset.locked) return;
      d.dataset.locked = '1';
      const k = +d.dataset.k, p = q.parts[k], i = +b.dataset.i, ok = i === p.answer;
      d.querySelectorAll('.opt').forEach(x => { x.disabled = true; const n = +x.dataset.i; if (n === i) x.classList.add(ok ? 'right' : 'wrong', 'chosen'); if (!sim && n === p.answer) x.classList.add('right'); });
      res[k] = ok;
      if (!sim) Q.showExplain(d, p, ok, null, true);
      if (res.filter(x => x !== undefined).length === q.parts.length) {
        const score = res.filter(Boolean).length, all = score === q.parts.length;
        if (!sim) el.querySelector('.c-twin-sum').innerHTML = `<div class="explain ${all ? 'good' : 'bad'}"><div class="verdict">${all ? `${q.parts.length} 個情境都判斷正確` : `${q.parts.length} 個情境答對 ${score} 個：要每個都對才算分清楚`}</div>${q.explain ? `<p>${fmt(q.explain)}</p>` : ''}${pair && pair.rule ? `<p class="c-rule">分辨要點：${esc(pair.rule)}</p>` : ''}</div>${Q.freqLine(q)}`;
        done({ ok: all, parts: res, score });
      }
    }));
  };
  Q.ANSWER_TEXT.contrast = q => (q.parts || []).map((p, k) => `情境 ${ABC[k]}：${esc(optText(p.options[p.answer]))}`).join('；');

  // ---------- 計算題（情境數值；沒有選項時用輸入框，程式比對數值） ----------
  const num = v => parseFloat(String(v).replace(/[,，\s]/g, '').replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
  const calcUnit = q => q.answerUnit || q.measure || q.valueUnit || '';
  Q.RENDERERS.calc = function (el, q, ctx, done, head) {
    if (Array.isArray(q.options) && q.options.length) return false;
    const sim = ctx.mode === 'sim';
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div><p class="c-tag-val">情境數值</p>
      <div class="c-calc"><input type="text" inputmode="decimal" autocomplete="off" placeholder="輸入數字"><span>${esc(calcUnit(q))}</span><button class="primary c-calc-go">送出</button></div><div class="feedback"></div>`;
    const inp = el.querySelector('input'), go = el.querySelector('.c-calc-go');
    const submit = () => {
      const v = num(inp.value);
      if (isNaN(v)) { el.querySelector('.feedback').innerHTML = '<p class="hint">請輸入數字。</p>'; return; }
      const ok = Math.abs(v - num(q.answer)) <= (q.tolerance || 0) + 1e-9;
      inp.disabled = true; go.disabled = true;
      if (!sim) Q.showExplain(el, q, ok, `正解：${q.answer}${calcUnit(q)}${q.formula ? `（算式：${q.formula}）` : ''}`);
      done({ ok, chosen: v });
    };
    go.onclick = submit;
    inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
  };
  Q.ANSWER_TEXT.calc = q => esc(Array.isArray(q.options) && q.options.length ? optText(q.options[q.answer]) : `${q.answer}${calcUnit(q)}`);

  // ---------- 價格與數量判斷（家長決定不畫供需曲線：依課本判斷價格、購買量、生產量往哪個方向變） ----------
  const DIR = { up: '增加', down: '減少', same: '不變' };
  const dirOf = v => /增|升|漲|多|up|\+/.test(String(v)) ? 'up' : /減|降|跌|少|down|-/.test(String(v)) ? 'down' : /不變|same|0/.test(String(v)) ? 'same' : null;
  function priceRows(q) {
    const rows = q.targets || q.ask || q.directions || q.rows;
    if (Array.isArray(rows)) return rows.map(r => typeof r === 'string' ? { label: r, answer: null } : { label: r.label || r.item || r.name, answer: dirOf(r.answer != null ? r.answer : r.direction) });
    if (q.answer && typeof q.answer === 'object' && !Array.isArray(q.answer)) return Object.entries(q.answer).map(([k, v]) => ({ label: k, answer: dirOf(v) }));
    return null;
  }
  Q.RENDERERS.price = function (el, q, ctx, done, head) {
    if (Array.isArray(q.options) && q.options.length) return false;
    const rows = priceRows(q);
    if (!rows) return false;
    const sim = ctx.mode === 'sim';
    const pick = {};
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div>
      <div class="c-dirs">${rows.map((r, k) => `<div class="c-dir" data-k="${k}"><span class="c-dir-l">${esc(r.label)}</span><span class="c-dir-b">${Object.entries(DIR).map(([d, t]) => `<button class="c-dirbtn" data-d="${d}"><i class="c-arrow c-a-${d}"></i>${t}</button>`).join('')}</span></div>`).join('')}</div>
      <div class="row"><button class="primary c-dir-go" disabled>送出</button></div><div class="feedback"></div>`;
    const go = el.querySelector('.c-dir-go');
    el.querySelectorAll('.c-dir').forEach(row => row.querySelectorAll('.c-dirbtn').forEach(b => b.onclick = () => {
      if (el.dataset.locked) return;
      pick[row.dataset.k] = b.dataset.d;
      row.querySelectorAll('.c-dirbtn').forEach(x => x.classList.toggle('on', x === b));
      go.disabled = Object.keys(pick).length < rows.length;
    }));
    go.onclick = () => {
      el.dataset.locked = '1'; go.disabled = true;
      let ok = true;
      el.querySelectorAll('.c-dir').forEach(row => {
        const r = rows[+row.dataset.k], good = pick[row.dataset.k] === r.answer;
        if (!good) ok = false;
        row.querySelectorAll('.c-dirbtn').forEach(x => { x.disabled = true; if (x.dataset.d === pick[row.dataset.k]) x.classList.add(good ? 'right' : 'wrong'); if (!sim && x.dataset.d === r.answer) x.classList.add('right'); });
      });
      if (!sim) Q.showExplain(el, q, ok, '正解：' + rows.map(r => `${r.label}${DIR[r.answer] || '—'}`).join('、'));
      done({ ok, chosen: Object.assign({}, pick) });
    };
  };
  Q.ANSWER_TEXT.price = q => { const rows = priceRows(q); return rows ? esc(rows.map(r => `${r.label}${DIR[r.answer] || '—'}`).join('、')) : esc(optText((q.options || [])[q.answer])); };

  // ---------- 迷思糾錯、觀點評估：選擇題，上面先放角色說的話／雙方論點 ----------
  function withPreface(pre) {
    return function (el, q, ctx, done, head) {
      const top = pre(q);
      if (!top) return false;
      el.innerHTML = `${head}${top}<div class="c-inner"></div>`;
      const inner = el.querySelector('.c-inner');
      Q.renderItem(inner, Object.assign({}, q, { type: 'single' }), ctx, done);
      // 子題的標頭重複了，拿掉；解析放回外層也沒關係
      const meta = inner.querySelector('.qmeta'); if (meta) meta.remove();
    };
  }
  Q.RENDERERS.myth = withPreface(q => {
    const quote = q.quote || q.myth || q.statement;
    return quote ? window.CivicsUI.sayHTML(q.speaker, quote) : '';
  });
  Q.RENDERERS.view = withPreface(q => {
    const sides = q.sides || q.claims || q.arguments || q.viewpoints;
    if (!Array.isArray(sides) || !sides.length) return '';
    return `<div class="c-views">${sides.map(s => typeof s === 'string' ? `<div class="c-view"><p>${fmt(s)}</p></div>` : `<div class="c-view"><b>${esc(s.who || s.side || s.name || '')}</b><p>${fmt(s.text || s.claim || '')}</p>${s.basis ? `<small>依據：${esc(s.basis)}</small>` : ''}</div>`).join('')}</div>`;
  });

  // ---------- 統計 ----------
  // 作答紀錄 {q, part, ok, c, m}；m：practice／sim／story／sprint／pair／cases／exam-remedy
  const qOf = id => C().anyQ(id);
  const isScenario = (q, e) => (e && e.m === 'story') || (q && (q.type === 'scenario' || q._story || /情境/.test(q._rawType || '')));
  function mastery() {
    const quest = new Set(), scen = new Set();
    for (const e of P().log) {
      if (!e.ok) continue;
      const q = qOf(e.q);
      for (const c of e.c || []) {
        if (isScenario(q, e)) scen.add(c);
        if (e.m !== 'story' && e.m !== 'cases') quest.add(c);
      }
    }
    return { quest, scen, has: c => quest.has(c) && scen.has(c) };
  }
  function conceptAcc() {
    const m = {};
    for (const e of P().log) for (const c of e.c || []) { const v = m[c] = m[c] || { n: 0, ok: 0 }; v.n++; if (e.ok) v.ok++; }
    return m;
  }
  function weakConcepts(n) {
    const acc = conceptAcc(), rec = P().recycle;
    return Object.keys(Object.assign({}, acc, rec)).filter(c => C().conceptName[c])
      .map(c => ({ c, acc: acc[c] ? acc[c].ok / acc[c].n : null, pending: !!rec[c] }))
      .filter(x => x.pending || (x.acc != null && x.acc < 0.8))
      .sort((a, b) => (b.pending - a.pending) || ((a.acc == null ? 1 : a.acc) - (b.acc == null ? 1 : b.acc)))
      .slice(0, n || 99);
  }
  // 領域 × 能力：每筆作答依題目的領域與能力歸格
  function matrix() {
    const cell = {};
    for (const e of P().log) {
      const q = qOf(e.q);
      if (!q) continue;
      const part = e.part != null && q.parts ? q.parts[e.part] : null;
      const sk = (part && part.skill ? [].concat(part.skill) : q.skill || []);
      const ds = q._boss ? q.domains : [q.domain];
      for (const d of ds) for (const s of sk) { const k = d + '|' + s, v = cell[k] = cell[k] || { n: 0, ok: 0 }; v.n++; if (e.ok) v.ok++; }
    }
    return cell;
  }

  // ---------- 混淆紀錄 ----------
  function recordPair(pid) {
    if (!pid || !C().pairById[pid]) return;
    const cf = P().confusions, o = cf[pid] || { n: 0, since: Date.now() };
    o.n += 1; o.last = Date.now(); o.cleared = false;
    cf[pid] = o; window.Store.save();
  }
  function clearPair(pid) {
    const o = P().confusions[pid];
    if (o && !o.cleared) { o.cleared = true; o.clearedAt = Date.now(); window.Store.save(); return true; }
    return false;
  }
  // 答錯時：選到的選項對應到混淆對的另一個概念（optionPairs／optionConcepts），或題目本身標了 confusablePair → 記下這一對
  function pairOfWrong(q, chosen) {
    if (chosen != null && q.optionPairs && q.optionPairs[chosen]) return q.optionPairs[chosen];
    if (chosen != null && Array.isArray(q.optionConcepts) && q.optionConcepts[chosen]) {
      const oc = q.optionConcepts[chosen];
      const p = C().pairs.find(p => p.concepts.includes(oc) && p.concepts.some(c => c !== oc && (q.concepts || []).includes(c)));
      if (p) return p.id;
    }
    return q.confusablePair || null;
  }
  // 每題作答後（Quiz.run 的 onAnswer，故事與案件也呼叫）
  function afterAnswer(q, r) {
    if (q.parts && r.parts) {
      q.parts.forEach((p, k) => { if (r.parts[k] === false) recordPair(p.confusablePair || q.confusablePair); });
      // 並排辨析全部答對：解除這組混淆
      if (q.type === 'contrast' && r.ok) { const ids = new Set([q.confusablePair].concat(q.parts.map(p => p.confusablePair))); ids.forEach(id => id && clearPair(id)); }
      return;
    }
    if (!r.ok) recordPair(pairOfWrong(q, r.chosen));
  }
  const openPairs = () => Object.entries(P().confusions).filter(([id, o]) => !o.cleared && C().pairById[id]).sort((a, b) => b[1].n - a[1].n).map(([id, o]) => Object.assign({ id }, o));
  // 最常混淆的三組（包含已解除的，依次數）
  const topPairs = n => Object.entries(P().confusions).filter(([id]) => C().pairById[id]).sort((a, b) => b[1].n - a[1].n).slice(0, n || 3).map(([id, o]) => Object.assign({ id }, o));

  // 一組混淆對的並排辨析題：優先用題庫與故事裡的並排辨析題；沒有就把同一對的兩題選擇題並排成一組
  function contrastFor(pid) {
    const all = C().live().concat(C().chapters.filter(C().chapterPlayable).flatMap(ch => ch.questions));
    const own = all.filter(q => q.type === 'contrast' && Array.isArray(q.parts) && (q.confusablePair === pid || q.parts.some(p => p.confusablePair === pid)));
    if (own.length) return Q.shuffle(own)[0];
    const ch = Q.shuffle(all.filter(q => !q.parts && Array.isArray(q.options) && Number.isInteger(q.answer) && (q.confusablePair === pid || Object.values(q.optionPairs || {}).includes(pid))));
    if (ch.length < 2) return null;
    const pr = C().pairById[pid];
    // 兩題盡量考到混淆對的不同概念
    const a = ch[0], b = ch.find(x => x !== a && (x.concepts || []).join() !== (a.concepts || []).join()) || ch[1];
    return { id: 'cx-' + pid, type: 'contrast', _civ: true, _synthetic: true, domain: pr.domain, unit: a.unit, unitLabel: '並排辨析', confusablePair: pid, concepts: pr.concepts, skill: ['概念辨析'],
      stem: `「${pr.labels.join('」和「')}」常被搞混。兩個情境都判斷正確，才算解除這組混淆。`, explain: pr.rule || '',
      parts: [a, b].map(x => ({ stem: x.stem, options: x.options, answer: x.answer, explain: x.explain, concepts: x.concepts, skill: x.skill, confusablePair: pid })) };
  }

  window.CivicsStats = { mastery, conceptAcc, weakConcepts, matrix, recordPair, clearPair, afterAnswer, openPairs, topPairs, contrastFor, isScenario, qOf };
})();
