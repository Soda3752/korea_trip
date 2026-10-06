const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
const photo = { image: 'images/korea/meal-reference.jpg', imageAlt: '餐食示意，非本團實際餐點', imageType: 'illustrative', photoKey: 'meal-reference', imageNote: '料理參考，餐廳未確認' };
function app(data = structuredClone(itinerary)) {
  const content = {};
  const listeners = [];
  const context = vm.createContext({ URL, URLSearchParams, window: {}, navigator: { userAgent: '' },
    location: { search: '?now=2026-10-12T12:00' }, input: data,
    document: { addEventListener: (...args) => listeners.push(args), getElementById: () => content, createElement: () => ({}) } });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  vm.runInContext('APP.data=input;recompute()', context);
  return { context, content, listeners, data };
}
function mealRows(html) { return [...html.matchAll(/<li class="tl-item tl-meal">[\s\S]*?<\/li>/g)].map(match => match[0]); }
test('renderDay adds optional reference photos to meal cards only with stable day/meal keys', () => {
  const { context, content, data } = app();
  data.days[1].mealPhotos = { lunch: photo, dinner: { ...photo, image: 'images/korea/dinner-reference.jpg' } };
  const before = JSON.stringify(data);
  context.renderDay(1);
  const rows = mealRows(content.innerHTML);
  assert.equal(rows.length, 2);
  for (const [index, key] of ['lunch', 'dinner'].entries()) {
    assert.match(rows[index], /class="meal-media"/);
    assert.ok(rows[index].includes(`data-meal-photo="day-2-${key}"`));
    assert.ok(rows[index].includes(`src="${data.days[1].mealPhotos[key].image}"`));
    assert.match(rows[index], /<img class="media-img"[^>]*loading="lazy"[^>]*decoding="async"/);
    assert.match(rows[index], /class="photo-badge"[^>]*>餐食示意<\/span>/);
    assert.match(rows[index], /餐食示意，非本團實際餐點/);
    assert.match(rows[index], /預估.*KST/);
    assert.doesNotMatch(rows[index], /spot-time|state-|data-map|onerror=/);
  }
  const summary = content.innerHTML.match(/<section class="notes daily-meals">[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(summary, /<img|meal-media|餐食示意/);
  assert.equal(JSON.stringify(data), before);
});

test('missing and malformed meal photos preserve exactly the previous text-only meal markup', () => {
  const { context } = app();
  const original = context.mealRow('dinner', '飯卷', '18:00');
  const invalid = [undefined, null, false, '', 'photo', 42, [], {},
    { ...photo, image: null }, { ...photo, imageAlt: '' }, { ...photo, imageAlt: '  ' },
    { ...photo, imageAlt: 42 }, { ...photo, image: ['images/korea/meal-reference.jpg'] }];
  for (const image of ['https://evil.test/a.jpg', '//evil.test/a.jpg', 'javascript:alert(1)',
    'images/korea/../evil.jpg', 'images/korea/A.jpg', 'images/korea/a.jpg?x=1',
    'images/korea/a.jpg#x', 'images/korea/a.png', 'images/korea/a.jpg\n',
    'images/korea/a.jpg" onerror="bad()', 'images\\korea\\a.jpg', '/images/korea/a.jpg']) invalid.push({ ...photo, image });
  for (const value of invalid) assert.equal(context.mealRow('dinner', '飯卷', '18:00', undefined, value), original, JSON.stringify(value));
});

test('meal alt and badge notes are escaped; reference label is forced and contain is respected', () => {
  const { context } = app();
  const html = context.mealRow('lunch', '原餐食', '12:00', undefined, { ...photo,
    imageAlt: '示意 <img>&"\'', imageNote: '參考 <script>&"\'', imageType: 'actual', imageFit: 'contain' });
  assert.match(html, /class="media-img media-img--contain"/);
  assert.ok(html.includes('alt="示意 &lt;img&gt;&amp;&quot;&#39;"'));
  assert.ok(html.includes('title="參考 &lt;script&gt;&amp;&quot;&#39;"'));
  assert.match(html, />餐食示意<\/span>/);
  assert.doesNotMatch(html, /<script>|alt="示意 <img>/);
});

test('captured image errors replace only the meal image and mark its media for a neutral compact fallback', () => {
  const { context, listeners } = app();
  const listener = listeners.find(([name]) => name === 'error');
  assert.equal(listener[2], true, 'non-bubbling image errors need capture');
  let replaced, marked;
  const card = { textContent: '原餐食・預估時間・相關文章', querySelector: () => media };
  const media = { classList: { add: value => { marked = value; } } };
  const image = { matches: selector => selector === 'img.media-img',
    closest: selector => selector === '.card--meal' ? card : null,
    replaceWith: node => { replaced = node; } };
  listener[1]({ target: image });
  assert.equal(replaced.className, 'media-ph');
  assert.equal(replaced.textContent, '圖片暫時無法載入');
  assert.equal(marked, 'meal-media--failed');
  assert.equal(card.textContent, '原餐食・預估時間・相關文章');
  replaced = undefined;
  listener[1]({ target: { matches: () => false } });
  assert.equal(replaced, undefined);
});

test('meal CSS limits media height, explicitly preserves contain/watermarks and shrinks failed media', () => {
  const css = fs.readFileSync('css/maple-theme.css', 'utf8');
  assert.match(css, /\.meal-media\s*\{[^}]*height:\s*120px;[^}]*max-height:\s*140px;/);
  assert.match(css, /@media\s*\(min-width:\s*560px\)\s*\{\s*\.meal-media\s*\{\s*height:\s*140px;/);
  assert.match(css, /\.meal-media \.media-img\s*\{[^}]*object-fit:\s*cover;/);
  assert.match(css, /\.meal-media \.media-img--contain\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(css, /\.meal-media \.photo-badge\s*\{[^}]*bottom:\s*2px;[^}]*font-size:\s*10px;/);
  assert.match(css, /\.meal-media\s*\{[^}]*padding-bottom:\s*22px;/, 'reserve a badge strip outside the image, not over watermarks');
  assert.match(css, /\.meal-media--failed\s*\{[^}]*height:\s*auto;/);
  assert.match(css, /\.meal-media \.media-ph\s*\{[^}]*background:\s*var\(--paper\);[^}]*color:\s*var\(--ink-soft\);/);
});
