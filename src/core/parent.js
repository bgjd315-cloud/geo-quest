// 家長頁（兩科共用）：進度、弱點矩陣、近期錯題、審題。各科的內容由 Subjects.<科>.parent 提供。
(function () {
  const { esc, app, download, pickFile, today } = window.UI;
  const S = () => window.Store.get();
  const SUBJ = window.Subjects;
  const subjName = k => SUBJ[k].name;
  // 有家長頁內容的科目（會考真題沒有審題，診斷另有分頁）
  const keys = () => Object.keys(SUBJ).filter(k => SUBJ[k].parent);

  let parentOK = false;
  function view(tab, topbar) {
    if (!parentOK) return login(topbar);
    tab = tab || 'progress';
    const tabs = Object.assign({ progress: '進度', diag: '學習診斷', matrix: '弱點矩陣', wrong: '近期錯題', review: '審題' }, SUBJ.civics && SUBJ.civics.parent && SUBJ.civics.parent.tab ? { civics: '公民' } : {});
    app().innerHTML = `${topbar('#/settings')}<div class="page parent"><h1>家長頁</h1>
      <nav class="tabs">${Object.entries(tabs).map(([k, v]) => `<a class="${k === tab ? 'on' : ''}" href="#/parent/${k}">${v}</a>`).join('')}</nav><div class="pbody"></div></div>`;
    const body = app().querySelector('.pbody');
    if (tab === 'progress') progress(body);
    if (tab === 'matrix') body.innerHTML = keys().filter(k => SUBJ[k].parent.matrixHTML).map(k => `<h2>${subjName(k)}</h2>${SUBJ[k].parent.matrixHTML()}`).join('');
    if (tab === 'wrong') wrong(body);
    if (tab === 'diag') window.Diagnosis.render(body);
    if (tab === 'review') review(body);
    if (tab === 'civics') SUBJ.civics.parent.tab(body);
  }

  function login(topbar) {
    const has = !!S().parentHash;
    app().innerHTML = `${topbar('#/settings')}<div class="page parent"><h1>家長頁</h1>
      <p>${has ? '請輸入家長密碼。' : '第一次使用，請設定一組家長密碼（只存在這台裝置）。'}</p>
      <input type="password" id="pw" inputmode="numeric" autocomplete="off" placeholder="密碼">
      ${has ? '' : '<input type="password" id="pw2" autocomplete="off" placeholder="再輸入一次">'}
      <div class="row"><button class="primary" id="go">${has ? '進入' : '設定並進入'}</button></div><p class="msg"></p></div>`;
    app().querySelector('#go').onclick = () => {
      const v = app().querySelector('#pw').value;
      const msg = app().querySelector('.msg');
      if (!v) { msg.textContent = '請輸入密碼'; return; }
      if (!has) {
        if (v !== app().querySelector('#pw2').value) { msg.textContent = '兩次輸入不一樣'; return; }
        window.Store.set({ parentHash: window.Store.hash(v) });
      } else if (window.Store.hash(v) !== S().parentHash) { msg.textContent = '密碼不對'; return; }
      parentOK = true; view(null, topbar);
    };
  }

  function progress(body) {
    body.innerHTML = keys().map(k => {
      const P = SUBJ[k].parent, log = P.log();
      const days = [...new Set(log.map(e => new Date(e.ts).toISOString().slice(0, 10)))];
      return `<h2>${subjName(k)}《${esc(SUBJ[k].title)}》</h2>
        <p>累計作答 ${log.length} 次，練習天數 ${days.length} 天，最近一次 ${log.length ? new Date(log[log.length - 1].ts).toLocaleString('zh-TW') : '—'}。</p>${P.progressHTML()}`;
    }).join('');
  }

  // 兩科的錯題混在一起，依時間由新到舊
  function wrong(body) {
    const rows = keys().flatMap(k => SUBJ[k].parent.log().filter(e => !e.ok).slice(-30).map(e => ({ k, e })))
      .sort((a, b) => b.e.ts - a.e.ts).slice(0, 30);
    if (!rows.length) { body.innerHTML = '<p class="empty">最近沒有錯題。</p>'; return; }
    body.innerHTML = rows.map(({ k, e }) => {
      const P = SUBJ[k].parent, q = P.find ? P.find(e.q) : P.questions().find(x => x.id === e.q);
      if (!q) return '';
      const stem = e.part != null && q.parts ? q.parts[e.part].stem : q.stem;
      return `<div class="wrong-row"><small><span class="tag">${subjName(k)}</span> ${new Date(e.ts).toLocaleString('zh-TW')}・${esc(q.id)}${e.part != null ? ` 第${e.part + 1}小題` : ''}・${esc(P.tagsOf(e))}</small><div>${esc(stem)}</div></div>`;
    }).join('');
  }

  // 審題：先選科目，再依單元（地理）或時代（歷史）篩選；歷史另有「故事章節」
  let filter = { subj: 'geo', status: '待審', group: '', kind: 'q' };
  function review(body) {
    const st = q => window.Loader.status(q);
    // 題目／故事章節切換（只有提供 stories 的科目才有）
    const kindNav = P => P.stories ? `<nav class="tabs kind-tabs"><a href="javascript:void 0" data-kind="q" class="${filter.kind !== 'story' ? 'on' : ''}">題目</a><a href="javascript:void 0" data-kind="story" class="${filter.kind === 'story' ? 'on' : ''}">故事章節（${P.stories().length} 章・待審 ${P.stories().filter(c => P.storyStatus(c) === '待審').length}）</a></nav>` : '';
    const subjNav = () => `<nav class="tabs subj-tabs">${keys().map(k => `<a href="javascript:void 0" data-k="${k}" class="${k === filter.subj ? 'on' : ''}">${subjName(k)}（${SUBJ[k].parent.questions().length} 題・待審 ${SUBJ[k].parent.questions().filter(q => st(q) === '待審').length}）</a>`).join('')}</nav>`;
    const bindNav = () => {
      body.querySelectorAll('.subj-tabs a').forEach(a => a.onclick = () => { filter = { subj: a.dataset.k, status: '待審', group: '', kind: 'q' }; draw(); });
      body.querySelectorAll('.kind-tabs a').forEach(a => a.onclick = () => { filter = Object.assign({}, filter, { kind: a.dataset.kind, group: '', status: '待審' }); draw(); });
    };

    // 故事章節：每章整章攤開預覽（嵌入題用答題元件顯示，附答案），確認／退回存在 review 的 story:<章id>
    const drawStories = P => {
      const chs = P.stories();
      const cst = c => P.storyStatus(c);
      const groups = [...new Set(chs.map(P.storyGroupOf))];
      const list = chs.filter(c => (!filter.status || cst(c) === filter.status) && (!filter.group || P.storyGroupOf(c) === filter.group));
      const n = s => chs.filter(c => cst(c) === s).length;
      const rv = c => S().review[P.storyKey(c.id)] || {};
      body.innerHTML = `${subjNav()}${kindNav(P)}
        <div class="rfilter">
          <select id="fs"><option value="">全部狀態</option>${['待審', '確認', '退回'].map(s => `<option ${filter.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <select id="fu"><option value="">全部館區</option>${groups.map(u => `<option ${filter.group === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
          <span>待審 ${n('待審')}・確認 ${n('確認')}・退回 ${n('退回')}</span></div>
        <p class="hint">故事章節確認後，孩子才能在館區讀這一章（章內嵌入題跟著章節一起上架）。</p>
        <div class="rlist">${list.map(c => `<details class="rq rs s-${cst(c)}" data-id="${esc(c.id)}"><summary><b>${esc(c.id)}</b> <span class="tag">${esc(cst(c))}</span>${rv(c).flag ? '<span class="tag flag">已標記問題</span>' : ''} ${esc(c.title || '')}</summary>
          <div class="rmeta">${P.storyMetaHTML(c)}</div>
          <div class="spreview"></div>
          <div class="row"><button class="primary sone" data-id="${esc(c.id)}" data-s="確認">確認</button><button class="ghost sone" data-id="${esc(c.id)}" data-s="退回">退回</button><button class="ghost sflag" data-id="${esc(c.id)}">標記問題（立即下架）</button></div>
          ${rv(c).note ? `<p class="note">備註：${esc(rv(c).note)}</p>` : ''}</details>`).join('') || `<p class="empty">${chs.length ? '沒有符合的章節。' : '故事還在撰寫中，目前沒有章節。'}</p>`}</div>`;
      bindNav();
      body.querySelector('#fs').onchange = e => { filter.status = e.target.value; draw(); };
      body.querySelector('#fu').onchange = e => { filter.group = e.target.value; draw(); };
      body.querySelectorAll('.sone').forEach(b => b.onclick = () => { window.Store.setReview(P.storyKey(b.dataset.id), { status: b.dataset.s }); draw(); });
      body.querySelectorAll('.sflag').forEach(b => b.onclick = () => {
        const note = prompt('這一章有什麼問題？（會一起存下來，方便修正）', '');
        if (note === null) return;
        window.Store.setReview(P.storyKey(b.dataset.id), { status: '退回', flag: true, note });
        draw();
      });
      body.querySelectorAll('details.rs').forEach(d => d.addEventListener('toggle', () => {
        const box = d.querySelector('.spreview');
        if (!d.open || box.dataset.done) return;
        box.dataset.done = '1';
        const c = chs.find(x => x.id === d.dataset.id);
        box.innerHTML = P.storyPreviewHTML(c);
        if (P.afterPreview) { P.afterPreview(box, c); return; }
        box.querySelectorAll('.sp-q').forEach(el => {
          const q = c.scenes[+el.dataset.k].question;
          window.Quiz.renderItem(el, q, { mode: 'practice' }, () => { });
          el.insertAdjacentHTML('beforeend', `<div class="answer-key"><small>${esc(q.id)}・${esc(window.Quiz.typeName(q.type))}</small>${answerKey(q)}</div>`);
        });
      }));
    };

    const draw = () => {
      const P = SUBJ[filter.subj].parent;
      if (filter.kind === 'story' && P.stories) return drawStories(P);
      const qs = P.questions();
      const groups = [...new Set(qs.map(P.groupOf))];
      const list = qs.filter(q => (!filter.status || st(q) === filter.status) && (!filter.group || P.groupOf(q) === filter.group));
      const n = s => qs.filter(q => st(q) === s).length;
      body.innerHTML = `${subjNav()}${kindNav(P)}
        <div class="rfilter">
          <select id="fs"><option value="">全部狀態</option>${['待審', '確認', '退回'].map(s => `<option ${filter.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <select id="fu"><option value="">${filter.subj === 'history' ? '全部時代' : '全部單元'}</option>${groups.map(u => `<option ${filter.group === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
          <span>待審 ${n('待審')}・確認 ${n('確認')}・退回 ${n('退回')}</span></div>
        <div class="row batch"><label><input type="checkbox" id="all"> 全選這頁</label><button class="primary" id="bok">勾選的確認</button><button class="ghost" id="bno">勾選的退回</button></div>
        <div class="row"><button class="ghost" id="rexp">匯出審題結果</button><button class="ghost" id="rimp">匯入審題結果</button></div>
        <p class="hint">審題結果存在這台裝置（地理、歷史都在同一個檔案）。若孩子用別台裝置，請匯出後在那台匯入，或把檔案交給 Claude 寫回題庫。</p>
        <div class="rlist">${list.map(q => `<details class="rq s-${st(q)}"><summary><input type="checkbox" class="sel" data-id="${q.id}"> <b>${esc(q.id)}</b> <span class="tag">${esc(st(q))}</span>${S().review[q.id] && S().review[q.id].flag ? '<span class="tag flag">已標記問題</span>' : ''} ${esc(q.stem.slice(0, 40))}…</summary>
          <div class="rmeta">${P.metaHTML(q)}<br>題型：${esc(window.Quiz.typeName(q.type))}｜依據：${esc(q.source)}</div>
          <div class="rpreview" data-id="${q.id}"></div>
          <div class="row"><button class="primary one" data-id="${q.id}" data-s="確認">確認</button><button class="ghost one" data-id="${q.id}" data-s="退回">退回</button><button class="ghost flagbtn" data-id="${q.id}">標記問題（立即下架）</button></div>
          ${S().review[q.id] && S().review[q.id].note ? `<p class="note">備註：${esc(S().review[q.id].note)}</p>` : ''}</details>`).join('') || `<p class="empty">${qs.length ? '沒有符合的題目。' : `${subjName(filter.subj)}目前還沒有題目。`}</p>`}</div>`;
      bindNav();
      body.querySelector('#fs').onchange = e => { filter.status = e.target.value; draw(); };
      body.querySelector('#fu').onchange = e => { filter.group = e.target.value; draw(); };
      body.querySelector('#all').onchange = e => body.querySelectorAll('.sel').forEach(c => c.checked = e.target.checked);
      const batch = s => { body.querySelectorAll('.sel:checked').forEach(c => window.Store.setReview(c.dataset.id, { status: s })); draw(); };
      body.querySelector('#bok').onclick = () => batch('確認');
      body.querySelector('#bno').onclick = () => batch('退回');
      body.querySelector('#rexp').onclick = () => download(`社會科闖關審題結果_${today()}.json`, window.Store.exportReview());
      body.querySelector('#rimp').onclick = () => pickFile(o => { try { alert(window.Store.importFile(o)); draw(); } catch (e) { alert(e.message); } });
      body.querySelectorAll('.one').forEach(b => b.onclick = () => { window.Store.setReview(b.dataset.id, { status: b.dataset.s }); draw(); });
      body.querySelectorAll('.flagbtn').forEach(b => b.onclick = () => {
        const note = prompt('這題有什麼問題？（會一起存下來，方便修正）', '');
        if (note === null) return;
        window.Store.setReview(b.dataset.id, { status: '退回', flag: true, note });
        draw();
      });
      // 展開時才預覽題目（含答案與解析）
      body.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
        const box = d.querySelector('.rpreview');
        if (!d.open || box.dataset.done) return;
        box.dataset.done = '1';
        const q = qs.find(x => x.id === box.dataset.id);
        window.Quiz.renderItem(box, q, { mode: 'practice' }, () => { });
        box.insertAdjacentHTML('beforeend', `<div class="answer-key">${answerKey(q)}</div>`);
      }));
    };
    draw();
  }

  function answerKey(q) {
    const opt = o => typeof o === 'string' ? o : (o.text || '（圖）');
    if (window.Quiz.ANSWER_TEXT[q.type]) return `<p><b>答案：</b>${window.Quiz.ANSWER_TEXT[q.type](q)}<br>${esc(q.explain || '')}</p>`;
    if (q.parts) return q.parts.map((p, k) => `<p><b>第${k + 1}小題答案：</b>${esc(opt(p.options[p.answer]))}<br>${esc(p.explain)}</p>`).join('');
    if (q.type === 'order') return `<p><b>答案：</b>${esc(q.answer.map(i => q.items[i]).join(' → '))}<br>${esc(q.explain)}</p>`;
    if (q.type === 'match') return `<p><b>答案：</b>${esc(q.left.map((l, i) => `${l} → ${q.right[q.answer[i]]}`).join('；'))}<br>${esc(q.explain)}</p>`;
    return `<p><b>答案：</b>${esc(opt(q.options[q.answer]))}<br>${esc(q.explain)}</p>`;
  }

  window.Parent = { view };
})();
