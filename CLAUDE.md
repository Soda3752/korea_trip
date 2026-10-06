# CLAUDE.md

## 專案

2026-10-11 至 2026-10-15 韓國秋楓跟團行程，高雄／仁川進出。純HTML、CSS、原生JS手機優先靜態網站，無框架、npm依賴或建置步驟。保留既有手機行程操作；使用者已要求楓葉主題，以楓紅、琥珀與暖米白呈現，不加入路線示意圖或無關功能。

## 架構

- `data/itinerary.json`：本次手冊整理的公開行程、三餐、住宿與提醒。
- 全域JS載入順序：`js/google-maps.js` → `js/now.js` → `js/app.js`；無import/export。
- `meta.people: null`：人數未知，標頭省略人數，不猜測。
- `days[].items[]` 以spot列出手冊順序；`time`為KST `HH:mm` 或 `null`。三餐在 `meals`，住宿在 `hotel`，由每日提醒呈現。
- 使用者已授權參考估時：20個估時需`timeEstimated:true`並明示時間僅供參考，午餐作安排基準。五個原手冊時刻不可覆寫；`mealTimes`亦為參考。規劃假設可留`planningNotes`，`tips`使用精簡提醒。不得把估時當成領隊確認、預約或實測車程；分店地址、座標不可補造。
- `coords: {}`；已知景點使用韓文搜尋，AIR SKY使用手冊原文地址；其他飯店只搜名稱，分店待確認。未指名場地 `map: null`。
- 個人非商業demo依使用者指定可用官方公開的著作權保留照片；保留來源並明示未取得開放授權，不以「沒有自由授權」等同「沒有實景照」。網站目前仍公開可存取。不得因照片來源而捏造本團未指明的店家／場館。
- 圖片為本地`images/korea/*.jpg`，來源與授權集中`data/photo-sources.json`及`photo-credits.html`。實景需確認場所；不明場所或無可用實景照片採清楚標示的示意／地區照，不冒充指定場所。`imageAlt`、`imageNote`、`photoKey`與來源紀錄一致；`image:null`保留色塊fallback。

## KST與高亮

`shanghaiNow()`僅保留原相容介面名稱，實際已修為韓國KST（UTC+9），即UTC瞬間加9小時並讀UTC欄位。支援有效 `?now=YYYY-MM-DDTHH:mm` 或日期（午夜），不接受無效日期／時刻或帶時區的覆寫。

完全已知時刻的日程保留目前／下一站判斷；含預估或未知時刻的日程只能在已知時刻那一分鐘標示該節點，不推測目前位置或下一站。未定時刻顯示「行程順序・時間待通知」與「待領隊通知」，不顯示狀態類別。

台灣集合13:40對應KST14:40，TW672台灣16:10對應KST17:10、仁川20:00；TW671仁川13:05、台灣抵達15:10對應KST16:10。卡片明寫當地時間。

## 公開資料安全

原始手冊不得複製進repo。不要新增人名、電話、私人聯絡資料、旅行社組織聯絡資料或團號。手冊提醒與法律規定未獨立驗證，行李20／10公斤、220V圓形兩孔、每日NT$300服務費需註明來源；入境與管制規定連到官方作最新查核，不宣稱一律適用。

## 測試與預覽

嚴格TDD：先測試、執行確認RED，再實作確認GREEN。

```bash
node --test tests/*.test.cjs
node --check js/now.js
node --check js/google-maps.js
node --check js/app.js
python3 -m http.server 8000
```

用 `?now=2026-10-11T14:40` 測試已知集合，`?now=2026-10-12T12:00`測試未知時間不高亮，以及前／後／午夜邊界。Node測試使用內建node:test、vm，不加npm套件。瀏覽器檢查分頁、資訊、載入與手機寬度；Google Maps 使用通用 HTTPS 連結（`api=1`），不需要 API key（金鑰）或計費設定；作業系統（OS）／瀏覽器決定開啟 App 或網頁。不得加入點擊攔截、安裝彈窗、逾時／商店 intent；真機原生 App 行為需另外測試，不承諾一定喚起 App。地址優先於有效 WGS84 `lng,lat` 座標（連結改為 `lat,lng`），其次為既有關鍵字；未知目標不出按鈕。交通卡使用 Google Maps 目的地路線與已識別的交通方式。

## 部署

main push觸發GitHub Pages Actions；CI使用 `Asia/Seoul` 產生KST最後更新時間與版本快取標記。`build-info.json`被gitignore，不手動commit。正式網址 `https://soda3752.github.io/korea_trip/`。沒有明確授權不commit、push或更動遠端。

## 設計

`css/style.css` 保留結構，`css/maple-theme.css` 後載覆寫為楓葉主題。保持每日分頁、照片／時間標籤、導航與入場KST翻牌時鐘；裝飾不可阻擋點擊，尊重reduced-motion。不得依舊CSS註解恢復藍綠彩格配色。內容一律繁體中文。更多維護與來源規則見README。
