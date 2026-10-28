// 公民資料載入：data/civics/manifest.json → window.CData（領域、單元、概念、混淆對、角色、概念卡、題目、案件、魔王題組、故事）。
// 內容由多位寫手分檔撰寫：manifest 列出但還讀不到的檔案一律略過（主控台警告），其他功能照常。
// 家長 115/10/29 決定公民內容直接上線：沒寫 status 的題目與章節一律當「確認」。
(function () {
  const CData = { units: [], unitById: {}, concepts: {}, conceptName: {}, conceptUnit: {}, pairs: [], pairById: {}, characters: [], charById: {},
    cards: {}, questions: [], byId: {}, cases: [], bosses: [], chapters: [], chapterById: {}, storyQById: {}, missing: [], error: null };
  const DOMAINS = ['社會', '政治', '法律', '經濟', '全球關聯'];
  const DOMAIN_KEY = { 社會: 'society', 政治: 'politics', 法律: 'law', 經濟: 'economy', 全球關聯: 'global' };
  const SKILLS = ['概念辨析', '規範判斷', '經濟推理', '圖表判讀', '觀點評估'];
  CData.DOMAINS = DOMAINS; CData.DOMAIN_KEY = DOMAIN_KEY; CData.SKILLS = SKILLS;
  CData.domainOfKey = k => DOMAINS.find(d => DOMAIN_KEY[d] === k) || null;
  const list = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
  CData.list = list;

  // ---------- 題型 ----------
  // 寫手可能用英文或中文寫 type；統一成網站內部的名稱
  const TYPE_ALIAS = {
    single: 'single', choice: 'single', 單選: 'single', 單選題: 'single',
    scenario: 'scenario', situation: 'scenario', judge: 'scenario', 情境判斷: 'scenario',
    order: 'order', sequence: 'order', process: 'order', 流程排序: 'order', 排序: 'order',
    contrast: 'contrast', pair: 'contrast', compare: 'contrast', twin: 'contrast', 並排辨析: 'contrast',
    price: 'price', direction: 'price', 'price-quantity': 'price', supply: 'price', 價格與數量判斷: 'price', 價格數量判斷: 'price', 供需: 'price',
    calc: 'calc', calculation: 'calc', compute: 'calc', 計算題: 'calc', 計算: 'calc',
    myth: 'myth', misconception: 'myth', 迷思糾錯: 'myth',
    view: 'view', viewpoint: 'view', argument: 'view', evaluate: 'view', 觀點評估: 'view',
    match: 'match', 配對: 'match', chain: 'chain', 題組: 'chain', boss: 'chain'
  };
  CData.TYPE_NAME = { single: '單選題', scenario: '情境判斷', order: '流程排序', contrast: '並排辨析', price: '價格與數量判斷', calc: '計算題', myth: '迷思糾錯', view: '觀點評估', match: '配對', chain: '題組', case: '案件分流', boss: '跨冊魔王題組' };
  function normType(q) {
    const t = TYPE_ALIAS[q.type] || TYPE_ALIAS[q.format] || TYPE_ALIAS[q.kind] || null;
    if (t) return t;
    if (Array.isArray(q.parts) || Array.isArray(q.cases)) return 'chain';
    if (Array.isArray(q.items) && Array.isArray(q.answer)) return 'order';
    return 'single';
  }
  CData.normType = normType;
  // 選項可以是字串或 {text, concept, correct, feedback}；統一成字串陣列，另存每個選項對應的概念（混淆紀錄用）
  function normOptions(q) {
    if (!Array.isArray(q.options)) return;
    const objs = q.options.some(o => o && typeof o === 'object' && !o.figure);
    if (objs) {
      const oc = q.options.map(o => (o && (o.concept || o.conceptId)) || null);
      if (!q.optionConcepts && oc.some(Boolean)) q.optionConcepts = oc;
      const fb = q.options.map(o => (o && o.feedback) || null);
      if (fb.some(Boolean)) q.optionFeedback = fb;
      if (!Number.isInteger(q.answer)) { const k = q.options.findIndex(o => o && o.correct === true); if (k >= 0) q.answer = k; }
      q.options = q.options.map(o => typeof o === 'string' ? o : (o.text || ''));
    }
    // 答案寫成選項文字時，換成索引
    if (typeof q.answer === 'string' && q.type !== 'calc') { const k = q.options.indexOf(q.answer); if (k >= 0) q.answer = k; }
  }
  // 一題（含小題）正規化：type、選項、小題；cases（並排辨析的兩個小情境）視為 parts
  function normQ(raw, extra) {
    const q = Object.assign({}, extra, raw);
    q._civ = true;
    q._rawType = raw.type;
    if (!q.parts && Array.isArray(q.cases)) q.parts = q.cases;
    q.type = normType(q);
    q.concepts = list(q.concepts);
    q.skill = list(q.skill);
    q.legalRefs = list(q.legalRefs).map(refOf);
    if (!q.source) q.source = q.unit ? '課本：康軒國中公民 ' + q.unit : '課本：康軒國中公民';
    q.stem = q.stem || q.question || q.situation || q.scenario || q.text || '';
    q.explain = q.explain || q.explanation || q.analysis || '';
    normOptions(q);
    if (Array.isArray(q.parts)) q.parts = q.parts.map(p => { const r = normQ(p, { domain: q.domain, book: q.book, unit: q.unit, concepts: p.concepts || q.concepts, confusablePair: p.confusablePair || q.confusablePair }); delete r._civ; return r; });
    return q;
  }
  CData.normQ = normQ;

  CData.load = async function () {
    const get = p => window.Loader.get('civics/' + p);
    const soft = p => get(p).catch(() => { CData.missing.push(p); return null; });
    const man = await get('manifest.json');
    CData.manifest = man;
    const [cf, pf, chf] = await Promise.all([soft(man.concepts || 'concepts.json'), soft(man.pairs || 'pairs.json'), soft(man.characters || 'characters.json')]);
    CData.units = (cf && cf.units) || [];
    CData.unitById = {}; CData.concepts = {}; CData.conceptName = {}; CData.conceptUnit = {};
    for (const u of CData.units) {
      CData.unitById[u.id] = u;
      for (const c of u.concepts || []) { CData.concepts[c.id] = c; CData.conceptName[c.id] = c.name; CData.conceptUnit[c.id] = u.id; }
    }
    CData.pairs = (pf && pf.pairs) || [];
    CData.pairById = Object.fromEntries(CData.pairs.map(p => [p.id, p]));
    CData.notice = (chf && chf.notice) || '故事人物為虛構';
    CData.setting = (chf && chf.setting) || '青禾里（虛構社區）';
    CData.characters = (chf && chf.characters) || [];
    CData.charById = Object.fromEntries(CData.characters.map(c => [c.id, c]));
    // 角色也可以用名字找（故事檔可能寫「陳伯伯」而不是 chenbobo）
    for (const c of CData.characters) { CData.charById[c.name] = CData.charById[c.name] || c; if (c.fullName) CData.charById[c.fullName] = CData.charById[c.fullName] || c; }

    const [cardFiles, qFiles, sFiles] = await Promise.all([
      Promise.all((man.cards || []).map(soft)),
      Promise.all((man.questions || []).map(p => soft(p).then(f => ({ p, f })))),
      Promise.all((man.stories || []).map(p => soft(p).then(f => ({ p, f }))))
    ]);
    CData.cards = Object.assign({}, ...cardFiles.map(f => (f && f.cards) || {}));
    CData.questions = []; CData.cases = []; CData.bosses = [];
    for (const { p, f } of qFiles) {
      if (!f) continue;
      const file = 'civics/' + p;
      if (/cases\.json$/.test(p)) { for (const c of f.cases || f.questions || []) if (c && c.id) CData.cases.push(normCase(c, file)); continue; }
      const isBoss = /boss[^/]*\.json$/.test(p);   // boss-b1.json … boss-b6.json（舊名 boss.json 也可）
      for (const raw of f.questions || f.groups || f.bosses || []) {
        if (!raw || !raw.id) continue;
        const q = normQ(raw, { status: '確認', book: f.book });
        q._file = file;
        if (isBoss) {
          q._boss = true;
          // level 寫成 boss-<領域>（中文或英文代號）；跨領域的另列 domains
          const lv = String(raw.level || '').replace(/^boss-/, '');
          const lvd = DOMAINS.includes(lv) ? lv : CData.domainOfKey(lv);
          // 主領域 domain（或 level）＋相關領域 relatedDomains → domains（跨領域題組）
          const prim = q.domain || lvd || list(q.domains)[0];
          q.domains = [...new Set([prim].concat(list(q.domains), list(q.relatedDomains)).filter(d => DOMAINS.includes(d)))];
          q.domain = prim;
          q.level = (DOMAIN_KEY[q.domain] || 'x') + '-boss';
          q.unitLabel = '跨冊魔王題組・' + q.domains.join('＋');
          if (q.type === 'single' && q.parts) q.type = 'chain';
          CData.bosses.push(q);
        } else {
          q.level = q.level || q.unit;
          q.unitLabel = CData.unitShort(q.unit);
          CData.questions.push(q);
        }
      }
    }
    CData.byId = Object.fromEntries(CData.questions.concat(CData.bosses).map(q => [q.id, q]));
    loadStories(sFiles);
    if (CData.missing.length) console.warn(`公民資料檔還沒準備好，先略過 ${CData.missing.length} 個：${CData.missing.join('、')}`);
    return CData;
  };

  // ---------- 案件分流挑戰（questions/cases.json） ----------
  // 每個案件：情境 → 事件類型（民事／刑事／行政）→ 救濟途徑；欄位名稱寫手可能不同，這裡統一
  const KINDS = ['民事', '刑事', '行政'];
  CData.CASE_KINDS = KINDS;
  function normCase(c, file) {
    const x = Object.assign({}, c, { _file: file, status: c.status || '確認' });
    x.text = c.text || c.situation || c.scenario || c.stem || c.case || '';
    let kind = c.eventType || c.caseType || c.kind || c.category || (KINDS.includes(c.type) ? c.type : null);
    if (kind && typeof kind === 'object' && !Array.isArray(kind)) kind = kind.answer;
    x.kind = list(kind).map(k => String(k).replace(/事件|案件/g, '')).filter(k => KINDS.includes(k));
    if (!x.kind.length && Array.isArray(c.kindOptions) && Number.isInteger(c.kindAnswer)) x.kind = [c.kindOptions[c.kindAnswer]];
    const r = c.remedy && typeof c.remedy === 'object' && !Array.isArray(c.remedy) ? c.remedy : null;
    x.options = (r && r.options) || c.remedyOptions || c.options || [];
    x.options = x.options.map(o => typeof o === 'string' ? o : (o.text || ''));
    let ans = r ? (r.answer != null ? r.answer : r.correct) : (c.remedyAnswer != null ? c.remedyAnswer : c.answer);
    if (typeof ans === 'string') ans = x.options.indexOf(ans);
    if (!Number.isInteger(ans) && typeof c.remedy === 'string') ans = x.options.indexOf(c.remedy);
    x.answer = Number.isInteger(ans) ? ans : -1;
    x.authority = c.authority || c.agency || c.competentAuthority || '';
    x.explain = c.explain || c.explanation || '';
    x.legalRefs = list(c.legalRefs);
    x.concepts = list(c.concepts);
    x.domain = c.domain || '法律';
    return x;
  }

  // ---------- 故事（stories/<domain>/<unit>.json，一檔一章） ----------
  const paraList = v => Array.isArray(v) ? v.map(p => typeof p === 'string' ? p : (p && (p.text || p.p)) || '').filter(Boolean)
    : String(v || '').split(/\n+/).map(t => t.trim()).filter(Boolean);
  CData.paraList = paraList;
  function loadStories(files) {
    CData.chapters = []; CData.chapterById = {}; CData.storyQById = {};
    for (const { p, f } of files) {
      if (!f) continue;
      const file = 'civics/' + p;
      // 一檔一章；也接受 {chapters:[…]}
      const raws = Array.isArray(f.chapters) ? f.chapters : [f.chapter || f];
      for (const raw of raws) {
        if (!raw || !raw.id || CData.chapterById[raw.id]) continue;
        const ch = Object.assign({ status: '確認' }, raw, { _file: file });
        ch.unit = ch.unit || (CData.unitById[ch.id] ? ch.id : null);
        const u = CData.unitById[ch.unit] || {};
        ch.domain = ch.domain || u.domain;
        ch.book = ch.book || u.book;
        ch.concepts = list(ch.concepts);
        ch.skills = list(ch.skills || ch.skill);
        ch.characters = list(ch.characters);
        ch.paragraphs = paraList(ch.paragraphs || ch.opening);
        ch.judgments = list(ch.judgment || ch.judgments).map(normJudgment).filter(Boolean);
        // 嵌入題：{lead 前導段落, question 題目, after 答對後的段落}；也接受直接放題目
        ch.scenes = list(ch.questions).map((s, k) => {
          const raw = s && s.question && typeof s.question === 'object' ? s.question : s;
          const id = raw.id || `cs-${ch.id}-${k + 1}`;
          const n = normQ(Object.assign({}, raw, { id }), { status: '確認', domain: ch.domain, book: ch.book, unit: ch.unit, concepts: raw.concepts || ch.concepts, skill: raw.skill || ch.skills[0] });
          n._story = ch.id; n._file = file; n.level = 'story-' + ch.id; n.unitLabel = '故事・' + (ch.title || ch.id);
          CData.storyQById[n.id] = n;
          return { lead: paraList(s.lead || s.before || ''), after: paraList(s.after || ''), question: n };
        });
        ch.questions = ch.scenes.map(x => x.question);
        ch.comparison = ch.comparison && typeof ch.comparison === 'object' ? ch.comparison : null;
        ch.misconception = normMyth(ch.misconception, ch);
        ch.legalRefs = list(ch.legalRefs).map(refOf);
        ch.caseCard = ch.caseCard || null;
        ch.fictionNotes = list(ch.fictionNotes);
        CData.chapters.push(ch);
        CData.chapterById[ch.id] = ch;
      }
    }
    const order = id => { const i = CData.units.findIndex(u => u.id === id); return i < 0 ? 999 : i; };
    CData.chapters.sort((a, b) => order(a.unit) - order(b.unit));
  }
  // 法條：字串「民法第12條」或 {law, article, point, textbook}
  function refOf(r) {
    if (typeof r === 'string') return { ref: r, law: r.replace(/第.*$/, ''), article: (r.match(/第.*$/) || [''])[0] };
    return Object.assign({}, r, { ref: r.ref || ((r.law || r.name || '') + (r.article || '')) });
  }
  CData.refOf = refOf;
  CData.refText = r => refOf(r).ref;
  // 判斷點：{prompt, options:[{text, correct, feedback}] 或字串＋answer, explain}
  function normJudgment(j) {
    if (!j || typeof j !== 'object') return null;
    const o = Object.assign({}, j);
    o.prompt = j.prompt || j.stem || j.question || j.situation || '';
    o.context = j.context || j.text || j.scene || '';
    let opts = j.options || j.choices || [];
    let ans = Number.isInteger(j.answer) ? j.answer : opts.findIndex(x => x && x.correct === true);
    o.options = opts.map((x, i) => typeof x === 'string' ? { text: x, correct: i === ans } : Object.assign({}, x, { text: x.text || x.label || '', correct: x.correct === true || i === ans }));
    o.explain = j.explain || j.analysis || j.explanation || j.reason || '';
    o.basis = j.basis || '';
    o.legalRefs = list(j.legalRefs).map(refOf);
    o.concepts = list(j.concepts);
    return o;
  }
  // 迷思糾錯：說話角色、迷思句、正確說法、依據；選項（有的話）讓學生選「哪裡錯／正確說法」
  function normMyth(m, ch) {
    if (!m || typeof m !== 'object') return null;
    const o = Object.assign({}, m);
    o.speaker = m.speaker || m.character || m.by || '';
    o.quote = m.quote || m.statement || m.text || m.line || m.myth || '';
    o.correction = m.correction || m.correct || m.right || m.truth || '';
    o.basis = m.basis || m.source || m.reference || '';
    o.wrong = m.wrong || m.error || m.whatIsWrong || m.wrongPoint || '';
    // 兩步驟：先選哪裡錯（wrongOptions），再選正確說法（options）
    const step = (opts, ans) => {
      if (!Array.isArray(opts) || !opts.length) return null;
      if (!Number.isInteger(ans)) ans = opts.findIndex(x => x && x.correct === true);
      return { options: opts.map(x => typeof x === 'string' ? x : (x.text || '')), answer: ans, feedback: opts.map(x => (x && x.feedback) || '') };
    };
    o.pickWrong = step(m.wrongOptions || m.errorOptions || (m.pickWrong && m.pickWrong.options), m.wrongAnswer != null ? m.wrongAnswer : m.pickWrong && m.pickWrong.answer);
    o.pickRight = step(m.options || m.correctOptions || m.choices || (m.pickRight && m.pickRight.options), m.answer != null ? m.answer : m.correctAnswer != null ? m.correctAnswer : m.pickRight && m.pickRight.answer);
    o.explain = m.explain || m.explanation || '';
    o.prompt = m.prompt || '';
    o.lead = paraList(m.lead || '');
    o.after = paraList(m.after || '');
    o.concepts = list(m.concepts);
    o._ch = ch.id;
    return o;
  }

  // ---------- 查詢 ----------
  CData.storyKey = id => 'cstory:' + id;
  CData.status = q => window.Loader.status(q);
  CData.chapterStatus = ch => window.Loader.status({ id: CData.storyKey(ch.id), status: ch.status || '確認' });
  // 家長 115/10/29：公民內容直接上線，不等審題；只有家長在家長頁「下架／標記問題」（退回）的才不出現
  const isLive = st => st !== '退回';
  CData.isLive = isLive;
  CData.chapterPlayable = ch => isLive(CData.chapterStatus(ch));
  CData.live = () => CData.questions.filter(q => isLive(CData.status(q)));
  CData.liveOfUnit = id => CData.live().filter(q => q.unit === id);
  CData.liveBoss = () => CData.bosses.filter(q => isLive(CData.status(q)));
  CData.liveCases = () => CData.cases.filter(c => isLive(CData.status(c)));
  CData.anyQ = id => CData.byId[id] || CData.storyQById[id] || CData.cases.find(c => c.id === id);
  CData.unitsOfDomain = d => CData.units.filter(u => u.domain === d);
  CData.chapterOfUnit = id => CData.chapters.find(c => c.unit === id) || null;
  CData.charOf = k => CData.charById[k] || null;
  CData.charName = k => (CData.charById[k] || { name: k }).name;
  CData.unitLabel = id => { const u = CData.unitById[id]; return u ? `${u.volume} ${u.lesson}・${u.title}` : (id || '公民'); };
  CData.unitShort = id => { const u = CData.unitById[id]; return u ? `${u.volume}・${u.title}` : (id || '公民'); };
  CData.pairsOfConcepts = cs => CData.pairs.filter(p => p.concepts.some(c => cs.includes(c)));
  CData.pairLabel = id => { const p = CData.pairById[id]; return p ? p.labels.join('／') : id; };

  // ---------- 插畫（家長在 Gemini App 生圖；沒有的圖用色塊與文字替代） ----------
  // 單一 HTML 版：GEO_IMAGES；網站首頁：build.js 寫入 GEO_CIVICS_IMGS（實際存在的檔名）；開發版：直接讀，讀不到就隱藏
  // 確定存在才回傳（答題引擎的嚮導圖用；沒有就用程式畫的頭像）
  CData.imgKnown = name => {
    if (window.GEO_IMAGES) return window.GEO_IMAGES[name] || '';
    if (Array.isArray(window.GEO_CIVICS_IMGS)) return window.GEO_CIVICS_IMGS.includes(name) ? 'assets/civics/web/' + name + '.webp' : '';
    return '';
  };
  CData.imgSrc = name => {
    if (window.GEO_IMAGES) return window.GEO_IMAGES[name] || '';
    if (Array.isArray(window.GEO_CIVICS_IMGS) && !window.GEO_CIVICS_IMGS.includes(name)) return '';
    return 'assets/civics/web/' + name + '.webp';
  };

  window.CData = CData;
})();
