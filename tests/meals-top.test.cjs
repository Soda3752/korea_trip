const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const meals = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];

function render(day) {
  const content = {};
  const context = vm.createContext({ URLSearchParams,
    document: { addEventListener() {}, getElementById() { return content; } },
    navigator: { userAgent: '' }, window: {} });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  }
  context.input = { days: [day] };
  vm.runInContext('APP.data = input; APP.state = { mode: "during", dayIndex: 0, currentItemIndex: -1, nextItemIndex: -1 }; renderDay(0);', context);
  return { html: content.innerHTML, context };
}

function assertTopMeals(day, html) {
  const headEnd = html.indexOf('</header>') + '</header>'.length;
  const timeNoteEnd = html.indexOf('</p>', html.indexOf('<p class="day-time-note">')) + '</p>'.length;
  const timelineStart = html.indexOf('<ol class="timeline">');
  const timelineEnd = html.indexOf('</ol>', timelineStart) + '</ol>'.length;
  const summary = html.match(/<section\b[^>]*class="(?=[^"]*\bnotes\b)(?=[^"]*\bdaily-meals\b)[^"]*"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(summary, 'a separate meal summary uses existing notes styling');
  assert.ok(headEnd > 0 && timeNoteEnd > headEnd && timelineStart > timeNoteEnd);
  assert.ok(summary.index >= timeNoteEnd && summary.index + summary[0].length < timelineStart,
    'meals must follow the day heading/time notice and precede the timeline');
  assert.equal(html.split('<strong>每日餐食</strong>').length - 1, 1);
  for (const [key, label] of meals) {
    const time = day.mealTimes?.[key] ? `（預估 ${escapeHTML(day.mealTimes[key])}）` : '';
    const row = `${label}${time}：${escapeHTML(day.meals[key])}`;
    assert.ok(summary[0].includes(row), `${label} keeps its exact meal and estimated time`);
    assert.equal(html.split(row).length - 1, 1, `${label} appears exactly once`);
  }
  if (day.mealTimes) assert.ok(summary[0].includes('餐食時間僅供參考，實際依領隊安排。'));
  const bottom = html.slice(timelineEnd);
  assert.doesNotMatch(bottom, /每日餐食|note-ico">🍽/);
  if (day.hotel) {
    const hotel = `<strong>住宿</strong><p>${escapeHTML(day.hotel.name)}<br>${escapeHTML(day.hotel.address || (day.hotel.name === '溫暖的家' ? '返台' : '地址／分店待確認'))}</p>`;
    assert.ok(bottom.includes(hotel));
    assert.ok(!summary[0].includes(hotel));
  }
  for (const [key, title, modifier] of [['tips', '小提醒', 'tip'], ['transport', '交通', 'car']]) {
    if (!day[key]) continue;
    assert.ok(bottom.includes(`class="note note--${modifier}"`));
    const note = `<strong>${title}</strong><p>${escapeHTML(day[key])}</p>`;
    assert.ok(bottom.includes(note));
    assert.ok(!summary[0].includes(note));
  }
}

assert.equal(itinerary.days.length, 5);
for (const day of itinerary.days) {
  test(`D${day.day}: real daily meals occur once above timeline; hotel and tips stay below`, () => {
    const { html, context } = render(day);
    assertTopMeals(day, html);
    assert.doesNotMatch(context.notesHTML(day), /每日餐食|note-ico">🍽/);
  });

  test(`D${day.day}: rendered meal names and estimated times remain escaped`, () => {
    const fixture = structuredClone(day);
    for (const [key] of meals) {
      fixture.meals[key] = `${key} <b>餐&"'</b>`;
      fixture.mealTimes[key] = `${key} <time>&"'</time>`;
    }
    fixture.transport = '原交通 <route>&"\'';
    const { html } = render(fixture);
    assertTopMeals(fixture, html);
    assert.doesNotMatch(html, /<b>餐|<time>&|<route>/);
  });
}

test('missing meals omit the top summary gracefully while preserving bottom reminders', () => {
  for (const missing of [undefined, null]) {
    const day = structuredClone(itinerary.days[0]);
    day.meals = missing;
    const { html, context } = render(day);
    assert.doesNotMatch(html, /每日餐食|note-ico">🍽|undefined|null/);
    assert.equal(context.mealHTML(day), '');
    assert.ok(html.indexOf('<strong>住宿</strong>') > html.indexOf('</ol>'));
    assert.ok(html.indexOf('<strong>小提醒</strong>') > html.indexOf('</ol>'));
  }
});

test('meals without estimated times retain all labels without inventing estimates', () => {
  const day = structuredClone(itinerary.days[0]);
  delete day.mealTimes;
  const { html } = render(day);
  assertTopMeals(day, html);
  const summary = html.slice(html.indexOf('<section class="notes daily-meals">'), html.indexOf('<ol class="timeline">'));
  assert.doesNotMatch(summary, /預估|undefined|null/);
});

test('daily meal header keeps the icon separate from full-width meal rows', () => {
  const { html } = render(itinerary.days[0]);
  const summary = html.match(/<section\b[^>]*class="[^"]*\bdaily-meals\b[^"]*"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(summary);
  assert.match(summary[1], /<div class="daily-meals-head">\s*<span class="note-ico">🍽<\/span>\s*<strong>每日餐食<\/strong>\s*<\/div>\s*<p>/);
  assert.doesNotMatch(summary[1], /class="note"|<div><strong>/);
});

test('daily meal spacing is scoped without changing bottom note layout', () => {
  const css = fs.readFileSync('css/maple-theme.css','utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const declarations = selector => rules.filter(r=>r[1].replace(/\/\*[\s\S]*?\*\//g,'').trim()===selector).map(r=>r[2]).join(';');
  const summary = declarations('.daily-meals');
  assert.match(summary,/padding:\s*14px\s+16px/);
  assert.match(summary,/margin:\s*10px\s+0\s+20px/);
  assert.match(declarations('.daily-meals-head'),/display:\s*flex/);
  assert.match(declarations('.daily-meals p'),/margin:\s*4px\s+0\s+0/);
  assert.doesNotMatch(summary,/padding-left:|grid-template-columns:/);
  assert.doesNotMatch(declarations('.notes'),/padding:|margin:/);
});
