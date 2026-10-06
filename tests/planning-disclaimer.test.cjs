'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const itinerary = JSON.parse(fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8'));

function app() {
  const context = vm.createContext({
    document: { addEventListener() {} },
    navigator: { userAgent: '' },
    window: {},
  });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  return context;
}

test('rendered real D1 and D5 tips exempt confirmed handbook collection and flight times', () => {
  const context = app();
  for (const dayNumber of [1, 5]) {
    const day = itinerary.days.find(day => day.day === dayNumber);
    const html = context.notesHTML(day);
    const tip = html.match(/<div class="note note--tip">[\s\S]*?<p>([\s\S]*?)<\/p>/);
    assert.ok(tip, `D${dayNumber} must render its real tips`);
    assert.match(tip[1], /除手冊集合與航班時刻外，各站時間僅供參考，均為預估、非領隊確認/, `D${dayNumber} must exempt confirmed times`);
    assert.match(tip[1], /餐食時間亦為預估，非餐廳訂位/);
  }
  for (const day of itinerary.days) {
    assert.ok(day.tips.startsWith('除手冊集合與航班時刻外，各站時間僅供參考，均為預估'));
  }
});

test('all five original handbook times remain exact and are not estimated', () => {
  const confirmed = [
    [1, 0, '14:40'], [1, 1, '17:10'], [1, 2, '20:00'],
    [5, 1, '13:05'], [5, 2, '16:10'],
  ];
  for (const [dayNumber, index, time] of confirmed) {
    const item = itinerary.days.find(day => day.day === dayNumber).items[index];
    assert.equal(item.time, time);
    assert.equal(Object.hasOwn(item, 'timeEstimated'), false);
  }
  const items = itinerary.days.flatMap(day => day.items);
  assert.equal(items.filter(item => item.timeEstimated === true).length, 20);
  assert.equal(items.filter(item => !Object.hasOwn(item, 'timeEstimated')).length, 5);
});
