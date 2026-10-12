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
  // 推估卡片獨立於手冊確認的 current/next；只依預定時間，不代表實際定位。
  const inferred = inferPlannedRow(plannedTimeline(days[dayIndex]), now.minutes);
  return { mode: 'during', dayIndex, currentItemIndex, nextItemIndex, inferred, today: now };
}

// 已安排餐食：有文字且非「未安排／XXX」；未安排者不建立卡片。
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
function isArrangedMeal(text) {
  return typeof text === 'string' && !!text.trim() && !/未安排|XXX/.test(text);
}

// 單日顯示順序（渲染與推估共用）：原 items 依手冊順序，餐食插在第一個較晚的已知時刻之前；
// 無效時刻的餐食排在最後。id 以天數＋原索引／餐別組成，穩定不隨時間變動。
function plannedTimeline(day) {
  const prefix = `d${day.day}`;
  const rows = (day.items || []).map((it, itemIndex) => {
    const kind = it.type === 'spot' ? 'spot' : 'transit';
    return { id: `${prefix}-${kind}-${itemIndex}`, kind, itemIndex, time: it.time, minutes: timeToMinutes(it.time) };
  });
  for (const mealKey of MEAL_KEYS) {
    if (!isArrangedMeal(day.meals && day.meals[mealKey])) continue;
    const time = day.mealTimes && day.mealTimes[mealKey];
    const minutes = timeToMinutes(time);
    const at = minutes === null ? -1 : rows.findIndex(row => row.minutes !== null && row.minutes > minutes);
    rows.splice(at === -1 ? rows.length : at, 0, { id: `${prefix}-meal-${mealKey}`, kind: 'meal', mealKey, time, minutes });
  }
  return rows;
}

const INFERRED_LABEL = { before: '推估下一行程', current: '推估目前行程', final: '推估最後行程' };
// 取開始時刻 <= 現在的最晚卡片（同刻取顯示順序較後者）；早於第一張取第一張，最後一張後維持最後一張。
// 交通列與無效／未知時刻不參與；沒有可用時刻則回傳 null。
function inferPlannedRow(rows, minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
  const timed = rows.filter(row => row.kind !== 'transit' && Number.isInteger(row.minutes));
  if (!timed.length) return null;
  let first = timed[0], final = timed[0], pick = null;
  for (const row of timed) {
    if (row.minutes < first.minutes) first = row;
    if (row.minutes >= final.minutes) final = row;
    if (row.minutes <= minutes && (!pick || row.minutes >= pick.minutes)) pick = row;
  }
  const phase = !pick ? 'before' : pick === final ? 'final' : 'current';
  const row = pick || first;
  return { id: row.id, phase, label: INFERRED_LABEL[phase] };
}
