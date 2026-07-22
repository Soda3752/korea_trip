#!/usr/bin/env node
// 用「高德靜態地圖 API」為每日行程產生真實路線地圖 PNG。
// 資料來源：data/itinerary.json 的 coords（GCJ-02，高德原生座標，零偏移）。
// 輸出：images/route-dayN.png（數字標號 + 路線連線，疊在真實上海地圖上）。
// 零依賴：Node 18+ 內建 fetch。
//
// 用法：
//   AMAP_KEY=你的Web服務key node tools/generate-static-maps.mjs
//   AMAP_KEY=xxx node tools/generate-static-maps.mjs 1 4   # 只生第 1、4 天
//
// 取得 key：https://console.amap.com → 建立應用 → 新增「Web服務」類型 key
//
// 設計：
//   - 標記顏色：起點＝胭脂紅 #9e2b25，其餘＝鎏金 #c9a24b（呼應網站設計語言）。
//   - 路線：鎏金折線依「實際造訪順序」連接各停留點（含回飯店的回程）。
//   - 不在地圖內放中文：標記只用數字 1–9，景點名稱由網站時間軸本身當圖例。
//   - 比例 4:5（640*800，scale=2 → 實際 1280*1600）。
//   - 帶 markers/paths 時不送 location/zoom，高德會自動框定當日範圍。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AMAP_KEY = process.env.AMAP_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const ENDPOINT = 'https://restapi.amap.com/v3/staticmap';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'images');

const SIZE = '800*1000';     // 4:5 直式（單軸上限 1024）
const SCALE = '2';           // 高清，實際輸出為 size 兩倍
const GOLD = '0xC9A24B';     // 鎏金（一般停留點）
const ROUGE = '0x9E2B25';    // 胭脂紅（起點）
const PATH_WEIGHT = '6';

// ── 可用環境變數即時調整呈現 ───────────────────────────────────────
const MARKER_SIZE = process.env.MARKER_SIZE || 'large';     // small | mid | large
const ZOOM_ADJUST = Number(process.env.ZOOM_ADJUST || '0'); // 縮放微調：+1 再放大一級，-1 拉遠
// 邊距(px)：計算縮放時預留，確保針頭完整在框內。針頭錨點在底、向上延伸，故上方留多一點。
const PAD_X = Number(process.env.PAD_X || '70');            // 左右
const PAD_TOP = Number(process.env.PAD_TOP || '130');       // 上方（容納針頭高度，針頭錨點在底向上延伸）
const PAD_BOTTOM = Number(process.env.PAD_BOTTOM || '70');  // 下方

if (!AMAP_KEY && !DRY_RUN) {
  console.error('✗ 缺少 AMAP_KEY 環境變數。\n  取得：https://console.amap.com（建立「Web服務」key）\n  範例：AMAP_KEY=xxxx node tools/generate-static-maps.mjs\n  （或先 DRY_RUN=1 不帶 key 預覽組好的 URL）');
  process.exit(1);
}

// 從 itinerary.json 抽出每天「實際造訪順序」的座標序列。
// 主體只取景點(spot)座標；頭尾若是交通(transit)則代表「從飯店出發／搭車返回飯店」，
// 補上對應的飯店/目的地點，讓路線首尾完整（transit 的中途目的地通常與下一景點重複，故不計入）。
function buildDaySequence(day, coords, hotelCoord) {
  const items = day.items || [];
  const coordOf = (it) => {
    const kw = it.type === 'spot' ? it.map?.keyword : it.to?.keyword;
    return kw && coords[kw] ? coords[kw] : null;
  };

  const seq = [];
  const push = (coord, name) => {
    if (!coord) return;
    if (seq.length && seq[seq.length - 1].coord === coord) return; // 去除連續重複
    seq.push({ coord, name });
  };

  const coordItems = items.filter((it) => coordOf(it));

  // 頭：若當天第一個帶座標的項目是交通，代表從飯店出發 → 補飯店為起點。
  const first = coordItems[0];
  if (first && first.type === 'transit' && hotelCoord) push(hotelCoord, '飯店');

  // 主體：僅景點。
  for (const it of items) {
    if (it.type === 'spot') push(coordOf(it), it.name);
  }

  // 尾：若當天最後一個帶座標的項目是交通（回程），補上它的目的地（通常為飯店）。
  const last = coordItems[coordItems.length - 1];
  if (last && last.type === 'transit') push(coordOf(last), last.to?.keyword || '返回');

  return seq;
}

// 依座標去重，保留首次出現順序 → 給每個獨立地點一個編號（1 起跳）。
function uniqueStops(seq) {
  const map = new Map(); // coord -> { num, name }
  let n = 0;
  for (const s of seq) {
    if (!map.has(s.coord)) map.set(s.coord, { num: ++n, name: s.name, coord: s.coord });
  }
  return [...map.values()];
}

// 兩點間近似直線距離（km），用來判斷哪些點是「離飯店很遠」的遠點。
function distKm(a, b) {
  const [lng1, lat1] = a.split(',').map(Number);
  const [lng2, lat2] = b.split(',').map(Number);
  const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180) * 111.32;
  const dy = (lat2 - lat1) * 110.57;
  return Math.hypot(dx, dy);
}

// 依各點經緯度範圍算出「中心點＋縮放級別」，取代高德自動框定（自動框定邊距太多、範圍偏廣）。
function computeView(stops) {
  const lngs = stops.map((s) => parseFloat(s.coord.split(',')[0]));
  const lats = stops.map((s) => parseFloat(s.coord.split(',')[1]));
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const center = `${((minLng + maxLng) / 2).toFixed(6)},${((minLat + maxLat) / 2).toFixed(6)}`;

  const [W, H] = SIZE.split('*').map(Number);
  // 扣掉邊距後的可用像素，讓「座標點 bbox」只佔這塊，四周留白容納針頭。
  const effW = Math.max(W - 2 * PAD_X, 50);
  const effH = Math.max(H - PAD_TOP - PAD_BOTTOM, 50);
  const lonSpan = Math.max(maxLng - minLng, 1e-4);
  const latSpan = Math.max(maxLat - minLat, 1e-4);
  const latC = ((minLat + maxLat) / 2) * Math.PI / 180;

  // 經/緯各自能容納的最大縮放（zoom 越大越近），取較小者確保全部點都進可用區。
  const zLon = Math.log2((effW * 360) / (256 * lonSpan));
  const zLat = Math.log2((effH * 360 * Math.cos(latC)) / (256 * latSpan));
  let zoom = Math.floor(Math.min(zLon, zLat)) + ZOOM_ADJUST;
  zoom = Math.max(3, Math.min(17, zoom));
  return { center, zoom };
}

// 由「路線點(含回程重複)」與「標記停留點(已編號)」組出靜態地圖 URL。
function buildUrl(pathPts, stops) {
  if (!stops.length) return null;

  // markers：每個停留點一組樣式（label 為單一數字）。編號最小者(起點)用胭脂紅，其餘鎏金。
  const markers = stops
    .map((s, i) => `${MARKER_SIZE},${i === 0 ? ROUGE : GOLD},${s.num}:${s.coord}`)
    .join('|');

  const { center, zoom } = computeView(stops);
  const params = new URLSearchParams({
    key: AMAP_KEY || 'undefined',
    location: center,
    zoom: String(zoom),
    size: SIZE,
    scale: SCALE,
    markers,
  });

  // paths：依造訪順序連成鎏金折線；僅 ≥2 點才畫。
  if (pathPts.length >= 2) {
    params.set('paths', `${PATH_WEIGHT},${GOLD},1,,:${pathPts.map((p) => p.coord).join(';')}`);
  }
  return `${ENDPOINT}?${params.toString()}`;
}

const FAR_KM = 12; // 距飯店超過此距離視為「遠點」（機場、迪士尼、朱家角…）

// 規劃當天要產生的地圖工作：總是有「全貌總覽」；若遠點壓扁了市區（市區≥2點且有遠點），
// 再加一張「市區特寫」（編號沿用總覽，只框市區）。
function planDayJobs(day, coords, hotelCoord) {
  const seq = buildDaySequence(day, coords, hotelCoord);
  const stops = uniqueStops(seq);
  const jobs = [{ suffix: '', pathPts: seq, stops, label: '全貌' }];

  if (hotelCoord) {
    const isCity = (coord) => distKm(coord, hotelCoord) <= FAR_KM;
    const cityStops = stops.filter((s) => isCity(s.coord));
    const hasFar = stops.some((s) => !isCity(s.coord));
    if (cityStops.length >= 2 && hasFar) {
      jobs.push({
        suffix: '-city',
        pathPts: seq.filter((p) => isCity(p.coord)),
        stops: cityStops,
        label: '市區特寫',
      });
    }
  }
  return jobs;
}

async function runJob(day, job) {
  const url = buildUrl(job.pathPts, job.stops);
  if (!url) throw new Error('找不到有座標的停留點');

  const outPath = join(OUT_DIR, `route-day${day.day}${job.suffix}.png`);
  if (DRY_RUN) return { outPath: '(DRY_RUN 未存檔)', url };

  const res = await fetch(url);
  const ctype = res.headers.get('content-type') || '';
  // 高德出錯時會回 JSON（status:0），成功才回圖片二進位。
  if (ctype.includes('application/json') || ctype.includes('text')) {
    throw new Error(`高德回報錯誤：${(await res.text()).slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return { outPath, url };
}

async function main() {
  const raw = await readFile(join(ROOT, 'data', 'itinerary.json'), 'utf8');
  const data = JSON.parse(raw);
  const coords = data.coords || {};

  // 找出飯店座標（coords key 含「亞朵」者）。
  const hotelKey = Object.keys(coords).find((k) => k.includes('亞朵'));
  const hotelCoord = hotelKey ? coords[hotelKey] : null;

  await mkdir(OUT_DIR, { recursive: true });

  const wanted = process.argv.slice(2).map(Number).filter((x) => x >= 1 && x <= (data.days?.length || 0));
  const targets = (data.days || []).filter((d) => !wanted.length || wanted.includes(d.day));

  console.log(`處理 ${targets.length} 天（size ${SIZE} scale ${SCALE}，遠點門檻 ${FAR_KM}km）`);

  for (const day of targets) {
    const jobs = planDayJobs(day, coords, hotelCoord);
    const legend = uniqueStops(buildDaySequence(day, coords, hotelCoord))
      .map((s) => `${s.num} ${s.name}`)
      .join('｜');
    console.log(`Day ${day.day}（${jobs.length === 2 ? '兩張：全貌＋市區特寫' : '一張'}）｜圖例：${legend}`);
    for (const job of jobs) {
      process.stdout.write(`  ${job.label} … `);
      try {
        const { outPath } = await runJob(day, job);
        console.log(`✓ ${outPath}`);
      } catch (err) {
        console.log(`✗ 失敗：${err.message}`);
      }
    }
  }
  console.log('完成。');
}

main().catch((e) => {
  console.error('未預期錯誤：', e);
  process.exit(1);
});
