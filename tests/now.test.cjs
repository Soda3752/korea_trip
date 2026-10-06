const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(search = '', instant = '2026-10-10T15:00:00Z') {
  class Clock extends Date { static now() { return Date.parse(instant); } }
  const ctx = vm.createContext({ URLSearchParams, location: { search }, Date: Clock });
  vm.runInContext(fs.readFileSync('js/now.js','utf8'), ctx);
  return ctx;
}
test('live wall clock uses KST and rolls over at UTC 15:00', () => {
  const c = load();
  assert.equal(c.shanghaiNow().dateStr, '2026-10-11');
  assert.equal(c.shanghaiNow().label, '00:00');
  assert.equal(load('', '2026-10-10T14:59:00Z').shanghaiNow().label, '23:59');
});
test('override is a validated KST wall time including midnight', () => {
  assert.equal(load('?now=2026-10-12T00:00').shanghaiNow().dateStr, '2026-10-12');
  assert.equal(load('?now=2026-10-12').shanghaiNow().minutes, 0);
  for (const x of ['2026-10-12T24:00','2026-02-30T12:00','x2026-10-12T12:00','2026-10-12T12:00Z']) {
    assert.equal(load('?now='+x).shanghaiNow().isOverride, false);
  }
});
test('untimed itineraries cannot claim current or next location', () => {
  const c = load();
  const state = c.resolveState({ days:[{date:'2026-10-11',items:[{type:'spot',time:null},{type:'spot',time:null}]}]}, {dateStr:'2026-10-11',minutes:600});
  assert.equal(state.currentItemIndex,-1); assert.equal(state.nextItemIndex,-1);
  const mixed = {days:[{date:'2026-10-11',items:[{type:'spot',time:'10:00'},{type:'spot',time:null},{type:'spot',time:'20:00'}]}]};
  const s = c.resolveState(mixed,{dateStr:'2026-10-11',minutes:900});
  assert.equal(s.currentItemIndex,-1); assert.equal(s.nextItemIndex,-1);
  const exact = c.resolveState(mixed,{dateStr:'2026-10-11',minutes:600});
  assert.equal(exact.currentItemIndex,0); assert.equal(exact.nextItemIndex,-1);
});
test('timed days and trip boundaries retain behavior; invalid times are ignored', () => {
  const c = load();
  for (const time of [null,'24:00','10:99','x12:00']) assert.equal(c.timeToMinutes(time),null);
  const d = { days:[{date:'2026-10-11',items:[{type:'spot',time:'10:00'},{type:'spot',time:'11:00'}]}]};
  assert.equal(c.resolveState(d,{dateStr:'2026-10-10',minutes:0}).mode,'before');
  assert.equal(c.resolveState(d,{dateStr:'2026-10-12',minutes:0}).mode,'after');
  assert.equal(c.resolveState(d,{dateStr:'2026-10-11',minutes:630}).currentItemIndex,0);
  assert.equal(c.resolveState(d,{dateStr:'2026-10-11',minutes:630}).nextItemIndex,1);
});
