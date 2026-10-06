'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const itinerary = JSON.parse(fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8'));

function render(data, dayIndex, time) {
  const content = {};
  const context = vm.createContext({
    URLSearchParams,
    location: { search: `?now=${data.days[dayIndex].date}T${time}` },
    document: { addEventListener() {}, getElementById: () => content },
    navigator: { userAgent: '' }, window: {}, input: data, dayIndex,
  });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  const state = vm.runInContext('APP.data=input;recompute();renderDay(dayIndex);APP.state', context);
  const allRows = [...content.innerHTML.matchAll(/<li class="tl-item ([^"]*)">([\s\S]*?)<\/li>/g)];
  const meals = allRows.filter(row => row[1].includes('tl-meal'));
  const expectedMeals = ['lunch', 'dinner'].filter(key => {
    const text = data.days[dayIndex].meals?.[key];
    return typeof text === 'string' && text.trim() && !/未安排|XXX/.test(text);
  }).length;
  assert.equal(meals.length, expectedMeals);
  meals.forEach(row => assert.doesNotMatch(row[0], /state-|now-badge|next-badge/));
  const rows = allRows.filter(row => /\btl-(?:spot|transit)\b/.test(row[1]));
  assert.equal(rows.length, data.days[dayIndex].items.length);
  return { state, rows };
}

// Check every source minute, including the D1 arrival that previously highlighted the hotel.
for (const [dayIndex, time, exactIndex] of [
  [0, '14:40', 0], [0, '17:10', 1], [0, '20:00', 2],
  [4, '13:05', 1], [4, '16:10', 2],
]) {
  test(`D${dayIndex + 1} ${time}: only the exact confirmed card has a state`, () => {
    const { state, rows } = render(itinerary, dayIndex, time);
    assert.equal(state.currentItemIndex, exactIndex);
    assert.equal(state.nextItemIndex, -1);
    const indices = rows.map((_, index) => index).sort((a, b) =>
      Number(itinerary.days[dayIndex].items[b].timeEstimated === true) -
      Number(itinerary.days[dayIndex].items[a].timeEstimated === true));
    indices.forEach(index => {
      const row = rows[index];
      const item = itinerary.days[dayIndex].items[index];
      assert.equal(row[1].match(/state-(?:past|upcoming|current|next)/g)?.join('') || '',
        index === exactIndex ? 'state-current' : '', `${item.name}: estimated=${item.timeEstimated === true}`);
      assert.equal(/(?:now|next)-badge/.test(row[2]), index === exactIndex);
    });
  });
}

test('mixed unknown and estimated days stay neutral except at confirmed exact minutes', () => {
  const data = { days: [{ day: 1, date: '2026-10-11', weekday: '日', title: '測試', items: [
    { type: 'spot', name: '已知一', time: '09:00' },
    { type: 'transit', desc: '未定交通', time: null },
    { type: 'spot', name: '未定', time: null },
    { type: 'spot', name: '預估', time: '10:00', timeEstimated: true },
    { type: 'spot', name: '已知二', time: '11:00' },
  ] }] };
  for (const time of ['08:59', '09:00', '09:01', '10:00', '11:00', '11:01']) {
    const { rows } = render(data, 0, time);
    rows.forEach((row, index) => {
      const item = data.days[0].items[index];
      const exact = item.type === 'spot' && !item.timeEstimated && item.time === time;
      assert.equal(row[1].match(/state-\w+/)?.[0] || '', exact ? 'state-current' : '', `${time} ${item.name || item.desc}`);
      assert.equal(/(?:now|next)-badge/.test(row[2]), exact);
    });
  }
});

test('fully known nonestimated days preserve current, past, next and upcoming behavior', () => {
  const data = { days: [{ day: 1, date: '2026-10-11', weekday: '日', title: '測試', items: [
    { type: 'spot', name: '一', time: '09:00' },
    { type: 'transit', desc: '交通' },
    { type: 'spot', name: '二', time: '10:00' },
    { type: 'spot', name: '三', time: '11:00' },
  ] }] };
  for (const [time, expected] of [
    ['08:59', ['next', 'upcoming', 'upcoming', 'upcoming']],
    ['09:30', ['current', 'upcoming', 'next', 'upcoming']],
    ['10:30', ['past', 'past', 'current', 'next']],
    ['11:30', ['past', 'past', 'past', 'current']],
  ]) {
    const { rows } = render(data, 0, time);
    assert.deepEqual(rows.map(row => row[1].match(/state-(\w+)/)?.[1]), expected, time);
  }
});
