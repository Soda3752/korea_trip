// Naver Map（네이버 지도）deeplink 組裝
// 設計：以關鍵字（keyword）為主，手機點擊優先喚起 Naver Map App，未安裝自動 fallback 網頁。
// 若景點資料補上 coord（"經度,緯度"，WGS-84 座標系），會升級為精準標點／真實路線規劃。
// 註：Naver 的 nmap:// scheme「強制」要帶 appname 參數（識別呼叫來源）。

const NAVER_APPNAME = 'com.soda3752.korea_trip'; // nmap:// 必填的來源識別字串

// Naver Map App 商店資訊（未安裝時引導安裝）
const NAVER_IOS_APPID = '311867728';           // App Store：NAVER Map
const NAVER_ANDROID_PKG = 'com.nhn.android.nmap'; // Android 套件名
const NAVER_ANDROID_STORE = `https://play.google.com/store/apps/details?id=${NAVER_ANDROID_PKG}`;

// 依平台回傳商店下載連結（桌機回 null）
function naverStoreUrl(plat) {
  const p = plat || naverPlatform();
  if (p === 'ios') return `https://apps.apple.com/app/id${NAVER_IOS_APPID}`;
  if (p === 'android') return NAVER_ANDROID_STORE;
  return null;
}

// 交通方式 → Naver route 類型（car / walk / public / bicycle）
function naverRouteType(mode) {
  if (mode === 'walk') return 'walk';
  if (mode === 'taxi') return 'car';
  if (mode === 'bike' || mode === 'bicycle') return 'bicycle';
  return 'public'; // metro / bus / 其他大眾運輸
}

// 網頁版查詢字串：優先關鍵字，退而用座標
function naverWebQuery(place) {
  if (place.keyword) return place.keyword;
  if (place.coord) {
    const [lon, lat] = place.coord.split(',').map((s) => s.trim());
    return `${lat},${lon}`;
  }
  return '';
}

// 景點導航（網頁 fallback）：一律開 map.naver.com 搜尋（帶入關鍵字或座標）
function naverSearchUrl(place) {
  if (!place) return null;
  const q = naverWebQuery(place);
  if (!q) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
}

// 交通串接（網頁 fallback）：Naver 網頁路線規劃參數複雜，這裡退回「開啟目的地搜尋」
// （手機端會走 naverNativeUrl 的 nmap://route，才有真實路線規劃）
function naverNavUrl(to, _mode) {
  if (!to) return null;
  return naverSearchUrl(to);
}

// ---- 直接喚起 Naver Map App（手機）----
// 平台偵測
function naverPlatform() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ 會偽裝成 Mac
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}

// 組出 nmap:// 的 actionPath?query（不含 scheme 前綴，供 iOS 直接接、Android 包進 intent）
// place: { coord:"lng,lat", keyword }；mode 有值 → 路線規劃(route)，否則 → 標點(place)
function naverActionQuery(place, mode) {
  const [lon, lat] = place.coord.split(',').map((s) => s.trim());
  const name = encodeURIComponent(place.keyword || '');
  if (mode) {
    return `route/${naverRouteType(mode)}?dlat=${lat}&dlng=${lon}&dname=${name}&appname=${NAVER_APPNAME}`;
  }
  return `place?lat=${lat}&lng=${lon}&name=${name}&appname=${NAVER_APPNAME}`;
}

// 組出 App scheme URL（無座標或桌機回 null，交由網頁 fallback）
// iOS：回傳 nmap://…（未安裝的偵測由 app.js 以逾時彈窗處理）
// Android：回傳 intent://…（自帶 browser_fallback_url，未安裝自動退回網頁版地圖）
function naverNativeUrl(place, mode) {
  if (!place || !place.coord) return null;
  const plat = naverPlatform();
  if (plat === 'other') return null;

  const action = naverActionQuery(place, mode);

  if (plat === 'ios') {
    return `nmap://${action}`;
  }
  // Android：用 intent 包 nmap scheme，未裝 App 時 browser_fallback_url 退回網頁版地圖
  const fb = encodeURIComponent(naverSearchUrl(place) || 'https://map.naver.com/');
  return `intent://${action}#Intent;scheme=nmap;package=${NAVER_ANDROID_PKG};S.browser_fallback_url=${fb};end`;
}
