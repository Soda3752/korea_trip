// 上海自由行 — 主程式：載入資料、tab 切換、時間軸渲染、當前景點高亮

const APP = { data: null, state: null, activeDay: 0, refreshTimer: null };

const MODE_ICON = { walk: '🚶', taxi: '🚕', metro: '🚇', maglev: '🚄' };
const MODE_LABEL = { walk: '步行', taxi: '打車', metro: '地鐵', maglev: '磁浮' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  fillIntroClock(); // 依當前上海時間填入翻牌時鐘，讓入場數字與「現在」一致
  if (await checkFreshVersion()) return; // 偵測到新版 → 已觸發強制重載，停止後續初始化
  try {
    const res = await fetch('data/itinerary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    APP.data = await res.json();
    enrichCoords(APP.data);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<p class="load-error">行程資料載入失敗：${e.message}<br>請確認 data/itinerary.json 存在且為合法 JSON。</p>`;
    hideIntro();
    return;
  }
  recompute();
  renderHeader();
  renderUpdatedAt();
  syncTopbarHeight();
  renderTabs();
  APP.activeDay = APP.state.dayIndex; // 預設開「今天」
  selectTab(APP.activeDay, { scroll: false });
  bindNowButton();
  attachMapHandler();
  bindHeaderCollapse();
  scrollToCurrent();
  playIntro(); // 一次性：時間軸依序浮現 → 翻牌時鐘淡出
  // 每分鐘更新一次高亮（覆寫模式下不自動跳動）
  APP.refreshTimer = setInterval(() => {
    if (APP.state && APP.state.today && APP.state.today.isOverride) return;
    recompute();
    if (typeof APP.activeDay === 'number') selectTab(APP.activeDay, { scroll: false, keep: true });
  }, 60 * 1000);
}

// ---- 入場：翻牌時鐘 ----
const PREFERS_REDUCED = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 依當前上海時間填入翻牌四位數（HH:mm）
function fillIntroClock() {
  const loader = document.getElementById('deco-loader');
  if (!loader) return;
  const now = shanghaiNow();
  const [h10, h1, , m10, m1] = now.label; // "HH:mm" → 取四位數字（跳過冒號）
  const set = (sel, ch) => { const el = loader.querySelector(sel); if (el) el.textContent = ch; };
  set('[data-h10]', h10);
  set('[data-h1]', h1);
  set('[data-m10]', m10);
  set('[data-m1]', m1);
}

// 一次性入場：時間軸卡片依序浮現，再淡出翻牌時鐘
function playIntro() {
  if (APP.introDone) return;
  APP.introDone = true;
  if (PREFERS_REDUCED()) { hideIntro(); return; }
  const tl = document.querySelector('.timeline');
  if (tl) {
    tl.classList.add('is-entering');
    tl.querySelectorAll('.tl-item').forEach((el, i) => { el.style.animationDelay = (i * 0.07) + 's'; });
  }
  setTimeout(hideIntro, 1900);
}

function hideIntro() {
  const loader = document.getElementById('deco-loader');
  if (loader) loader.classList.add('is-hidden');
}

// 由 data.coords 為各 map/to 補上座標（已自帶 coord 者不覆蓋）→ 啟用精準標點與真實路線規劃
function enrichCoords(data) {
  const dict = data.coords || {};
  const fill = (place) => {
    if (place && place.keyword && !place.coord && dict[place.keyword]) {
      place.coord = dict[place.keyword];
    }
  };
  data.days.forEach((d) => d.items.forEach((it) => {
    if (it.type === 'spot') fill(it.map);
    else if (it.type === 'transit') fill(it.to);
  }));
}

function recompute() {
  const now = shanghaiNow();
  APP.state = resolveState(APP.data, now);
  APP.state.today = now;
}

function renderHeader() {
  const m = APP.data.meta;
  document.getElementById('app-title').textContent = m.title;
  document.getElementById('app-sub').textContent =
    `${m.dateRange} · ${m.people}人 · ${m.hotel}`;
}

// sessionStorage 安全存取（隱私模式下存取可能 throw）
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }

// 版本檢查：build-info.json 一律 no-store 抓最新版本號，與本頁載入時的 window.__BUILD__ 比對；
// 不同代表使用者拿到的是被快取的舊頁 → 帶 cache-bust 參數強制重載一次（繞過 GitHub Pages 的 max-age=600）。
// 重載發生在入場 loader 仍覆蓋畫面時，使用者不會看到舊內容閃現。
async function checkFreshVersion() {
  const built = window.__BUILD__;
  if (!built || built === '__BUILD_VERSION__') return false; // 本機預覽／未經 CI 注入 → 略過
  try {
    const res = await fetch('build-info.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const info = await res.json();
    APP.buildInfo = info; // 供 renderUpdatedAt 重用，免重複請求
    if (info.version && info.version !== built) {
      if (ssGet('cb-version') === info.version) return false; // 本 session 已為此版本重載過 → 防迴圈
      ssSet('cb-version', info.version);
      const url = new URL(location.href);
      url.searchParams.set('_', info.version); // 唯一 query → CDN/瀏覽器快取 miss → 抓回最新 HTML
      location.replace(url.toString());
      return true;
    }
  } catch (_) {
    /* 無此檔（本機預覽）或網路問題 → 不處理 */
  }
  return false;
}

// 最後更新時間（由 CI 部署時產生的 build-info.json，台北 UTC+8）
async function renderUpdatedAt() {
  const el = document.getElementById('app-updated');
  if (!el) return;
  try {
    let info = APP.buildInfo;
    if (!info) {
      const res = await fetch('build-info.json', { cache: 'no-store' });
      if (!res.ok) return;
      info = await res.json();
    }
    if (!info.builtAt) return;
    el.textContent = `最後更新：${info.builtAt}`;
    el.hidden = false;
    syncTopbarHeight(); // 此行非同步出現會墊高標題 → 重新量測
  } catch (_) {
    /* 本地預覽無此檔 → 不顯示 */
  }
}

// 量測標題列實際高度寫回 --topbar-h，讓 tabbar 的 sticky top 與收合位移永遠對齊
// （標題字數／「最後更新」行／螢幕寬度都會改變高度，不能寫死）
function syncTopbarHeight() {
  const tb = document.querySelector('.topbar');
  if (!tb) return;
  const h = Math.round(tb.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty('--topbar-h', h + 'px');
}

// ---- Tabs ----
function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  APP.data.days.forEach((d, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.setAttribute('role', 'tab');
    btn.dataset.idx = i;
    const isToday = APP.state.mode === 'during' && APP.state.dayIndex === i;
    btn.innerHTML = `<span class="tab-day">D${d.day}</span><span class="tab-date">${d.date.slice(5).replace('-', '/')}</span>${isToday ? '<span class="tab-dot" title="今天"></span>' : ''}`;
    btn.addEventListener('click', () => selectTab(i, { scroll: true }));
    nav.appendChild(btn);
  });
  const info = document.createElement('button');
  info.className = 'tab tab--info';
  info.dataset.idx = 'info';
  info.innerHTML = `<span class="tab-day">ℹ️</span><span class="tab-date">資訊</span>`;
  info.addEventListener('click', () => selectTab('info', { scroll: true }));
  nav.appendChild(info);
}

function selectTab(idx, opts = {}) {
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.idx === String(idx);
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (idx === 'info') {
    APP.activeDay = 'info';
    renderInfo();
  } else {
    APP.activeDay = idx;
    renderDay(idx);
  }
  if (opts.scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  // 顯示/隱藏「回到現在」
  const nowBtn = document.getElementById('now-btn');
  nowBtn.hidden = !(APP.state.mode === 'during');
}

// ---- 狀態橫幅（旅程前/後）----
function bannerHTML() {
  const s = APP.state;
  if (s.mode === 'before') {
    const start = APP.data.days[0].date;
    return `<div class="banner banner--before">🧳 旅程尚未開始（${start} 出發）。先看看每天的安排吧！</div>`;
  }
  if (s.mode === 'after') {
    return `<div class="banner banner--after">✈️ 旅程已結束，感謝這趟美好的回憶 ♥</div>`;
  }
  return '';
}

// ---- 單日時間軸 ----
function renderDay(dayIndex) {
  const day = APP.data.days[dayIndex];
  const isToday = APP.state.mode === 'during' && APP.state.dayIndex === dayIndex;
  const curIdx = isToday ? APP.state.currentItemIndex : -1;
  const nextIdx = isToday ? APP.state.nextItemIndex : -1;

  const itemState = (i, type) => {
    if (!isToday) return '';
    if (type === 'spot') {
      if (i === curIdx) return 'state-current';
      if (i === nextIdx) return 'state-next';
      return i < curIdx ? 'state-past' : 'state-upcoming';
    }
    // transit：依位置歸屬
    if (curIdx === -1) return 'state-upcoming';
    return i <= curIdx ? 'state-past' : 'state-upcoming';
  };

  const rows = day.items.map((it, i) => {
    return it.type === 'spot'
      ? spotRow(it, itemState(i, 'spot'))
      : transitRow(it, itemState(i, 'transit'));
  }).join('');

  const html = `
    ${bannerHTML()}
    <header class="day-head">
      <div class="day-kicker">Day ${day.day} · ${day.date.slice(5).replace('-', '/')}（${day.weekday}）</div>
      <h2 class="day-title">${esc(day.title)}</h2>
    </header>
    <ol class="timeline">${rows}</ol>
    ${notesHTML(day)}
  `;
  document.getElementById('content').innerHTML = html;
}

function spotRow(it, state) {
  const time = it.time ? `<time class="spot-time">${esc(fmt12(it.time))}</time>` : '';
  const nav = it.map
    ? `<a class="btn-nav" data-map href="${amapSearchUrl(it.map)}" target="_blank" rel="noopener"
         data-coord="${esc(it.map.coord || '')}" data-name="${esc(it.map.keyword || '')}" data-mode="">導航 ↗</a>`
    : '';
  const badge = state === 'state-current'
    ? '<span class="now-badge">現在</span>'
    : state === 'state-next' ? '<span class="next-badge">即將</span>' : '';
  return `
    <li class="tl-item tl-spot ${state}">
      <div class="tl-rail"><span class="tl-node"></span></div>
      <article class="card">
        <div class="card-media">${mediaHTML(it)}${time}</div>
        <div class="card-body">
          <div class="card-head">
            <h3 class="card-title">${esc(it.name)} ${badge}</h3>
            ${nav}
          </div>
          ${it.stay ? `<p class="spot-stay">⏱ 預計停留 <b>${esc(it.stay)}</b></p>` : ''}
          ${it.intro ? `<p class="card-intro">${esc(it.intro)}</p>` : ''}
        </div>
      </article>
    </li>`;
}

function transitRow(it, state) {
  const url = amapNavUrl(it.to, it.mode);
  const icon = MODE_ICON[it.mode] || '➡️';
  const dest = it.to && it.to.keyword
    ? `<span class="transit-dest">▸ 即將前往 ${esc(it.to.keyword)}</span>` : '';
  const inner = `
      <span class="transit-icon">${icon}</span>
      <span class="transit-text">
        <span class="transit-desc">${esc(it.desc || MODE_LABEL[it.mode] || '移動')}</span>
        ${dest}
      </span>
      ${url ? '<span class="transit-go">開地圖 ↗</span>' : ''}`;
  const body = url
    ? `<a class="transit-chip" data-map href="${url}" target="_blank" rel="noopener"
         data-coord="${esc((it.to && it.to.coord) || '')}" data-name="${esc((it.to && it.to.keyword) || '')}" data-mode="${esc(it.mode || '')}">${inner}</a>`
    : `<div class="transit-chip transit-chip--static">${inner}</div>`;
  return `
    <li class="tl-item tl-transit ${state}">
      <div class="tl-rail tl-rail--dashed"></div>
      ${body}
    </li>`;
}

function mediaHTML(it) {
  if (it.image) {
    return `<img class="media-img" src="${esc(it.image)}" alt="${esc(it.name)}" loading="lazy">`;
  }
  // 漸層佔位圖：依名稱取色相，固定落在藍～靛範圍以維持藍白主調
  const hue = 200 + (hashStr(it.name) % 60);
  const style = `background:linear-gradient(135deg,hsl(${hue} 55% 42%),hsl(${hue + 25} 60% 30%))`;
  return `<div class="media-ph" style="${style}">
      <span class="media-ph-name">${esc(it.name)}</span>
      <span class="media-ph-hint">📷 待補圖</span>
    </div>`;
}

function notesHTML(day) {
  const parts = [];
  if (day.tips) parts.push(`<div class="note note--tip"><span class="note-ico">💡</span><div><strong>小提醒</strong><p>${esc(day.tips)}</p></div></div>`);
  if (day.transport) parts.push(`<div class="note note--car"><span class="note-ico">🚗</span><div><strong>交通</strong><p>${esc(day.transport)}</p></div></div>`);
  return parts.length ? `<section class="notes">${parts.join('')}</section>` : '';
}

// ---- 資訊分頁 ----
function renderInfo() {
  const info = APP.data.info;
  const tableRows = info.transportTable.map(
    (r) => `<tr><td>${esc(r.from)}</td><td>${esc(r.method)}</td><td>${esc(r.cost)}</td><td>${esc(r.note)}</td></tr>`
  ).join('');
  const budgetRows = info.budget.map(
    (r) => `<tr><td>${esc(r.item)}</td><td class="num">${esc(r.perPerson)}</td><td>${esc(r.note)}</td></tr>`
  ).join('');
  const checklist = info.checklist.map((c) => `<li><label><input type="checkbox"> ${esc(c)}</label></li>`).join('');
  const didi = info.didiGuide.map((c) => `<li>${esc(c)}</li>`).join('');
  const notes = info.notes.map((c) => `<li>${esc(c)}</li>`).join('');
  const apps = info.apps.map((a) => `<li><strong>${esc(a.name)}</strong> — ${esc(a.use)}</li>`).join('');

  document.getElementById('content').innerHTML = `
    <header class="day-head"><h2 class="day-title">實用資訊</h2></header>
    <section class="info-block">
      <h3 class="info-h">🚌 交通總覽・每天怎麼移動</h3>
      <div class="table-wrap"><table class="info-table">
        <thead><tr><th>路段</th><th>方式</th><th>費用</th><th>備註</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
    </section>
    <section class="info-block">
      <h3 class="info-h">💰 預估費用（台幣・每人參考）</h3>
      <div class="table-wrap"><table class="info-table">
        <thead><tr><th>項目</th><th>每人</th><th>備註</th></tr></thead>
        <tbody>${budgetRows}</tbody>
      </table></div>
    </section>
    <section class="info-block">
      <h3 class="info-h">🧳 行李清單</h3>
      <ul class="checklist">${checklist}</ul>
    </section>
    <section class="info-block">
      <h3 class="info-h">🚕 滴滴叫車・使用指南</h3>
      <ul class="bullet">${didi}</ul>
    </section>
    <section class="info-block">
      <h3 class="info-h">☀️ 7 月上海注意事項</h3>
      <ul class="bullet">${notes}</ul>
    </section>
    <section class="info-block">
      <h3 class="info-h">📱 實用 App</h3>
      <ul class="bullet">${apps}</ul>
    </section>`;
}

// ---- 回到現在 ----
function bindNowButton() {
  const btn = document.getElementById('now-btn');
  btn.addEventListener('click', () => {
    recompute();
    if (APP.state.mode === 'during') {
      selectTab(APP.state.dayIndex, { scroll: false });
      scrollToCurrent();
    }
  });
}

// 上滑捲過門檻 → 收合頂部標題（藍色 Day 分頁維持至頂）；捲回頂端再展開。
// 用 transform 收合（不觸發 reflow，門檻不會抖動）；加 hysteresis 防臨界閃動。
function bindHeaderCollapse() {
  const COLLAPSE_AT = 72; // 捲過此距離（px）收合
  const EXPAND_AT = 16;   // 捲回此距離內展開
  let collapsed = false;
  let ticking = false;
  const update = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    if (!collapsed && y > COLLAPSE_AT) {
      collapsed = true;
      document.body.classList.add('head-collapsed');
    } else if (collapsed && y < EXPAND_AT) {
      collapsed = false;
      document.body.classList.remove('head-collapsed');
    }
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  // 轉向／改變視窗寬度會改變標題列高度 → 重新量測對齊
  window.addEventListener('resize', () => requestAnimationFrame(syncTopbarHeight), { passive: true });
  update();
}

// 手機點擊「導航」/交通串接 → 先試喚起高德 App，開不起來才退回網頁
function attachMapHandler() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-map]');
    if (!a) return;
    const coord = a.getAttribute('data-coord');
    if (!coord) return; // 無座標 → 直接走 href（網頁搜尋）
    const web = a.getAttribute('href');
    const native = amapNativeUrl(
      { coord, keyword: a.getAttribute('data-name') || '' },
      a.getAttribute('data-mode') || ''
    );
    if (!native) return; // 桌機 → 正常開網頁
    e.preventDefault();
    if (amapPlatform() === 'android') {
      // intent 自帶 browser_fallback_url：有裝開 App，沒裝自動跳商店引導安裝
      window.location.href = native;
      return;
    }
    // iOS：嘗試喚起 App，1.5 秒內若頁面仍可見（App 沒開）→ 彈窗引導安裝／改用網頁版
    const timer = setTimeout(() => {
      if (!document.hidden) showInstallDialog(web);
    }, 1500);
    const cancel = () => clearTimeout(timer);
    document.addEventListener('visibilitychange', cancel, { once: true });
    window.addEventListener('pagehide', cancel, { once: true });
    window.location.href = native;
  });
}

// 未偵測到高德 App（iOS）→ 底部彈窗：前往安裝／改用網頁版／取消
function showInstallDialog(webUrl) {
  if (document.querySelector('.install-sheet')) return; // 避免重複
  const overlay = document.createElement('div');
  overlay.className = 'install-overlay';
  overlay.innerHTML = `
    <div class="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <p class="install-title" id="install-title">尚未偵測到高德地圖 App</p>
      <p class="install-desc">安裝後導航更精準，<br>或改用網頁版地圖繼續。</p>
      <button type="button" class="install-btn install-btn--primary" data-act="install">前往安裝高德地圖</button>
      <button type="button" class="install-btn" data-act="web">改用網頁版地圖</button>
      <button type="button" class="install-btn install-btn--ghost" data-act="cancel">取消</button>
    </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.getAttribute('data-act');
    if (ev.target === overlay || act === 'cancel') return close();
    if (act === 'install') {
      const store = amapStoreUrl('ios');
      if (store) window.location.href = store;
      return close();
    }
    if (act === 'web') {
      if (webUrl) window.location.href = webUrl;
      return close();
    }
  });
  document.body.appendChild(overlay);
}

function scrollToCurrent() {
  if (APP.state.mode !== 'during' || APP.activeDay !== APP.state.dayIndex) return;
  requestAnimationFrame(() => {
    const el = document.querySelector('.state-current') || document.querySelector('.state-next');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// "HH:mm"(24h) → 中文時段 12 小時制，如 13:00→「下午 1:00」、20:30→「晚上 8:30」、04:30→「凌晨 4:30」
// 內部判斷一律用原始 24h 字串，這裡只負責顯示轉換；非 HH:mm 格式原樣回傳。
function fmt12(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return t;
  const h = +m[1];
  const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${m[2]}`;
}

// ---- utils ----
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
