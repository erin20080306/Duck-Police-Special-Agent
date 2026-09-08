# 鴨警特工 / Duck Force

瀏覽器 3D 單人射擊遊戲。以提供的小鴨參考圖為角色方向：奶油色身體、黑帽、紅上衣、桃粉短褲、黃色鴨嘴與腳。角色目前為程式建立的風格化 3D 模型，並非 Blender 雕刻或照片等級的絨毛模型。

## 已實作

- 霓虹港區與中央廣場兩張地圖，三種難度，每局三波機器人。
- 第一／第三人稱、瞄準、兩種武器、換彈、衝刺、生命與急救補給、分數與結算。
- 敵人接近與射擊、掩體碰撞及射線遮擋；桌面滑鼠／鍵盤與手機觸控。
- 本地合成音效、暫停與重新開始。Three.js 版本由 package-lock.json 鎖定。

## Vercel 部署

1. Vercel 新增專案，匯入此 GitHub repository。
2. Framework Preset 選 **Vite**，Root Directory 維持根目錄。
3. Install Command 為 `npm ci`，Build Command 為 `npm run build`；Output Directory 為 **dist**（vercel.json 已指定）。
4. Deploy。無環境變數、無資料庫、無 API 金鑰。

## 操作

WASD 移動，滑鼠轉向，左鍵射擊，右鍵瞄準，R 換彈，Shift 衝刺，1/2 選武器，V 切換視角，Esc 暫停。手機左搖桿移動、右側空白處滑動轉向，按畫面按鍵操作。建議手機橫向遊玩。

本機執行 `npm ci`、`npm run dev` 啟動遊戲；執行 `npm test` 與 `npm run build` 檢查核心規則及正式建置。使用 Node.js 22.12 以上版本。

## 範圍與限制

這是原創單人遊戲，參考影片的射擊操作方向；未複製影片的美術、音樂、原始碼或品牌。未實作線上多人、帳號、跨裝置存檔或生者／不死生物陣營。線上多人需另外設計連線伺服器，不能把目前的 AI 機器人描述為真人連線。

美術採程式化 3D 幾何，與參考影片的高精細寫實場景有差距。網頁使用 WebGL；低階手機表現取決於裝置。未經真實瀏覽器遊玩驗證。字型可由 Google Fonts 載入，無網路時使用系統字型。Three.js 採 MIT 授權，授權檔隨 npm 套件提供。
