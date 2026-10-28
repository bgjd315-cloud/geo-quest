# -*- coding: utf-8 -*-
"""探路用：把網站各頁截成長圖，看看哪些畫面適合放進影片（不進影片）。"""
import os, sys
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "explore")
URL = "http://127.0.0.1:8801/dist/index.html"
SEED = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed.js"), encoding="utf-8").read()

ROUTES = sys.argv[1:] or ["#/hub", "#/", "#/unit/climate", "#/unit/home", "#/weak", "#/x", "#/x/stats", "#/x/kp", "#/x/diag", "#/settings", "#/parent"]


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1, color_scheme="light")
        pg.goto(URL)
        pg.wait_for_function("window.Data && Data.questions && Data.questions.length > 400 && window.XData && XData.items.length > 100", timeout=60000)
        pg.evaluate(SEED)
        for r in ROUTES:
            pg.goto(URL + r)
            pg.reload()
            pg.wait_for_timeout(1500)
            name = r.replace("#/", "").replace("/", "_") or "home"
            pg.screenshot(path=f"{OUT}/{name}.png", full_page=True)
            print(name, pg.evaluate("document.documentElement.scrollHeight"))
        b.close()


if __name__ == "__main__":
    main()
