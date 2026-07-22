// 高德地圖 deeplink 組裝
// 設計：以關鍵字（keyword）為主，手機點擊優先喚起高德 App，未安裝自動 fallback 網頁。
// 保留空間：若景點資料補上 coord（"經度,緯度"，gaode 座標系），會自動升級為精準標點／真實路線規劃。

const AMAP_SRC = 'shanghai-trip';

// 高德 App 商店資訊（未安裝時引導安裝）
const AMAP_IOS_APPID = '461703208';            // App Store：高德地图 / AMap Global
const AMAP_ANDROID_PKG = 'com.autonavi.minimap'; // Android 套件名
const AMAP_ANDROID_STORE = `https://play.google.com/store/apps/details?id=${AMAP_ANDROID_PKG}`;

// 依平台回傳商店下載連結（桌機回 null）
function amapStoreUrl(plat) {
  const p = plat || amapPlatform();
  if (p === 'ios') return `https://apps.apple.com/app/id${AMAP_IOS_APPID}`;
  if (p === 'android') return AMAP_ANDROID_STORE;
  return null;
}

// 交通方式 → 高德路線規劃 mode
function amapNavMode(mode) {
  if (mode === 'walk') return 'walk';
  if (mode === 'taxi') return 'car';
  return 'bus'; // metro / maglev / 其他
}

// 景點導航：有座標走標點，否則關鍵字搜尋
function amapSearchUrl(place) {
  if (!place) return null;
  if (place.coord) {
    const p = new URLSearchParams({
      position: place.coord,
      name: place.keyword || '',
      src: AMAP_SRC,
      coordinate: 'gaode',
      callnative: '1',
    });
    return `https://uri.amap.com/marker?${p.toString()}`;
  }
  const p = new URLSearchParams({ keyword: place.keyword, src: AMAP_SRC, callnative: '1' });
  if (place.city) p.set('city', place.city);
  return `https://uri.amap.com/search?${p.toString()}`;
}

// 交通串接：有目的地座標 → 真實路線規劃；否則 fallback 開啟目的地地點卡（App 內可一鍵「到這去」）
function amapNavUrl(to, mode) {
  if (!to) return null;
  if (to.coord) {
    const p = new URLSearchParams({
      to: to.coord,
      toname: to.keyword || '',
      mode: amapNavMode(mode),
      src: AMAP_SRC,
      coordinate: 'gaode',
      callnative: '1',
    });
    return `https://uri.amap.com/navigation?${p.toString()}`;
  }
  return amapSearchUrl(to);
}

// ---- 直接喚起高德 App（手機）----
// 平台偵測
function amapPlatform() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ 會偽裝成 Mac
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}

// 交通方式 → App scheme 的路線類型 t（0 駕車 / 1 公交 / 2 步行）
function amapSchemeType(mode) {
  if (mode === 'walk') return 2;
  if (mode === 'taxi') return 0;
  return 1; // metro / maglev
}

// 組出 App scheme URL（無座標或桌機回 null，交由網頁 fallback）
// place: { coord:"lng,lat", keyword }；mode 有值 → 路線規劃，否則 → 標點
// Android intent 未安裝時的 browser_fallback_url 指向 Play 商店（引導安裝）；
// iOS 的「未安裝」行為由 app.js 以逾時偵測後彈窗處理。
function amapNativeUrl(place, mode) {
  if (!place || !place.coord) return null;
  const plat = amapPlatform();
  if (plat === 'other') return null;
  const [lon, lat] = place.coord.split(',').map((s) => s.trim());
  const name = encodeURIComponent(place.keyword || '');
  const isRoute = !!mode;

  if (plat === 'ios') {
    return isRoute
      ? `iosamap://path?sourceApplication=${AMAP_SRC}&dlat=${lat}&dlon=${lon}&dname=${name}&dev=0&t=${amapSchemeType(mode)}`
      : `iosamap://viewMap?sourceApplication=${AMAP_SRC}&poiname=${name}&lat=${lat}&lon=${lon}&dev=0`;
  }
  // Android：用 intent，並帶 browser_fallback_url（未裝 App 時自動開網頁）
  const q = isRoute
    ? `route?sourceApplication=${AMAP_SRC}&dlat=${lat}&dlon=${lon}&dname=${name}&dev=0&t=${amapSchemeType(mode)}`
    : `viewMap?sourceApplication=${AMAP_SRC}&poiname=${name}&lat=${lat}&lon=${lon}&dev=0`;
  // 未安裝 → fallback 至 Play 商店引導安裝（取代原本退回網頁版地圖）
  const fb = encodeURIComponent(AMAP_ANDROID_STORE);
  return `intent://${q}#Intent;scheme=androidamap;package=${AMAP_ANDROID_PKG};S.browser_fallback_url=${fb};end`;
}
