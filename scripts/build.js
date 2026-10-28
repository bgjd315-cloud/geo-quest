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

data['history/kp.json'] = JSON.parse(read('data/history/kp.json'));
// 會考真題：data/exam/manifest.json 列出的年度檔；還不存在的先略過（警告），網站會顯示「資料準備中」
const xman = JSON.parse(read('data/exam/manifest.json'));
data['exam/manifest.json'] = xman;
for (const rel of xman.files || []) {
  if (!fs.existsSync(path.join(ROOT, 'data/exam', rel))) { console.warn(`⚠ 會考真題 data/exam/${rel} 還不存在，先略過`); continue; }
  data['exam/' + rel] = JSON.parse(read('data/exam/' + rel));
}

// 插畫：地理 assets/web、歷史 assets/history/web；檔名不可重複
const images = {};
for (const dir of ['assets/web', 'assets/history/web']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.webp'))) {
    const name = f.replace(/\.webp$/, '');
    if (images[name]) { console.error(`插畫檔名重複：${dir}/${f}`); process.exit(1); }
    images[name] = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, dir, f)).toString('base64');
  }
}

// 會考題目截圖（assets/exam/<年>/*.webp）：只收資料檔有引用的圖。
// 全部內嵌後若超過 25 MB，改成不內嵌：dist/index.html 用相對路徑 ../assets/exam/… 讀圖
// （GitHub Pages 上 dist/ 和 assets/ 都在 repo 根目錄底下；本機雙擊 dist/index.html 也一樣讀得到）。
const LIMIT = 25 * 1024 * 1024;
const examImgs = new Set();
for (const [k, f] of Object.entries(data)) if (/^exam\/\d+\.json$/.test(k)) {
  for (const g of f.groups || []) if (g.img) examImgs.add(g.img);
  for (const it of f.items || []) if (it.img) examImgs.add(it.img);
}
const missingImg = [...examImgs].filter(p => !fs.existsSync(path.join(ROOT, p)));
if (missingImg.length) console.warn(`⚠ 會考題目圖片缺 ${missingImg.length} 張：${missingImg.slice(0, 5).join('、')}`);
const imgBytes = [...examImgs].filter(p => fs.existsSync(path.join(ROOT, p))).reduce((s, p) => s + fs.statSync(path.join(ROOT, p)).size, 0);
const baseBytes = Buffer.byteLength(JSON.stringify(data)) + Buffer.byteLength(JSON.stringify(images)) + 400 * 1024;
const embedExam = process.argv.includes('--embed-exam') || (!process.argv.includes('--link-exam') && baseBytes + Math.ceil(imgBytes * 4 / 3) < LIMIT);
const examImages = {};
if (embedExam) for (const p of examImgs) if (fs.existsSync(path.join(ROOT, p))) examImages[p] = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, p)).toString('base64');

// JSON 內嵌到 <script> 時，避免出現 </script>
const safe = o => JSON.stringify(o).replace(/</g, '\\u003c');
const tpl = read('dev.html');   // 開發版頁面（逐檔載入 src/ 與 data/）當模板

// 程式：照 dev.html 的順序串成一支，再用 esbuild 轉成舊版 Safari（iOS 12 起）也看得懂的寫法
const srcs = [...tpl.matchAll(/<script src="(src\/[^"]+)"><\/script>/g)].map(m => m[1]);
const { execFileSync } = require('child_process');
const js = execFileSync('npx', ['--yes', 'esbuild@0.24.0', '--target=safari12', '--loader=js', '--charset=utf8', '--log-level=error'],
  { input: srcs.map(p => `// ${p}\n${read(p)}`).join(';\n'), encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 }).replace(/<\/script/gi, '<\\/script');

function page(dataScript) {
  let html = tpl.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}\n</style>`);
  html = html.replace('<!--DATA-->', () => `<script>${dataScript}</script>`);
  let first = true;   // 第一支 <script src> 換成整包程式，其餘刪掉
  return html.replace(/<script src="(src\/[^"]+)"><\/script>\n?/g, () => first ? (first = false, `<script>\n${js}\n</script>\n`) : '');
}
const stamp = `window.GEO_BUILD=${safe(new Date().toISOString())};`;
const report = f => (fs.statSync(path.join(ROOT, f)).size / 1024 / 1024).toFixed(2);

// 1. 網站首頁 index.html（GitHub Pages）：資料內嵌，不必再逐檔下載；插畫與會考截圖照常從 assets/ 讀
fs.writeFileSync(path.join(ROOT, 'index.html'), page(`window.GEO_DATA=${safe(data)};${stamp}window.GEO_EXAM_BASE='';`));
// 2. 單一 HTML 檔 dist/index.html：連插畫也內嵌，離線雙擊就能開
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/index.html'), page(`window.GEO_DATA=${safe(data)};window.GEO_IMAGES=${safe(images)};${stamp}${embedExam ? `window.GEO_EXAM_IMAGES=${safe(examImages)};` : `window.GEO_EXAM_BASE='../';`}`));
console.log(`\n已產生網站首頁 index.html（${report('index.html')} MB）與單一 HTML 檔 dist/index.html（${report('dist/index.html')} MB）。`);
console.log('開發時用本機伺服器開 dev.html（逐檔讀 src/ 與 data/，改了不必重新打包）。');
console.log(embedExam ? `會考題目圖片 ${examImgs.size} 張已內嵌。` : `會考題目圖片 ${examImgs.size} 張（${(imgBytes / 1024 / 1024).toFixed(1)} MB）沒有內嵌：dist/index.html 從 ../assets/exam/ 讀圖，部署時 assets/exam/ 要一起進 git。`);
