// 地理資料載入：data/manifest.json 列出的所有檔案 → window.Data。
(function () {
  const Data = { files: {} };
  Data.load = async function () {
    const get = window.Loader.get;
    const man = await get('manifest.json');
    const all = [].concat(man.core, man.figures, man.cards, man.questions);
    await Promise.all(all.map(async p => { Data.files[p] = await get(p); }));
    Data.manifest = man;
    Data.concepts = Data.files['concepts.json'];
    Data.regions = Data.files['regions.json'].regions;
    Data.units = Data.files['units.json'].units;
    Data.conceptName = {};
    Data.conceptUnit = {};
    for (const u of Data.concepts.units) for (const c of u.concepts) { Data.conceptName[c.id] = c.name; Data.conceptUnit[c.id] = u.id; }
    Data.cards = {};
    for (const p of man.cards) Object.assign(Data.cards, Data.files[p].cards);
    Data.questions = [];
    for (const p of man.questions) for (const q of Data.files[p].questions) Data.questions.push(Object.assign({ _file: p }, q));
    Data.byId = Object.fromEntries(Data.questions.map(q => [q.id, q]));
    Data.images = window.GEO_IMAGES || null;
    return Data;
  };
  Data.img = name => window.Loader.img(name, 'assets/web/');
  Data.status = q => window.Loader.status(q);
  Data.live = function () { return Data.questions.filter(q => Data.status(q) === '確認'); };

  window.Data = Data;
})();
