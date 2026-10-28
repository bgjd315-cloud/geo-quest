# -*- coding: utf-8 -*-
"""萬象地圖冊網站介紹片（geo2）：程式生成大調木琴配樂（100 BPM）與動作音效，時間對齊 geo2/SPEC.md。
改自 ../../tools/make_audio.py（原檔不動）。"""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
DUR = 88.0
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")
rng = np.random.default_rng(23)
BEAT = 60 / 100

# 音名 → 頻率（A4 = 440）
SEMI = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}


def hz(n):
    return 440 * 2 ** ((SEMI[n[0]] + (int(n[-1]) - 4) * 12) / 12)


def buf():
    return np.zeros(int(SR * DUR) + SR)


def add(b, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(b):
        return
    n = min(len(x), len(b) - i)
    b[i:i + n] += x[:n] * g


def lp(x, fc):
    b, a = signal.butter(2, fc / (SR / 2))
    return signal.lfilter(b, a, x)


def hp(x, fc):
    b, a = signal.butter(2, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi):
    b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


cache = {}


def marimba(n, dur=1.2):
    """木琴：基音＋4 倍泛音快速衰減，敲擊感。"""
    key = (n, dur)
    if key not in cache:
        f = hz(n)
        t = np.arange(int(SR * dur)) / SR
        x = np.sin(2 * np.pi * f * t) * np.exp(-t * 3.2) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 14)
        x *= np.minimum(t / 0.003, 1)
        cache[key] = x
    return cache[key]


def pad(notes, dur, att=0.6):
    """柔和鋪底：幾個略為走音的正弦疊在一起，慢起慢收。"""
    t = np.arange(int(SR * dur)) / SR
    x = np.zeros_like(t)
    for n in notes:
        f = hz(n)
        for det in (-0.6, 0.6):
            x += np.sin(2 * np.pi * (f + det) * t)
    e = np.minimum(t / att, 1) * np.minimum((dur - t) / att, 1)
    return lp(x / (2 * len(notes)), 2500) * np.clip(e, 0, 1)


def bass(n, dur=0.55):
    f = hz(n)
    t = np.arange(int(SR * dur)) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 4) * np.minimum(t / 0.01, 1)


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)


def shaker():
    n = int(SR * 0.08)
    return hp(noise(0.08), 5000) * env(n, 0.004, 0.02)


CHORDS = {"C": ["C3", "E3", "G3"], "Am": ["A2", "C3", "E3"], "F": ["F2", "A2", "C3"], "G": ["G2", "B2", "D3"], "Em": ["E2", "G2", "B2"]}
ARP = {"C": ["C4", "E4", "G4", "C5"], "Am": ["A3", "C4", "E4", "A4"], "F": ["F3", "A3", "C4", "F4"], "G": ["G3", "B3", "D4", "G4"], "Em": ["E3", "G3", "B3", "E4"]}


def groove(m, t0, t1, prog=("C", "Am", "F", "G"), gain=0.22, k0=0):
    """八分音符木琴琶音＋低音＋沙鈴（每 8 個八分音符換和弦）。"""
    t, k = t0, k0
    bar = BEAT * 4
    while t < t1 - 0.05:
        c = prog[(k // 8) % len(prog)]
        a = ARP[c]
        add(m, marimba(a[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]], 0.9), t, gain + (0.07 if k % 4 == 0 else 0))
        if k % 4 == 0:
            add(m, bass(CHORDS[c][0][0] + "2"), t, 0.45)
        if k % 2 == 1:
            add(m, shaker(), t, 0.16)
        if k % 8 == 0:
            add(m, pad(CHORDS[c], bar + 0.3, 0.3), t, 0.24)
        t += BEAT / 2
        k += 1


def bloom(m, t, notes=("C4", "E4", "G4", "C5", "E5", "G5"), g=0.28, padg=0.6, d=3.0):
    add(m, pad(["C3", "G3", "C4", "E4"], d, 0.3), t, padg)
    for j, n in enumerate(notes):
        add(m, marimba(n, 1.8), t + j * 0.05, g)


def music():
    m = buf()
    bar = BEAT * 4
    # 0–8.5 s：迷霧，鋪底＋稀疏木琴
    for i, c in enumerate(["Am", "F", "C", "G"]):
        add(m, pad(CHORDS[c], bar * 0.95 + 0.6, 0.6), i * bar * 0.9, 0.5)
    for t, n in [(0.6, "E5"), (1.8, "C5"), (3.0, "A4"), (4.6, "G4"), (5.4, "C5"), (6.2, "E5"), (6.9, "G5"), (7.5, "E5")]:
        add(m, marimba(n, 1.6), t, 0.32)
    # 8.5–13 s：社會科闖關（輕快琶音進來）
    groove(m, 8.5, 13.0, gain=0.18)
    # 13 s 片名：和弦綻開
    bloom(m, 13.0)
    # 16–23.5 s 七島＋航線：往上爬的琶音
    t0, k = 16.0, 0
    climb = ["C4", "E4", "G4", "C5", "D4", "F4", "A4", "D5", "E4", "G4", "B4", "E5", "F4", "A4", "C5", "F5"]
    while t0 < 23.45:
        add(m, marimba(climb[k % len(climb)], 0.9), t0, 0.24)
        if k % 4 == 0:
            add(m, bass(["C2", "D2", "E2", "F2"][(k // 4) % 4]), t0, 0.45)
        if k % 2 == 1:
            add(m, shaker(), t0, 0.18)
        t0 += BEAT / 2
        k += 1
    # 23.5 s：588 題大和弦
    bloom(m, 23.5, ("C4", "G4", "C5", "E5", "G5", "C6"), 0.3, 0.7, 3.4)
    # 27–81 s：功能介紹，穩定的木琴律動；每段開頭換一個進行
    sections = [(27.0, 35.0, ("C", "G", "Am", "F")), (35.0, 45.5, ("Am", "F", "C", "G")), (45.5, 51.5, ("F", "G", "C", "Am")),
                (51.5, 59.0, ("C", "Am", "F", "G")), (59.0, 68.0, ("C", "G", "Am", "F")), (68.0, 76.5, ("F", "G", "Em", "Am")),
                (76.5, 81.0, ("C", "F", "G", "C"))]
    for a, b, p in sections:
        groove(m, a, b, p, 0.2)
    # 81–88 s 片尾：回到 C 大調，慢慢收
    add(m, pad(["C3", "G3", "C4", "E4"], 7.0, 0.8), 81.0, 0.55)
    for t, n in [(81.2, "C5"), (81.8, "E5"), (82.4, "G5"), (83.6, "E5"), (84.2, "D5"), (84.8, "C5"), (86.0, "G4"), (86.4, "C5")]:
        add(m, marimba(n, 2.0), t, 0.3)
    m = m[:int(SR * DUR)]
    fade = np.ones_like(m)
    fade[-int(SR * 2.0):] = np.linspace(1, 0, int(SR * 2.0))
    return m * fade


def wind(d):
    n = int(SR * d)
    x = noise(d)
    out = np.zeros(n)
    seg = int(SR * 0.05)
    for i in range(0, n, seg):
        fc = 500 + 400 * np.sin(i / n * np.pi * 3)
        out[i:i + seg] = bp(x[i:i + seg], fc, fc * 3)
    return out * np.sin(np.linspace(0, np.pi, n)) ** 2


def whoosh(d=0.45, var=0):
    n = int(SR * d)
    lo = 300 + var * 150
    return bp(noise(d), lo, lo * 6) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 1.2


def click():
    n = int(SR * 0.04)
    return hp(noise(0.04), 2500) * env(n, 0.001, 0.008)


def chime(f0=1320):
    t = np.arange(int(SR * 0.9)) / SR
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in [(f0, 4), (f0 * 1.5, 6), (f0 * 2, 9)]) / 3


def ding(f0=1760):
    t = np.arange(int(SR * 0.6)) / SR
    return (np.sin(2 * np.pi * f0 * t) + 0.4 * np.sin(2 * np.pi * f0 * 2.76 * t)) * np.exp(-t * 7)


def flap():
    out = np.zeros(int(SR * 0.6))
    for k in range(4):
        b = lp(noise(0.08), 900) * env(int(SR * 0.08), 0.005, 0.02)
        i = int(SR * k * 0.13)
        out[i:i + len(b)] += b
    return out


def page():
    n = int(SR * 0.3)
    return bp(noise(0.3), 1200, 6000) * np.sin(np.linspace(0, np.pi, n)) ** 3


def stamp(var=0):
    n = int(SR * 0.35)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (90 + var * 10) * t) * np.exp(-t / 0.07) * 0.9 + lp(noise(0.35), 1800) * env(n, 0.002, 0.03) * 0.7


def riser(d=1.2):
    n = int(SR * d)
    x = noise(d)
    out = np.zeros(n)
    seg = int(SR * 0.05)
    for i in range(0, n, seg):
        fc = 400 + 5000 * (i / n) ** 2
        out[i:i + seg] = bp(x[i:i + seg], fc, min(fc * 2.5, 18000))
    return out * np.linspace(0, 1, n) ** 2 * 0.9


def thud():
    """答錯：低沉木頭聲，不刺耳。"""
    t = np.arange(int(SR * 0.5)) / SR
    return (np.sin(2 * np.pi * 196 * t) + 0.5 * np.sin(2 * np.pi * 233 * t)) * np.exp(-t * 9)


def pop(f0=880):
    t = np.arange(int(SR * 0.18)) / SR
    return np.sin(2 * np.pi * f0 * t * (1 + 0.3 * np.exp(-t * 40))) * np.exp(-t * 22)


def sfx():
    s = buf()
    add(s, wind(3.6), 0.3, 0.55)               # S1 迷霧
    add(s, whoosh(0.8, 0), 4.6, 0.5)           # S2 迷霧吹散
    add(s, flap(), 5.4, 0.5)                   # 阿鵲飛入
    add(s, ding(1568), 6.9, 0.45)              # 島亮起
    add(s, ding(1760), 7.5, 0.45)
    add(s, whoosh(0.5, 2), 8.5, 0.4)           # S3 手機進場
    add(s, click(), 10.7, 0.7)                 # 點地理卡
    add(s, page(), 11.1, 0.5)
    add(s, whoosh(0.5, 1), 13.2, 0.4)          # S4 片名
    for i in range(7):                         # S5 七島迷霧散開
        add(s, ding(1046 * 2 ** ((i * 2) / 12)), 16.8 + i * 0.3 + (0.3 if i == 6 else 0), 0.33)
    add(s, whoosh(1.2, 0), 20.7, 0.45)         # 航線膠捲
    add(s, riser(1.2), 22.3, 0.5)
    add(s, stamp(0), 23.5, 0.75)               # 588 題
    for i in range(9):                         # 九種題型
        add(s, pop(660 + i * 55), 24.3 + i * 0.07, 0.22)
    add(s, whoosh(0.5, 2), 27.0, 0.4)          # S6 手機
    add(s, click(), 28.9, 0.7)                 # 點正解
    add(s, chime(1320), 29.4, 0.5)             # 答對
    add(s, page(), 30.7, 0.5)                  # 等高線
    add(s, page(), 32.8, 0.5)                  # 人口金字塔
    add(s, whoosh(0.5, 2), 35.0, 0.4)          # S7
    add(s, thud(), 35.8, 0.6)                  # 答錯
    for t in (37.1, 39.0, 40.6):               # 原理卡 → 通論基本題 → 回到同一區域
        add(s, page(), t, 0.5)
        add(s, pop(990), t + 0.02, 0.2)
    add(s, whoosh(0.5, 1), 42.0, 0.3)          # 錯題回收
    add(s, ding(1568), 43.0, 0.42)             # 連對兩次
    add(s, ding(2093), 43.5, 0.42)
    add(s, whoosh(0.5, 2), 45.5, 0.4)          # S8
    for i in range(3):                         # 高中低
        add(s, pop(780 + i * 110), 46.25 + i * 0.15, 0.25)
    add(s, whoosh(0.45, 1), 46.8, 0.35)        # 放大鏡
    add(s, page(), 48.9, 0.5)
    add(s, whoosh(0.45, 1), 49.1, 0.35)
    add(s, whoosh(0.5, 2), 51.5, 0.4)          # S9
    add(s, whoosh(1.0, 0), 52.5, 0.3)          # 捲動
    add(s, whoosh(0.45, 1), 53.5, 0.35)        # 放大鏡
    add(s, page(), 55.8, 0.5)                  # 模擬模式
    add(s, whoosh(0.5, 2), 59.0, 0.4)          # S10
    for t in (60.9, 63.1, 65.2):
        add(s, page(), t, 0.5)
    add(s, whoosh(1.0, 0), 65.9, 0.3)          # 捲動考點分布
    add(s, whoosh(0.5, 2), 68.0, 0.4)          # S11
    add(s, whoosh(1.0, 0), 69.0, 0.3)          # 捲動診斷
    add(s, page(), 72.2, 0.6)                  # 列印報告
    add(s, page(), 73.9, 0.5)                  # 家長頁
    add(s, whoosh(0.5, 2), 76.5, 0.4)          # S12
    for i in range(4):
        add(s, stamp(i % 3), 77.1 + i * 0.4, 0.5)
    add(s, whoosh(0.5, 1), 81.15, 0.35)        # S13 片尾
    add(s, flap(), 82.2, 0.4)
    return s[:int(SR * DUR)]


def norm(x, peak_db):
    return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    m = norm(music(), -7)
    e = norm(sfx(), -4)
    for name, x in (("music", m), ("sfx", e)):
        st = np.stack([x, x], 1)
        wavfile.write(os.path.join(OUT, name + ".wav"), SR, (st * 32767).astype(np.int16))
    print("ok")
