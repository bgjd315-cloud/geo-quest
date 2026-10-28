#!/usr/bin/env node
// 打包成單一 HTML 檔（dist/index.html）：CSS、JS、兩科資料檔、插畫全部內嵌，離線雙擊就能開。
// 題庫檢查沒過就停止，不會產生檔案。
// 用法：node scripts/build.js
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate.js');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

if (!validate()) { console.error('\n建置中止：請先修正題庫錯誤。'); process.exit(1); }

const man = JSON.parse(read('data/manifest.json'));
const data = { 'manifest.json': man };
for (const rel of [].concat(man.core, man.figures, man.cards, man.questions)) data[rel] = JSON.parse(read('data/' + rel));
// 歷史：data/history/ 底下的檔案，鍵名加上 history/
const hman = JSON.parse(read('data/history/manifest.json'));
data['history/manifest.json'] = hman;
for (const rel of [].concat(hman.events, hman.cards || [], hman.questions || [], hman.stories || [])) data['history/' + rel] = JSON.parse(read('data/history/' + rel));

// 插畫：地理 assets/web、歷史 assets/history/web；檔名不可重複
const images = {};
for (const dir of ['assets/web', 'assets/history/web']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.webp'))) {
    const name = f.replace(/\.webp$/, '');
    if (images[name]) { console.error(`插畫檔名重複：${dir}/${f}`); process.exit(1); }
    images[name] = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, dir, f)).toString('base64');
  }
}

// JSON 內嵌到 <script> 時，避免出現 </script>
const safe = o => JSON.stringify(o).replace(/</g, '\\u003c');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}\n</style>`);
html = html.replace('<!--DATA-->', () => `<script>window.GEO_DATA=${safe(data)};window.GEO_IMAGES=${safe(images)};window.GEO_BUILD=${safe(new Date().toISOString())};</script>`);
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${read(p)}\n</script>`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist/index.html');
fs.writeFileSync(out, html);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\n已產生 dist/index.html（${mb} MB）：可直接雙擊開啟，也可以部署到 GitHub Pages。`);
