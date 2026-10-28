# -*- coding: utf-8 -*-
"""從本機遊戲（http://127.0.0.1:8781/dist/index.html）截真實手機畫面，給介紹影片用。
先在 D:\\geo-quest 執行 python -m http.server 8781 --bind 127.0.0.1"""
import json, os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "intro", "assets", "screens")
URL = "http://127.0.0.1:8781/dist/index.html"

# 假的作答紀錄：讓首頁進度、弱點地圖有內容（只存在截圖用的瀏覽器裡）
SEED = """
(() => {
  const s = { v: 1, hero: 'girl', log: [], levels: {}, recycle: { 'clim-orographic': { streak: 0, since: 0 } }, review: {}, parentHash: null, introSeen: true };
  const qs = Data.live();
  let k = 0;
  for (const q of qs) {
    if (!/^(map|climate|landform|eu|na)-/.test(q.level)) continue;
    const ok = (k++ % 7) !== 0 && !(q.concepts.includes('clim-orographic') && k % 2);
    s.log.push({ q: q.id, ok, c: q.concepts, r: q.region, m: 'practice', ts: 1761600000000 + k });
  }
  for (const id of ['map-1','map-2','map-3','map-4','climate-1','climate-2','landform-1','eu-1']) s.levels[id] = { done: true, best: 0.9, last: 0.9, total: 10, ts: 1761600000000 };
  localStorage.setItem('geoquest.v1', JSON.stringify(s));
})()
"""


def answer(pg, sel_box, correct=True):
    """點選題目的正解（或錯誤選項），等解析出現。"""
    pg.evaluate("""([sel, ok]) => {
      const box = document.querySelector(sel);
      const q = Data.byId[box.dataset.qid];
      const parts = q.parts || [q];
      (q.parts ? [...box.querySelectorAll('.part')] : [box]).forEach((el, k) => {
        const p = parts[k]; const i = ok ? p.answer : (p.answer + 1) % p.options.length;
        el.querySelector(`.opt[data-i="${i}"]`).click();
      });
    }""", [sel_box, correct])
    pg.wait_for_timeout(300)


def show_question(pg, qid, banner):
    pg.evaluate("""([qid, banner]) => {
      history.replaceState(null, '', '#/x');  // 不觸發 hashchange，避免網站把畫面換回首頁
      const app = document.getElementById('app');
      app.innerHTML = `<div class="page play"><div class="banner"><img src="${Data.img(banner)}" alt=""><h2>${Charts.esc(banner === 'lv_cl_3' ? '紀錄室：溫雨圖判讀' : '歐洲的自然環境')}</h2><span class="mode">練習模式・不計時，即時解析</span></div><div class="runbox"><div class="run"><div class="runbar"><button class="ghost quit">離開</button><div class="progress"><div class="fill" style="width:40%"></div></div><div class="count">5 / 10</div></div><div class="stage"><div class="item" id="qbox" data-qid="${qid}"></div></div></div></div></div>`;
      Quiz.renderItem(document.getElementById('qbox'), Data.byId[qid], { mode: 'practice' }, () => {});
      window.scrollTo(0, 0);
    }""", [qid, banner])
    pg.wait_for_timeout(400)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="light")
        pg.goto(URL)
        pg.wait_for_function("window.Data && Data.questions && Data.questions.length > 400")
        pg.evaluate(SEED)
        pg.goto(URL + "#/")
        pg.reload()  # 讓網站重新讀入剛寫進 localStorage 的進度
        pg.wait_for_function("document.querySelector('.atlas')")
        pg.wait_for_timeout(800)
        pg.screenshot(path=f"{OUT}/1_home.png")

        # 真實溫雨圖題：答對，看到解析
        show_question(pg, "clim-014", "lv_cl_3")
        pg.screenshot(path=f"{OUT}/2_climo_q.png")
        # 記下正解選項的位置（CSS px），影片的點擊圈要對準它
        taps = {"climo": pg.evaluate("""() => { const q = Data.byId['clim-014']; const r = document.querySelector(`#qbox .opt[data-i="${q.answer}"]`).getBoundingClientRect(); return [r.left + r.width * 0.35, r.top + r.height / 2]; }""")}
        answer(pg, "#qbox", True)
        pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/3_climo_ok.png")

        # 答錯 → 原理卡（和闖關中補救畫面相同的版面）
        pg.evaluate("""() => {
          const app = document.getElementById('app');
          app.innerHTML = `<div class="page play"><div class="runbox"><div class="run"><div class="runbar"><button class="ghost quit">離開</button><div class="progress"><div class="fill" style="width:50%"></div></div><div class="count">6 / 12</div></div><div class="stage"><div class="remedy"><img class="bird" src="${Data.img('bird_hint')}" alt=""><p>先看一下這張原理卡，再試一題。</p></div>${Quiz.cardHTML('clim-orographic')}</div></div></div></div>`;
          window.scrollTo(0, 0);
        }""")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/4_card.png")

        # 區域遠征：首頁的遠征航線
        pg.goto(URL + "#/")
        pg.wait_for_function("document.querySelector('.ship')")
        pg.evaluate("window.scrollTo(0, document.querySelectorAll('h2.sec')[1].offsetTop - 8)")
        pg.wait_for_timeout(800)
        pg.screenshot(path=f"{OUT}/5_routes.png")

        # 歐洲的地圖題
        show_question(pg, "eu-005", "exp_eu")
        taps["map"] = pg.evaluate("""() => { const q = Data.byId['eu-005']; const g = [...document.querySelectorAll('#qbox [data-pick]')].find(e => e.dataset.pick === q.options[q.answer]); const r = g.querySelector('circle').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }""")
        answer(pg, "#qbox", True)
        pg.evaluate("window.scrollTo(0, 0)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/6_region_map.png")

        # 人口金字塔
        show_question(pg, "nea-013", "exp_eu")
        pg.evaluate("document.querySelector('.banner h2').textContent='東北亞的人文與產業'; document.querySelector('.banner img').src=Data.img('exp_nea')")
        pg.wait_for_timeout(400)
        pg.screenshot(path=f"{OUT}/7_pyramid.png")

        # 弱點地圖
        pg.goto(URL + "#/weak")
        pg.wait_for_function("document.querySelector('.mx')")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/8_weak.png")

        pg.evaluate("localStorage.removeItem('geoquest.v1')")
        # 換算成影片畫面座標：手機螢幕左上角 (1202, 92)，截圖 390 CSS px 寬 → 436 px
        k = 436 / 390
        video = {key: [round(1202 + x * k), round(92 + y * k)] for key, (x, y) in taps.items()}
        with open(os.path.join(OUT, "taps.json"), "w", encoding="utf-8") as f:
            json.dump(video, f)
        print("taps", video)
        b.close()
    print(sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
