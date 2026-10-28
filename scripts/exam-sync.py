# 把 data/exam/*.json 用到的截圖，從 _會考/crops/（完整切題，不進 git）複製到 assets/exam/（上線用）。
# 公民題與沒用到的題組圖不會複製；assets/exam 裡多出來的舊檔會移除。
import json, os, shutil, glob, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = 'D:/geo-quest'
need = set()
for f in glob.glob(f'{ROOT}/data/exam/1*.json'):
    d = json.load(open(f, encoding='utf-8'))
    for x in d.get('items', []) + d.get('groups', []): need.add(x['img'])
for p in sorted(need):
    src = f"{ROOT}/_會考/crops/{p.split('assets/exam/')[1]}"
    dst = f'{ROOT}/{p}'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
extra = [p for p in glob.glob(f'{ROOT}/assets/exam/*/*.webp') if os.path.relpath(p, ROOT).replace(os.sep, '/') not in need]
for p in extra: os.remove(p)
print('copied', len(need), 'removed', len(extra))
