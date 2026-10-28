# -*- coding: utf-8 -*-
"""萬象地圖冊介紹片：程式生成大調木琴配樂（100 BPM）與動作音效，時間對齊 intro/SPEC.md。"""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
DUR = 50.0
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "intro", "assets", "audio")
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


def music():
    m = buf()
    bar = BEAT * 4
    # 開場 0–9 s：迷霧，鋪底＋稀疏木琴
    for i, c in enumerate(["Am", "F", "C", "G"]):
        add(m, pad(CHORDS[c], bar * 0.95 + 0.6), i * bar * 0.94, 0.5)
    for t, n in [(0.6, "E5"), (1.8, "C5"), (3.0, "A4"), (4.6, "G4"), (5.4, "C5"), (6.2, "E5"), (6.9, "G5"), (7.5, "E5"), (8.1, "C5")]:
        add(m, marimba(n, 1.6), t, 0.32)
    # 片名 9 s：和弦綻開
    add(m, pad(["C3", "G3", "C4", "E4"], 3.6, 0.3), 9.05, 0.6)
    for j, n in enumerate(["C4", "E4", "G4", "C5", "E5", "G5"]):
        add(m, marimba(n, 1.8), 9.1 + j * 0.06, 0.28)
    # 遊戲畫面 12.5–28.5 s：八分音符琶音＋低音＋沙鈴
    prog = ["C", "Am", "F", "G"]
    t0, k = 12.5, 0
    while t0 < 28.4:
        c = prog[(k // 8) % 4]
        a = ARP[c]
        add(m, marimba(a[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]], 0.9), t0, 0.24 + (0.08 if k % 4 == 0 else 0))
        if k % 4 == 0:
            add(m, bass(CHORDS[c][0].replace("2", "2").replace("3", "2")), t0, 0.5)
        if k % 2 == 1:
            add(m, shaker(), t0, 0.18)
        if k % 8 == 0:
            add(m, pad(CHORDS[c], bar + 0.3, 0.3), t0, 0.28)
        t0 += BEAT / 2
        k += 1
    # 六島與十二航線 28.5–36 s：往上爬的琶音
    t0, k = 28.5, 0
    climb = ["C4", "E4", "G4", "C5", "D4", "F4", "A4", "D5", "E4", "G4", "B4", "E5", "F4", "A4", "C5", "F5"]
    while t0 < 35.9:
        add(m, marimba(climb[k % len(climb)], 0.9), t0, 0.26)
        if k % 4 == 0:
            add(m, bass(["C2", "D2", "E2", "F2"][(k // 4) % 4]), t0, 0.5)
        if k % 2 == 1:
            add(m, shaker(), t0, 0.2)
        t0 += BEAT / 2
        k += 1
    # 504 題 36 s：大和弦
    add(m, pad(["C3", "G3", "C4", "E4", "G4"], 2.2, 0.05), 35.95, 0.7)
    for j, n in enumerate(["C4", "G4", "C5", "E5", "G5", "C6"]):
        add(m, marimba(n, 1.8), 35.95 + j * 0.04, 0.3)
    # 魔王 38–43 s：小調、低沉
    for i, c in enumerate(["Am", "F", "Em"]):
        add(m, pad(CHORDS[c], 1.9, 0.3), 38.0 + i * 1.6, 0.55)
        add(m, bass(CHORDS[c][0], 1.2), 38.0 + i * 1.6, 0.6)
    # 片尾 43–50 s：回到 C 大調，慢慢收
    add(m, pad(["C3", "G3", "C4", "E4"], 7.0, 0.8), 43.0, 0.55)
    for t, n in [(43.2, "C5"), (43.8, "E5"), (44.4, "G5"), (45.6, "E5"), (46.2, "D5"), (46.8, "C5")]:
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


def sfx():
    s = buf()
    add(s, wind(3.6), 0.3, 0.55)               # 迷霧
    add(s, whoosh(0.8, 0), 4.6, 0.5)           # 迷霧吹散
    add(s, flap(), 5.4, 0.5)                   # 阿鵲飛入
    add(s, ding(1568), 6.9, 0.45)              # 島亮起
    add(s, ding(1760), 7.5, 0.45)
    add(s, whoosh(0.5, 1), 9.1, 0.4)           # 片名
    add(s, whoosh(0.5, 2), 12.5, 0.45)         # 手機進場
    add(s, click(), 14.75, 0.7)                # 點正解
    add(s, chime(1320), 15.2, 0.5)             # 答對
    add(s, page(), 16.5, 0.5)                  # 原理卡
    add(s, page(), 20.5, 0.5)                  # 區域題
    add(s, click(), 21.95, 0.7)
    add(s, chime(1480), 22.1, 0.35)
    add(s, page(), 22.8, 0.5)                  # 人口金字塔
    add(s, page(), 24.5, 0.5)                  # 弱點地圖
    for i in range(6):                         # 六島迷霧散開
        add(s, ding(1046 * 2 ** ((i * 2) / 12)), 28.5 + 0.9 + i * 0.42, 0.35)
    add(s, whoosh(1.2, 0), 32.65, 0.45)        # 航線膠捲
    add(s, riser(1.2), 34.75, 0.5)
    add(s, stamp(0), 35.95, 0.8)               # 504 題
    for i in range(6):                         # 魔王出場
        add(s, stamp(i % 3), 38.8 + i * 0.4 + 0.05, 0.55)
    add(s, whoosh(0.5, 1), 43.15, 0.35)        # 片尾
    add(s, flap(), 44.2, 0.4)
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
