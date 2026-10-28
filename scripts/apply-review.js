#!/usr/bin/env node
// 把家長頁「匯出審題結果」的 JSON 寫回題庫檔（只改 status，標記問題的備註另存成 review_note）。
// 用法：node scripts/apply-review.js <審題結果.json>
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('用法：node scripts/apply-review.js <審題結果.json>'); process.exit(1); }
const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
if (exp.type !== 'geo-quest-review') { console.error('這不是審題結果檔'); process.exit(1); }

const DATA = path.join(__dirname, '..', 'data');
const man = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const count = { 確認: 0, 退回: 0, 待審: 0 }, flagged = [];
const seen = new Set();
for (const rel of man.questions) {
  const p = path.join(DATA, rel);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  for (const q of d.questions) {
    const r = exp.review[q.id];
    if (!r) continue;
    seen.add(q.id);
    if (r.status && r.status !== q.status) { q.status = r.status; changed = true; }
    if (r.flag) { q.review_note = r.note || '（家長標記有問題，未附說明）'; flagged.push(`${q.id}：${q.review_note}`); changed = true; }
    count[q.status] = (count[q.status] || 0) + 1;
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
}
const missing = Object.keys(exp.review).filter(id => !seen.has(id));
console.log(`已寫回：確認 ${count['確認']}、退回 ${count['退回']}、待審 ${count['待審']}`);
if (flagged.length) console.log('家長標記的問題：\n  ' + flagged.join('\n  '));
if (missing.length) console.log('題庫裡找不到這些題號（可能已刪除）：' + missing.join('、'));
