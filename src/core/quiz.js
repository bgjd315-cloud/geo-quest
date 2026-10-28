// 答題引擎（兩科共用）：題型元件、練習／模擬模式、錯題回收、區域題答錯的補救流程。
// 預設用地理的資料與進度；歷史在 run() 傳入 track、live、guide、card 換成自己的。
(function () {
  const C = window.Charts, esc = C.esc;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const MARK = ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ', 'Ⓔ', 'Ⓕ'];

  // ---------- 圖表 ----------
  function figure(f) {
    if (!f) return '';
    const D = window.Data.files;
    let svg = '';
    if (f.type === 'climograph') {
      const st = D[f.data].stations[f.station];
      svg = C.climograph(st, f.label || f.station, f);
    } else if (f.type === 'climographs') {
      const sts = f.stations.map(o => D[f.data].stations[o.station]);
      const pMax = Math.max(700, Math.ceil(Math.max(...sts.flatMap(s => s.precip)) / 100) * 100);
      svg = `<div class="fig-row">${f.stations.map((o, i) => C.climograph(sts[i], o.label || o.station, Object.assign({}, f, { pMax }))).join('')}</div>`;
    } else if (f.type === 'tw-stations') {
      const src = D[f.data].stations;
      const pts = f.stations.map(o => {
        const st = src[o.station];
        const value = o.show ? showValue(st, o.show) : null;
        return { label: o.label || o.station, lat: st.lat, lon: st.lon, value, dx: o.dx, dy: o.dy };
      });
      svg = C.twMap(D[f.basemap], pts, f);
    } else if (f.type === 'contour') {
      svg = C.contourMap(D[f.terrain], f);
    } else if (f.type === 'profile') {
      svg = C.profileChart(D[f.terrain], f.from, f.to, f);
    } else if (f.type === 'town') {
      svg = C.townGrid(D[f.map], f);
    } else if (f.type === 'graticule') {
      svg = C.graticule(D[f.basemap], f.points, f);
    } else if (f.type === 'region-map' || f.type === 'polar-map') {
      // 點可以直接給經緯度，或引用氣候資料檔裡的測站座標
      const pts = (f.points || []).map(p => {
        if (p.station) { const st = D[p.data || f.data].stations[p.station]; return Object.assign({ label: p.label || p.station, lat: st.lat, lon: st.lon }, p.show ? { value: showValue(st, p.show) } : {}, { dx: p.dx, dy: p.dy }); }
        return p;
      });
      const o = Object.assign({}, f, { points: pts });
      svg = f.type === 'region-map' ? C.regionMap(D[f.basemap], o) : C.polarMap(D[f.basemap], o);
    } else if (f.type === 'pyramid') {
      const d = D[f.data];
      svg = C.pyramid(d.countries[f.country][f.year], f.label || `${f.country} ${f.year} 年${d.projectionYears.includes(f.year) ? '（推估）' : ''}`, f);
    } else if (f.type === 'pyramids') {
      const d = D[f.data];
      svg = `<div class="fig-row">${f.items.map(o => C.pyramid(d.countries[o.country][o.year], o.label || `${o.country} ${o.year} 年${d.projectionYears.includes(o.year) ? '（推估）' : ''}`, Object.assign({ maxPct: f.maxPct }, o))).join('')}</div>`;
    } else if (f.type === 'diagram') {
      svg = C.diagram(f.id, Object.assign({}, f.opts, { pick: f.pick }));
    }
    const cap = f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : '';
    const src = sourceLine(f);
    return `<figure class="figure">${svg}${cap}${src}</figure>`;
  }
  function showValue(st, show) {
    const s = window.GeoCalc.climateStats(st);
    return show === 'precipTotal' ? Math.round(s.precipTotal).toLocaleString() + 'mm' : s[show] + '℃';
  }
  function sourceLine(f) {
    const D = window.Data.files;
    if (f.type === 'climograph' || f.type === 'climographs') return `<div class="figsrc">資料：${esc(D[f.data].source)}，${esc(D[f.data].period)}</div>`;
    if (f.type === 'tw-stations') return `<div class="figsrc">資料：${esc(D[f.data].source)}，${esc(D[f.data].period)}</div>`;
    if (f.type === 'contour' || f.type === 'profile') return `<div class="figsrc">練習用虛構地形</div>`;
    if (f.type === 'diagram') return `<div class="figsrc">原理示意圖</div>`;
    if (f.type === 'pyramid' || f.type === 'pyramids') return `<div class="figsrc">資料：${esc(D[f.data].source.split('，')[0])}</div>`;
    if ((f.type === 'region-map' || f.type === 'polar-map') && (f.points || []).some(p => p.station)) return `<div class="figsrc">測站座標：${esc(D[f.data].source.split('（')[0])}</div>`;
    return '';
  }

  // 選項顯示順序：每次隨機排列，避免正解總在同一個位置；
  // 甲乙丙丁這類標記、數字開頭（月份、距離、經緯度）的選項保持原順序
  function order(options, type) {
    const idx = options.map((_, i) => i);
    if (type === 'click') return idx;
    const fixed = options.every(o => typeof o === 'string' && (o.length <= 2 || /^[\d０-９\-−+.]/.test(o)));
    return fixed ? idx : shuffle(idx);
  }
  function optsHTML(options, type) {
    return order(options, type).map((i, k) => `<button class="opt" data-i="${i}"><b>${MARK[k]}</b> ${optionHTML(options[i])}</button>`).join('');
  }

  function optionHTML(o) {
    if (typeof o === 'string') return esc(o);
    return `${o.text ? `<span>${esc(o.text)}</span>` : ''}${o.figure ? figure(o.figure) : ''}`;
  }

  // ---------- 一題的畫面 ----------
  // done(result) 會帶回 {ok, score, parts?}
  function renderItem(el, q, ctx, done) {
    const sim = ctx.mode === 'sim';
    const head = `<div class="qmeta"><span class="tag">${esc(q.unitLabel || q.unit)}</span>${q.region && q.region !== '通論' ? `<span class="tag region">${esc(q.region)}</span>` : ''}<span class="tag soft">${esc(typeName(q.type))}</span></div>`;
    // 各科自訂的題型（公民的並排辨析、計算題、價格與數量判斷…）
    // 回傳 false 表示這題還是用一般選擇題介面
    if (RENDERERS[q.type] && RENDERERS[q.type](el, q, ctx, done, head) !== false) return;
    if (Array.isArray(q.parts)) return renderChain(el, q, ctx, done, head);
    if (q.type === 'order') return renderOrder(el, q, ctx, done, head);
    if (q.type === 'match') return renderMatch(el, q, ctx, done, head);
    if (q.type === 'clue') return renderClue(el, q, ctx, done, head);

    // single / click / decode / compare / transfer：選擇題介面
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div>${figure(q.figure)}
      <div class="opts ${hasFigOpts(q) ? 'fig-opts' : ''}">${optsHTML(q.options, q.type)}</div>
      <div class="feedback"></div>`;
    const choose = i => {
      if (el.dataset.locked) return;
      el.dataset.locked = '1';
      const ok = i === q.answer;
      el.querySelectorAll('.opt').forEach(b => {
        const k = +b.dataset.i;
        b.disabled = true;
        if (k === i) b.classList.add(ok ? 'right' : 'wrong', 'chosen');
        if (!sim && k === q.answer) b.classList.add('right');
      });
      el.querySelectorAll('[data-pick]').forEach(g => g.classList.add('done'));
      if (!sim) showExplain(el, q, ok, !ok && q.optionFeedback && q.optionFeedback[i] ? q.optionFeedback[i] : '');
      done({ ok, chosen: i });
    };
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => choose(+b.dataset.i));
    // 圖上點選：點圖上的標記等於選擇同名選項
    if (q.type === 'click') {
      el.querySelectorAll('[data-pick]').forEach(g => g.addEventListener('click', () => {
        const i = q.options.indexOf(g.dataset.pick);
        if (i >= 0) choose(i);
      }));
    }
  }

  function renderChain(el, q, ctx, done, head) {
    const sim = ctx.mode === 'sim';
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div>${figure(q.figure)}<div class="parts"></div>`;
    const box = $('.parts', el);
    const res = [];
    q.parts.forEach((p, k) => {
      const d = document.createElement('div');
      d.className = 'part' + (!sim && k > 0 ? ' locked' : '');
      d.innerHTML = `<div class="pstem"><b>${k + 1}.</b> ${fmt(p.stem)}</div>${p.figure ? figure(p.figure) : ''}
        <div class="opts">${optsHTML(p.options, 'part')}</div><div class="feedback"></div>`;
      box.appendChild(d);
      d.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (d.dataset.locked || d.classList.contains('locked')) return;
        const i = +b.dataset.i, ok = i === p.answer;
        d.dataset.locked = '1';
        d.querySelectorAll('.opt').forEach(x => { x.disabled = true; const n = +x.dataset.i; if (n === i) x.classList.add(ok ? 'right' : 'wrong', 'chosen'); if (!sim && n === p.answer) x.classList.add('right'); });
        res[k] = ok;
        if (!sim) {
          showExplain(d, p, ok, null, true);
          // 練習模式：前一題答對才解鎖下一題；答錯則看解析後解鎖，避免卡關
          const next = box.children[k + 1];
          if (next) {
            if (ok) next.classList.remove('locked');
            else {
              const btn = document.createElement('button');
              btn.className = 'ghost';
              btn.textContent = '看懂了，繼續下一小題';
              btn.onclick = () => { next.classList.remove('locked'); btn.remove(); };
              d.appendChild(btn);
            }
          }
        }
        if (res.filter(x => x !== undefined).length === q.parts.length) {
          const score = res.filter(Boolean).length;
          if (!sim) box.insertAdjacentHTML('afterend', freqLine(q));
          done({ ok: score === q.parts.length, parts: res, score });
        }
      });
    });
  }

  function renderClue(el, q, ctx, done, head) {
    const sim = ctx.mode === 'sim';
    let shown = 1;
    const ord = order(q.options, q.type);
    const draw = () => {
      el.innerHTML = `${head}<div class="stem">${fmt(q.stem || '線索逐一揭開，越早猜對得分越高。')}</div>${figure(q.figure)}
        <ol class="clues">${q.clues.map((c, i) => `<li class="${i < shown ? 'on' : 'off'}">${i < shown ? fmt(c) : '？？？'}</li>`).join('')}</ol>
        ${shown < q.clues.length ? '<button class="ghost more">再揭開一條線索</button>' : ''}
        <div class="opts">${ord.map((i, k) => `<button class="opt" data-i="${i}"><b>${MARK[k]}</b> ${optionHTML(q.options[i])}</button>`).join('')}</div><div class="feedback"></div>`;
      const more = $('.more', el);
      if (more) more.onclick = () => { shown++; draw(); };
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const i = +b.dataset.i, ok = i === q.answer;
        el.querySelectorAll('.opt').forEach(x => { x.disabled = true; const n = +x.dataset.i; if (n === i) x.classList.add(ok ? 'right' : 'wrong', 'chosen'); if (!sim && n === q.answer) x.classList.add('right'); });
        if (more) more.remove();
        const pts = ok ? Math.max(1, q.clues.length - shown + 1) : 0;
        if (!sim) showExplain(el, q, ok, ok ? `用了 ${shown} 條線索，得 ${pts} 分。` : '');
        done({ ok, clueScore: pts, cluesUsed: shown });
      });
    };
    draw();
  }

  function renderOrder(el, q, ctx, done, head) {
    const sim = ctx.mode === 'sim';
    const order = [];
    const draw = () => {
      el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div>${figure(q.figure)}
        <div class="order-pick">${q.items.map((t, i) => `<button class="chip ${order.includes(i) ? 'used' : ''}" data-i="${i}" ${order.includes(i) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
        <div class="order-seq">${order.map((i, k) => `<span class="seq">${k + 1}. ${esc(q.items[i])}</span>`).join('') || '<span class="hint">依序點選上面的項目</span>'}</div>
        <div class="row"><button class="ghost undo" ${order.length ? '' : 'disabled'}>重排</button><button class="primary submit" ${order.length === q.items.length ? '' : 'disabled'}>送出</button></div><div class="feedback"></div>`;
      el.querySelectorAll('.chip').forEach(b => b.onclick = () => { order.push(+b.dataset.i); draw(); });
      $('.undo', el).onclick = () => { order.length = 0; draw(); };
      $('.submit', el).onclick = () => {
        const ok = order.every((v, k) => v === q.answer[k]);
        el.querySelectorAll('button').forEach(b => b.disabled = true);
        if (!sim) showExplain(el, q, ok, `正確順序：${q.answer.map(i => q.items[i]).join(' → ')}`);
        done({ ok, chosen: order.slice() });
      };
    };
    draw();
  }

  function renderMatch(el, q, ctx, done, head) {
    const sim = ctx.mode === 'sim';
    el.innerHTML = `${head}<div class="stem">${fmt(q.stem)}</div>${figure(q.figure)}
      <div class="match">${q.left.map((l, i) => `<label class="mrow"><span>${esc(l)}</span><select data-i="${i}"><option value="">請選擇</option>${q.right.map((r, j) => `<option value="${j}">${esc(r)}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="row"><button class="primary submit">送出</button></div><div class="feedback"></div>`;
    $('.submit', el).onclick = () => {
      const pick = [...el.querySelectorAll('select')].map(s => s.value === '' ? -1 : +s.value);
      if (pick.includes(-1)) { $('.feedback', el).innerHTML = '<p class="hint">每一列都要選一個答案。</p>'; return; }
      const ok = pick.every((v, i) => v === q.answer[i]);
      el.querySelectorAll('select,button').forEach(b => b.disabled = true);
      if (!sim) showExplain(el, q, ok, '正確配對：' + q.left.map((l, i) => `${l} → ${q.right[q.answer[i]]}`).join('；'));
      done({ ok, chosen: pick });
    };
  }

  function showExplain(el, q, ok, extra, noFreq) {
    const fb = el.querySelector(':scope > .feedback');
    fb.innerHTML = `<div class="explain ${ok ? 'good' : 'bad'}"><div class="verdict">${ok ? '答對了' : '再想想看'}</div>${extra ? `<p>${esc(extra)}</p>` : ''}<p>${fmt(q.explain || '')}</p></div>${noFreq ? '' : freqLine(q)}`;
  }
  // 作答後：這題觀念的會考出題率（題目各觀念取最高；地理看 concepts，歷史看 kp 與事件）
  function freqLine(q) {
    const X = window.XData;
    if (!X || !X.questionCount || !X.items || !X.items.length) return '';
    return `<p class="xf-line">${X.chip(X.questionCount(q))}<span>這題的觀念在會考有多常考</span></p>`;
  }

  const fmt = s => esc(s || '').replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const hasFigOpts = q => q.options && q.options.some(o => typeof o === 'object' && o.figure);
  const TYPE_NAME = { single: '單選題', click: '圖上點選', chain: '連鎖題組', clue: '線索猜地', order: '排序', match: '配對', decode: '原理解碼', compare: '跨區比較', transfer: '遷移題' };
  const typeName = t => TYPE_NAME[t] || '題目';
  // 各科可以登記自己的題型：RENDERERS[type](el, q, ctx, done, head)、ANSWER_TEXT[type](q) → 正解文字
  const RENDERERS = {}, ANSWER_TEXT = {};

  // ---------- 原理卡 ----------
  function cardHTML(concept) {
    const c = window.Data.cards[concept];
    const name = window.Data.conceptName[concept] || concept;
    if (!c) return `<div class="card"><h3>${esc(name)}</h3><p>這個概念的原理卡還在準備中。</p></div>`;
    const xc = window.XData && window.XData.chipKey ? window.XData.chipKey('geo:' + concept) : '';
    return `<div class="card"><div class="card-kicker">原理卡${xc}</div><h3>${esc(c.title || name)}</h3>${figure(c.figure)}<p>${fmt(c.text)}</p>${c.tip ? `<p class="tip">${fmt(c.tip)}</p>` : ''}</div>`;
  }

  // ---------- 一場闖關 ----------
  // opts: {title, pool:[題目], size, mode:'practice'|'sim', timeLimit(秒), onEnd(summary),
  //        track（該科進度，預設地理 Store）, live（可補救的已確認題）, guide（補救時的嚮導圖）, card(概念) → 原理卡 HTML}
  function pick(pool, size, track) {
    const s = track.get();
    const seen = {};
    for (const e of s.log) seen[e.q] = (seen[e.q] || 0) + (e.ok ? 1 : -2);
    // 沒做過、或做錯過的題目優先
    return shuffle(pool).sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0)).slice(0, size);
  }

  function run(root, opts) {
    const mode = opts.mode || 'practice';
    const track = opts.track || window.Store;
    const card = opts.card || cardHTML;
    const queue = pick(opts.pool, opts.size || 10, track).map(q => ({ kind: 'q', q }));
    const used = new Set(queue.map(x => x.q.id));
    const results = [];
    let idx = 0, t0 = Date.now(), timer = null;
    const live = opts.live || window.Data.live();

    root.innerHTML = `<div class="run">
      <div class="runbar"><button class="ghost quit">離開</button><div class="progress"><div class="fill"></div></div><div class="count"></div>${mode === 'sim' ? '<div class="clock"></div>' : ''}</div>
      <div class="stage"></div><div class="nav"><button class="primary next" disabled>下一題</button></div></div>`;
    const stage = $('.stage', root), next = $('.next', root);
    $('.quit', root).onclick = () => { clearInterval(timer); opts.onQuit && opts.onQuit(); };

    if (mode === 'sim') {
      const limit = opts.timeLimit || queue.length * 75;
      const clock = $('.clock', root);
      const tick = () => {
        const left = Math.max(0, limit - Math.round((Date.now() - t0) / 1000));
        clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (left === 0) { clearInterval(timer); finish(true); }
      };
      tick(); timer = setInterval(tick, 1000);
    }

    // 補救插入（只在練習模式）
    function remedy(q) {
      const later = [];
      for (const c of q.concepts) {
        if (q.region && q.region !== '通論') {
          // 區域題答錯：原理卡 → 通論基本題 → 同區域另一題變化題
          later.push({ kind: 'card', concept: c });
          // 通論基本題：優先沒出過的；都出過了就重出一題，原理比新鮮感重要
          const basics = shuffle(live.filter(x => x.region === '通論' && x.concepts.includes(c) && !x.parts && !/-boss$/.test(x.level)));
          const basic = basics.find(x => !used.has(x.id)) || basics[0];
          if (basic) { used.add(basic.id); later.push({ kind: 'q', q: basic, tag: '通論基本題' }); }
          const variant = shuffle(live.filter(x => x.region === q.region && x.concepts.includes(c) && !used.has(x.id) && !/-boss$/.test(x.level)))[0];
          if (variant) { used.add(variant.id); later.push({ kind: 'q', q: variant, tag: '回到同一區域' }); }
          break;
        }
      }
      if (later.length) { queue.splice(idx + 1, 0, ...later); return; }
      const c = q.concepts[0];
      // 歷史（opts.cardFirst）：答錯先看館藏卡
      if (opts.cardFirst && c) queue.splice(idx + 1, 0, { kind: 'card', concept: c });
      // 通論題答錯：隔幾題後換同概念的另一題
      // 優先找同一關的題目；找不到再找其他一般關卡（不從魔王關抓）
      const cand = shuffle(live.filter(x => x.concepts.includes(c) && !used.has(x.id) && !/-boss$/.test(x.level)));
      const alt = cand.find(x => x.level === q.level) || cand[0];
      if (alt) { used.add(alt.id); queue.splice(Math.min(queue.length, idx + 3), 0, { kind: 'q', q: alt, tag: '錯題回收' }); }
    }

    function show() {
      const item = queue[idx];
      const totalQ = queue.filter(x => x.kind === 'q').length;
      const doneQ = queue.slice(0, idx).filter(x => x.kind === 'q').length;
      $('.count', root).textContent = `${Math.min(doneQ + 1, totalQ)} / ${totalQ}`;
      $('.fill', root).style.width = (doneQ / totalQ * 100) + '%';
      next.disabled = true;
      next.textContent = idx === queue.length - 1 ? (mode === 'sim' ? '交卷' : '完成') : '下一題';
      stage.scrollTop = 0; window.scrollTo(0, 0);
      if (item.kind === 'card') {
        stage.innerHTML = `<div class="remedy"><img class="bird" src="${opts.guide || window.Data.img('bird_hint')}" alt=""><p>${esc(opts.cardIntro || '先看一下這張原理卡，再試一題。')}</p></div>${card(item.concept)}`;
        next.disabled = false;
        return;
      }
      const box = document.createElement('div');
      box.className = 'item';
      stage.innerHTML = item.tag ? `<div class="remedy-tag">${esc(item.tag)}</div>` : '';
      stage.appendChild(box);
      renderItem(box, item.q, { mode }, r => {
        results.push({ q: item.q, r });
        const q = item.q;
        if (q.parts && r.parts) r.parts.forEach((ok, k) => track.record({ q: q.id, part: k, ok, c: q.parts[k].concepts || q.concepts, r: q.region, m: mode }));
        else track.record({ q: q.id, ok: r.ok, c: q.concepts, r: q.region, m: mode });
        if (opts.onAnswer) opts.onAnswer(q, r, mode);
        if (!r.ok && mode === 'practice') remedy(q);
        next.disabled = false;
        if (mode === 'sim') { idx === queue.length - 1 ? finish() : (idx++, show()); }
      });
    }

    next.onclick = () => { if (idx >= queue.length - 1) finish(); else { idx++; show(); } };

    function finish(timeUp) {
      clearInterval(timer);
      let got = 0, total = 0;
      for (const { q, r } of results) {
        if (q.parts) { total += q.parts.length; got += r.score; }
        else { total += 1; got += r.ok ? 1 : 0; }
      }
      const summary = { got, total, results, mode, timeUp, seconds: Math.round((Date.now() - t0) / 1000) };
      opts.onEnd && opts.onEnd(summary);
    }
    if (!queue.length) { stage.innerHTML = '<p class="empty">這一關目前沒有已確認的題目。請家長到家長頁審題後再來。</p>'; next.disabled = true; return; }
    show();
  }

  // 模擬模式結束後：逐題顯示作答與解析
  function reviewList(results) {
    return results.map(({ q, r }, n) => {
      if (ANSWER_TEXT[q.type]) return `<div class="rv ${r.ok ? 'good' : 'bad'}"><div class="rvh">${n + 1}. ${r.ok ? '○' : '×'} ${fmt(q.stem)}</div><div>正解：${ANSWER_TEXT[q.type](q)}</div><p>${fmt(q.explain)}</p>${freqLine(q)}</div>`;
      if (q.parts) {
        return `<div class="rv"><div class="rvh">${n + 1}. ${fmt(q.stem)}</div>${figure(q.figure)}${q.parts.map((p, k) => `<div class="rvp ${r.parts[k] ? 'good' : 'bad'}"><b>${k + 1}.</b> ${fmt(p.stem)}<div>正解：${optionHTML(p.options[p.answer])}</div><p>${fmt(p.explain)}</p></div>`).join('')}${freqLine(q)}</div>`;
      }
      const ans = q.type === 'order' ? q.answer.map(i => q.items[i]).join(' → ')
        : q.type === 'match' ? q.left.map((l, i) => `${l} → ${q.right[q.answer[i]]}`).join('；')
          : `${typeof q.options[q.answer] === 'string' ? q.options[q.answer] : (q.options[q.answer].text || '（見圖）')}`;
      return `<div class="rv ${r.ok ? 'good' : 'bad'}"><div class="rvh">${n + 1}. ${r.ok ? '○' : '×'} ${fmt(q.stem)}</div>${figure(q.figure)}<div>正解：${esc(ans)}</div><p>${fmt(q.explain)}</p>${freqLine(q)}</div>`;
    }).join('');
  }

  window.Quiz = { run, figure, cardHTML, reviewList, renderItem, typeName, shuffle, RENDERERS, ANSWER_TEXT, TYPE_NAME, fmt, optsHTML, showExplain, freqLine };
})();
