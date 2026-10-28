# -*- coding: utf-8 -*-
"""從 Windows 內建 Noto Sans TC 可變字型取 400／700，只留影片用到的字（改文字後要重跑）。"""
import glob, os, re
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
text = ""
for f in [os.path.join(HERE, "index.html")] + glob.glob(os.path.join(HERE, "compositions", "*.html")):
    s = open(f, encoding="utf-8").read()
    s = re.sub(r"<style>.*?</style>", "", s, flags=re.S)
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    text += s
text += "0123456789ABCDEFabcdefghijklmnopqrstuvwxyz–～、，。．：「」？！（）✕✓ "
chars = sorted(set(text) - set("\n\r\t"))
print(len(chars), "字")
for w in (400, 700):
    f = TTFont("C:/Windows/Fonts/NotoSansTC-VF.ttf")
    f = instancer.instantiateVariableFont(f, {"wght": w})
    opt = subset.Options(); opt.flavor = "woff2"; opt.layout_features = ["*"]
    sub = subset.Subsetter(opt); sub.populate(text="".join(chars)); sub.subset(f)
    out = os.path.join(HERE, "assets", "fonts", f"noto-{w}.woff2")
    f.flavor = "woff2"; f.save(out)
    print(out, os.path.getsize(out))
