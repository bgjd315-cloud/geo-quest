# -*- coding: utf-8 -*-
"""萬象地圖冊網站介紹片（geo2）：從本機網站截真實手機畫面（390×844 @2x）。
改自 ../../tools/capture_screens.py（原檔不動）。
先在 D:\\geo-quest 執行：python -m http.server 8801 --bind 127.0.0.1
假進度寫在 seed.js；家長頁用的是截圖專用的測試密碼（只存在截圖用的瀏覽器）。"""
import json, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets", "screens")
URL = "http://127.0.0.1:8801/dist/index.html"
SEED = open(os.path.join(HERE, "seed.js"), encoding="utf-8").read()
TEST_PW = "2468"  # 截圖專用測試密碼
info = {}


def go(pg, route, wait=None):
    pg.goto(URL + route)
    pg.reload()
    if wait:
        try:
            pg.wait_for_function(f"document.querySelector({json.dumps(wait)})", timeout=15000)
        except Exception:
            print("WAIT FAIL", route, pg.evaluate("document.getElementById('app').innerHTML.replace(/base64,[^\"]+/g,'').slice(0,800)"))
            raise
    pg.wait_for_timeout(900)


def shot(pg, name, full=False):
    pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)
    print(name)


def answer(pg, box_sel, correct=True):
    pg.evaluate("""([sel, ok]) => {
      const box = document.querySelector(sel);
      const q = window.__curQ;
      const parts = q.parts || [q];
      (q.parts ? [...box.querySelectorAll('.part')] : [box]).forEach((el, k) => {
        const p = parts[k]; const i = ok ? p.answer : (p.answer + 1) % p.options.length;
        el.querySelector(`.opt[data-i="${i}"]`).click();
      });
    }""", [box_sel, correct])
    pg.wait_for_timeout(400)


def play_page(pg, qids, banner, title, mode="practice"):
    """用網站自己的 Quiz.run 跑一場（和闖關畫面相同），題目指定好，方便截到要的題。"""
    pg.evaluate("""([qids, banner, title, mode]) => {
      history.replaceState(null, '', '#/x-video');
      const app = document.getElementById('app');
      app.innerHTML = `<div class="page play"><div class="banner"><img src="${Data.img(banner)}" alt=""><h2>${title}</h2><span class="mode">${mode === 'sim' ? '模擬模式・計時，交卷後看解析' : '練習模式・不計時，即時解析'}</span></div><div class="runbox"></div></div>`;
      const pool = qids.map(id => Data.byId[id]);
      const orig = Quiz.shuffle; Quiz.__noShuffle = true;
      Quiz.run(app.querySelector('.runbox'), { pool, size: pool.length, mode, onEnd: () => {} });
      window.scrollTo(0, 0);
    }""", [qids, banner, title, mode])
    pg.wait_for_timeout(600)


def count(pg, txt, frac):
    """一場只放一題時，進度列改成一般關卡的樣子（例：5 / 10）。"""
    pg.evaluate("([t, f]) => { const c = document.querySelector('.count'); if (c) c.textContent = t; const fl = document.querySelector('.fill'); if (fl) fl.style.width = f + '%'; }", [txt, frac])


def cur_q(pg):
    """目前畫面上的題目（stage 裡的 .item 由 renderItem 畫出；用題幹比對找出題目物件）。"""
    pg.evaluate("""() => {
      const stem = document.querySelector('.stage .item');
      window.__curQ = null;
      const txt = stem ? stem.textContent : '';
      let best = null, bl = 0;
      for (const q of Data.questions) { const s = (q.stem || '').replace(/[*_]/g, '').slice(0, 18); if (s && txt.includes(s) && s.length > bl) { best = q; bl = s.length; } }
      window.__curQ = best;
    }""")
    return pg.evaluate("window.__curQ && window.__curQ.id")


def tap_of(pg, sel):
    r = pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
    return r


def main():
    os.makedirs(OUT, exist_ok=True)
    taps = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="light")
        pg.goto(URL)
        pg.wait_for_function("window.Data && Data.questions && Data.questions.length > 400 && window.XData && XData.items.length > 100", timeout=60000)
        pg.evaluate(SEED)
        pg.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('geoquest.v1')); s.parentHash = Store.hash('{TEST_PW}'); localStorage.setItem('geoquest.v1', JSON.stringify(s)); }})()")
        pg.reload()  # 先重新載入，避免網站把記憶體裡的空白進度存回去蓋掉假資料
        pg.wait_for_function("window.Data && Data.questions && Data.questions.length > 400", timeout=60000)

        # 1 社會科闖關 hub
        go(pg, "#/hub", ".hub, .subj, .card, a")
        shot(pg, "01_hub")
        taps["hub_geo"] = tap_of(pg, 'a[href="#/"]')
        # 2 地圖冊首頁（長圖：影片裡捲動）
        go(pg, "#/", ".atlas")
        shot(pg, "02_home_full", full=True)
        info["home_sections"] = pg.evaluate("[...document.querySelectorAll('h2.sec')].map(h => [h.textContent, h.offsetTop])")
        # 3 雲頂島：關卡出題率、練習／模擬
        go(pg, "#/unit/climate", "h1, h2, .lv, img")
        shot(pg, "03_unit_climate_full", full=True)
        # 歸鄉島
        go(pg, "#/unit/home", "h1, h2, img")
        shot(pg, "04_unit_home")

        # 5 溫雨圖題 → 答對
        play_page(pg, ["clim-014"], "lv_cl_3", "紀錄室：溫雨圖判讀")
        cur_q(pg)
        count(pg, "5 / 10", 40)
        shot(pg, "05_climo_q")
        taps["climo"] = pg.evaluate("""() => { const q = window.__curQ; const r = document.querySelector(`.stage .item .opt[data-i="${q.answer}"]`).getBoundingClientRect(); return [r.left + r.width * 0.35, r.top + r.height / 2]; }""")
        answer(pg, ".stage .item", True)
        pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        pg.wait_for_timeout(300)
        count(pg, "5 / 10", 40)
        shot(pg, "06_climo_ok")

        # 7 等高線（點選題）
        play_page(pg, ["map-029"], "lv_map_4", "山中測量站：等高線與剖面")
        count(pg, "3 / 10", 20)
        shot(pg, "07_contour")
        # 8 人口金字塔
        play_page(pg, ["pp-017"], "lv_cl_1", "人口結構")
        pg.evaluate("document.querySelector('.banner img').src = Data.img('cover_lights')")
        pg.wait_for_timeout(300)
        count(pg, "6 / 10", 50)
        shot(pg, "08_pyramid")

        # 9 區域題答錯 → 原理卡 → 通論基本題 → 回到同一區域
        play_page(pg, ["eu-007"], "exp_eu", "歐洲的自然環境")
        cur_q(pg)
        answer(pg, ".stage .item", False)
        pg.wait_for_timeout(300)
        count(pg, "4 / 10", 30)
        shot(pg, "09_region_wrong")
        pg.click(".next"); pg.wait_for_timeout(500)
        count(pg, "5 / 12", 33)
        shot(pg, "10_card")
        pg.click(".next"); pg.wait_for_timeout(500)
        count(pg, "5 / 12", 33)
        shot(pg, "11_basic")
        info["basic_tag"] = pg.evaluate("(document.querySelector('.remedy-tag')||{}).textContent")
        cur_q(pg)
        answer(pg, ".stage .item", True)
        pg.click(".next"); pg.wait_for_timeout(500)
        count(pg, "6 / 12", 42)
        shot(pg, "12_back_region")
        info["back_tag"] = pg.evaluate("(document.querySelector('.remedy-tag')||{}).textContent")

        # 13 模擬模式（計時）
        go(pg, "#/play/climate-2/sim", ".clock")
        shot(pg, "13_sim_mode")

        # 14 弱點地圖（長圖）
        go(pg, "#/weak", ".mx")
        shot(pg, "14_weak_full", full=True)

        # 15 會考真題首頁
        go(pg, "#/x", ".x-mode")
        shot(pg, "15_exam_home")
        # 16 年度模擬：找一題有圖的地理題
        go(pg, "#/x/sim/114", ".x-stage .x-item")
        k = pg.evaluate("XData.yearItems(114).findIndex(it => it.subject === 'geo' && it.chart)")
        for _ in range(max(k, 0)):
            pg.click(".x-next"); pg.wait_for_timeout(150)
        pg.wait_for_timeout(800)
        shot(pg, "16_exam_sim")
        # 17 知識點練習
        go(pg, "#/x/kp/map-latlon", ".item, .x-item")
        shot(pg, "17_exam_kp")
        # 18 考點分布（長圖）
        go(pg, "#/x/stats", "table, .x-kplist, h2")
        shot(pg, "18_stats_full", full=True)
        from PIL import Image  # 只用到上面一段（捲到「知識點 × 年份」表），裁成 2400 CSS px 高
        Image.open(f"{OUT}/18_stats_full.png").crop((0, 0, 780, 4800)).save(f"{OUT}/18_stats_top.png", optimize=True)
        os.remove(f"{OUT}/18_stats_full.png")

        # 19 學習診斷（長圖）＋列印版
        go(pg, "#/x/diag", "h1")
        shot(pg, "19_diag_full", full=True)
        info["diag_sections"] = pg.evaluate("[...document.querySelectorAll('h2')].map(h => [h.textContent, h.getBoundingClientRect().top + scrollY])")
        pg.emulate_media(media="print")
        pg.wait_for_timeout(400)
        shot(pg, "20_diag_print_full", full=True)
        pg.emulate_media(media="screen")

        # 21 家長頁（輸入截圖專用測試密碼）
        go(pg, "#/parent", "#pw")
        pg.fill("#pw", TEST_PW)
        pg.click("#go"); pg.wait_for_timeout(800)
        shot(pg, "21_parent_full", full=True)

        # 22 設定：匯出進度檔
        go(pg, "#/settings", "h1")
        pg.evaluate("(() => { const h = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('換裝置')); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 140); })()")
        pg.wait_for_timeout(400)
        shot(pg, "22_settings")

        pg.evaluate("localStorage.removeItem('geoquest.v1')")
        b.close()
    # 超過 2 MB 的長圖轉成 WebP（HyperFrames 只內嵌 2 MB 以下的檔案）
    from PIL import Image
    for fn in os.listdir(OUT):
        fp = os.path.join(OUT, fn)
        if fn.endswith(".png") and os.path.getsize(fp) > 2_000_000:
            Image.open(fp).save(fp[:-4] + ".webp", quality=92, method=6)
            os.remove(fp)
            print("webp", fn)
    with open(os.path.join(OUT, "taps_css.json"), "w", encoding="utf-8") as f:
        json.dump({"taps": taps, "info": info}, f, ensure_ascii=False, indent=1)
    print(json.dumps({"taps": taps, "info": info}, ensure_ascii=False))


if __name__ == "__main__":
    main()
