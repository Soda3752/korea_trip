// 當前時間與「目前該在哪個景點」判斷
// 一律以 UTC+8（上海/台灣）計算，與裝置時區設定無關。
// 測試/Demo：用 ?now=2026-07-14T10:30 覆寫當前時間。

// 回傳上海牆上時間的結構：{ dateStr:'YYYY-MM-DD', minutes:當日分鐘數, h, mi, label }
function shanghaiNow() {
  const override = new URLSearchParams(location.search).get('now');
  if (override) {
    const m = override.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (m) {
      const h = m[4] ? +m[4] : 0;
      const mi = m[5] ? +m[5] : 0;
      return makeNowParts(m[1], +m[2], +m[3], h, mi, true);
    }
  }
  // 真實裝置時間 → 轉成 UTC+8 牆上時間：取 UTC 瞬間 + 8h，再讀 UTC 欄位
  const sh = new Date(Date.now() + 8 * 3600 * 1000);
  return makeNowParts(
    sh.getUTCFullYear(),
    sh.getUTCMonth() + 1,
    sh.getUTCDate(),
    sh.getUTCHours(),
    sh.getUTCMinutes(),
    false
  );
}

function makeNowParts(y, mo, d, h, mi, isOverride) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateStr: `${y}-${pad(mo)}-${pad(d)}`,
    minutes: h * 60 + mi,
    h,
    mi,
    label: `${pad(h)}:${pad(mi)}`,
    isOverride: !!isOverride,
  };
}

function timeToMinutes(t) {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

// 解析整體狀態
// 回傳 { mode, dayIndex, currentItemIndex, nextItemIndex, today }
//   mode: 'before' | 'after' | 'during' | 'none'
function resolveState(data, now) {
  const days = data.days;
  const dates = days.map((d) => d.date);
  const todayIndex = dates.indexOf(now.dateStr);

  if (todayIndex === -1) {
    if (now.dateStr < dates[0]) return { mode: 'before', dayIndex: 0 };
    if (now.dateStr > dates[dates.length - 1]) return { mode: 'after', dayIndex: days.length - 1 };
    return { mode: 'none', dayIndex: 0 };
  }

  // 行程期間內：在當天 spot 中找最後一個 time ≤ 現在
  const items = days[todayIndex].items;
  let currentItemIndex = -1;
  items.forEach((it, i) => {
    if (it.type !== 'spot') return;
    const mins = timeToMinutes(it.time);
    if (mins !== null && mins <= now.minutes) currentItemIndex = i;
  });

  // 下一個 spot
  let nextItemIndex = -1;
  for (let i = currentItemIndex + 1; i < items.length; i++) {
    if (items[i].type === 'spot') { nextItemIndex = i; break; }
  }

  return { mode: 'during', dayIndex: todayIndex, currentItemIndex, nextItemIndex, today: now };
}
