'use strict';
// 「回到現在」按鈕：點擊後回到今天，有已知目前／下一站才捲到該節點，否則捲回今天開頭；不捏造位置。
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

test('estimated D2: already on today and scrolled down → click returns to today heading/start', () => {
  const t = setup(itinerary, '2026-10-12T12:00');
  t.run('selectTab(1,{scroll:false})');
  assert.equal(t.nowBtn.hidden, false);
  t.click();
  t.flush();
  assert.equal(t.run('APP.activeDay'), 1);
  assert.deepEqual(t.log.map(e => e.el), ['window'], 'scrolls the viewport once');
  assert.equal(t.log[0].opts.top, 0);
  // 中性狀態：不得產生目前／下一站
  assert.doesNotMatch(t.content.innerHTML, /state-current|state-next|now-badge|next-badge/);
  assert.match(t.content.innerHTML, /class="day-head"/);
});

for (const [label, from] of [['info tab', "'info'"], ['another day tab', '3']]) {
  test(`estimated D2: from ${label} → click renders today and scrolls to its start`, () => {
    const t = setup(itinerary, '2026-10-12T12:00');
    t.run(`selectTab(${from},{scroll:false})`);
    t.click();
    assert.equal(t.run('APP.activeDay'), 1);
    assert.match(t.content.innerHTML, /Day 2 · 10\/12/);
    assert.equal(t.log.length, 0, 'scroll waits for the next animation frame');
    t.flush();
    assert.deepEqual(t.log, [{ el: 'window', opts: { top: 0, behavior: 'smooth' } }]);
    assert.doesNotMatch(t.content.innerHTML, /state-current|state-next/);
  });
}

test('known confirmed minute D1 14:40 → scrolls the current card into the viewport centre', () => {
  const t = setup(itinerary, '2026-10-11T14:40');
  t.run("selectTab('info',{scroll:false})");
  t.click();
  assert.equal(t.log.length, 0);
  t.flush();
  assert.equal(t.run('APP.activeDay'), 0);
  assert.deepEqual(t.log, [{ el: 'state-current', opts: { behavior: 'smooth', block: 'center' } }]);
});

test('D1 between known minutes (15:00) stays neutral and falls back to today start', () => {
  const t = setup(itinerary, '2026-10-11T15:00');
  t.run('selectTab(0,{scroll:false})');
  t.click();
  t.flush();
  assert.doesNotMatch(t.content.innerHTML, /state-current|state-next/);
  assert.deepEqual(t.log, [{ el: 'window', opts: { top: 0, behavior: 'smooth' } }]);
});

test('fully known day with only a next stop → scrolls to the next card', () => {
  const data = JSON.parse(JSON.stringify(itinerary));
  data.days[0].items = [
    { type: 'spot', name: '一', time: '09:00' },
    { type: 'spot', name: '二', time: '10:00' },
  ];
  const t = setup(data, '2026-10-11T08:00');
  t.click();
  t.flush();
  assert.deepEqual(t.log, [{ el: 'state-next', opts: { behavior: 'smooth', block: 'center' } }]);
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
