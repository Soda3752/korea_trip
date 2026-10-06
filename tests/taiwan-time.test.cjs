'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('data/itinerary.json', 'utf8');
const itinerary = JSON.parse(source);
const clauses = ['時間軸為韓國時間KST 14:40。', '時間軸為KST 17:10。', '時間軸KST為16:10。'];
function render(dayIndex, time = '12:00', data = structuredClone(itinerary)) {
  const before = JSON.stringify(data);
  const content = {};
  const ctx = vm.createContext({ URL, URLSearchParams, input: data, dayIndex,
    location: { search: `?now=${data.days[dayIndex].date}T${time}` },
    document: { addEventListener() {}, getElementById: () => content }, window: {}, navigator: { userAgent: '' } });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  const state = vm.runInContext('APP.data=input;recompute();renderDay(dayIndex);APP.state', ctx);
  assert.equal(JSON.stringify(data), before, 'render leaves all source fields immutable');
  const rows = [...content.innerHTML.matchAll(/<li class="tl-item tl-spot [^"]*">([\s\S]*?)<\/li>/g)].map(m => m[1]);
  return { ctx, rows, html: content.innerHTML, state };
}
test('actual three KHH cards display Taiwan local time and only remove obsolete conversion sentences', () => {
  const cases = [[0, 0, '14:40', '13:40', 0], [0, 1, '17:10', '16:10', 1], [4, 2, '16:10', '15:10', 2]];
  assert.equal(itinerary.days.flatMap(d => d.items).filter(it => it.photoKey === 'khh' && it.map?.keyword === '高雄國際機場').length, 3);
  for (const [day, index, canonical, local, clause] of cases) {
    const { ctx, rows, state } = render(day, canonical);
    const item = itinerary.days[day].items[index];
    assert.equal(item.time, canonical);
    const badge = rows[index].match(/<time class="spot-time">([^<]*)<\/time>/)[1];
    assert.equal(badge, `${ctx.fmt12(local)} 臺灣時間 UTC+8`);
    assert.doesNotMatch(badge, /KST/);
    assert.ok(rows[index].includes(ctx.esc(item.intro.replace(clauses[clause], ''))));
    for (const obsolete of clauses) assert.ok(!rows[index].includes(obsolete));
    assert.equal(state.currentItemIndex, index, 'highlight uses canonical KST, not displayed Taiwan time');
    assert.equal(state.nextItemIndex, -1);
    assert.equal(render(day, local).state.currentItemIndex, -1);
  }
  assert.equal(fs.readFileSync('data/itinerary.json', 'utf8'), source);
});
test('intro clock retains canonical Korean digits and clearly labels KST UTC+9', () => {
  const { ctx } = render(0, '14:40');
  const fields = Object.fromEntries(['[data-h10]', '[data-h1]', '[data-m10]', '[data-m1]', '.deco-loader-eyebrow'].map(key => [key, { textContent: '' }]));
  ctx.document.getElementById = () => ({ querySelector: key => fields[key] });
  ctx.fillIntroClock();
  assert.equal(['[data-h10]', '[data-h1]', '[data-m10]', '[data-m1]'].map(key => fields[key].textContent).join(''), '1440');
  assert.match(fields['.deco-loader-eyebrow'].textContent, /韓國時間 KST UTC\+9/);
});
test('all Korean badges, photos, maps, 29 articles, seven neutral meals and original notes survive rendering', () => {
  let spots = 0, photos = 0, articles = 0, meals = 0;
  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    const day = itinerary.days[dayIndex];
    const { ctx, rows, html } = render(dayIndex);
    assert.equal(rows.length, day.items.length);
    day.items.forEach((it, index) => {
      spots++;
      const row = rows[index];
      assert.ok(row.includes(ctx.mediaHTML(it)), 'original photo markup retained');
      assert.ok(row.includes(ctx.articlesHTML(it)), 'original spot article markup retained');
      const url = ctx.googleSearchUrl(it.map);
      if (url) assert.ok(row.includes(`href="${ctx.esc(url)}"`), 'original map destination');
      if (!(it.photoKey === 'khh' && it.map?.keyword === '高雄國際機場')) {
        assert.ok(row.includes(`${it.timeEstimated ? '預估 ' : ''}${ctx.fmt12(it.time)} KST`));
        if (it.intro) assert.ok(row.includes(ctx.esc(it.intro)), 'Korean intro unchanged');
      }
    });
    assert.ok(html.includes(ctx.mealHTML(day)), 'original meal summary');
    assert.ok(html.includes(ctx.notesHTML(day)), 'original reminders/hotel');
    photos += [...html.matchAll(/<img class="media-img/g)].length;
    articles += [...html.matchAll(/class="article-link"/g)].length;
    const mealRows = [...html.matchAll(/<li class="tl-item tl-meal">([\s\S]*?)<\/li>/g)];
    meals += mealRows.length;
    mealRows.forEach(row => assert.doesNotMatch(row[1], /state-|now-badge|next-badge/));
  }
  assert.equal(spots, 25);
  assert.equal(photos, 32);
  assert.equal(articles, 29);
  assert.equal(meals, 7);
  assert.deepEqual(itinerary.days.flatMap(d => d.items.filter(it => !it.timeEstimated).map(it => it.time)), ['14:40', '17:10', '20:00', '13:05', '16:10']);
  assert.equal(itinerary.meta.timezone, '+09:00');
  assert.equal(fs.readFileSync('data/itinerary.json', 'utf8'), source);
});
test('only mixed Taiwan/Korea days explain local time while retaining the neutral estimate disclaimer', () => {
  for (let day = 0; day < 5; day++) {
    const { html } = render(day);
    const note = html.match(/<p class="day-time-note">([^<]*)<\/p>/)[1];
    const prefix = [0, 4].includes(day) ? '各地當地時間，臺灣 UTC+8／韓國 KST UTC+9' : '韓國時間 KST';
    assert.equal(note, `${prefix} · 預估時間僅供參考，實際依領隊、交通及用餐安排調整；時間標示不代表實際所在位置。`);
  }
});
test('Taiwan display conversion derives one hour from valid canonical times, wraps midnight and rejects invalid input', () => {
  const { ctx } = render(0);
  const khh = itinerary.days[0].items[0];
  for (const [time, expected] of [['00:00', '23:00'], ['00:30', '23:30'], ['01:00', '00:00'], ['23:59', '22:59'], ['14:41', '13:41']]) {
    assert.equal(ctx.spotDisplayTime({ ...khh, time }), expected);
  }
  for (const time of [null, undefined, '', '24:00', '12:60', '1:00', 'bad', 1440]) {
    assert.equal(ctx.spotDisplayTime({ ...khh, time }), time);
  }
  for (const item of [{ ...khh, photoKey: 'icn' }, { ...khh, map: { keyword: '인천국제공항' } }, { ...khh, map: null }, { name: khh.name, time: '14:40' }]) {
    assert.equal(ctx.spotDisplayTime(item), '14:40');
    const html = ctx.spotRow(item, '');
    assert.match(html, /下午 2:40 KST/);
    if (item.intro) assert.ok(html.includes(ctx.esc(item.intro)), 'non-Taiwan intro is untouched');
  }
  const intro = '韓國時間20:00抵達。KST 09:00保留。' + clauses.join('');
  assert.ok(ctx.spotRow({ ...khh, intro }, '').includes('韓國時間20:00抵達。KST 09:00保留。'));
});
