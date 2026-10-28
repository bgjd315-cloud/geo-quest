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
        # 01 社會科闖關首頁
        shot(pg, "01_hub")
        tap_of(pg, "hub_hist", ".hub-card.hub-history", 0.3, 0.5)

        # 02 大廳
        go(pg, "#/h", ".wing-list", 900)
        shot(pg, "02_hall")
        scroll_to(pg, ".wing-list", 60)
        shot(pg, "03_hall_wings")
        tap_of(pg, "wing_tw", '.wing-card[href="#/h/wing/tw"]', 0.4, 0.5)

        # 04 臺灣館：故事與時代櫃子
        go(pg, "#/h/wing/tw", ".era-list", 900)
        shot(pg, "04_wing_tw")
        scroll_to(pg, ".era-list", 70)
        shot(pg, "05_wing_eras")
        tap_of(pg, "era_play", '.era-list a.primary.btn', 0.5, 0.5)
        # 世界館的時代櫃子（出題率標籤）
        go(pg, "#/h/wing/w", ".era-list", 900)
        scroll_to(pg, ".era-list", 70)
        shot(pg, "06_wing_w_eras")

        # 07 時間長廊
        go(pg, "#/h/timeline", ".tl-ev", 900)
        shot(pg, "07_timeline")
        pg.screenshot(path=f"{OUT}/07b_timeline_full.png", full_page=True)
        pg.evaluate("document.querySelector('[data-z=\"1\"]').click();")
        pg.wait_for_timeout(400)
        pg.evaluate("""() => { const s = document.querySelector('.tl-scroll'); const ev = document.querySelector('.tl-ev[data-id="tw-dutch"]') || document.querySelector('.tl-ev'); s.scrollLeft = ev.offsetLeft - s.clientWidth * 0.25; }""")
        pg.wait_for_timeout(400)
        shot(pg, "08_timeline_zoom")
        evsel = '.tl-ev[data-id="tw-dutch"]'
        tap_of(pg, "tl_ev", evsel, 0.3, 0.5)
        pg.evaluate(f"document.querySelector({json.dumps(evsel)}).click()")
        pg.wait_for_timeout(500)
        shot(pg, "09_timeline_sheet")

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
        # 12b 結算：阿斑把放錯的檔案收進「待修復」（views.result 的版面與文字）
        pg.evaluate("""() => {
          const T = window.UI.talk(HData.img('aban_hint'), '阿斑', '放錯的檔案我先收進「待修復」，之後換個樣子再出現，修好兩次就歸檔。');
          document.getElementById('app').innerHTML = `<header class="top"><a class="back" href="#/h/wing/tw">‹ 返回</a><nav><a href="#/hub">社會科</a><a href="#/h/timeline">時間長廊</a><a href="#/settings">設定</a></nav></header><div class="page result">
            <div class="score-hero"><img src="${HData.img('arch_girl_think')}" alt=""><div><div class="big">7 / 10</div><div>70%・用時 9 分 12 秒</div></div></div>${T}
            <div class="row"><a class="primary btn" href="#/h/wing/tw">回到臺灣館</a></div></div>`;
          window.scrollTo(0, 0);
        }""")
        shot(pg, "12b_play_result")

        # 13– 故事：F3 艋舺的茶箱
        CH = "F3"
        go(pg, f"#/h/story/{CH}", ".st-stage", 900)
        shot(pg, "13_story_doc")
        nxt = lambda: pg.evaluate("(() => { const n = document.querySelector('.st-next'); n.disabled = false; n.click(); })()")
        nxt(); pg.wait_for_timeout(400)
        shot(pg, "14_story_opening")
        nxt(); pg.wait_for_timeout(400)
        # 時代選擇：點正確的櫃子
        ok_i = pg.evaluate(f"HData.chapterById['{CH}'].eraChoice.options.findIndex(o => o.correct)")
        shot(pg, "15_story_era")
        tap_of(pg, "story_era", f'.st-era .opt[data-i="{ok_i}"]', 0.35, 0.5)
        pg.evaluate(f"document.querySelector('.st-era .opt[data-i=\"{ok_i}\"]').click()")
        pg.wait_for_timeout(400)
        shot(pg, "16_story_era_ok")
        # 場景：找第一個有嵌入題的場景
        n_sc = pg.evaluate(f"HData.chapterById['{CH}'].scenes.length")
        got_q = False
        for k in range(n_sc):
            nxt(); pg.wait_for_timeout(400)
            hasq = pg.evaluate("!!document.querySelector('.st-q .opt')")
            if hasq and not got_q:
                scroll_to(pg, ".st-qhead", 60)
                shot(pg, "17_story_q")
                r = pg.evaluate("""() => { const it = document.querySelector('.st-q'); const q = HData.chapterById['F3'].scenes.find(s => s.question && it.textContent.includes(String(s.question.stem || s.question.parts && s.question.parts[0].stem).replace(/[*_]/g,'').slice(0,8))).question; const p = q.parts ? q.parts[0] : q; const box = q.parts ? it.querySelector('.part') : it; const el = box.querySelector(`.opt[data-i="${p.answer}"]`); const r = el.getBoundingClientRect(); return [r.left + r.width * .35, r.top + r.height / 2]; }""")
                taps["story_q"] = r
                pg.evaluate("""() => { const it = document.querySelector('.st-q'); const q = HData.chapterById['F3'].scenes.find(s => s.question && it.textContent.includes(String(s.question.stem || s.question.parts && s.question.parts[0].stem).replace(/[*_]/g,'').slice(0,8))).question; (q.parts ? [...it.querySelectorAll('.part')] : [it]).forEach((el, k) => { const p = q.parts ? q.parts[k] : q; el.querySelector(`.opt[data-i="${p.answer}"]`).click(); }); }""")
                pg.wait_for_timeout(400)
                shot(pg, "18_story_q_ok")
                got_q = True
        # 時代錯置偵探
        nxt(); pg.wait_for_timeout(400)
        wrong_s = pg.evaluate(f"HData.chapterById['{CH}'].detective.wrong.map(Number)")
        scroll_to(pg, ".dt-box", 80)
        shot(pg, "19_story_detective")
        tap_of(pg, "story_dt", f'.dt-s[data-i="{wrong_s[0]}"]', 0.5, 0.5)
        for i in wrong_s:
            pg.evaluate(f"document.querySelector('.dt-s[data-i=\"{i}\"]').click()")
        pg.wait_for_timeout(200)
        shot(pg, "20_story_detective_pick", 200)
        pg.evaluate("document.querySelector('.dt-check').click()")
        pg.wait_for_timeout(400)
        scroll_to(pg, ".dt-result", 120)
        shot(pg, "21_story_detective_result")
        # 史實與虛構
        nxt(); pg.wait_for_timeout(400)
        pg.evaluate(f"""() => {{ const items = HData.chapterById['{CH}'].factFiction; document.querySelectorAll('.ff-row').forEach((row, i) => row.querySelector(`.ff-b[data-v="${{items[i].fact ? 1 : 0}}"]`).click()); }}""")
        scroll_to(pg, ".ff-list", 80)
        shot(pg, "22_story_ff")
        pg.evaluate("document.querySelector('.ff-reveal').click()")
        pg.wait_for_timeout(400)
        scroll_to(pg, ".ff-list", 80)
        shot(pg, "23_story_ff_reveal")
        # 結尾 → 館藏卡
        nxt(); pg.wait_for_timeout(400)
        nxt(); pg.wait_for_timeout(600)
        shot(pg, "24_story_unlock")

        # 25 收藏冊
        go(pg, "#/h/cards", ".album-grid", 900)
        shot(pg, "25_album")
        b_on = pg.evaluate("!!document.querySelector('.cc.on')")
        if b_on:
            tap_of(pg, "album_card", ".cc.on", 0.5, 0.5)
            pg.evaluate("document.querySelector('.cc.on').click()")
            pg.wait_for_timeout(400)
            shot(pg, "26_album_card")

        # 27 會考真題首頁
        go(pg, "#/x", ".x-modes", 900)
        shot(pg, "27_exam_home")
        # 28 知識點練習（歷史）
        kp = pg.evaluate("""() => { const ks = Object.keys(XData.appear).filter(k => k.startsWith('hist:')).sort((a, b) => XData.count(b) - XData.count(a)); return ks[0].split(':')[1]; }""")
        print("kp", kp)
        go(pg, f"#/x/kp/{kp}", ".x-opts", 1500)
        shot(pg, "28_exam_kp", 1200)
        # 29 考點分布（歷史段）
        go(pg, "#/x/stats", ".x-rank", 900)
        pg.evaluate("""() => { const h = [...document.querySelectorAll('h2.sec')].find(x => x.textContent.includes('歷史')); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 60); }""")
        shot(pg, "29_exam_stats")
        # 30 學習診斷
        go(pg, "#/x/diag", ".x-diagpage", 1200)
        shot(pg, "30_diag")
        pg.evaluate("""() => { const h = [...document.querySelectorAll('h2, h3')].find(x => x.textContent.includes('需加強')); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 50); }""")
        shot(pg, "31_diag2")
        # 32 家長頁
        go(pg, "#/parent", "#pw", 600)
        pg.fill("#pw", PW)
        if pg.evaluate("!!document.querySelector('#pw2')"):
            pg.fill("#pw2", PW)
        pg.click("#go")
        pg.wait_for_timeout(800)
        shot(pg, "32_parent")
        pg.evaluate("""() => { const h = [...document.querySelectorAll('.pbody h2')].find(x => x.textContent.includes('歷史')); if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 14); }""")
        shot(pg, "33_parent_hist")

        b.close()
    # 換算成影片畫面座標：手機螢幕左上角 (SX, SY)，截圖 390 CSS px 寬 → 436 px
    with open(os.path.join(OUT, "taps_css.json"), "w", encoding="utf-8") as f:
        json.dump(taps, f, ensure_ascii=False, indent=1)
    print(sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
