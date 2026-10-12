const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Nightly hotel rows carry the optional taxi card, exactly as renderDay passes it.
const nightlyTaxi = (day, item) => item.name === day.hotel?.name ? day.hotel.taxi : undefined;
// Rows now carry a stable timeline id; today's single planned inference replaces now/next badges.
const rowExtras = (context, day, index, isToday) => {
  const id = `d${day.day}-spot-${index}`;
  const inferred = isToday ? vm.runInContext('APP.state.inferred', context) : null;
  return [id, inferred ? (inferred.id === id ? inferred : null) : undefined];
};
const mealTitle = label => new RegExp(`<h3 class="card-title">🍽 ${label.replace(/[()]/g, '\\$&')}(?: <span class="inferred-badge">[^<]+</span>)?</h3>`);
const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function render(data, dayIndex, time = '12:00') {
  const before = JSON.stringify(data);
  const content = {};
  const context = vm.createContext({ URL, URLSearchParams,
    location: { search: `?now=${data.days[dayIndex].date}T${time}` },
    document: { addEventListener() {}, getElementById: () => content },
    navigator: { userAgent: '' }, window: {}, input: data, dayIndex });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const state = vm.runInContext('APP.data=input;recompute();renderDay(dayIndex);APP.state', context);
  assert.equal(JSON.stringify(data), before, 'render must not mutate source data');
  assert.equal(vm.runInContext('APP.data === input', context), true);
  const rows = [...content.innerHTML.matchAll(/<li class="tl-item ([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
  return { context, state, rows, meals: rows.filter(row => row[1].includes('tl-meal')) };
}
// User change: arranged breakfasts are timeline cards too (4), giving 11 meal cards.
const expectedOrder = [
  [0, 1, 2, 'dinner', 3],
  ['breakfast', 0, 1, 'lunch', 2, 3, 4, 'dinner', 5],
  ['breakfast', 0, 1, 'lunch', 2, 3, 'dinner', 4],
  ['breakfast', 0, 1, 'lunch', 2, 3, 4, 5, 'dinner', 6],
  ['breakfast', 0, 1, 2],
];
test('all five days merge exactly eleven arranged meal cards at their existing estimated times', () => {
  const noPhotos = structuredClone(itinerary);
  noPhotos.days.forEach(day => { delete day.mealPhotos; });
  const counts = [];
  itinerary.days.forEach((day, dayIndex) => {
    const { rows, meals, context } = render(noPhotos, dayIndex);
    counts.push(meals.length);
    assert.equal(meals.length, [1, 3, 3, 3, 1][dayIndex], `D${day.day} meal count`);
    assert.equal(rows.length, expectedOrder[dayIndex].length);
    expectedOrder[dayIndex].forEach((entry, position) => {
      const row = rows[position];
      if (typeof entry === 'number') {
        assert.equal(row[0], context.spotRow(day.items[entry], '', nightlyTaxi(day, day.items[entry]), ...rowExtras(context, day, entry, true)).trim(), 'original spot HTML, time and article links preserved');
      } else {
        assert.match(row[1], /^tl-meal(?: state-inferred state-inferred--\w+)?$/);
        assert.match(row[2], /<article class="card card--meal">/);
        assert.match(row[2], mealTitle(entry === 'breakfast' ? '早餐' : entry === 'lunch' ? '午餐' : day.meals[entry].includes('自理') ? '晚餐(自理)' : '晚餐'));
        assert.ok(row[2].includes(escapeHTML(day.meals[entry])), 'full unchanged meal description');
        assert.ok(row[2].includes(`預估 ${context.fmt12(day.mealTimes[entry])} KST`));
        assert.match(row[2], /時間僅供參考/);
        assert.match(row[2], /非餐廳訂位/);
        assert.match(row[2], /分店.*位置未確認/);
        assert.doesNotMatch(row[0], /state-(?:past|upcoming|current|next)\b|now-badge|next-badge|<img|card-media|media-ph|data-map/);
      }
    });
  });
  assert.deepEqual(counts, [1, 3, 3, 3, 1]);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 11);
});

test('missing or invalid meal times stay pending at the end, never fabricated or sorted as midnight', () => {
  for (const time of [undefined, null, '', '24:00', '12:60', 'bad <time>&"\'', 1200]) {
    const data = structuredClone(itinerary);
    data.days[0].mealTimes.dinner = time;
    const { rows, meals } = render(data, 0);
    assert.equal(meals.length, 1);
    assert.equal(rows.at(-1), meals[0], 'untimed meal has no fabricated time placement');
    assert.match(meals[0][2], /時間待通知/);
    assert.match(meals[0][2], /待領隊通知/);
    assert.doesNotMatch(meals[0][2], /預估|KST|undefined|null|<time>|24:00|12:60/);
  }
  const data = structuredClone(itinerary);
  delete data.days[0].mealTimes;
  assert.match(render(data, 0).meals[0][2], /時間待通知/);
});

test('meal rows keep full descriptions escaped and omit absent or unarranged meals without inventing any', () => {
  const data = structuredClone(itinerary);
  const day = data.days[1];
  delete day.mealPhotos; // Explicit legacy no-photo fixture; canonical photos are tested separately.
  day.meals.lunch += ` <b>餐&"'</b>`;
  day.meals.dinner += ` <img src=x onerror="bad()">`;
  const { meals } = render(data, 1);
  assert.equal(meals.length, 3); // arranged breakfast + lunch + dinner
  assert.match(meals[0][2], /🍽 早餐/);
  for (const [index, key] of ['lunch', 'dinner'].entries()) {
    assert.ok(meals[index + 1][2].includes(escapeHTML(day.meals[key])));
    assert.doesNotMatch(meals[index + 1][2], /<b>|<img|早餐/);
  }
  for (const [missing, count] of [[undefined, 0], [null, 0], [{}, 0], [{ breakfast: '飯店內用' }, 1],
    [{ lunch: '', dinner: '未安排（手冊XXX）' }, 0], [{ lunch: 'XXX', dinner: 42 }, 0], [{ breakfast: '未安排（手冊XXX）' }, 0]]) {
    day.meals = missing;
    assert.equal(render(data, 1).meals.length, count);
  }
});

for (const [clockDay, time, confirmedIndex] of [[0, '14:40', 0], [0, '17:10', 1], [0, '20:00', 2], [4, '13:05', 1], [4, '16:10', 2]]) {
  test(`confirmed D${clockDay + 1} ${time}: all eleven meals unmarked; original state indices and article HTML intact`, () => {
    const atClock = render(itinerary, clockDay, time);
    assert.equal(atClock.state.currentItemIndex, confirmedIndex);
    assert.equal(atClock.state.nextItemIndex, -1);
    let mealCount = 0;
    itinerary.days.forEach((day, dayIndex) => {
      // Render every tab against the same confirmed clock/state, as the actual UI does.
      atClock.context.targetDay = dayIndex;
      vm.runInContext('renderDay(targetDay)', atClock.context);
      const content = atClock.context.document.getElementById('content').innerHTML;
      const rows = [...content.matchAll(/<li class="tl-item ([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
      const mealRows = rows.filter(row => row[1].includes('tl-meal'));
      mealCount += mealRows.length;
      mealRows.forEach(row => assert.doesNotMatch(row[0], /state-|now-badge|next-badge|inferred/));
      const spots = rows.filter(row => row[1].includes('tl-spot'));
      assert.equal(spots.length, day.items.length);
      spots.forEach((row, index) => {
        const state = dayIndex === clockDay && index === confirmedIndex ? 'state-current' : '';
        assert.equal(row[0], atClock.context.spotRow(day.items[index], state, nightlyTaxi(day, day.items[index]), ...rowExtras(atClock.context, day, index, dayIndex === clockDay)).trim());
      });
    });
    assert.equal(mealCount, 11);
  });
}

test('meal insertion leaves fully known original state indices intact even after a inserted row', () => {
  const data = { days: [{ day: 1, date: '2026-10-11', weekday: '日', title: '測試',
    meals: { lunch: '原午餐' }, mealTimes: { lunch: '09:30' }, items: [
      { type: 'spot', name: '一', time: '09:00' },
      { type: 'transit', desc: '交通' },
      { type: 'spot', name: '二', time: '10:00' },
      { type: 'spot', name: '三', time: '11:00' },
    ] }] };
  const { context, rows, state, meals } = render(data, 0, '10:30');
  assert.equal(state.currentItemIndex, 2);
  assert.equal(state.nextItemIndex, 3);
  assert.equal(meals.length, 1);
  assert.doesNotMatch(meals[0][0], /state-/);
  const originals = rows.filter(row => !row[1].includes('tl-meal'));
  ['past', 'past', 'current', 'next'].forEach((status, index) => {
    const item = data.days[0].items[index];
    const marker = index === 2 ? vm.runInContext('APP.state.inferred', context) : null;
    const expected = item.type === 'spot' ? context.spotRow(item, `state-${status}`, undefined, `d1-spot-${index}`, marker) : context.transitRow(item, `state-${status}`, `d1-transit-${index}`);
    assert.equal(originals[index][0], expected.trim());
  });
});

test('compact meal cards reuse existing card styles with the same row spacing as spots', () => {
  const css = fs.readFileSync('css/maple-theme.css', 'utf8');
  assert.match(css, /\.tl-meal\s*\{\s*padding-bottom:\s*14px;\s*\}/);
});
