# 鴨警特工 · Duck Force

第一人稱瀏覽器戰術射擊遊戲，依使用者上傳的 Astral War 錄影調整戰場方向、持槍構圖與操作；主角保留紅衣黑帽小鴨的外形。此版本覆蓋之前的卡通巡防版。

## 這次重製

- **鋼鐵廢墟**：灰暗工業街區、分層建築窗框、鋼架、煙囪、貨櫃、裝甲運輸車、沙包與路障。
- **雨夜神社**：鳥居、瓦頂、石燈籠、庭院、枯樹與降雨。
- 生成的混凝土材質用於表面顏色與凹凸；濕地面、環境反射、煙霧、陰影與桌面色調後製。
- 紅衣黑帽小鴨：短絨細節、鴨嘴、帽徽及戰術背帶；敌方為鴨形守衛。
- 第一人稱 AR-07 步槍／P-09 手槍，有瞄具對位、後座力、槍口火光、換彈、彈匣與左手動作。
- 三種難度、三波守衛、行動倒數、命中及精準命中、有限彈藥、波次補給與結算。
- AI 依掩體判斷視線，在遮擋時以有界網格尋路；蹲下可以躲在較低的掩體後。
- 靜態環境與角色依材質合併幾何以控制 draw calls；手機自動降低像素比、關閉動態陰影與後製。

## 電腦與手機

| 動作 | 電腦 | 手機 |
| --- | --- | --- |
| 移動 | WASD | 左搖桿 |
| 轉向 | 滑鼠 | 右侧空白區滑動 |
| 開火 | 左鍵；手槍每次點擊 | 開火鍵；手槍每次點擊 |
| 瞄準 | 按住右鍵 | 瞄準鍵切換 |
| 換彈 | R | 換彈鍵 |
| 切槍 | 1 / 2 | 切槍鍵 |
| 蹲下 | C | 蹲下鍵 |
| 疾跑 | Shift | 疾跑鍵 |
| 暫停 | Esc / P | 右上暫停鍵 |

手機建議橫向。開始時在瀏覽器支援的情況下要求全螢幕及橫向；iPhone Safari 可能仍需要手動旋轉。裝置切換分頁／失焦時會自動暫停。手機觸控採 Pointer Capture，支援移動與瞄準同時操作，放開按鍵會停止動作。操作設定中可切換畫質、音效與靈敏度。

## Vercel

匯入 `erin20080306/Duck-Police-Special-Agent`，Root Directory 保持根目錄，Framework 選 **Vite**。

- Install：`npm ci`
- Build：`npm run build`
- Output：`dist`

不需要環境變數、API Key 或資料庫。若 Vercel 已連接此 repo 的 main，GitHub 更新是否自動部署取決於該專案的設定。

## 本機開發

Node.js 22.12 以上：

```sh
npm ci
npm run dev
npm test
npm run build
```

## 驗證與限制

自動測試涵蓋掩體／蹲姿視線、移動防穿牆、彈藥守恆、守衛尋路、兩張地圖的出生點與通行路線、模型幾何與武器動畫節點。正式建置另以 Vite 驗證。

**尚未經真實瀏覽器畫面驗收或電腦／手機實機效能測試。** 這是以錄影為方向的原創重製，不能宣稱與影片逐像素一致、相同美術品質或已達手機穩定 60 FPS。模型為程式化 3D 幾何加材質，未使用 Blender 高精度雕刻、動作捕捉或 Meshy 模型。此版是單人 AI 遊戲，沒有真人多人、網路房間或不死生物模式。

混凝土材質 `public/assets/concrete.webp` 使用內建 imagegen 生成、以 WebP 儲存，提示詞：photorealistic worn gray industrial concrete surface texture; flat orthographic material scan; fine grain, hairline cracks, damp stains, chipped flecks; neutral gray, flat diffuse lighting, no objects/text/logos. 提示要求可平鋪，但邊界連續性未作像素級驗證。

Three.js 採 MIT 授權。字型使用 Google Fonts（失敗時使用系統字型），音效以 Web Audio 本地合成。
