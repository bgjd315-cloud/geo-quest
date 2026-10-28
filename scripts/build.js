#!/usr/bin/env node
// 打包成單一 HTML 檔（dist/index.html）：CSS、JS、資料檔、插畫全部內嵌，離線雙擊就能開。
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

const images = {};
const imgDir = path.join(ROOT, 'assets/web');
for (const f of fs.readdirSync(imgDir).filter(f => f.endsWith('.webp'))) {
  images[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(imgDir, f)).toString('base64');
}

// JSON 內嵌到 <script> 時，避免出現 </script>
const safe = o => JSON.stringify(o).replace(/</g, '\\u003c');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="src/styles.css">', () => `<style>\n${read('src/styles.css')}\n</style>`);
html = html.replace('<!--DATA-->', () => `<script>window.GEO_DATA=${safe(data)};window.GEO_IMAGES=${safe(images)};window.GEO_BUILD=${safe(new Date().toISOString())};</script>`);
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${read(p)}\n</script>`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist/index.html');
fs.writeFileSync(out, html);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\n已產生 dist/index.html（${mb} MB）：可直接雙擊開啟，也可以部署到 GitHub Pages。`);
