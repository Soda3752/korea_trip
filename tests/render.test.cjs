const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function app() {
  const els = Object.fromEntries(['app-title','app-sub','content'].map(k => [k, {}]));
  const ctx = vm.createContext({ document: { addEventListener(){}, getElementById(k){return els[k];} }, navigator:{userAgent:''}, window:{} });
  for (const file of ['js/naver.js','js/now.js','js/app.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  const data = JSON.parse(fs.readFileSync('data/itinerary.json','utf8'));
  ctx.input = data;
  vm.runInContext('APP.data = input; APP.state = {mode:"during",dayIndex:1,currentItemIndex:-1,nextItemIndex:-1};',ctx);
  return {ctx,els,data};
}
test('untimed card shows schedule uncertainty and neutral handbook placeholder', () => {
  const {ctx} = app();
  const html = ctx.spotRow({name:'測試',time:null,image:null,intro:'時間待領隊通知。',map:null},'');
  assert.match(html,/行程順序/); assert.match(html,/時間待通知/); assert.match(html,/手冊行程/);
  assert.doesNotMatch(html,/null|待補圖|現在|即將/);
});
test('daily reminders render all meals and accommodation, without unknown-time state classes', () => {
  const {ctx,els,data} = app();
  ctx.renderDay(1);
  const html = els.content.innerHTML;
  for (const value of Object.values(data.days[1].meals)) assert.ok(html.includes(value));
  assert.ok(html.includes(data.days[1].hotel.name));
  assert.doesNotMatch(html,/state-current|state-next|state-upcoming|state-past/);
});
test('unknown party size omitted from header and official current-check links rendered', () => {
  const {ctx,els,data} = app();
  ctx.renderHeader();
  assert.doesNotMatch(els['app-sub'].textContent,/null|4人|undefined/);
  ctx.renderInfo();
  for (const link of data.info.officialLinks) assert.ok(els.content.innerHTML.includes(link.url));
  assert.doesNotMatch(els.content.innerHTML,/釜山|叫車指南|預估費用/);
});
test('static entry, docs and build timestamps describe this tour; unrelated photos removed', () => {
  const index = fs.readFileSync('index.html','utf8');
  assert.doesNotMatch(index,/釜山|Busan|自由行/);
  assert.match(index,/韓國秋楓/);
  for (const doc of ['README.md','CLAUDE.md']) {
    const text = fs.readFileSync(doc,'utf8');
    assert.match(text,/2026-10-11/); assert.match(text,/node --test/);
    assert.doesNotMatch(text,/空白範本|UTC\+8|台北 UTC/);
  }
  assert.match(fs.readFileSync('.github/workflows/deploy.yml','utf8'),/Asia\/Seoul/);
  assert.equal(fs.readdirSync('images').filter(x => x.endsWith('.jpg')).length,0);
});
test('new landmark navigation uses Korean search and unknown hotel branches remain unlocated', () => {
  const {ctx,data} = app();
  const water = data.days[1].items[0];
  assert.equal(water.map?.keyword,'송도 센트럴파크 수상택시');
  const aurora = data.days[4].items[0];
  assert.equal(aurora.map.keyword,'인스파이어 오로라');
  assert.equal(ctx.naverSearchUrl(aurora.map),'https://map.naver.com/p/search/'+encodeURIComponent(aurora.map.keyword));
  for (const d of data.days.slice(1,4)) {
    const place = d.items.at(-1).map;
    assert.ok(place.keyword); assert.equal(place.coord,undefined);
  }
});
