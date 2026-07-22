# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案本質

手機優先的**單頁靜態網站**：韓國 5 天 4 夜自由行行程表，部署於 GitHub Pages。
**無建置步驟、無框架、無 npm 依賴**——純 HTML/CSS/原生 JS。三支 JS 以 `<script>` 依序載入（`naver.js` → `now.js` → `app.js`），彼此用**全域函式**呼叫，沒有 import/export 模組系統。

> 本專案由 `china_trip`（上海）fork 而來，保留整體架構與設計語言，行程內容已清空為韓國空白範本。**時區為 KST（`+09:00`）。** 導航層已由高德改接 **Naver Map**（`js/naver.js`），座標系改為 **WGS-84**。

## 核心架構：資料與呈現分離

所有行程內容都在 `data/itinerary.json`，程式碼只負責讀取與渲染。**改行程＝只編輯這個 JSON，不要動 JS。**

- `meta`：標題、日期區間、`timezone`（韓國 `+09:00`，當前景點判斷的時區依據）。
- `coords`：`地點關鍵字 → "經度,緯度"`（**WGS-84** 世界座標系）查表。`app.js` 的 `enrichCoords()` 在載入時依 `keyword` 把座標補進各 `map`/`to`，因此座標集中在此一處維護。刪掉某筆 → 該地點退回關鍵字搜尋。
- `days[].items[]`：兩種交錯節點
  - `spot`（景點卡片）：`time`(HH:mm)、`name`、`image`(null→漸層佔位／URL／`images/` 路徑)、`intro`、`map`（**選填**，有才顯示導航鈕）。
  - `transit`（交通串接）：`mode`(`walk`/`taxi`/`metro`/`bus`)、`desc`、`to`（目的地，點擊跳 Naver Map）。
- `info`：資訊分頁資料（交通總覽、費用、行李、滴滴指南、注意事項、App）。

## 三支 JS 的職責

- `js/now.js`：時間與「目前該在哪個景點」。`shanghaiNow()` **一律換算 UTC+8**（取 UTC 瞬間 +8h 再讀 UTC 欄位，與裝置時區無關），並支援 `?now=YYYY-MM-DDTHH:mm` 覆寫。`resolveState()` 是純函式，回傳 `{mode: before|during|after|none, dayIndex, currentItemIndex, nextItemIndex}`。
- `js/naver.js`：Naver Map deeplink。`naverSearchUrl`/`naverNavUrl` 產生網頁版 `map.naver.com/p/search/{query}` 連結（fallback）；`naverNativeUrl` 依平台產生 App scheme：iOS 直接回 `nmap://`（`place`/`route/{car|walk|public|bicycle}`），Android 回 `intent://...scheme=nmap;package=com.nhn.android.nmap` 並帶 `browser_fallback_url` 退回網頁版。**`nmap://` 強制帶 `appname` 參數**（`NAVER_APPNAME`）。座標存 `"lng,lat"`（WGS-84），scheme 參數為 `lat`/`lng` 分開。mode 對應：`walk`→walk、`taxi`→car、`metro`/`bus`→public。
- `js/app.js`：載入 JSON、tab 切換、時間軸 spine 渲染、三態高亮、「回到現在」、資訊分頁、`renderUpdatedAt()`、入場翻牌時鐘。`attachMapHandler()` 用事件委派：手機點 `a[data-map]` 時先試 App scheme，iOS 1.5 秒逾時 fallback 網頁，Android 由 intent 的 `browser_fallback_url` 處理。`fillIntroClock()`／`playIntro()`／`hideIntro()` 控制入場：`fillIntroClock()` 依 `shanghaiNow().label` 填翻牌四位數（與「現在」連動）；`playIntro()` 一次性播放時間軸卡片依序浮現後淡出 loader（`prefers-reduced-motion` 或載入失敗皆直接 `hideIntro()`）。

## 當前景點高亮（招牌功能）

`resolveState` 比對今天日期與各 `day.date` 找出今天是 Day 幾；當天時間軸中「最後一個 `time ≤ 現在` 的 spot」標為「現在」、下一個 spot 標「即將」。**範本行程日期為 2026-10（佔位，待填實際日期），平時測試一定要用 `?now=` 覆寫**，否則永遠是旅程前倒數狀態、看不到高亮。

## 部署（GitHub Pages + Actions）

- push 到 `main` 觸發 `.github/workflows/deploy.yml` 自動部署。Pages 已啟用為 `build_type=workflow`（曾因 workflow token 無權建立站台失敗，改用帳號 `gh api` 啟用後解決）。
- workflow 在上傳前產生 `build-info.json`（台北 UTC+8 時間戳），前端 `renderUpdatedAt()` fetch 後顯示「最後更新」。此檔由 CI 產生、**已 gitignore，不要手動 commit**。
- 正式網址：`https://soda3752.github.io/korea_trip/`

## 常用指令

```bash
# 本地預覽（需用伺服器，因 fetch 載入 JSON）
python3 -m http.server 8000
# 測試當前景點高亮（關鍵）
open "http://localhost:8000/?now=2026-10-01T13:30"

# 部署：直接 push，workflow 自動跑
git push
gh run watch <run-id> --exit-status      # 觀察部署
gh run list --workflow=deploy.yml --limit 1
```

## 驗證手法（無測試框架）

- 語法：`node --check js/*.js`
- 邏輯：用 node `vm` 沙箱載入 `now.js`/`naver.js`（stub `location`/`navigator`/`URLSearchParams`），對 `resolveState` 與 deeplink 組裝做斷言。
- 視覺：headless Chrome `--screenshot` 搭配 `?now=` 驗證前/中/後三種狀態與當前高亮。
- Naver Map App **喚起行為無法在此環境驗證**，需在 iOS/Android 真機各測一次。

## 設計語言（老上海 Art Deco・月份牌）

- 主調是 **墨綠（`--jade` #1f3a34）＋鎏金（`--gold` #c9a24b）＋米白紙感（`--paper` #efe4c7）**，墨綠當「墨色」用（主文字 `--ink` #20312b，不用純黑）。
- **胭脂紅（`--rouge` #9e2b25）是唯一破格，只用於「現在/即將」狀態**（節點脈動、邊框、徽章、標題），勿擴散到其他元件。
- Deco 語彙：時間軸節點為**菱形**（`rotate(45deg)`）、時間用**鎏金框車票**樣式、Day 標頭為墨綠帶＋鎏金 ◆ 分隔、卡片為米白＋鎏金細框。少圓角（`--radius` 6px）。
- 字體分工：`--serif`（Noto Serif TC）中文標題、`--deco`（Cinzel）拉丁與數字、`--sans`（Noto Sans TC）內文。**經 `index.html` 的 Google Fonts `<link>` 載入**——這是專案唯一的外部依賴；離線時 fallback 到系統襯線（Songti），版面不壞但少了 Deco 味。
- 入場簽名：翻牌時鐘（`.deco-loader`），墨綠斜紋底＋鎏金外框，數字隨當前韓國時間（KST）連動，翻牌後時間軸依序浮現。

## 慣例

- 內容一律**繁體中文**。
- `coords` 為地標近似座標（非實地校準），導航會到地標附近；特定場所（如「宮宴 北京西路1485號」）建議實機校正。
- 設計文件在 `.claude/report/2026_06_18/`。
