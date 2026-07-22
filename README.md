# 韓國 5天4夜 · 自由行網頁

手機優先的單頁靜態行程網頁，依當下時間（UTC+9・KST）自動指出「現在該在哪個景點」，點與點之間有可點擊的交通串接。部署於 GitHub Pages。

> 由 `china_trip`（上海）fork 而來，保留整體架構與設計語言，行程內容已清空為韓國空白範本。

## 功能

- **Day 1–5 分頁 + 資訊分頁**：依今天日期自動開到當天，當前時段景點以脈動高亮。
- **時間軸 spine**：填充至「現在」，清楚呈現「已過 / 現在 / 即將」三態。
- **景點卡片**：景點圖（可為漸層佔位）＋ 簡介 ＋（選填）「導航」鈕。
- **交通串接**：點擊帶入「即將前往」目的地。
- **回到現在**：手動瀏覽其他天後，一鍵回到當前景點。

## 改行程：只動一個檔

編輯 [`data/itinerary.json`](data/itinerary.json)，程式碼完全不用碰。

每天的 `items` 由兩種節點交錯組成：

```jsonc
// 景點卡片
{
  "type": "spot",
  "time": "14:30",                 // HH:mm，當前景點判斷依此
  "name": "景福宮",
  "image": null,                   // null=漸層佔位；補圖改成 "images/gyeongbokgung.jpg"
  "intro": "朝鮮王朝正宮…",         // 簡介
  "map": { "keyword": "景福宮", "city": "首爾" }  // 選填，有才顯示「導航」鈕
}

// 交通串接（夾在兩景點之間）
{
  "type": "transit",
  "mode": "metro",                 // walk / taxi / metro / maglev
  "desc": "地鐵 3 號線約 20 分鐘",
  "to": { "keyword": "景福宮", "city": "首爾" }
}
```

### 補景點真圖

1. 把圖片放進 `images/`（例如 `images/gyeongbokgung.jpg`）。
2. 在該 spot 的 `image` 欄填路徑 `"images/gyeongbokgung.jpg"`。

### 校正景點座標

景點與交通的精準度由 `data/itinerary.json` 最上方的 `coords` 表決定（`"經度,緯度"`）：

- 有座標 → 精準標點與路線規劃。
- 移除某筆 → 該地點退回關鍵字搜尋。

> ⚠️ **地圖整合待調整**：本專案的導航（`js/amap.js`）沿用自上海版本，走的是**高德地圖**深連結，在韓國覆蓋不佳。若要落地，建議改接 **Naver Map / Kakao Map** 深連結，座標系統與 URL scheme 也需一併調整。

## 本地預覽

```bash
cd korea_trip
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

測試「當前景點」：在網址加 `?now=` 覆寫時間（不影響真實時間，KST）：

```
http://localhost:8000/?now=2026-10-01T13:30
```

## 部署到 GitHub Pages

1. push 到 `main` 後，`.github/workflows/deploy.yml` 會自動部署。
2. GitHub repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**（若尚未啟用）。
3. 部署完成後網址約為 `https://<帳號>.github.io/korea_trip/`。

> `.nojekyll` 已加入，避免 GitHub Pages 的 Jekyll 處理底線開頭資源。
