'use strict';
// 「回到現在」按鈕：點擊後回到今天並將依預定時間推估的卡片置中；只有無任何有效時刻才捲回今天開頭。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const itinerary = JSON.parse(fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8'));

function setup(data, now) {
  const content = { innerHTML: '' };
  const clicks = [];
  const nowBtn = { hidden: true, addEventListener(type, fn) { if (type === 'click') clicks.push(fn); } };
  const frames = [];
  const log = [];
  const element = (cls) => ({ cls, scrollIntoView(opts) { log.push({ el: cls, opts: JSON.parse(JSON.stringify(opts)) }); } });
  const document = {
    addEventListener() {},
    getElementById: (id) => (id === 'now-btn' ? nowBtn : content),
    querySelectorAll: () => [],
    querySelector(sel) {
      const cls = /^\.([\w-]+)$/.exec(sel)?.[1];
      return cls && new RegExp(`class="[^"]*\\b${cls}\\b`).test(content.innerHTML) ? element(cls) : null;
    },
    documentElement: { scrollTop: 0 },
  };
  const window = {
    scrollY: 1800,
    scrollTo(opts) { log.push({ el: 'window', opts: JSON.parse(JSON.stringify(opts)) }); },
  };
  const context = vm.createContext({
    URLSearchParams, location: { search: `?now=${now}` }, document, window,
    navigator: { userAgent: '' }, requestAnimationFrame: (fn) => frames.push(fn), input: data,
  });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  vm.runInContext('APP.data=input;recompute();bindNowButton();', context);
  const run = (code) => vm.runInContext(code, context);
  const flush = () => { while (frames.length) frames.shift()(); };
  const click = () => { assert.equal(clicks.length, 1, 'now button has exactly one click handler'); clicks[0](); };
  return { run, flush, click, log, frames, content, nowBtn };
}

test('estimated D2: already on today and scrolled down → click centres the inferred lunch card', () => {
  const t = setup(itinerary, '2026-10-12T12:00');
  t.run('selectTab(1,{scroll:false})');
  assert.equal(t.nowBtn.hidden, false);
  t.click();
  t.flush();
  assert.equal(t.run('APP.activeDay'), 1);
  // User change: scroll once to the planned inference instead of the day start.
  assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }]);
  // 確認狀態仍不捏造：沒有手冊目前／下一站
  assert.doesNotMatch(t.content.innerHTML, /state-current|state-next|now-badge|next-badge/);
  assert.match(t.content.innerHTML, /data-tl-id="d2-meal-lunch">/);
});

for (const [label, from] of [['info tab', "'info'"], ['another day tab', '3']]) {
  test(`estimated D2: from ${label} → click renders today and centres the inferred card`, () => {
    const t = setup(itinerary, '2026-10-12T12:00');
    t.run(`selectTab(${from},{scroll:false})`);
    t.click();
    assert.equal(t.run('APP.activeDay'), 1);
    assert.match(t.content.innerHTML, /Day 2 · 10\/12/);
    assert.equal(t.log.length, 0, 'scroll waits for the next animation frame');
    t.flush();
    assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }]);
    assert.doesNotMatch(t.content.innerHTML, /state-current|state-next/);
  });
}

test('known confirmed minute D1 14:40 → centres the confirmed card, which is also the single inferred card', () => {
  const t = setup(itinerary, '2026-10-11T14:40');
  t.run("selectTab('info',{scroll:false})");
  t.click();
  assert.equal(t.log.length, 0);
  t.flush();
  assert.equal(t.run('APP.activeDay'), 0);
  assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }]);
  assert.match(t.content.innerHTML, /class="tl-item tl-spot state-current state-inferred[^"]*" data-tl-id="d1-spot-0"/);
});

test('D1 between known minutes (15:00) has no confirmed state but centres the inferred assembly card', () => {
  const t = setup(itinerary, '2026-10-11T15:00');
  t.run('selectTab(0,{scroll:false})');
  t.click();
  t.flush();
  assert.doesNotMatch(t.content.innerHTML, /state-current|state-next/);
  assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }]);
  assert.match(t.content.innerHTML, /state-inferred--current" data-tl-id="d1-spot-0"/);
});

test('fully known day with only a next stop → centres that next card (inferred 推估下一行程)', () => {
  const data = JSON.parse(JSON.stringify(itinerary));
  data.days[0].items = [
    { type: 'spot', name: '一', time: '09:00' },
    { type: 'spot', name: '二', time: '10:00' },
  ];
  const t = setup(data, '2026-10-11T08:00');
  t.click();
  t.flush();
  assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }]);
  assert.match(t.content.innerHTML, /class="tl-item tl-spot state-next state-inferred state-inferred--before" data-tl-id="d1-spot-0"/);
});

for (const now of ['2026-10-10T12:00', '2026-10-16T12:00']) {
  test(`outside trip (${now}) → click leaves tab and scroll unchanged`, () => {
    const t = setup(itinerary, now);
    t.run('selectTab(2,{scroll:false})');
    assert.equal(t.nowBtn.hidden, true);
    const before = t.content.innerHTML;
    t.click();
    t.flush();
    assert.equal(t.run('APP.activeDay'), 2);
    assert.equal(t.content.innerHTML, before);
    assert.equal(t.frames.length, 0);
    assert.deepEqual(t.log, []);
  });
}
