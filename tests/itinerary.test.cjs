const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/itinerary.json'), 'utf8'));

test('public itinerary follows the five-day handbook without invented details', () => {
  assert.deepEqual(data.days.map(d => d.date), ['2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15']);
  const expected = [
    ['高雄國際機場 KHH 集合','高雄國際機場 KHH 出發・TW672','仁川國際機場 ICN 抵達','AIR SKY HOTEL'],
    ['松島水上計程車','現代PREMIUM OUTLET','俗離山道國立公園','丹楓隧道','法住寺','丹陽大明渡假村（二人一戶）'],
    ['滿天下空中走廊 SKY WALK','九景傳統市場','森林系網紅咖啡廳（不含飲品）','東大門綜合商場','安山HOUND HOTEL'],
    ['景福宮＋韓服體驗','韓流時尚彩粧店','韓國文化體驗營','HERO塗鴉秀','韓國超市巡禮','首爾明洞','安山HOUND HOTEL'],
    ['Mohegan INSPIRE迎仕柏數位大道','仁川國際機場 ICN 出發・TW671','高雄國際機場 KHH 抵達']
  ];
  data.days.forEach((d,i) => {
    assert.deepEqual(d.items.filter(x => x.type === 'spot').map(x => x.name), expected[i]);
    for (const key of ['breakfast','lunch','dinner']) assert.ok(d.meals[key]);
    assert.ok(d.hotel.name);
    for (const x of d.items) {
      assert.ok(x.image && /^images\/korea\/[a-z0-9-]+\.jpg$/.test(x.image));
      if (x.time === null) assert.match(x.intro, /待領隊通知/);
      if (/咖啡廳|彩粧店|文化體驗營|HERO|超市/.test(x.name)) {
        assert.equal(x.map, null); assert.match(x.intro, /待確認/);
      }
    }
  });
  assert.equal(data.meta.timezone, '+09:00');
  assert.equal(data.meta.people, null);
  assert.deepEqual(data.coords, {});
  assert.deepEqual(data.days.map(d => d.items.filter(x => x.time !== null && !x.timeEstimated).map(x => x.time)), [['14:40','17:10','20:00'],[],[],[],['13:05','16:10']]);
  assert.match(data.days[0].items[0].intro, /台灣時間13:40.*三樓A12/);
  assert.match(data.days[0].items[1].intro, /台灣時間16:10/);
  assert.match(data.days[4].items[2].intro, /台灣時間15:10.*KST.*16:10/);
  assert.equal(data.days[0].hotel.address, '31 Eunhasu-ro 29beon-gil, Yeongjong-gu, Incheon, 南韓 23315');
  assert.equal(data.days[0].items[3].map.keyword, data.days[0].hotel.address);
  for (const i of [1,2,3]) assert.equal(data.days[i].hotel.address, null);
  assert.match(data.days[3].items[2].intro, /水果大福DIY.*韓服體驗.*海苔博物館.*韓流潮拍大頭貼/);
  const publicText = JSON.stringify(data);
  assert.doesNotMatch(publicText, /釜山|Busan|7C6153|MIDAM|Spa Land|SEL\d|(?<!\d)09\d{8}(?!\d)|全面採電子|均需/);
  assert.match(publicText, /20公斤/); assert.match(publicText, /10公斤/); assert.match(publicText, /220V/); assert.match(publicText, /300/);
  assert.match(publicText, /手冊.*未.*驗證/);
  assert.ok(data.info.officialLinks.some(x => x.url === 'https://www.e-arrivalcard.go.kr/'));
});
