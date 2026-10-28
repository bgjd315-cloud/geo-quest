# 會考社會科試題本切題：依題號與題組說明的位置，把每題（與題組共用的閱讀材料）截成圖片，並輸出文字索引。
# 圖表歸屬：先把圖片與向量線條併成「圖塊」，再看哪一題的文字提到該圖塊的圖名（圖(十四)、表(二)）；
# 沒有圖名或沒人提到，就歸給圖塊中心所在的那一題。每題的截圖只保留自己的文字與圖塊，其他塗白。
# 用法：python -I scripts/exam-crop.py 111 112 113 114 115
import fitz, re, sys, json, os
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
ROOT = 'D:/geo-quest'
Q = re.compile(r'^(\d{1,2})\.(\s|$)')
G = re.compile(r'回答第?\s*(\d+)\s*[至～~\-]\s*(\d+)\s*題')
CAP = re.compile(r'^[圖表]\s*[\(（]\s*[一二三四五六七八九十]+\s*[\)）]')
DPI = 200

def norm(s):
    return re.sub(r'\s', '', s).replace('（', '(').replace('）', ')')

def lines(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0: continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t: out.append((fitz.Rect(l['bbox']), t))
    return out

FOOT = {}
def footers(page):
    # 頁尾：「請翻頁繼續作答」框（含外框線）與頁碼，截圖時塗白
    if page.number not in FOOT:
        fs = []
        for r, t in lines(page):
            if '請翻頁' in t or '試題結束' in t:
                # 只塗「請翻頁」那個框：框線是和文字重疊、右側靠頁邊的向量線條（不往左擴，免得塗到旁邊的選項）
                box = fitz.Rect(r)
                for d in page.get_drawings():
                    dr = fitz.Rect(d['rect'])
                    if dr.intersects(r + (-12, -10, 30, 10)) and dr.width < 200: box.include_rect(dr)
                fs.append(box + (-2, -2, 2, 2))
            elif r.y0 > page.rect.height - 60 and re.fullmatch(r'[\d\s\-–]+', t):
                fs.append(r + (-4, -3, 4, 3))   # 頁碼
        FOOT[page.number] = fs
    return FOOT[page.number]

def footer_y(page):
    return page.rect.height - 8

def graphics(page):
    fs = footers(page)
    rs = [fitz.Rect(b['bbox']) for b in page.get_text('dict')['blocks'] if b['type'] == 1]
    for d in page.get_drawings():
        r = fitz.Rect(d['rect'])
        if r.width > page.rect.width * 0.8: continue   # 分隔線、頁框
        rs.append(r)
    return [r for r in rs if not any(f.contains(r) for f in fs)]

def is_footer(page, rect, t):
    # 整行落在頁尾框裡才算頁尾（只沾到邊的選項文字不算）
    return any(f.contains(rect + (1, 1, -1, -1)) for f in footers(page))

def merge(rects, gap=4):
    rs = [fitz.Rect(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out = []
        for r in rs:
            for o in out:
                if fitz.Rect(o.x0 - gap, o.y0 - gap, o.x1 + gap, o.y1 + gap).intersects(r):
                    o.include_rect(r); changed = True; break
            else:
                out.append(fitz.Rect(r))
        rs = out
    return rs

def clusters(page, L):
    cs = [{'rect': r, 'caps': [], 'terms': []} for r in merge(graphics(page)) if r.width * r.height > 40]
    for rect, t in L:
        if not CAP.match(t) or len(t) > 12: continue
        lab = norm(CAP.match(t).group(0))
        below = lab.startswith('表')   # 表名在表格上方，圖名在圖的下方
        best = None
        for c in cs:
            r = c['rect']
            if min(r.x1, rect.x1) - max(r.x0, rect.x0) < -10: continue
            d = (r.y0 - rect.y1) if below else (rect.y0 - r.y1)
            if -5 <= d <= 30 and (best is None or d < best[0]): best = (d, c)
        if best:
            best[1]['rect'].include_rect(rect); best[1]['caps'].append(lab)
        else:
            cs.append({'rect': fitz.Rect(rect), 'caps': [lab], 'terms': []})   # 只有圖名（如純文字表格）
    # 圖塊裡的說明文字一併納入；註解框（「詞：此處指…」）記下被註解的詞
    for c in cs:
        for rect, t in L:
            inter = fitz.Rect(c['rect']) & rect
            if not inter.is_empty and inter.width * inter.height > 0.6 * rect.width * rect.height:
                c['rect'].include_rect(rect)
                m = re.match(r'^\W*([一-鿿《》]{1,10})[：:]', t)
                if m: c['terms'].append(m.group(1))
    # 貼在圖邊、伸出圖框的短標籤（經緯度、刻度）也算圖的一部分
    def gap(r, o):
        return max(o.x0 - r.x1, r.x0 - o.x1, 0) + max(o.y0 - r.y1, r.y0 - o.y1, 0)
    base = [fitz.Rect(c['rect']) for c in cs]
    for rect, t in L:
        if len(t) > 10 or CAP.match(t) or Q.match(t) or not cs: continue
        k = min(range(len(cs)), key=lambda i: gap(rect, base[i]))   # 只併進最近的圖塊
        if 0 < gap(rect, base[k]) <= 24: cs[k]['rect'].include_rect(rect)
    return cs

def bottom(page, L):
    ys = [r.y1 for r, t in L if not is_footer(page, r, t)] + [r.y1 for r in graphics(page)]
    return max(ys) if ys else page.rect.height - 40

for y in sys.argv[1:]:
    doc = fitz.open(f'{ROOT}/_會考/soc_{y}.pdf')
    outdir = f'{ROOT}/_會考/crops/{y}'; os.makedirs(outdir, exist_ok=True)
    anchors = []
    for pi, page in enumerate(doc):
        if pi == 0: continue
        for rect, t in lines(page):
            if rect.x0 > 90: continue
            m = Q.match(t)
            if m and 1 <= int(m.group(1)) <= 60: anchors.append({'p': pi, 'y': rect.y0, 'kind': 'q', 'no': int(m.group(1))}); continue
            g = G.search(t)
            if g: anchors.append({'p': pi, 'y': rect.y0, 'kind': 'g', 'range': [int(g.group(1)), int(g.group(2))]})
    clean, last = [], 0
    for a in anchors:   # 只留題號遞增的錨點（避免選項或表格裡的「1.」被當題號）
        if a['kind'] == 'q':
            if a['no'] != last + 1: continue
            last = a['no']
        clean.append(a)
    index = {'year': int(y), 'items': [], 'groups': []}
    for pi in sorted({a['p'] for a in clean}):
        page = doc[pi]
        L = lines(page)
        A = [a for a in clean if a['p'] == pi]
        bot = bottom(page, L) + 3
        for i, a in enumerate(A):
            a['top'] = max(40, a['y'] - (1.5 if a['kind'] == 'q' else -0.5))
            a['end'] = A[i + 1]['y'] - 1.5 if i + 1 < len(A) else bot
            a['own'] = []
        CS = clusters(page, L)
        for c in CS:
            owner = None
            keys = c['caps'] + c['terms']
            if keys:
                for a in A:   # 題目文字（不含圖塊自己的文字）提到這個圖名或被註解的詞
                    txt = norm(''.join(t for r, t in L if a['top'] <= (r.y0 + r.y1) / 2 < a['end']
                                       and not (r & c['rect']).width * (r & c['rect']).height > 0.6 * r.width * r.height
                                       and not (CAP.match(t) and len(t) <= 12)))
                    if any(k in txt for k in keys): owner = a; break
            if owner is None:
                cy = (c['rect'].y0 + c['rect'].y1) / 2
                owner = next((a for a in A if a['top'] <= cy < a['end']), None)
            if owner: owner['own'].append(c)
        for a in A:
            own = [c['rect'] for c in a['own']]
            y0 = min([a['top']] + [r.y0 - 2 for r in own]); y1 = max([a['end']] + [r.y1 + 2 for r in own])
            clip = fitz.Rect(50, y0, page.rect.width - 50, min(y1, footer_y(page)))
            pix = page.get_pixmap(dpi=DPI, clip=clip)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            s = pix.width / clip.width
            P = lambda r: [(r.x0 - clip.x0) * s, (r.y0 - clip.y0) * s, (r.x1 - clip.x0) * s, (r.y1 - clip.y0) * s]
            # 白底遮罩：本題範圍內＋自己的圖塊保留，其餘塗白；別題的圖塊伸進本題範圍也塗白
            mask = Image.new('L', img.size, 0); md = ImageDraw.Draw(mask)
            md.rectangle(P(fitz.Rect(clip.x0, a['top'], clip.x1, a['end'])), fill=255)
            for c in CS:
                if c not in a['own']: md.rectangle(P(c['rect'] + (-2, -2, 2, 2)), fill=0)
            for r in own: md.rectangle(P(r + (-2, -2, 2, 2)), fill=255)
            # 本題自己的文字行一定保留（別題的圖塊有時伸到本題文字旁邊）
            others = [c['rect'] for c in CS if c not in a['own']]
            for r, t in L:
                if a['top'] <= (r.y0 + r.y1) / 2 < a['end'] and not any(
                        (r & o).width * (r & o).height > 0.6 * r.width * r.height for o in others):
                    md.rectangle(P(r + (-1, -1, 1, 1)), fill=255)
                elif not (a['top'] <= (r.y0 + r.y1) / 2 < a['end']) and not any(
                        (r & o).width * (r & o).height > 0.6 * r.width * r.height for o in own):
                    md.rectangle(P(r + (-1, -1, 1, 1)), fill=0)   # 延伸區裡別題的文字塗白
            for f in footers(page): md.rectangle(P(f), fill=0)
            img = Image.composite(img, Image.new('RGB', img.size, 'white'), mask)
            name = f"q{a['no']:02d}" if a['kind'] == 'q' else f"g{a['range'][0]:02d}"
            img.save(f'{outdir}/{name}.webp', 'WEBP', quality=82, method=6)
            text = page.get_text('text', clip=fitz.Rect(clip.x0, a['top'], clip.x1, a['end']))
            rec = {'name': name, 'page': pi + 1, 'bbox': [round(v, 1) for v in clip], 'text': text}
            if a['kind'] == 'q': rec['no'] = a['no']; index['items'].append(rec)
            else: rec['range'] = a['range']; index['groups'].append(rec)
    index['items'].sort(key=lambda r: r['no'])
    json.dump(index, open(f'{ROOT}/_會考/index_{y}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    nos = [r['no'] for r in index['items']]
    print(y, len(nos), 'missing', sorted(set(range(1, 55)) - set(nos)), 'groups', [g['range'] for g in index['groups']])
