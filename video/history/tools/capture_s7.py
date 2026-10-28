# 只重截 S7（闖關：答錯 → 解析 → 館藏卡 → 錯題回收）。其餘同 capture_history.py。
# -*- coding: utf-8 -*-
"""時光檔案館介紹片：從本機網站截真實手機畫面（390×844 @2x），並記錄點擊目標座標。
複製自 video/tools/capture_screens.py 改寫（原檔不動）。
先在 D:\\geo-quest 執行 python -m http.server 8802 --bind 127.0.0.1"""
import json, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "assets", "screens")
URL = "http://127.0.0.1:8802/dist/index.html"
PW = "7315"  # 截圖用瀏覽器裡的家長頁測試密碼（只存在這個暫時的瀏覽器）

# 假的作答紀錄：讓長廊狀態、出題率、診斷、家長頁、收藏冊有內容
SEED = """
(() => {
  const H = window.HData, X = window.XData;
  const t0 = 1793100000000;
  const s = JSON.parse(localStorage.getItem('geoquest.v1') || '{}');
  s.v = 1; s.subject = 'history'; s.review = s.review || {};
  const h = { hero: 'girl', introSeen: true, log: [], levels: {}, recycle: {}, stories: {}, cards: [] };
  const eras = ['tw-pre', 'tw-sea', 'tw-qing', 'tw-jp', 'ea-zhou', 'ea-qinhan', 'w-ancient', 'w-greek'];
  let k = 0;
  for (const q of H.live()) {
    const ei = H.eras.findIndex(e => e.id === q.era);
    if (ei < 0 || ei > 15) continue;
    if (k % 3 === 2 && ei > 8) { k++; continue; }
    const ok = (k % 5) !== 0;
    h.log.push({ q: q.id, ok, c: q.concepts, m: 'practice', ts: t0 + k * 60000 });
    k++;
  }
  for (const e of H.eras.slice(0, 9)) h.levels[e.id] = { done: true, best: 0.8, last: 0.8, total: 10, mode: 'practice', ts: t0 };
  const evs = H.events.filter(e => e.line === 'tw').slice(10, 13).concat(H.events.filter(e => e.line === 'ea').slice(4, 6));
  for (const e of evs) h.recycle[e.id] = { streak: 0, since: t0 };
  for (const id of ['F1', 'F2', 'T1', 'T2', 'I1', 'I2']) {
    const ch = H.chapterById[id]; if (!ch) continue;
    h.stories[id] = { done: true, ts: t0, got: 3, total: 4 };
    for (const e of (ch.unlock && ch.unlock.length ? ch.unlock : ch.eventIds || [])) if (!h.cards.includes(e)) h.cards.push(e);
  }
  s.history = h;
  const x = { log: [], sims: { 113: [{ score: 52, total: 70, ts: t0, secs: 4200 }] }, recycle: {} };
  let j = 0;
  for (const it of X.items) {
    const ok = it.subject === 'hist' ? (j % 3 !== 0) : true;
    x.log.push({ id: it.id, ok, ts: t0 + j * 30000, mode: 'kp', a: ok ? it.answer : (it.answer + 1) % 4 });
    if (!ok) x.recycle[it.id] = { streak: 0, since: t0 };
    j++;
  }
  s.exam = x;
  // 地理也放一點紀錄，家長頁才看得出兩科
  const g = [];
  let m = 0;
  for (const q of window.Data.live().slice(0, 80)) { g.push({ q: q.id, ok: m % 4 !== 0, c: q.concepts, r: q.region, m: 'practice', ts: t0 + m * 50000 }); m++; }
  s.log = g; s.hero = s.hero || 'girl'; s.introSeen = true;
  localStorage.setItem('geoquest.v1', JSON.stringify(s));
})()
"""

taps = {}


def shot(pg, name, wait=500):
    pg.wait_for_timeout(wait)
    pg.screenshot(path=f"{OUT}/{name}.png")
    print("shot", name)


def tap_of(pg, key, sel, fx=0.5, fy=0.5):
    """記下元素在手機畫面上的位置（CSS px，相對於目前視窗）。"""
    r = pg.evaluate("""([sel, fx, fy]) => { const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return null;
      const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; }""", [sel, fx, fy])
    taps[key] = r
    print("tap", key, r)
    return r


def go(pg, h, sel, wait=600):
    pg.evaluate(f"location.hash = '{h}'")
    pg.wait_for_function(f"document.querySelector({json.dumps(sel)})")
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(wait)


def scroll_to(pg, sel, top=90):
    pg.evaluate("""([sel, top]) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - top); }""", [sel, top])
    pg.wait_for_timeout(300)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="light")
        pg.goto(URL + "#/hub")
        pg.wait_for_function("window.HData && HData.questions && HData.questions.length > 600 && window.XData && XData.items.length > 100 && window.Data && Data.questions.length > 400")
        pg.evaluate(SEED)
        pg.goto(URL + "#/hub")
        pg.reload()
        pg.wait_for_function("document.querySelector('.hub-card') && window.HData && HData.chapters && HData.chapters.length")
        pg.wait_for_timeout(1200)
        # 10 闖關：清帝國時期櫃子，答錯 → 館藏卡
        FINDQ = """() => { const it = document.querySelector('.stage .item') || document.querySelector('.stage'); const st = (it.querySelector('.stem') || {}).textContent || '';
          const q = HData.liveOfEra('tw-qing').find(q => q.stem && st.replace(/\s/g, '').startsWith(String(q.stem).replace(/[*_\s]/g, '').slice(0, 12)));
          return q && q.type === 'single' && !q.parts && q.options && q.options.length === 4 && it.querySelectorAll('.opt').length === 4 && st.length < 90 ? q.id : null; }"""
        for attempt in range(40):
            go(pg, "#/h/wing/tw", ".era-list", 200)
            go(pg, "#/h/play/tw-qing/practice", ".stage", 700)
            qid = pg.evaluate(FINDQ)
            if qid:
                break
        print("qid", qid)
        shot(pg, "10_play_q")
        wrong = pg.evaluate("""(qid) => { const q = HData.anyQ(qid); const i = (q.answer + 1) % q.options.length; const el = document.querySelector(`.stage .opt[data-i="${i}"]`); const r = el.getBoundingClientRect(); return [i, r.left + r.width * .35, r.top + r.height / 2]; }""", qid)
        taps["play_wrong"] = wrong[1:]
        pg.evaluate(f"document.querySelector('.stage .opt[data-i=\"{wrong[0]}\"]').click()")
        pg.wait_for_timeout(500)
        pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        shot(pg, "11_play_wrong")
        # 11b 答錯 → 下一題：阿斑先拿出館藏卡（網站 7dd738e 起的真實流程）
        pg.evaluate("document.querySelector('.next').click()")
        pg.wait_for_function("document.querySelector('.stage .card')")
        pg.evaluate("window.scrollTo(0, 0)")
        shot(pg, "11b_play_card")
        # 12 錯題回收：同一事件換一題再出（和闖關中插入的「錯題回收」題相同版面）
        pg.evaluate("""(qid) => {
          const q = HData.anyQ(qid), c = q.concepts[0];
          const alt = HData.live().find(x => x.id !== qid && x.concepts.includes(c) && !x.parts && x.options && x.options.length === 4) || HData.live().find(x => x.id !== qid && x.era === q.era && !x.parts && x.options);
          const stage = document.querySelector('.stage');
          stage.innerHTML = '<div class="remedy-tag">錯題回收</div>';
          const box = document.createElement('div'); box.className = 'item'; stage.appendChild(box);
          Quiz.renderItem(box, alt, { mode: 'practice' }, () => {});
          document.querySelector('.count').textContent = '5 / 11';
          document.querySelector('.fill').style.width = '36%';
          window.scrollTo(0, 0);
        }""", qid)
        shot(pg, "12_play_recycle")
        b.close()
    with open(os.path.join(OUT, "taps_s7_css.json"), "w", encoding="utf-8") as f:
        json.dump(taps, f, ensure_ascii=False, indent=1)
    print(taps)


if __name__ == "__main__":
    main()
