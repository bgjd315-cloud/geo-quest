# 萬象地圖冊 介紹影片：交付紀錄

- 採用故事 A「迷霧中的地圖冊」，50 秒＋東方學Bar 片尾 3 秒＝53 秒，1920×1080、30fps。沒做的 B、C 留在 ../STORYLINES.md。
- 真實畫面：遊戲截圖由 ../tools/capture_screens.py 從本機遊戲（dist/index.html）自動截（390×844 @2x），並記錄點擊目標座標到 assets/screens/taps.json。重新截圖時選項會重新打散，s4.html 的 tap 座標要改成新的 taps.json。
- 字型：Noto Sans TC（Windows 內建可變字型）取 400／700 兩種粗細，只留影片用到的字（assets/fonts/noto-400/700.woff2）；改文字後要重新子集化，否則新字會缺字。
- 聲音：../tools/make_audio.py 程式生成 C 大調木琴配樂（100 BPM）與音效（風聲、翅膀、叮聲、點擊、答對提示、翻頁、蓋章、riser）。成片音量 mean −22.8 dB、峰值 −3.3 dB。
- 檢查：hyperframes check 0 錯誤 0 警告；修過：第 0 秒不可空白（地圖冊一開場就看得到）、兩個點擊圈改用截圖時記錄的座標、片尾拿掉網址只留 QR code、初始隱藏改寫在 CSS、低對比文字加深。
- 品牌：東方學Bar 白色浮水印在右下角（寬 192 px），檢查圖 8 格確認沒蓋到字；片尾卡只放彩色 Logo、不加標語（同字靈搜神記）。
- 最弱的一段：S4 手機截圖上的字在影片裡偏小，靠左邊大字說明。
