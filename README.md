# 鴨警特工 / Duck Police Special Agent

《霓虹封鎖線》是可部署到 Vercel 的 **Three.js 單人戰術 FPS**。扮演白色絨毛鴨警，在夜港市利用掩體與 AI 守衛交戰，於倒數結束前拆除 B 區干擾裝置。

角色以提供的第一張鴨警圖片為造型參考：白色絨毛、黃色鴨嘴、黑色警帽、金色警徽與鍊條、深色戰術服及藍色發光裝備。角色、武器與場景由程式建立 3D 幾何構成；不是從圖片提取的寫實模型。

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ferin20080306%2FDuck-Police-Special-Agent)

若要讓此倉庫的後續更新自動部署：

1. 登入 https://vercel.com/new ，選擇 **Import Git Repository**。
2. 選擇 `erin20080306/Duck-Police-Special-Agent`。
3. **Root Directory 保持倉庫根目錄**，Framework Preset 選 **Vite**。
4. Build Command：`npm run build`；Output Directory：`dist`；Install Command：`npm install`。
5. 點選 **Deploy**。

已提供 vercel.json，不需要 API Key、資料庫或環境變數。遊戲使用靜態託管，不需要後端伺服器。部署到自己的 Vercel 帳號，需要在 Vercel 完成登入與 GitHub 授權。

## 玩法

- 共三回合；每回合增加守衛，開始時補滿生命與彈藥。
- 在倒數結束前抵達黃色 B 區，持續按住拆除鍵 **5 秒**。
- 離開拆除範圍或鬆開按鍵，拆除進度會重置。
- 可以清空守衛再拆除，或利用掩體繞行。雷達顯示已進入警戒狀態的守衛。
- 頭部命中造成額外傷害；守衛必須取得視線才能攻擊。
- 生命歸零或倒數結束即失敗，可重試該回合。
- 三種難度影響時間、守衛數量、傷害與準確度。

| 操作 | 電腦 |
| --- | --- |
| 移動 | WASD 或方向鍵 |
| 瞄準 / 開火 | 滑鼠 / 左鍵 |
| 精準瞄準 | 按住右鍵 |
| 疾跑 / 換彈 | 左 Shift / R |
| 切換步槍與手槍 | 1 / 2 |
| 拆除 | 裝置附近按住 E |
| 暫停 / 釋放滑鼠 | Esc 或 P |

手機與平板：左搖桿移動、右側滑動瞄準；右下角有開火、換彈、切槍與拆除按鈕。建議橫向遊玩。失去焦點或切換分頁時自動暫停。

## 本機開發

使用 Node.js 22.12 以上版本。

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

## 專案結構

- `src/main.js`：遊戲循環、第一人稱操作、武器、AI、回合、HUD、手機輸入及音效。
- `src/character.js`：第二版鴨警角色；細密短絨、寬鴨嘴、盾形警徽、長版皮衣與持槍姿勢。
- `src/world.js`：場景、武器及燈光；角色絨毛採 InstancedMesh 減少 draw calls。
- `src/rules.js`：碰撞、彈藥、難度、計時及拆除規則。
- `src/style.css`：主選單、HUD 與響應式介面。
- `tests/rules.test.js`：規則及地圖可通行性測試。
- `.github/workflows/ci.yml`：push / pull request 自動測試與建置。

## 範圍與相容性

這是原創鴨警主題的單人遊戲，參考使用者描述的瀏覽器 CS 類射擊玩法；不包含 Counter-Strike 商標、美術、地圖或音效。原 X 影片無法直接讀取，因此不宣稱逐項重現影片。

需要支援 WebGL 2 的現代瀏覽器。電腦版使用 Pointer Lock；若游標未鎖定，點擊場景即可再次啟用。音效由 Web Audio 即時產生；字體使用 Google Fonts 並提供本機字體 fallback。沒有多人連線、帳號、伺服器排行榜或持久化遊戲存檔。

自動驗證涵蓋規則測試與 production build；實際裝置效能及各瀏覽器觸控手感仍需在目標裝置驗收。
