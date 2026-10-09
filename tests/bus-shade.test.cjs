const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const RAW = fs.readFileSync('data/itinerary.json', 'utf8');
const PREFIX = '跟團移動與接駁依領隊安排；手冊未提供車程與各站集合時間。';
const CAVEAT = '左右以面向車頭為準；依2026年10月行程參考時段與地點大方向估算，非實際道路逐段模擬。時間、飯店與路線依旅行社／導遊安排，天候、轉彎、窗簾與遮蔽物會影響日照。';
const ADVICE = [
  '遊覽車避曬：左右皆可。20:00抵達後接駁在夜間，沒有日照避曬差異。',
  '遊覽車避曬：優先左側。參考13:00～16:00松島往俗離山的大方向為東南，午後太陽在南至西南，較容易照右側；17:30法住寺往丹陽轉為東北，日落前短段反而右側較避曬。',
  '遊覽車避曬：優先右側。參考14:00～17:00丹陽往首爾的大方向為西北，午後太陽在西南，較容易照左側；晚間往安山無日照差異。咖啡廳位置未確認，不能判斷該段。',
  '遊覽車避曬：優先左側。參考07:00～09:00安山往景福宮大方向為北至東北，晨光在東至東南，較容易照右側；白天各店家、場館位置未定，不保證全日同一側避曬，晚間返回無日照差異。',
  '遊覽車避曬：左右差異較小，不作固定側推薦。參考07:00～09:00安山往迎仕柏大方向為西北，晨光多在車後方，左右優劣可能隨時間與轉彎切換；迎仕柏至機場為短程，依當下陽光選位。',
];
const SIDE = ['左右皆可', '優先左側', '優先右側', '優先左側', '左右差異較小，不作固定側推薦'];

function load() {
  const data = JSON.parse(RAW);
  const ctx = vm.createContext({ URLSearchParams, URL, document: { addEventListener() {} }, navigator: { userAgent: '' }, window: {} });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { ctx, data };
}

test('each day transport keeps original prefix and appends exact shade advice plus caveat', () => {
  const { data } = load();
  assert.equal(data.days.length, 5);
  data.days.forEach((d, i) => assert.equal(d.transport, PREFIX + ADVICE[i] + CAVEAT));
});

test('notesHTML renders all five advices with correct side and caveat, without mutating source', () => {
  const { ctx, data } = load();
  const before = JSON.stringify(data);
  data.days.forEach((d, i) => {
    const html = ctx.notesHTML(d);
    assert.ok(html.includes(ADVICE[i]), `D${i + 1} advice`);
    assert.ok(html.includes(CAVEAT), `D${i + 1} caveat`);
    assert.ok(html.includes(PREFIX), `D${i + 1} prefix`);
    assert.match(html, new RegExp(`遊覽車避曬：${SIDE[i]}`));
    assert.doesNotMatch(html, /\d+\.\d+\s*°|方位角/, 'no precise angles in UI');
  });
  assert.equal(JSON.stringify(data), before);
});

test('unconfirmed spots are not promoted and other data untouched', () => {
  const { data } = load();
  assert.match(data.days[2].transport, /咖啡廳位置未確認，不能判斷該段/);
  assert.match(data.days[3].transport, /店家、場館位置未定，不保證全日同一側避曬/);
  for (const i of [1, 2, 3]) assert.equal(data.days[i].hotel.address, null);
  for (const i of [2, 3]) assert.deepEqual(data.days[i].items.at(-1).map, { keyword: '安山HOUND HOTEL' });
  assert.doesNotMatch(JSON.stringify(data.days.map(d => d.transport)), /HOUND|하운드|반달섬/);
});
