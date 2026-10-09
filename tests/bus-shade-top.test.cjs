const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const RAW = fs.readFileSync('data/itinerary.json', 'utf8');
const SIDE = ['左右皆可', '優先左側', '優先右側', '優先左側', '左右差異較小，不作固定側推薦'];
const DETAIL = [
  '20:00抵達後接駁在夜間，沒有日照避曬差異。',
  '參考13:00～16:00松島往俗離山的大方向為東南，午後太陽在南至西南，較容易照右側；17:30法住寺往丹陽轉為東北，日落前短段反而右側較避曬。',
  '參考14:00～17:00丹陽往首爾的大方向為西北，午後太陽在西南，較容易照左側；晚間往安山無日照差異。咖啡廳位置未確認，不能判斷該段。',
  '參考07:00～09:00安山往景福宮大方向為北至東北，晨光在東至東南，較容易照右側；白天各店家、場館位置未定，不保證全日同一側避曬，晚間返回無日照差異。',
  '參考07:00～09:00安山往迎仕柏大方向為西北，晨光多在車後方，左右優劣可能隨時間與轉彎切換；迎仕柏至機場為短程，依當下陽光選位。',
];
const CAVEAT = '左右以面向車頭為準；依主要路段與參考時段估算，非全日避曬保證，實際依導遊路線安排。';

function load() {
  const content = {};
  const ctx = vm.createContext({ URLSearchParams, URL,
    document: { addEventListener() {}, getElementById() { return content; } },
    navigator: { userAgent: '' }, window: {} });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { ctx, content };
}

function render(day) {
  const { ctx, content } = load();
  ctx.input = { days: [day] };
  vm.runInContext('APP.data = input; APP.state = { mode: "during", dayIndex: 0, currentItemIndex: -1, nextItemIndex: -1 }; renderDay(0);', ctx);
  return content.innerHTML;
}

test('all five days show shade card after time note, before meals and timeline', () => {
  const data = JSON.parse(RAW);
  data.days.forEach((day, i) => {
    const html = render(day);
    const card = html.match(/<section class="bus-shade"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(card, `D${i + 1} card`);
    assert.equal(html.split('class="bus-shade"').length - 1, 1);
    const note = html.indexOf('</p>', html.indexOf('class="day-time-note"'));
    const meals = html.indexOf('daily-meals');
    const timeline = html.indexOf('<ol class="timeline">');
    assert.ok(note > 0 && card.index > note && card.index < meals && meals < timeline, `D${i + 1} order`);
    assert.ok(card[0].includes('☀️ 遊覽車避曬座位'));
    assert.ok(card[0].includes(`<strong class="bus-shade-pick">${SIDE[i]}</strong>`), `D${i + 1} pick`);
    assert.ok(card[0].includes(`<p class="bus-shade-detail">${DETAIL[i]}</p>`), `D${i + 1} detail`);
    assert.ok(card[0].includes(`<p class="bus-shade-caveat">${CAVEAT}</p>`));
    assert.doesNotMatch(card[0], /跟團移動與接駁|非實際道路逐段模擬/);
    // bottom transport note remains complete
    assert.ok(html.slice(html.indexOf('</ol>', timeline)).includes(day.transport));
  });
});

test('escapes dynamic text and returns empty for missing or malformed advice', () => {
  const { ctx } = load();
  const html = ctx.busShadeHTML({ transport: '遊覽車避曬：<b>左</b>&"\'。細節<script>x</script>。左右以面向車頭為準；其他' });
  assert.ok(html.includes('&lt;b&gt;左&lt;/b&gt;&amp;&quot;&#39;'));
  assert.ok(html.includes('細節&lt;script&gt;x&lt;/script&gt;。'));
  assert.doesNotMatch(html, /<script>|<b>/);
  for (const day of [undefined, null, {}, { transport: null }, { transport: 42 }, { transport: '一般交通說明' },
    { transport: '遊覽車避曬：' }, { transport: '遊覽車避曬：。左右以面向車頭為準' }]) {
    assert.equal(ctx.busShadeHTML(day), '', JSON.stringify(day));
  }
  assert.ok(!ctx.busShadeHTML({ transport: '遊覽車避曬：左右皆可。左右以面向車頭為準；' }).includes('bus-shade-detail'));
});

test('rendering does not mutate itinerary data', () => {
  const data = JSON.parse(RAW);
  const before = JSON.stringify(data);
  data.days.forEach(render);
  assert.equal(JSON.stringify(data), before);
  assert.equal(fs.readFileSync('data/itinerary.json', 'utf8'), RAW);
});

test('maple theme scopes the shade card', () => {
  const css = fs.readFileSync('css/maple-theme.css', 'utf8');
  assert.match(css, /\.bus-shade\s*\{[^}]*\}/);
  assert.match(css, /\.bus-shade-pick\s*\{[^}]*font-weight:\s*(700|800|bold)/);
});
