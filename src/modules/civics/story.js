// 公民故事播放器（#/c/story/<章id>）：開場 → 判斷點（附解析）→ 嵌入題（答對才繼續；答錯看解析再試）→ 迷思糾錯
// → 制度對照（法條、對照表）→ 案件卡（法律單元：事件類型 → 主管機關 → 程序 → 救濟途徑 → 可能結果）→ 概念卡收進公民筆記。
// 另提供家長頁的整章預覽（正文、legalRefs、caseCard、fictionNotes 並排）與公民的家長頁內容、路由與科目登記。
(function () {
  const { esc, app } = window.UI;
  const C = () => window.CData;
  const P = () => window.Store.C.get();
  const T = () => window.Store.C;
  const U = () => window.CivicsUI;
  const ST = () => window.CivicsStats;
  const fmt = s => esc(s || '').replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const paras = v => C().paraList(v).map(t => `<p>${esc(t)}</p>`).join('');
  const list = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];

  // 判斷點與迷思糾錯也記進作答紀錄（掌握判定與領域 × 能力矩陣要用），用虛擬題目 id
  function pseudo(ch, kind, k, o) {
    const id = `${kind}-${ch.id}-${k + 1}`;
    if (!C().storyQById[id]) C().storyQById[id] = { id, type: kind === 'cj' ? 'scenario' : 'myth', _story: ch.id, domain: ch.domain, book: ch.book, unit: ch.unit,
      concepts: list(o.concepts).length ? list(o.concepts) : (ch.coreConcepts || ch.concepts), skill: list(o.skill).length ? list(o.skill) : ch.skills.slice(0, 1), confusablePair: o.confusablePair || null, stem: o.prompt || o.quote || '' };
    return C().storyQById[id];
  }

  // ---------- 案件卡、制度對照、法條 ----------
  const CASE_STEPS = [['eventType', '事件類型', ['type', 'kind', 'caseType']], ['authority', '主管機關', ['agency', 'competentAuthority']], ['procedure', '程序', ['process', 'steps']], ['remedy', '救濟途徑', ['remedies', 'relief']], ['outcome', '可能結果', ['result', 'results']]];
  const caseVal = (cc, k, al) => { for (const x of [k].concat(al)) if (cc[x] != null && cc[x] !== '') return cc[x]; return null; };
  function caseCardHTML(cc) {
    if (!cc) return '';
    return `<div class="c-casecard"><div class="card-kicker">案件卡</div>${cc.title ? `<h3>${esc(cc.title)}</h3>` : ''}<ol class="c-flow">${CASE_STEPS.map(([k, name, al]) => {
      const v = caseVal(cc, k, al);
      return `<li><span class="c-flow-h">${name}</span>${Array.isArray(v) ? `<ul>${v.map(x => `<li>${esc(typeof x === 'string' ? x : x.text || JSON.stringify(x))}</li>`).join('')}</ul>` : `<p>${esc(v || '—')}</p>`}</li>`;
    }).join('')}</ol></div>`;
  }
  const COLS = { age: '年齡', item: '項目', rule: '規定', basis: '依據', name: '名稱', point: '重點', note: '說明', a: '甲', b: '乙' };
  function tableHTML(t) {
    const rows = (t && t.rows) || [];
    if (!rows.length) return '';
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => k !== 'core' && typeof rows[0][k] !== 'boolean');
    return `${t.title ? `<h4>${esc(t.title)}</h4>` : ''}<div class="mx-wrap"><table class="c-cmp"><thead><tr>${keys.map(k => `<th>${esc((t.columns && t.columns[k]) || COLS[k] || k)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.core === false ? 'c-sub' : r.core ? 'c-core' : ''}">${keys.map(k => `<td>${esc(r[k] == null ? '' : r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  // 制度對照：rows 表格，加上其他附表（例如 ageTable 年齡並排表）
  function comparisonHTML(cmp) {
    if (!cmp) return '';
    const extra = Object.entries(cmp).filter(([k, v]) => k !== 'rows' && v && typeof v === 'object' && Array.isArray(v.rows));
    return `${cmp.rows ? `<h3>${esc(cmp.title || '制度對照')}</h3>${tableHTML({ rows: cmp.rows })}` : ''}${extra.map(([, v]) => tableHTML(v)).join('')}`;
  }
  function refsHTML(refs) {
    return refs.length ? `<ul class="c-reflist">${refs.map(r => `<li><b>${esc(r.ref)}</b>${r.point ? `<span>${esc(r.point)}</span>` : ''}${r.textbook ? `<small>課本：${esc(r.textbook)}</small>` : ''}</li>`).join('')}</ul>` : '';
  }

  // ---------- 故事播放器 ----------
  function story(id) {
    const ch = C().chapterById[id];
    if (!ch) return U().views.home();
    const u = C().unitById[ch.unit] || {};
    const back = ch.unit ? '#/c/u/' + ch.unit : '#/c';
    const top = U().topbar(back);
    if (!C().chapterPlayable(ch)) {
      app().innerHTML = `${top}<div class="page c-story"><h1>${esc(ch.title)}</h1>${U().guide('這一章暫時下架修正中，晚一點再來讀。', 'think')}<div class="row"><a class="primary btn" href="${back}">回去</a></div></div>`;
      return;
    }
    const my = ch.misconception;
    const steps = [['open', '開場'], ...ch.judgments.map((_, k) => ['judge' + k, '判斷點']), ...ch.scenes.map((_, k) => ['scene' + k, '嵌入題']),
      ...(my ? [['myth', '迷思糾錯']] : []), ...(ch.comparison || ch.legalRefs.length ? [['cmp', '制度對照']] : []), ...(ch.caseCard ? [['case', '案件卡']] : []), ['unlock', '公民筆記']];
    const score = { got: 0, total: 0 };
    let at = 0;
    app().innerHTML = `${top}<div class="page c-story c-d-${U().DOM[ch.domain] ? U().DOM[ch.domain].k : ''}">
      <header class="st-head"><small>${esc(ch.domain || '')}・${esc(u.volume || '')} ${esc(u.lesson || '')}〈${esc(u.title || '')}〉</small><h1>${esc(ch.title)}</h1>
        <ol class="st-dots">${steps.map(([, n], i) => `<li data-i="${i}" title="${esc(n)}"></li>`).join('')}</ol><div class="st-step"></div></header>
      <div class="st-stage"></div><div class="st-nav"><button class="primary st-next" disabled>繼續</button></div></div>`;
    const stage = app().querySelector('.st-stage'), next = app().querySelector('.st-next');
    const ready = label => { next.disabled = false; next.textContent = label || '繼續'; };
    next.onclick = () => { if (at < steps.length - 1) { at++; show(); } };

    function show() {
      const [k, name] = steps[at];
      app().querySelectorAll('.st-dots li').forEach((li, i) => li.className = i < at ? 'past' : i === at ? 'now' : '');
      app().querySelector('.st-step').textContent = `${at + 1} / ${steps.length}・${name}`;
      next.disabled = true; next.textContent = '繼續';
      next.parentNode.hidden = k === 'unlock';
      window.scrollTo(0, 0);
      if (k === 'open') {
        stage.innerHTML = `<div class="c-opener">${U().pic(U().chapterImg(ch.unit || ch.id), 'c-opener-img', `<span class="c-openerfb"><b>${esc(ch.title)}</b><small>${esc(C().setting || '青禾里')}</small></span>`)}</div>
          <div class="c-cast">${ch.characters.map(c => `<span class="c-castp">${U().ava(c)}<small>${esc(C().charName(c))}</small></span>`).join('')}</div>
          <p class="c-notice">${esc(ch.fictionNotice || C().notice || '故事人物為虛構')}</p>
          <article class="st-text">${paras(ch.paragraphs)}</article>`;
        ready(ch.judgments.length ? '想一想：怎麼判斷？' : '繼續');
      } else if (k.startsWith('judge')) judgeStep(+k.slice(5));
      else if (k.startsWith('scene')) sceneStep(+k.slice(5));
      else if (k === 'myth') mythStep();
      else if (k === 'cmp') {
        stage.innerHTML = `${U().guide('這一章用到的規定，整理成一張表。', 'idle')}<div class="c-cmpbox">${comparisonHTML(ch.comparison)}</div>
          ${ch.legalRefs.length ? `<h3>法條與課本依據</h3>${refsHTML(ch.legalRefs)}` : ''}`;
        ready();
      } else if (k === 'case') {
        stage.innerHTML = `${U().guide('吳律師說：遇到法律問題，先分清楚是哪一種事件，就知道找誰、走什麼程序。', 'think')}${caseCardHTML(ch.caseCard)}`;
        ready();
      } else if (k === 'unlock') unlockStep();
    }

    // 判斷點：依規範判斷，選錯看回饋再選；選對看解析
    function judgeStep(k) {
      const j = ch.judgments[k], pq = pseudo(ch, 'cj', k, j);
      let first = true;
      stage.innerHTML = `${j.context ? `<article class="st-text">${paras(j.context)}</article>` : ''}<div class="item c-judge"><div class="st-qhead">判斷點</div><div class="stem">${fmt(j.prompt)}</div>
        <div class="opts">${window.Quiz.shuffle(j.options.map((_, i) => i)).map(i => `<button class="opt" data-i="${i}">${esc(j.options[i].text)}</button>`).join('')}</div><div class="feedback"></div></div>`;
      stage.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const o = j.options[+b.dataset.i];
        if (first) { first = false; T().record({ q: pq.id, ok: !!o.correct, c: pq.concepts, m: 'story' }); if (!o.correct) ST().afterAnswer(pq, { ok: false }); score.total++; if (o.correct) score.got++; }
        b.disabled = true; b.classList.add(o.correct ? 'right' : 'wrong');
        stage.querySelector('.feedback').innerHTML = `<div class="explain ${o.correct ? 'good' : 'bad'}"><div class="verdict">${o.correct ? '判斷正確' : '再想想看'}</div>${o.feedback ? `<p>${fmt(o.feedback)}</p>` : ''}${o.correct && j.explain ? `<p class="c-analysis"><b>解析</b>　${fmt(j.explain)}</p>${j.legalRefs.length ? `<p class="c-refs">依據：${j.legalRefs.map(r => esc(r.ref)).join('、')}</p>` : ''}` : ''}</div>`;
        if (o.correct) { stage.querySelectorAll('.opt').forEach(x => x.disabled = true); ready('故事繼續'); }
      });
    }

    // 嵌入題：答對才繼續；答錯先看解析，再試一次（第一次作答才計分）
    function sceneStep(k) {
      const s = ch.scenes[k], q = s.question;
      let first = true;
      stage.innerHTML = `${s.lead.length ? `<article class="st-text">${paras(s.lead)}</article>` : ''}<div class="st-qhead">換你判斷</div><div class="item st-q"></div><div class="c-retry"></div><div class="c-after"></div>`;
      const box = stage.querySelector('.st-q');
      const attempt = () => {
        box.removeAttribute('data-locked');
        window.Quiz.renderItem(box, q, { mode: 'practice' }, r => {
          if (first) {
            first = false;
            if (q.parts && r.parts) r.parts.forEach((ok, j) => T().record({ q: q.id, part: j, ok, c: q.parts[j].concepts || q.concepts, m: 'story' }));
            else T().record({ q: q.id, ok: r.ok, c: q.concepts, m: 'story' });
            ST().afterAnswer(q, r);
            score.total++; if (r.ok) score.got++;
          }
          const rt = stage.querySelector('.c-retry');
          if (r.ok) {
            rt.innerHTML = '';
            stage.querySelector('.c-after').innerHTML = s.after.length ? `<article class="st-text">${paras(s.after)}</article>` : '';
            ready('故事繼續');
          } else {
            rt.innerHTML = '<p class="hint">要答對，故事才會繼續。看完解析，再試一次。</p><button class="primary c-again">再試一次</button>';
            rt.querySelector('.c-again').onclick = () => { rt.innerHTML = ''; attempt(); window.scrollTo(0, box.getBoundingClientRect().top + window.scrollY - 80); };
          }
        });
      };
      attempt();
    }

    // 迷思糾錯：角色說出迷思句，學生選出哪裡錯、正確說法是什麼
    function mythStep() {
      const pq = pseudo(ch, 'cm', 0, my);
      let first = true;
      const steps2 = [my.pickWrong && Object.assign({ title: '這句話哪裡有問題？' }, my.pickWrong), my.pickRight && Object.assign({ title: my.prompt || '正確的說法是哪一個？' }, my.pickRight)].filter(Boolean);
      stage.innerHTML = `${my.lead.length ? `<article class="st-text">${paras(my.lead)}</article>` : ''}<div class="st-qhead">迷思糾錯</div>${U().sayHTML(my.speaker, my.quote)}<div class="c-mythq"></div><div class="c-after"></div>`;
      const qb = stage.querySelector('.c-mythq');
      const reveal = ok => {
        qb.insertAdjacentHTML('beforeend', `<div class="explain ${ok ? 'good' : 'bad'} c-mythans"><div class="verdict">正確說法</div><p>${fmt(my.correction)}</p>${my.explain ? `<p>${fmt(my.explain)}</p>` : ''}${my.basis ? `<p class="c-refs">依據：${esc(my.basis)}</p>` : ''}</div>`);
        stage.querySelector('.c-after').innerHTML = my.after.length ? `<article class="st-text">${paras(my.after)}</article>` : '';
        ready();
      };
      const note = ok => { if (!first) return; first = false; T().record({ q: pq.id, ok, c: pq.concepts, m: 'story' }); if (!ok) ST().afterAnswer(pq, { ok: false }); score.total++; if (ok) score.got++; };
      if (!steps2.length) {
        // 資料沒有選項：先判斷對不對，再揭曉
        qb.innerHTML = `<div class="stem">這句話正確嗎？</div><div class="opts"><button class="opt" data-v="1">正確</button><button class="opt" data-v="0">有問題</button></div>`;
        qb.querySelectorAll('.opt').forEach(b => b.onclick = () => { const ok = b.dataset.v === '0'; note(ok); qb.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (x.dataset.v === '0') x.classList.add('right'); else if (x === b) x.classList.add('wrong'); }); reveal(ok); });
        return;
      }
      let si = 0, allOk = true;
      const run = () => {
        const st = steps2[si];
        const d = document.createElement('div');
        d.className = 'item c-mythstep';
        d.innerHTML = `<div class="stem">${esc(st.title)}</div><div class="opts">${window.Quiz.shuffle(st.options.map((_, i) => i)).map(i => `<button class="opt" data-i="${i}">${esc(st.options[i])}</button>`).join('')}</div><div class="feedback"></div>`;
        qb.appendChild(d);
        d.querySelectorAll('.opt').forEach(b => b.onclick = () => {
          const i = +b.dataset.i, ok = i === st.answer;
          if (!ok) allOk = false;
          b.disabled = true; b.classList.add(ok ? 'right' : 'wrong');
          d.querySelector('.feedback').innerHTML = ok ? '' : `<p class="hint">${esc(st.feedback[i] || '不是這個，再選一次。')}</p>`;
          if (!ok) return;
          d.querySelectorAll('.opt').forEach(x => x.disabled = true);
          si++;
          if (si < steps2.length) run(); else { note(allOk); reveal(allOk); }
        });
      };
      run();
    }

    // 收進公民筆記；記下讀完
    function unlockStep() {
      const ids = ch.concepts.filter(c => C().conceptName[c]);
      const fresh = U().collect(ids);
      const stories = Object.assign({}, P().stories, { [ch.id]: { done: true, ts: Date.now(), got: score.got, total: score.total } });
      T().set({ stories });
      stage.innerHTML = `${U().guide(fresh.length ? `讀完了！${fresh.length} 張概念卡收進你的公民筆記。` : '讀完了！這幾張概念卡之前已經收進筆記。', 'happy')}
        ${score.total ? `<p class="hint">這一章的判斷與嵌入題，第一次就答對 ${score.got} / ${score.total}。答錯的概念會在闖關時換一題再出現。</p>` : ''}
        <div class="unlock-cards">${ids.map(x => `<div class="unlock-card${fresh.includes(x) ? ' new' : ''}">${fresh.includes(x) ? '<span class="new-tag">新收進</span>' : ''}${U().cardHTML(x)}</div>`).join('')}</div>
        ${ch.fictionNotes.length ? `<details class="c-fiction"><summary>故事裡哪些是虛構的？</summary><ul>${ch.fictionNotes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
        <div class="row">${ch.unit && C().liveOfUnit(ch.unit).length ? `<a class="primary btn" href="#/c/play/${ch.unit}/practice">接著闖概念關</a>` : ''}<a class="ghost btn" href="${back}">回單元</a><a class="ghost btn" href="#/c/notes">公民筆記</a></div>`;
    }
    show();
  }

  // ---------- 家長頁：整章預覽（正文 ｜ 制度對照、案件卡、虛構說明 並排） ----------
  const len = s => C().paraList(s).join('').replace(/\s/g, '').length;
  function storyPreviewHTML(ch) {
    const my = ch.misconception;
    return `<div class="sp c-sp"><div class="c-sp-main">
      <h4>開場 <small>${len(ch.paragraphs)} 字</small></h4><div class="sp-text">${paras(ch.paragraphs)}</div>
      ${ch.judgments.map(j => `<h4>判斷點</h4><p>${esc(j.prompt)}</p><ul class="sp-opts">${j.options.map(o => `<li class="${o.correct ? 'ok' : ''}">${o.correct ? '✓ ' : ''}${esc(o.text)}<br><span class="hint">${esc(o.feedback || '')}</span></li>`).join('')}</ul><p class="hint">解析：${esc(j.explain)}</p>`).join('')}
      ${ch.scenes.map((s, k) => `<h4>嵌入題 ${k + 1}</h4><div class="sp-text">${paras(s.lead)}</div><div class="sp-q c-spq" data-k="${k}"></div><div class="sp-text">${paras(s.after)}</div>`).join('')}
      ${my ? `<h4>迷思糾錯（${esc(C().charName(my.speaker))}）</h4><p>「${esc(my.quote)}」</p>${my.pickRight ? `<ul class="sp-opts">${my.pickRight.options.map((o, i) => `<li class="${i === my.pickRight.answer ? 'ok' : ''}">${i === my.pickRight.answer ? '✓ ' : ''}${esc(o)}</li>`).join('')}</ul>` : ''}<p>正確說法：${esc(my.correction)}</p><p class="hint">依據：${esc(my.basis)}</p>` : '<p class="c-warn">缺迷思糾錯</p>'}
    </div><aside class="c-sp-side">
      <h4>制度對照</h4>${comparisonHTML(ch.comparison) || '<p class="hint">—</p>'}
      <h4>legalRefs</h4>${refsHTML(ch.legalRefs) || '<p class="hint">—</p>'}
      <h4>caseCard</h4>${ch.caseCard ? caseCardHTML(ch.caseCard) : `<p class="hint">${ch.domain === '法律' ? '<span class="c-warn">法律單元缺案件卡</span>' : '（非法律單元）'}</p>`}
      <h4>fictionNotes</h4><ul>${ch.fictionNotes.map(t => `<li>${esc(t)}</li>`).join('') || '<li class="c-warn">缺</li>'}</ul>
    </aside></div>`;
  }
  function afterPreview(box, ch) {
    box.querySelectorAll('.c-spq').forEach(el => {
      const q = ch.scenes[+el.dataset.k].question;
      window.Quiz.renderItem(el, q, { mode: 'practice' }, () => { });
      el.insertAdjacentHTML('beforeend', `<div class="answer-key"><small>${esc(q.id)}・${esc(window.Quiz.typeName(q.type))}</small>${answerKey(q)}</div>`);
    });
  }
  function answerKey(q) {
    const opt = o => typeof o === 'string' ? o : (o && o.text) || '';
    const A = window.Quiz.ANSWER_TEXT[q.type];
    if (A) return `<p><b>答案：</b>${A(q)}<br>${esc(q.explain || '')}</p>`;
    if (q.parts) return q.parts.map((p, k) => `<p><b>第${k + 1}小題：</b>${esc(opt(p.options[p.answer]))}<br>${esc(p.explain || '')}</p>`).join('');
    if (q.type === 'order') return `<p><b>答案：</b>${esc(q.answer.map(i => q.items[i]).join(' → '))}<br>${esc(q.explain)}</p>`;
    if (q.type === 'match') return `<p><b>答案：</b>${esc(q.left.map((l, i) => `${l} → ${q.right[q.answer[i]]}`).join('；'))}<br>${esc(q.explain)}</p>`;
    return `<p><b>答案：</b>${esc(opt((q.options || [])[q.answer]))}<br>${esc(q.explain || '')}</p>`;
  }

  // ---------- 家長頁的公民部分 ----------
  const qName = id => C().conceptName[id] || id;
  function progressHTML() {
    const books = [...new Set(C().units.map(u => u.book))].sort();
    return `<table class="plist"><thead><tr><th>冊／單元</th><th>題數</th><th>故事</th><th>闖關最佳</th><th>完成</th></tr></thead><tbody>
      ${books.map(b => { const us = C().units.filter(u => u.book === b); return `<tr class="uh"><th colspan="5">第${b}冊（${esc(us[0].volume)}）　完成 ${us.filter(U().unitDone).length} / ${us.length} 單元</th></tr>` + us.map(u => { const ch = C().chapterOfUnit(u.id), r = P().levels[u.id]; return `<tr><td>${esc(u.lesson)} ${esc(u.title)}</td><td>${C().liveOfUnit(u.id).length}</td><td>${ch ? (U().storyDone(ch.id) ? '讀完' : '未讀') : '—'}</td><td>${r ? Math.round(r.best * 100) + '%' : '—'}</td><td>${U().unitDone(u) ? '✓' : ''}</td></tr>`; }).join(''); }).join('')}
      </tbody></table>
      <p>公民筆記 ${(P().cards || []).length} 張；案件分流 ${(P().levels.cases && Math.round(P().levels.cases.best * 100) + '%') || '還沒做'}；衝刺模式最近 ${(P().sprint && P().sprint.date) || '—'}。</p>
      <h3>錯題回收中的概念</h3><p>${Object.keys(P().recycle).map(c => esc(qName(c))).join('、') || '沒有'}</p>`;
  }
  // 家長頁「公民」分頁：進度、領域 × 能力、最常混淆、題目與故事清單（下架／標記問題、整章預覽）
  let pf = { kind: 'q', unit: '', status: '' };
  function tab(body) {
    const st = q => C().status(q);
    const S = () => window.Store.get();
    const draw = () => {
      const isQ = pf.kind === 'q';
      const qs = isQ ? C().questions.concat(C().bosses, C().cases) : C().chapters;
      const unitOf = x => x.unit || (x._boss ? 'boss' : x.domain ? 'cases' : '');
      const stOf = x => isQ ? st(x) : C().chapterStatus(x);
      const keyOf = x => isQ ? x.id : C().storyKey(x.id);
      const items = qs.filter(x => (!pf.unit || unitOf(x) === pf.unit) && (!pf.status || (pf.status === '上架' ? C().isLive(stOf(x)) : !C().isLive(stOf(x)))));
      const rv = x => S().review[keyOf(x)] || {};
      body.innerHTML = `<h2>公民《青禾里的故事》</h2>
        <h3>各冊完成度</h3>${progressHTML()}
        <h3>領域 × 能力</h3>${U().matrixHTML(false)}
        <h3>最常混淆的三組概念</h3>${U().topPairsHTML()}
        <h3>內容清單</h3><p class="hint">公民內容一律直接上線（家長 115/10/29 決定）。孩子做題發現問題時，按「下架」或「標記問題」，這題（這章）就不會再出現；修好後按「重新上架」。</p>
        <nav class="tabs kind-tabs"><a href="javascript:void 0" data-kind="q" class="${isQ ? 'on' : ''}">題目（${C().questions.length + C().bosses.length + C().cases.length}）</a><a href="javascript:void 0" data-kind="s" class="${isQ ? '' : 'on'}">故事章節（${C().chapters.length}）</a></nav>
        <div class="rfilter"><select id="cu"><option value="">全部單元</option>${C().units.map(u => `<option value="${u.id}" ${pf.unit === u.id ? 'selected' : ''}>${esc(u.volume)} ${esc(u.title)}</option>`).join('')}${isQ ? `<option value="boss" ${pf.unit === 'boss' ? 'selected' : ''}>魔王題組</option><option value="cases" ${pf.unit === 'cases' ? 'selected' : ''}>案件分流</option>` : ''}</select>
          <select id="cs"><option value="">全部</option>${['上架', '已下架'].map(s => `<option ${pf.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span>${items.length} 筆</span></div>
        <div class="rlist">${items.slice(0, 200).map(x => `<details class="rq ${isQ ? '' : 'rs'} s-${stOf(x)}" data-id="${esc(x.id)}"><summary><b>${esc(x.id)}</b> <span class="tag">${C().isLive(stOf(x)) ? '上架' : '已下架'}</span>${rv(x).flag ? '<span class="tag flag">已標記問題</span>' : ''} ${esc(String(isQ ? (x.stem || x.text || '') : x.title).slice(0, 40))}</summary>
          <div class="rmeta">${isQ ? `${esc(x.domain || '')}｜${esc(C().unitShort(x.unit))}｜${esc(window.Quiz.typeName(x.type) || '案件')}｜能力：${esc([].concat(x.skill || []).join('、'))}｜概念：${esc((x.concepts || []).map(qName).join('、'))}${x.confusablePair ? `｜混淆對：${esc(C().pairLabel(x.confusablePair))}` : ''}${(x.legalRefs || []).length ? `｜法條：${esc(x.legalRefs.map(r => r.ref).join('、'))}` : ''}` : `${esc(x.domain || '')}｜${esc(C().unitShort(x.unit))}｜角色：${esc(x.characters.map(C().charName).join('、'))}｜概念：${esc(x.concepts.map(qName).join('、'))}`}</div>
          <div class="cpreview"></div>
          <div class="row">${C().isLive(stOf(x)) ? `<button class="ghost cdown" data-k="${esc(keyOf(x))}">下架</button><button class="ghost cflag" data-k="${esc(keyOf(x))}">標記問題（立即下架）</button>` : `<button class="primary cup" data-k="${esc(keyOf(x))}">重新上架</button>`}</div>
          ${rv(x).note ? `<p class="note">備註：${esc(rv(x).note)}</p>` : ''}</details>`).join('') || '<p class="empty">沒有符合的內容（寫手還在補）。</p>'}${items.length > 200 ? `<p class="hint">只列前 200 筆，請用單元篩選。</p>` : ''}</div>`;
      body.querySelectorAll('.kind-tabs a').forEach(a => a.onclick = () => { pf = { kind: a.dataset.kind, unit: '', status: '' }; draw(); });
      body.querySelector('#cu').onchange = e => { pf.unit = e.target.value; draw(); };
      body.querySelector('#cs').onchange = e => { pf.status = e.target.value; draw(); };
      body.querySelectorAll('.cdown').forEach(b => b.onclick = () => { window.Store.setReview(b.dataset.k, { status: '退回' }); draw(); });
      body.querySelectorAll('.cup').forEach(b => b.onclick = () => { window.Store.setReview(b.dataset.k, { status: '確認', flag: false }); draw(); });
      body.querySelectorAll('.cflag').forEach(b => b.onclick = () => {
        const note = prompt('有什麼問題？（會一起存下來，方便修正）', '');
        if (note === null) return;
        window.Store.setReview(b.dataset.k, { status: '退回', flag: true, note });
        draw();
      });
      body.querySelectorAll('details.rq').forEach(d => d.addEventListener('toggle', () => {
        const box = d.querySelector('.cpreview');
        if (!d.open || box.dataset.done) return;
        box.dataset.done = '1';
        const x = qs.find(y => y.id === d.dataset.id);
        if (!isQ) { box.innerHTML = storyPreviewHTML(x); afterPreview(box, x); return; }
        if (x.kind && !x.type) { box.innerHTML = `<p>${esc(x.text)}</p><p><b>事件類型：</b>${esc(x.kind.join('＋'))}　<b>主管機關：</b>${esc(x.authority || '—')}</p><p><b>救濟途徑：</b>${esc(x.options[x.answer] || '—')}</p><p class="hint">${esc(x.explain)}</p>`; return; }
        window.Quiz.renderItem(box, x, { mode: 'practice' }, () => { });
        box.insertAdjacentHTML('beforeend', `<div class="answer-key">${answerKey(x)}</div>`);
      }));
    };
    draw();
  }

  const parent = {
    progressHTML, tab,
    matrixHTML: () => U().matrixHTML(false) + `<h3>最常混淆的三組</h3>${U().topPairsHTML()}`,
    log: () => P().log,
    tagsOf: e => (e.c || []).map(qName).join('、'),
    questions: () => C().questions.concat(C().bosses),
    groupOf: q => C().unitShort(q.unit) || '魔王題組',
    find: id => { const q = C().anyQ(id); return q && q.stem != null ? q : q ? Object.assign({ stem: q.text || '' }, q) : null; },
    stories: () => C().chapters,
    storyKey: id => C().storyKey(id),
    storyStatus: ch => C().chapterStatus(ch),
    storyGroupOf: ch => ch.domain || '公民',
    storyMetaHTML: ch => `${esc(ch.id)}｜${esc(ch.domain || '')}｜${esc(C().unitShort(ch.unit))}｜角色：${esc(ch.characters.map(C().charName).join('、'))}`,
    storyPreviewHTML, afterPreview,
    metaHTML: q => `${esc(q.domain || '')}｜${esc(C().unitShort(q.unit))}｜能力：${esc([].concat(q.skill || []).join('、'))}｜概念：${esc((q.concepts || []).map(qName).join('、'))}`
  };

  // ---------- 路由（#/c/…） ----------
  function route(a, b, c) {
    const V = U().views;
    if (C().error) { app().innerHTML = `${U().topbar('#/hub')}<div class="page"><h1>公民資料載入失敗</h1><p>${esc(C().error)}</p></div>`; return; }
    if (a === 'd') return V.domain(b);
    if (a === 'u') return V.unit(b);
    if (a === 'story') return story(b);
    if (a === 'play') return V.play(b, c === 'sim' ? 'sim' : 'practice');
    if (a === 'pair') return V.pair(b);
    if (a === 'boss') return V.boss(b, c);
    if (a === 'cases') return V.cases();
    if (a === 'notes') return V.notes();
    if (a === 'weak') return V.weak();
    if (a === 'cell') return V.cell(b, c);
    if (a === 'sprint') return V.sprint();
    if (a === 'people') return V.people();
    return V.home();
  }

  // 首頁卡片封面：有插畫 civ_hub 就用，沒有就用程式畫的社區
  const HUB_SVG = `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="chub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f5"/><stop offset="1" stop-color="#f1f9f3"/></linearGradient></defs><rect width="300" height="400" fill="url(#chub)"/><circle cx="230" cy="80" r="26" fill="#fff4c9"/><path d="M0 260 Q80 200 160 250 T300 236 V400 H0Z" fill="#9fd1a9"/><path d="M0 300 Q120 260 300 296 V400 H0Z" fill="#6fb487"/><rect x="40" y="236" width="70" height="60" fill="#fffaf0" stroke="#5c8a70"/><path d="M34 236 L75 210 L116 236Z" fill="#2e8f5b"/><rect x="150" y="246" width="56" height="50" fill="#e9f2fb" stroke="#5c8a70"/><path d="M144 246 L178 224 L212 246Z" fill="#3a7bc4"/><circle cx="240" cy="270" r="18" fill="#3f9a63"/><rect x="238" y="284" width="4" height="16" fill="#7a5a3a"/><text x="150" y="150" font-size="40" text-anchor="middle" fill="#2e7d5b" font-family="'Noto Serif TC',serif" font-weight="700" letter-spacing="4">青禾里的故事</text></svg>`;
  window.Subjects.civics = {
    name: '公民', title: '青禾里的故事', home: '#/c',
    cover: () => C().imgSrc('civ_hub') || '',
    coverHTML: () => `<span class="hub-cv">${U().pic('civ_hub', 'hub-cvimg', HUB_SVG)}</span>`,
    blurb: '跟著阿晴走進青禾里，從鄰里日常到公共議題，讀懂故事中的不同立場，分清權利、責任與規範，在每一次選擇中練習思考與判斷。',
    load: () => C().load().catch(e => { C().error = e.message; console.warn('公民資料載入失敗', e); }),
    route, parent, card: id => U().cardHTML(id),
    about: '公民內容依康軒國中公民第一至六冊（1上、1下 113 年版，2上、2下、3下 114 年版，3上 115 年版）；與現行法規不同處一律依課本。青禾里與故事人物皆為虛構；經濟題的數字為情境數值。'
  };
  window.CivicsStory = { story, caseCardHTML, comparisonHTML, refsHTML, storyPreviewHTML };
})();
