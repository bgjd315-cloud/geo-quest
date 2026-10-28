# -*- coding: utf-8 -*-
"""把 Windows 內建 Noto Sans TC 可變字型切成 400／700 兩種粗細，只留影片 compositions 用到的字。改了文字要重跑。"""
import glob, os, re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Windows\Fonts\NotoSansTC-VF.ttf"
text = ""
for f in glob.glob(os.path.join(ROOT, "compositions", "*.html")):
    s = open(f, encoding="utf-8").read()
    s = re.sub(r"<style>.*?</style>", "", s, flags=re.S)
    text += s
chars = set(text) | set("0123456789")
chars = "".join(sorted(c for c in chars if ord(c) >= 32))
print(len(chars), "字")
for w in (400, 700):
    f = TTFont(SRC)
    inst = instantiateVariableFont(f, {"wght": w})
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]
    sub = subset.Subsetter(opts); sub.populate(text=chars); sub.subset(inst)
    out = os.path.join(ROOT, "assets", "fonts", f"noto-{w}.woff2")
    inst.flavor = "woff2"; inst.save(out)
    print(out, os.path.getsize(out))
