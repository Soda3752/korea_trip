// KST（UTC+9）牆上時間，與裝置時區無關。
// shanghaiNow 保留原全域介面名稱；實際一律使用韓國時間。
function shanghaiNow() {
  const override = new URLSearchParams(location.search).get('now');
  const m = override && /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(override);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0);
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && h < 24 && mi < 60) {
      return makeNowParts(y, mo, d, h, mi, true);
    }
  }
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return makeNowParts(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate(), kst.getUTCHours(), kst.getUTCMinutes(), false);
}
function makeNowParts(y, mo, d, h, mi, isOverride) {
  const pad = n => String(n).padStart(2, '0');
  return { dateStr: `${y}-${pad(mo)}-${pad(d)}`, minutes: h * 60 + mi, h, mi, label: `${pad(h)}:${pad(mi)}`, isOverride: !!isOverride };
}
function timeToMinutes(t) {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
function resolveState(data, now) {
  const days = data.days;
  const dates = days.map(d => d.date);
  const dayIndex = dates.indexOf(now.dateStr);
  if (dayIndex === -1) {
    if (now.dateStr < dates[0]) return { mode: 'before', dayIndex: 0 };
    if (now.dateStr > dates[dates.length - 1]) return { mode: 'after', dayIndex: days.length - 1 };
    return { mode: 'none', dayIndex: 0 };
  }
  const spots = days[dayIndex].items.map((it, index) => ({ index, minutes: timeToMinutes(it.time), type: it.type, estimated: it.timeEstimated === true })).filter(it => it.type === 'spot');
  const hasUnknown = spots.some(it => it.minutes === null || it.estimated);
  let currentItemIndex = -1, nextItemIndex = -1;
  if (hasUnknown) {
    // 混合未知時間時，不能由已知出發時間推測之後仍在同一場所。
    // 只在手冊已知時間那一分鐘標示當下節點，不推測「即將」。
    const exact = spots.find(it => it.minutes !== null && !it.estimated && it.minutes === now.minutes);
    if (exact) currentItemIndex = exact.index;
  } else {
    spots.forEach(it => { if (it.minutes <= now.minutes) currentItemIndex = it.index; });
    const next = spots.find(it => it.index > currentItemIndex);
    if (next) nextItemIndex = next.index;
  }
  return { mode: 'during', dayIndex, currentItemIndex, nextItemIndex, today: now };
}
