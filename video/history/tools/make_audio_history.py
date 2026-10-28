# -*- coding: utf-8 -*-
"""時光檔案館介紹片：程式生成配樂（八音盒＋柔和弦樂鋪底，五聲音階，90 BPM）與動作音效。
以 video/tools/make_audio.py 為底改寫（原檔不動），時間對齊 ../SPEC.md。"""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
DUR = 89.0
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")
rng = np.random.default_rng(31)
BEAT = 60 / 90

SEMI = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}


def hz(n):
    """音名 → 頻率，例如 F#4、Bb3。"""
    acc = 1 if "#" in n else -1 if "b" in n[1:] else 0
    return 440 * 2 ** ((SEMI[n[0]] + acc + (int(n[-1]) - 4) * 12) / 12)


def buf():
    return np.zeros(int(SR * DUR) + SR * 2)


def add(b, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(b) or i < 0:
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


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)


cache = {}


def mbox(n, dur=1.8):
    """八音盒：基音＋略微不和諧的高泛音，敲擊後慢慢消失。"""
    key = (n, dur)
    if key not in cache:
        f = hz(n)
        t = np.arange(int(SR * dur)) / SR
        x = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.4)
             + 0.45 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 4.5)
             + 0.22 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 11)
             + 0.10 * np.sin(2 * np.pi * f * 8.9 * t) * np.exp(-t * 20))
        x *= np.minimum(t / 0.002, 1)
        cache[key] = x / 1.6
    return cache[key]


def strings(notes, dur, att=0.9, bright=1400):
    """柔和弦樂：每個音三條略走音的鋸齒波，濾掉高頻，慢起慢收。"""
    t = np.arange(int(SR * dur)) / SR
    x = np.zeros_like(t)
    for n in notes:
        f = hz(n)
        for det in (-0.35, 0.0, 0.4):
            ph = rng.uniform(0, 2 * np.pi)
            x += signal.sawtooth(2 * np.pi * (f * (1 + det / 100)) * t + ph)
    x = lp(lp(x / (3 * len(notes)), bright), bright * 1.2)
    vib = 1 + 0.05 * np.sin(2 * np.pi * 4.8 * t)
    e = np.minimum(t / att, 1) * np.minimum((dur - t) / att, 1)
    return x * vib * np.clip(e, 0, 1)


def pluck(n, dur=1.0):
    """低音撥弦。"""
    f = hz(n)
    t = np.arange(int(SR * dur)) / SR
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t * 3.2)
    return lp(x * np.minimum(t / 0.006, 1), 900)


CH = {
    "D": ["D3", "F#3", "A3"], "Bm": ["B2", "D3", "F#3"], "G": ["G2", "B2", "D3"], "A": ["A2", "C#3", "E3"],
    "Em": ["E3", "G3", "B3"], "F#m": ["F#2", "A2", "C#3"],
}
ARP = {
    "D": ["D5", "F#5", "A5", "E5", "F#5", "A5", "B5", "A5"],
    "Bm": ["B4", "D5", "F#5", "E5", "D5", "F#5", "A5", "F#5"],
    "G": ["B4", "D5", "E5", "D5", "B4", "D5", "A5", "E5"],
    "A": ["A4", "C#5", "E5", "A5", "E5", "C#5", "B4", "E5"],
    "Em": ["E5", "G5", "B5", "A5", "G5", "E5", "D5", "E5"],
}
BASS = {"D": "D2", "Bm": "B1", "G": "G1", "A": "A1", "Em": "E2", "F#m": "F#2"}


def groove(m, t0, t1, prog, gain=0.26, dens=8):
    """八音盒琶音（八分音符）＋弦樂鋪底＋撥弦低音，每小節換一個和弦。"""
    bar = BEAT * 4
    k = 0
    t = t0
    while t < t1 - 0.05:
        c = prog[(k // 8) % len(prog)]
        step = k % 8
        if dens == 8 or step % 2 == 0:
            add(m, mbox(ARP[c][step], 1.6), t, gain * (1.15 if step == 0 else 1.0))
        if step == 0:
            add(m, strings(CH[c], min(bar + 0.6, t1 - t + 0.4), 0.5), t, 0.30)
            add(m, pluck(BASS[c], 1.2), t, 0.55)
        if step == 4:
            add(m, pluck(BASS[c], 0.9), t, 0.35)
        t += BEAT / 2
        k += 1


def music():
    m = buf()
    # 0–4.5 蛀蟲之夜：B 小調五聲，低沉弦樂＋稀疏、往下走的八音盒（帶一點神秘）
    add(m, strings(["B2", "F#3", "D4"], 5.0, 1.2, 900), 0.0, 0.55)
    add(m, pluck("B1", 2.0), 0.05, 0.4)
    for t, n in [(0.4, "F#5"), (1.05, "D5"), (1.7, "B4"), (2.35, "A4"), (3.0, "F#4"), (3.4, "A4"), (3.75, "B4")]:
        add(m, mbox(n, 2.2), t, 0.30)
    # 4.5–9 長廊亮燈：往上爬的琶音，和弦轉亮
    add(m, strings(["G2", "D3", "B3"], 2.4, 0.6), 4.5, 0.42)
    add(m, strings(["A2", "E3", "C#4"], 2.4, 0.6), 6.6, 0.42)
    add(m, pluck("G1", 1.6), 4.5, 0.45)
    add(m, pluck("A1", 1.6), 6.6, 0.45)
    climb = ["D5", "E5", "F#5", "A5", "B5", "A5", "F#5", "E5", "A4", "C#5", "E5", "A5"]
    for i, n in enumerate(climb):
        add(m, mbox(n, 1.5), 4.6 + i * BEAT / 2, 0.24)
    # 9 片名：D 大調和弦綻開
    add(m, strings(["D3", "A3", "D4", "F#4"], 3.8, 0.25), 9.0, 0.55)
    add(m, pluck("D2", 2.5), 9.0, 0.6)
    for j, n in enumerate(["D5", "F#5", "A5", "D6", "F#6"]):
        add(m, mbox(n, 2.2), 9.05 + j * 0.07, 0.24)
    # 12.5–45 功能介紹：穩定的八音盒琶音
    groove(m, 12.5, 18.0, ["D", "Bm"], 0.22, dens=4)
    groove(m, 18.0, 29.5, ["D", "Bm", "G", "A"], 0.24)
    groove(m, 29.5, 37.0, ["G", "D", "Em", "A"], 0.24)
    groove(m, 37.0, 45.0, ["Bm", "G", "D", "A"], 0.24)
    # 45–62 故事：換成較抒情的進行，琶音稀一點
    add(m, strings(["E3", "G3", "B3", "D4"], 4.6, 0.5), 45.0, 0.45)
    for t, n in [(45.1, "B4"), (45.75, "D5"), (46.4, "E5"), (47.05, "G5"), (47.7, "F#5"), (48.35, "E5"), (49.0, "D5")]:
        add(m, mbox(n, 2.0), t, 0.27)
    add(m, pluck("E2", 2.0), 45.0, 0.45)
    groove(m, 49.5, 62.0, ["G", "D", "Em", "A"], 0.22, dens=8)
    # 62–82.5 收藏冊、出題率、真題與診斷
    groove(m, 62.0, 70.5, ["D", "Bm", "G", "A"], 0.24)
    groove(m, 70.5, 82.5, ["D", "A", "Bm", "G"], 0.24)
    # 82.5–89 片尾：回到 D 大調，慢慢收
    add(m, strings(["D3", "A3", "D4", "F#4"], 6.5, 0.6), 82.5, 0.5)
    add(m, pluck("D2", 3.0), 82.5, 0.55)
    for t, n in [(82.7, "A5"), (83.35, "F#5"), (84.0, "E5"), (84.65, "D5"), (85.6, "F#5"), (86.25, "E5"), (86.9, "D5")]:
        add(m, mbox(n, 2.4), t, 0.27)
    m = m[:int(SR * DUR)]
    fade = np.ones_like(m)
    fade[-int(SR * 2.2):] = np.linspace(1, 0, int(SR * 2.2)) ** 1.5
    fade[:int(SR * 0.08)] = np.linspace(0, 1, int(SR * 0.08))
    return m * fade


# ---------- 音效 ----------
def whoosh(d=0.45, var=0):
    n = int(SR * d)
    lo = 260 + var * 120
    return bp(noise(d), lo, lo * 6) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 1.1


def click():
    n = int(SR * 0.04)
    return hp(noise(0.04), 2500) * env(n, 0.001, 0.008)


def page():
    n = int(SR * 0.32)
    return bp(noise(0.32), 1200, 6000) * np.sin(np.linspace(0, np.pi, n)) ** 3


def flutter(d=0.6):
    """紙張翻飛：幾下快速的紙聲。"""
    out = np.zeros(int(SR * d))
    for k in range(5):
        b = bp(noise(0.06), 1500, 7000) * env(int(SR * 0.06), 0.004, 0.015)
        i = int(SR * k * d / 6)
        out[i:i + len(b)] += b * (1 - k * 0.12)
    return out


def chew(d=1.6):
    """蛀蟲咬紙：輕輕的、不刺耳的細碎聲。"""
    out = np.zeros(int(SR * d))
    for k in range(int(d / 0.11)):
        b = bp(noise(0.03), 900, 3500) * env(int(SR * 0.03), 0.002, 0.008)
        i = int(SR * (k * 0.11 + rng.uniform(0, 0.03)))
        out[i:i + len(b)] += b * rng.uniform(0.5, 1)
    return out


def chime(f0=1320):
    t = np.arange(int(SR * 1.0)) / SR
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in [(f0, 4), (f0 * 1.5, 6), (f0 * 2, 9)]) / 3


def ding(f0=1760):
    t = np.arange(int(SR * 0.6)) / SR
    return (np.sin(2 * np.pi * f0 * t) + 0.4 * np.sin(2 * np.pi * f0 * 2.76 * t)) * np.exp(-t * 7)


def lamp():
    """檯燈亮起：開關喀一聲＋溫暖的鐘聲。"""
    return np.concatenate([click() * 0.8, np.zeros(int(SR * 0.02))]), chime(880)


def thud():
    """答錯：低沉木頭聲，不刺耳。"""
    n = int(SR * 0.3)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 180 * t * (1 - t)) * np.exp(-t / 0.06) * 0.8 + lp(noise(0.3), 900) * env(n, 0.002, 0.03) * 0.3


def stamp(var=0):
    n = int(SR * 0.35)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (95 + var * 12) * t) * np.exp(-t / 0.07) * 0.9 + lp(noise(0.35), 1800) * env(n, 0.002, 0.03) * 0.7


def drawer():
    """櫃子拉開：木頭滑動聲。"""
    n = int(SR * 0.5)
    x = bp(noise(0.5), 200, 1500) * np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return x * 0.8


def pat():
    """石虎落地：軟軟的一聲。"""
    n = int(SR * 0.18)
    return lp(noise(0.18), 500) * env(n, 0.003, 0.03) * 1.2


def riser(d=0.9):
    n = int(SR * d)
    x = noise(d)
    out = np.zeros(n)
    seg = int(SR * 0.05)
    for i in range(0, n, seg):
        fc = 400 + 4000 * (i / n) ** 2
        out[i:i + seg] = bp(x[i:i + seg], fc, min(fc * 2.5, 18000))
    return out * np.linspace(0, 1, n) ** 2 * 0.8


def sparkle(t0, s, g=0.35):
    for j, f in enumerate([1175, 1480, 1760, 2349]):
        add(s, ding(f), t0 + j * 0.07, g)


def sfx():
    s = buf()
    # S1 蛀蟲之夜
    for t in (0.5, 1.0, 1.5):
        add(s, flutter(0.6), t, 0.45)
    add(s, chew(1.7), 2.8, 0.35)
    # S2 長廊亮燈
    add(s, whoosh(0.6, 0), 4.5, 0.4)
    add(s, pat(), 5.55, 0.6)
    for i, t in enumerate((6.5, 7.05, 7.6)):
        c, ch = lamp()
        add(s, c, t, 0.6)
        add(s, ch, t + 0.02, 0.28)
    # S3 片名
    add(s, whoosh(0.5, 1), 9.15, 0.4)
    # S4 社會科闖關 → 大廳
    add(s, whoosh(0.5, 2), 12.5, 0.4)
    add(s, click(), 14.7, 0.7)
    add(s, page(), 15.1, 0.5)
    add(s, page(), 16.8, 0.4)
    # S5 館區、櫃子、題數、能力
    add(s, whoosh(0.5, 1), 18.0, 0.35)
    for t in (18.3, 18.55, 18.8):
        add(s, page(), t, 0.35)
    add(s, drawer(), 22.2, 0.55)
    penta = [1175, 1319, 1480, 1760, 1976]
    for i in range(21):
        add(s, ding(penta[i % 5] * (1 if i < 10 else 2 if i >= 20 else 1)), 22.8 + i * 0.055, 0.10)
    add(s, riser(0.6), 24.4, 0.35)
    add(s, stamp(0), 25.0, 0.75)
    for i in range(6):
        add(s, stamp(i % 3), 26.9 + i * 0.17 + 0.05, 0.45)
    # S6 時間長廊
    add(s, whoosh(0.5, 2), 29.5, 0.4)
    add(s, whoosh(1.2, 0), 30.5, 0.25)
    add(s, whoosh(0.4, 3), 32.9, 0.3)
    add(s, page(), 33.25, 0.4)
    add(s, click(), 34.2, 0.7)
    add(s, page(), 34.55, 0.45)
    # S7 整理櫃子、答錯、錯題回收
    add(s, whoosh(0.5, 2), 37.0, 0.4)
    add(s, click(), 38.6, 0.7)
    add(s, page(), 38.95, 0.45)
    add(s, click(), 40.2, 0.7)
    add(s, thud(), 40.6, 0.55)
    add(s, pat(), 41.8, 0.5)
    add(s, page(), 42.65, 0.45)
    # S8 故事三線
    add(s, whoosh(0.5, 1), 45.0, 0.35)
    for t in (45.3, 45.6, 45.9):
        add(s, flutter(0.4), t, 0.3)
    # S9 一章故事
    add(s, whoosh(0.5, 2), 49.5, 0.4)
    add(s, page(), 50.9, 0.4)
    add(s, page(), 51.8, 0.4)
    add(s, click(), 52.7, 0.7)
    add(s, chime(1320), 53.05, 0.35)
    add(s, page(), 54.0, 0.4)
    add(s, click(), 54.9, 0.7)
    add(s, chime(1480), 55.25, 0.35)
    add(s, page(), 56.2, 0.4)
    add(s, click(), 56.8, 0.7)
    add(s, chime(1568), 57.7, 0.3)
    add(s, page(), 58.5, 0.4)
    add(s, chime(1319), 59.4, 0.3)
    sparkle(60.2, s, 0.3)
    # S10 收藏冊
    add(s, whoosh(0.5, 2), 62.0, 0.4)
    add(s, click(), 63.5, 0.7)
    add(s, page(), 63.85, 0.45)
    # S11 出題率
    for t in (65.8, 66.1, 66.4):
        add(s, whoosh(0.35, 3), t, 0.25)
    for i, t in enumerate((67.1, 67.55, 68.0)):
        add(s, ding(1319 * 2 ** (i * 2 / 12)), t, 0.3)
    # S12 會考真題、診斷、家長頁
    add(s, whoosh(0.5, 2), 70.5, 0.4)
    for t in (72.9, 75.3, 77.7, 80.1):
        add(s, page(), t, 0.45)
    # S13 片尾
    add(s, whoosh(0.5, 1), 82.65, 0.35)
    add(s, pat(), 83.6, 0.5)
    for i in range(3):
        add(s, ding(1760 * 2 ** (i * 2 / 12)), 84.0 + i * 0.18, 0.15)
    return s[:int(SR * DUR)]


def norm(x, peak_db):
    return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    m = norm(music(), -8)
    e = norm(sfx(), -5)
    for name, x in (("music", m), ("sfx", e)):
        st = np.stack([x, x], 1)
        wavfile.write(os.path.join(OUT, name + ".wav"), SR, (st * 32767).astype(np.int16))
    mix = m + e
    print("ok  mix peak %.1f dB  rms %.1f dB" % (20 * np.log10(np.abs(mix).max()), 20 * np.log10(np.sqrt((mix ** 2).mean()))))
