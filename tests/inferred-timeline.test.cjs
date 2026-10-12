'use strict';
// 使用者明確要求：「回到現在」一律依預定時間推估一張行程卡（含三餐），並清楚標示為推估、非實際定位。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8');
const itinerary = JSON.parse(source);
const MEALS = ['breakfast', 'lunch', 'dinner'];
const LABEL = { before: '推估下一行程', current: '推估目前行程', final: '推估最後行程' };
const DISCLAIMER = '推估依預定時間，非實際定位，實際依領隊安排';
const plain = value => JSON.parse(JSON.stringify(value));
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(typeof t === 'string' ? t : ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const arranged = text => typeof text === 'string' && !!text.trim() && !/未安排|XXX/.test(text);

// Independent reference: display order (meals inserted before the first later timed row) and the planned pick.
function referenceRows(day) {
  const rows = day.items.map((it, i) => ({ id: `d${day.day}-${it.type === 'spot' ? 'spot' : 'transit'}-${i}`, kind: it.type === 'spot' ? 'spot' : 'transit', minutes: toMin(it.time) }));
  for (const key of MEALS) {
    if (!arranged(day.meals?.[key])) continue;
    const minutes = toMin(day.mealTimes?.[key]);
    const at = minutes === null ? -1 : rows.findIndex(r => r.minutes !== null && r.minutes > minutes);
    rows.splice(at === -1 ? rows.length : at, 0, { id: `d${day.day}-meal-${key}`, kind: 'meal', minutes });
  }
  return rows;
}
function referencePick(day, minutes) {
  const timed = referenceRows(day).filter(r => r.kind !== 'transit' && r.minutes !== null);
  if (!timed.length) return null;
  const min = Math.min(...timed.map(r => r.minutes)), max = Math.max(...timed.map(r => r.minutes));
  if (minutes < min) return { id: timed.find(r => r.minutes === min).id, phase: 'before' };
  const final = timed.filter(r => r.minutes === max).at(-1);
  const best = Math.max(...timed.filter(r => r.minutes <= minutes).map(r => r.minutes));
  const pick = timed.filter(r => r.minutes === best).at(-1);
  return { id: pick.id, phase: pick === final ? 'final' : 'current' };
}

function makeApp({ data = itinerary, now = null, instant = '2026-10-12T03:00:00Z' } = {}) {
  const content = { innerHTML: '' };
  const clicks = [];
  const nowBtn = { hidden: true, addEventListener(type, fn) { if (type === 'click') clicks.push(fn); } };
  const frames = [], log = [];
  const clock = { instant };
  class Clock extends Date { static now() { return Date.parse(clock.instant); } }
  const element = cls => ({ scrollIntoView(opts) { log.push({ el: cls, opts: plain(opts) }); } });
  const document = {
    addEventListener() {},
    getElementById: id => (id === 'now-btn' ? nowBtn : content),
    querySelectorAll: () => [],
    querySelector(sel) {
      const cls = /^\.([\w-]+)$/.exec(sel)?.[1];
      return cls && new RegExp(`class="[^"]*\\b${cls}\\b`).test(content.innerHTML) ? element(cls) : null;
    },
    documentElement: { scrollTop: 0 },
  };
  const location = { search: now ? `?now=${now}` : '' };
  const window = { scrollY: 1500, scrollTo(opts) { log.push({ el: 'window', opts: plain(opts) }); } };
  const ctx = vm.createContext({ URL, URLSearchParams, Date: Clock, location, document, window,
    navigator: { userAgent: '' }, requestAnimationFrame: fn => frames.push(fn), input: data });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  vm.runInContext('APP.data=input;recompute();bindNowButton();', ctx);
  const run = code => vm.runInContext(code, ctx);
  return {
    ctx, run, content, nowBtn, log, frames, clock, location,
    flush() { while (frames.length) frames.shift()(); },
    click() { assert.equal(clicks.length, 1); clicks[0](); },
    at(value) { location.search = `?now=${value}`; run('recompute()'); },
    render(dayIndex) { run(`selectTab(${JSON.stringify(dayIndex)},{scroll:false})`); return content.innerHTML; },
  };
}
const liRows = html => [...html.matchAll(/<li class="tl-item ([^"]*)" data-tl-id="([^"]+)">([\s\S]*?)<\/li>/g)]
  .map(m => ({ cls: m[1], id: m[2], body: m[3], html: m[0] }));
const cardRows = html => liRows(html).filter(r => /\btl-(?:spot|meal)\b/.test(r.cls));
const markers = html => liRows(html).filter(r => /\bstate-inferred\b/.test(r.cls));

test('planned timeline derives 36 timed cards: 25 spots + 11 arranged meals incl. 4 breakfasts, stable unique ids', () => {
  const app = makeApp();
  const spotCount = itinerary.days.reduce((n, d) => n + d.items.filter(it => it.type === 'spot').length, 0);
  const mealCount = itinerary.days.reduce((n, d) => n + MEALS.filter(k => arranged(d.meals?.[k])).length, 0);
  const breakfasts = itinerary.days.filter(d => arranged(d.meals?.breakfast)).length;
  assert.deepEqual([spotCount, mealCount, breakfasts], [25, 11, 4]);
  const all = [];
  itinerary.days.forEach(day => {
    const rows = plain(app.ctx.plannedTimeline(day));
    assert.deepEqual(rows.map(r => r.id), referenceRows(day).map(r => r.id), `D${day.day} display order`);
    assert.deepEqual(plain(app.ctx.plannedTimeline(day)), rows, 'pure and deterministic');
    rows.forEach(r => assert.ok(Number.isInteger(r.minutes), `${r.id} is timed`));
    all.push(...rows);
  });
  assert.equal(all.length, spotCount + mealCount);
  assert.equal(new Set(all.map(r => r.id)).size, 36);
  assert.deepEqual(all.filter(r => r.kind === 'meal' && r.mealKey === 'breakfast').map(r => r.id),
    ['d2-meal-breakfast', 'd3-meal-breakfast', 'd4-meal-breakfast', 'd5-meal-breakfast']);
  for (const absent of ['d1-meal-breakfast', 'd1-meal-lunch', 'd5-meal-lunch', 'd5-meal-dinner']) {
    assert.ok(!all.some(r => r.id === absent), `${absent} is not invented`);
  }
  assert.equal(source, fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8'));
});

test('every minute of all five days infers exactly one card that matches the planned reference', () => {
  const app = makeApp({ now: '2026-10-11T00:00' });
  itinerary.days.forEach((day, dayIndex) => {
    for (let minute = 0; minute < 1440; minute++) {
      app.at(`${day.date}T${hm(minute)}`);
      const expected = referencePick(day, minute);
      const state = plain(app.run('APP.state'));
      assert.equal(state.mode, 'during');
      assert.equal(state.dayIndex, dayIndex);
      assert.deepEqual({ id: state.inferred.id, phase: state.inferred.phase, label: state.inferred.label },
        { ...expected, label: LABEL[expected.phase] }, `D${day.day} ${hm(minute)}`);
    }
  });
});

test('each timeline target boundary (t-1, t, t+1) renders a single labelled marker with the disclaimer', () => {
  const app = makeApp({ now: '2026-10-11T00:00' });
  let checked = 0;
  itinerary.days.forEach((day, dayIndex) => {
    for (const row of referenceRows(day)) {
      for (const minute of [row.minutes - 1, row.minutes, row.minutes + 1].filter(m => m >= 0 && m < 1440)) {
        app.at(`${day.date}T${hm(minute)}`);
        const html = app.render(dayIndex);
        const expected = referencePick(day, minute);
        const found = markers(html);
        assert.equal(found.length, 1, `D${day.day} ${hm(minute)} one marker`);
        assert.equal(found[0].id, expected.id);
        assert.ok(found[0].body.includes(`<span class="inferred-badge">${LABEL[expected.phase]}</span>`));
        assert.ok(found[0].body.includes(DISCLAIMER));
        assert.equal((html.match(/inferred-badge/g) || []).length, 1, 'no duplicate badges');
        assert.doesNotMatch(html, /now-badge|next-badge/, 'confirmed badges never duplicate the inference');
        assert.equal(cardRows(html).length, referenceRows(day).length);
        checked++;
      }
    }
  });
  assert.ok(checked >= 36 * 3 - 2);
});

test('labels: before first, interval, after final and midnight on every trip day', () => {
  const app = makeApp({ now: '2026-10-11T00:00' });
  const cases = [
    ['2026-10-11T00:00', 'd1-spot-0', 'before'], ['2026-10-11T14:39', 'd1-spot-0', 'before'],
    ['2026-10-11T14:40', 'd1-spot-0', 'current'], ['2026-10-11T20:59', 'd1-spot-2', 'current'],
    ['2026-10-11T21:00', 'd1-meal-dinner', 'current'], ['2026-10-11T23:59', 'd1-spot-3', 'final'],
    ['2026-10-12T00:00', 'd2-meal-breakfast', 'before'], ['2026-10-12T07:00', 'd2-meal-breakfast', 'current'],
    ['2026-10-12T12:00', 'd2-meal-lunch', 'current'], ['2026-10-12T23:59', 'd2-spot-5', 'final'],
    ['2026-10-13T07:29', 'd3-meal-breakfast', 'before'], ['2026-10-13T18:30', 'd3-meal-dinner', 'current'],
    ['2026-10-14T06:30', 'd4-meal-breakfast', 'current'], ['2026-10-14T19:00', 'd4-meal-dinner', 'current'],
    ['2026-10-15T05:59', 'd5-meal-breakfast', 'before'], ['2026-10-15T13:05', 'd5-spot-1', 'current'],
    ['2026-10-15T16:09', 'd5-spot-1', 'current'], ['2026-10-15T16:10', 'd5-spot-2', 'final'],
    ['2026-10-15T23:59', 'd5-spot-2', 'final'],
  ];
  for (const [now, id, phase] of cases) {
    app.at(now);
    const inferred = plain(app.run('APP.state.inferred'));
    assert.deepEqual(inferred && [inferred.id, inferred.phase, inferred.label], [id, phase, LABEL[phase]], now);
  }
});

test('other dates, info tab and before/after trip carry no inferred marker; resolveState confirmed semantics remain', () => {
  const app = makeApp({ now: '2026-10-12T12:00' });
  for (let other = 0; other < 5; other++) {
    const html = app.render(other);
    assert.equal(markers(html).length, other === 1 ? 1 : 0, `D${other + 1}`);
  }
  assert.doesNotMatch(app.render('info'), /state-inferred|inferred-badge/);
  for (const now of ['2026-10-10T23:59', '2026-10-10T12:00', '2026-10-16T00:00', '2026-10-20T08:00']) {
    app.at(now);
    assert.equal(app.run('APP.state.inferred ?? null'), null, now);
    for (let day = 0; day < 5; day++) assert.equal(markers(app.render(day)).length, 0, `${now} D${day + 1}`);
  }
  app.at('2026-10-11T14:40');
  const s = plain(app.run('APP.state'));
  assert.equal(s.currentItemIndex, 0);
  assert.equal(s.nextItemIndex, -1);
  app.at('2026-10-11T15:00');
  assert.equal(app.run('APP.state.currentItemIndex'), -1, 'no confirmed current between handbook minutes');
  assert.equal(app.run('APP.state.inferred.id'), 'd1-spot-0', 'inference is a separate property');
});

test('confirmed handbook minutes overlap the inference on one card: one badge, Taiwan display unchanged, canonical KST', () => {
  const app = makeApp({ now: '2026-10-11T14:40' });
  for (const [now, dayIndex, id, display] of [
    ['2026-10-11T14:40', 0, 'd1-spot-0', '下午 1:40 臺灣時間 UTC+8'], ['2026-10-11T17:10', 0, 'd1-spot-1', '下午 4:10 臺灣時間 UTC+8'],
    ['2026-10-11T20:00', 0, 'd1-spot-2', '晚上 8:00 KST'], ['2026-10-15T13:05', 4, 'd5-spot-1', '下午 1:05 KST'],
    ['2026-10-15T16:10', 4, 'd5-spot-2', '下午 3:10 臺灣時間 UTC+8'],
  ]) {
    app.at(now);
    const html = app.render(dayIndex);
    const [marked] = markers(html);
    assert.equal(markers(html).length, 1);
    assert.equal(marked.id, id);
    assert.match(marked.cls, /\bstate-current\b/, 'confirmed class kept on the same card');
    assert.ok(marked.body.includes(`<time class="spot-time">${display}</time>`), 'confirmed clock has no 預估 prefix');
    assert.equal((html.match(/inferred-badge|now-badge|next-badge/g) || []).length, 1);
  }
  app.at('2026-10-11T13:40'); // displayed Taiwan time is not the canonical comparison value
  assert.equal(app.run('APP.state.inferred.phase'), 'before');
});

test('all 36 cards show planned times; breakfasts are text-only hotel meals without invented photos or venues', () => {
  const app = makeApp({ now: '2026-10-10T12:00' });
  let spots = 0, meals = 0, breakfasts = 0, photos = 0, articles = 0;
  itinerary.days.forEach((day, dayIndex) => {
    const html = app.render(dayIndex);
    const rows = cardRows(html);
    rows.forEach(r => {
      if (r.cls.includes('tl-spot')) {
        spots++;
        assert.match(r.body, /<time class="spot-time">[^<]+<\/time>/);
      } else {
        meals++;
        const key = /meal-(\w+)$/.exec(r.id)[1];
        assert.ok(r.body.includes(`預估 ${app.ctx.fmt12(day.mealTimes[key])} KST`), r.id);
        if (key === 'breakfast') {
          breakfasts++;
          assert.ok(r.body.includes('<h3 class="card-title">🍽 早餐</h3>'));
          assert.ok(r.body.includes(app.ctx.esc(day.meals.breakfast)));
          assert.doesNotMatch(r.html, /<img|meal-media|article-link|data-map/);
        }
      }
    });
    photos += (html.match(/<img class="media-img/g) || []).length;
    articles += (html.match(/class="article-link"/g) || []).length;
  });
  assert.deepEqual({ spots, meals, breakfasts, photos, articles }, { spots: 25, meals: 11, breakfasts: 4, photos: 32, articles: 29 });
});

test('ties keep stable original order; malformed and unknown times are excluded with a safe fallback', () => {
  const app = makeApp();
  const day = { day: 9, date: '2026-10-11', items: [
    { type: 'spot', name: 'A', time: '10:00' }, { type: 'transit', desc: 'x', time: '10:30' },
    { type: 'spot', name: 'B', time: '10:00' }, { type: 'spot', name: 'C', time: null },
    { type: 'spot', name: 'D', time: '24:00' }, { type: 'spot', name: 'E', time: '12:00' }, { type: 'spot', name: 'F', time: '12:00' },
  ], meals: { breakfast: '飯店內用', lunch: '午餐', dinner: '未安排（手冊XXX）' }, mealTimes: { breakfast: 'bad', lunch: '10:00', dinner: '11:00' } };
  const rows = plain(app.ctx.plannedTimeline(day));
  assert.deepEqual(rows.map(r => r.id), ['d9-spot-0', 'd9-meal-lunch', 'd9-transit-1', 'd9-spot-2', 'd9-spot-3', 'd9-spot-4', 'd9-spot-5', 'd9-spot-6', 'd9-meal-breakfast']);
  const pick = m => { const r = app.ctx.inferPlannedRow(app.ctx.plannedTimeline(day), m); return r && `${r.id}:${r.phase}`; };
  assert.equal(pick(599), 'd9-spot-0:before', 'tie before first → first in order');
  assert.equal(pick(600), 'd9-spot-2:current', 'tie at start → last in stable display order');
  assert.equal(pick(630), 'd9-spot-2:current', 'transit never selected');
  assert.equal(pick(720), 'd9-spot-6:final');
  for (const bad of [-1, 1440, 12.5, NaN, null, undefined, '600']) assert.equal(app.ctx.inferPlannedRow(app.ctx.plannedTimeline(day), bad), null);
  assert.equal(app.ctx.inferPlannedRow(app.ctx.plannedTimeline({ day: 1, items: [{ type: 'spot', time: null }] }), 600), null);
  const data = structuredClone(itinerary);
  data.days[1].items.forEach(it => { it.time = null; });
  data.days[1].mealTimes = { breakfast: null, lunch: '25:00', dinner: 'x' };
  const t = makeApp({ data, now: '2026-10-12T12:00' });
  t.render('info');
  t.click();
  t.flush();
  assert.equal(t.run('APP.activeDay'), 1);
  assert.equal(markers(t.content.innerHTML).length, 0);
  assert.deepEqual(t.log, [{ el: 'window', opts: { top: 0, behavior: 'smooth' } }], 'no fabricated target');
});

test('return-now switches to today and centres the inferred card from info, other days and today', () => {
  for (const [now, from, today, id] of [
    ['2026-10-12T12:00', "'info'", 1, 'd2-meal-lunch'], ['2026-10-12T12:00', '3', 1, 'd2-meal-lunch'],
    ['2026-10-11T15:00', '0', 0, 'd1-spot-0'], ['2026-10-15T00:00', '2', 4, 'd5-meal-breakfast'],
    ['2026-10-14T23:59', '4', 3, 'd4-spot-6'],
  ]) {
    const t = makeApp({ now });
    t.render(Number.isNaN(+from) ? 'info' : +from);
    assert.equal(t.nowBtn.hidden, false);
    t.click();
    assert.equal(t.run('APP.activeDay'), today);
    assert.equal(t.log.length, 0, 'scroll waits for layout');
    t.flush();
    assert.deepEqual(t.log, [{ el: 'state-inferred', opts: { behavior: 'smooth', block: 'center' } }], now);
    assert.equal(markers(t.content.innerHTML)[0].id, id);
  }
});

test('minute refresh moves the marker without changing the selected day; overrides do not auto-advance', () => {
  const t = makeApp({ instant: '2026-10-12T02:59:00Z' }); // KST 11:59 D2
  t.render(1);
  assert.equal(markers(t.content.innerHTML)[0].id, 'd2-spot-1');
  t.clock.instant = '2026-10-12T03:00:00Z';
  t.run('minuteRefresh()');
  assert.equal(t.run('APP.activeDay'), 1);
  assert.equal(markers(t.content.innerHTML)[0].id, 'd2-meal-lunch');
  t.render(3);
  t.clock.instant = '2026-10-12T10:30:00Z';
  t.run('minuteRefresh()');
  assert.equal(t.run('APP.activeDay'), 3, 'other day stays selected');
  assert.equal(markers(t.content.innerHTML).length, 0);
  assert.equal(t.run('APP.state.inferred.id'), 'd2-meal-dinner');
  t.render('info');
  t.run('minuteRefresh()');
  assert.equal(t.run('APP.activeDay'), 'info');
  const o = makeApp({ now: '2026-10-12T11:59' });
  o.render(1);
  o.clock.instant = '2026-10-12T10:30:00Z';
  o.run('minuteRefresh()');
  assert.equal(markers(o.content.innerHTML)[0].id, 'd2-spot-1');
});

test('canonical KST inference is identical across device time zones', () => {
  const script = `
    const fs=require('fs'),vm=require('vm');
    const data=JSON.parse(fs.readFileSync('data/itinerary.json','utf8'));
    const out=[];
    for (const iso of ['2026-10-12T03:00:00Z','2026-10-11T14:59:00Z','2026-10-11T15:00:00Z','2026-10-15T07:10:00Z','2026-10-10T14:59:00Z']) {
      class C extends Date { static now(){ return Date.parse(iso); } }
      const ctx=vm.createContext({URLSearchParams,location:{search:''},Date:C});
      vm.runInContext(fs.readFileSync('js/now.js','utf8'),ctx);
      const s=vm.runInContext('resolveState(d,shanghaiNow())',Object.assign(ctx,{d:data}));
      out.push(s.inferred ? s.inferred.id+':'+s.inferred.phase : s.mode);
    }
    process.stdout.write(out.join(','));`;
  const results = ['UTC', 'Asia/Taipei', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map(TZ =>
    execFileSync(process.execPath, ['-e', script], { cwd: root, env: { ...process.env, TZ } }).toString());
  assert.equal(new Set(results).size, 1, results.join(' | '));
  assert.equal(results[0], 'd2-meal-lunch:current,d1-spot-3:final,d2-meal-breakfast:before,d5-spot-2:final,before');
});

test('scoped inferred styling stays mobile-safe and motion-free; docs drop the obsolete neutral/no-breakfast rules', () => {
  const css = fs.readFileSync(path.join(root, 'css/maple-theme.css'), 'utf8');
  const rule = sel => css.match(new RegExp(`${sel.replace(/[.\-]/g, m => '\\' + m)}\\s*\\{([^}]*)\\}`))?.[1] || '';
  assert.match(rule('.inferred-badge'), /white-space:\s*normal/);
  assert.match(rule('.inferred-badge'), /max-width:\s*100%/);
  assert.match(rule('.state-inferred .card'), /box-shadow/);
  assert.doesNotMatch(css.match(/\.state-inferred[^{]*\{[^}]*\}|\.inferred-[\w-]+\s*\{[^}]*\}/g).join(''), /animation|transition/);
  const docs = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8') + fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(docs, /推估目前行程/);
  assert.match(docs, /早餐/);
  assert.doesNotMatch(docs, /不推測目前位置或下一站|只能在已知時刻那一分鐘標示/);
});
