const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const DATA = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
const HOUND_WARN_ZH = '分店待確認：以下僅適用反月島2館，請先向領隊確認再使用。';
const HOUND_WARN_KO = '이 주소가 실제 숙소인지 가이드에게 먼저 확인해 주세요.';

test('nightly hotel taxi metadata: verified D1/D2, conditional Hound D3/D4, none for D5', () => {
  const t = DATA.days.map(d => d.hotel.taxi);
  assert.deepEqual(t[0], { nameKo: '에어스카이 호텔', addressKo: '인천광역시 영종구 은하수로29번길 31', sourceUrl: 'https://www.hotelairsky.co.kr/', branchUnconfirmed: false });
  assert.deepEqual(t[1], { nameKo: '소노벨 단양', addressKo: '충청북도 단양군 단양읍 삼봉로 187-17', sourceUrl: 'https://www.sonohotelsresorts.com/belle_dy/location', branchUnconfirmed: false });
  for (const i of [2, 3]) assert.deepEqual(t[i], { nameKo: '더 하운드 호텔 반달섬2', addressKo: '경기도 안산시 단원구 엠티브이17로 23', sourceUrl: 'http://ap73.yncmedia.kr/page/page3', branchUnconfirmed: true });
  assert.equal(t[4], undefined);
  assert.doesNotMatch(JSON.stringify(DATA), /중구 은하수로/);
  // Canonical values stay untouched: addresses remain unknown, Hound navigation unchanged.
  for (const i of [1, 2, 3]) assert.equal(DATA.days[i].hotel.address, null);
  for (const i of [2, 3]) assert.deepEqual(DATA.days[i].items.at(-1).map, { keyword: '安山HOUND HOTEL' });
});

function app(data = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'))) {
  const els = { content: {}, 'app-title': {}, 'app-sub': {} };
  const ctx = vm.createContext({ URLSearchParams, URL, document: { addEventListener() {}, getElementById(k) { return els[k]; } }, navigator: { userAgent: '' }, window: {} });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  ctx.input = data;
  vm.runInContext('APP.data = input; APP.state = {mode:"before",dayIndex:0,currentItemIndex:-1,nextItemIndex:-1};', ctx);
  const day = i => { ctx.renderDay(i); return els.content.innerHTML; };
  return { ctx, day, data };
}
// The nightly hotel <li> card (last timeline spot) for a rendered day.
function hotelCard(html, name) {
  const cards = html.split('<li class="tl-item').slice(1);
  return cards.map(c => c.slice(0, c.indexOf('</li>'))).filter(c => c.includes(`class="card-title">${name} `));
}

test('D1/D2 nightly hotel cards show the exact Korean taxi sentence below intro and articles', () => {
  const { day } = app();
  const cases = [
    [0, 'AIR SKY HOTEL', '기사님, 에어스카이 호텔로 데려다 주세요.', '주소는 인천광역시 영종구 은하수로29번길 31입니다.'],
    [1, '丹陽大明渡假村（二人一戶）', '기사님, 소노벨 단양으로 데려다 주세요.', '주소는 충청북도 단양군 단양읍 삼봉로 187-17입니다.'],
  ];
  for (const [i, name, l1, l2] of cases) {
    const html = day(i);
    const [card] = hotelCard(html, name);
    assert.ok(card, `D${i + 1} hotel card`);
    assert.match(card, /<section class="taxi-card"[^>]*>/);
    assert.match(card, /給計程車司機看/);
    assert.ok(card.includes(`<p class="taxi-ko" lang="ko">${l1}<br>${l2}</p>`), `D${i + 1} sentence`);
    assert.ok(card.indexOf('taxi-card') > card.indexOf('card-intro'));
    if (card.includes('spot-articles')) assert.ok(card.indexOf('taxi-card') > card.indexOf('spot-articles'));
    assert.ok(card.indexOf('taxi-card') < card.indexOf('</article>'));
    assert.doesNotMatch(card, /分店待確認|가이드에게/);
    // Exactly one taxi block per day; never on other spots, meals or bottom notes.
    assert.equal(html.split('class="taxi-card"').length, 2);
    assert.doesNotMatch(card, /hotelairsky|sonohotelsresorts|href="http:/);
  }
});

test('D3/D4 Hound card is conditional: Chinese warning above, Korean check outside sentence, never confirmed', () => {
  const { day } = app();
  for (const i of [2, 3]) {
    const html = day(i);
    const [card] = hotelCard(html, '安山HOUND HOTEL');
    const sentence = '<p class="taxi-ko" lang="ko">기사님, 더 하운드 호텔 반달섬2로 데려다 주세요.<br>주소는 경기도 안산시 단원구 엠티브이17로 23입니다.</p>';
    assert.ok(card.includes(sentence), `D${i + 1} sentence`);
    const zh = card.indexOf(`<p class="taxi-warn">${HOUND_WARN_ZH}</p>`);
    assert.ok(zh !== -1 && zh < card.indexOf(sentence), 'Chinese warning above');
    const ko = card.indexOf(`<p class="taxi-warn-ko" lang="ko">${HOUND_WARN_KO}</p>`);
    assert.ok(ko > card.indexOf(sentence), 'Korean warning outside, after sentence');
    assert.doesNotMatch(card, /已確認|已預訂|確定入住|확정|예약 완료/);
    assert.equal(html.split('class="taxi-card"').length, 2);
    // Navigation remains the original name search.
    assert.match(card, /query=%E5%AE%89%E5%B1%B1HOUND\+HOTEL/);
  }
});

test('D5 home has no taxi block; spotRow(it, state) without taxi is unchanged; bottom 住宿 note untouched', () => {
  const { ctx, day, data } = app();
  const d5 = day(4);
  assert.doesNotMatch(d5, /taxi-card|給計程車司機看|기사님/);
  const hotelItem = data.days[0].items[3];
  const two = ctx.spotRow(hotelItem, '');
  assert.equal(ctx.spotRow(hotelItem, '', undefined), two);
  assert.doesNotMatch(two, /taxi-card/);
  for (let i = 0; i < 4; i++) {
    const html = day(i);
    const notes = html.slice(html.indexOf('<section class="notes">'));
    assert.ok(notes.includes(ctx.notesHTML(data.days[i])) || html.includes(ctx.notesHTML(data.days[i])));
    assert.doesNotMatch(notes, /taxi-card/);
  }
  // Exact name only: metadata on a day whose hotel name matches no spot renders nothing.
  const moved = JSON.parse(JSON.stringify(data));
  moved.days[4].hotel.taxi = data.days[0].hotel.taxi;
  assert.doesNotMatch(app(moved).day(4), /taxi-card/);
  const renamed = JSON.parse(JSON.stringify(data));
  renamed.days[0].hotel.name = 'AIR SKY';
  assert.doesNotMatch(app(renamed).day(0), /taxi-card/);
});

test('malformed or missing taxi metadata fails closed; markup is escaped; input never mutated', () => {
  const { ctx, data } = app();
  const it = data.days[0].items[3];
  const good = data.days[0].hotel.taxi;
  const bad = [
    null, 'x', [], [good], {},
    { ...good, nameKo: undefined }, { ...good, addressKo: null }, { ...good, nameKo: 7 },
    { ...good, nameKo: '   ' }, { ...good, addressKo: '' }, { ...good, nameKo: '호텔\n' },
    { ...good, addressKo: '주소\u0000' }, { ...good, nameKo: '가'.repeat(81) },
    { ...good, branchUnconfirmed: undefined }, { ...good, branchUnconfirmed: 'false' }, { ...good, branchUnconfirmed: 1 },
  ];
  for (const taxi of bad) {
    const before = JSON.stringify(taxi);
    assert.doesNotMatch(ctx.spotRow(it, '', taxi), /taxi-card|기사님/, JSON.stringify(taxi));
    assert.equal(JSON.stringify(taxi), before);
  }
  // Required provenance: sourceUrl must be a clean HTTPS URL (or the exact legacy HOUND HTTP page).
  const badSources = [
    undefined, null, 7, {}, ['https://www.hotelairsky.co.kr/'], '', '   ', 'not a url', 'javascript:alert(1)',
    'data:text/html,x', 'ftp://example.com/', 'https:///nohost', 'https://user:pw@www.hotelairsky.co.kr/',
    'https://user@www.hotelairsky.co.kr/', ' https://www.hotelairsky.co.kr/', 'https://www.hotelairsky.co.kr/\n',
    'https://www.hotel\tairsky.co.kr/', 'https://www.hotelairsky.co.kr/\u0000', 'https:\\\\www.hotelairsky.co.kr\\',
    'http://www.hotelairsky.co.kr/', 'http://ap73.yncmedia.kr/page/page3/', 'http://ap73.yncmedia.kr/page/page3?x=1',
    'HTTP://ap73.yncmedia.kr/page/page3', 'http://user@ap73.yncmedia.kr/page/page3',
  ];
  for (const sourceUrl of badSources) {
    const taxi = { ...good, sourceUrl };
    if (sourceUrl === undefined) delete taxi.sourceUrl;
    assert.doesNotMatch(ctx.spotRow(it, '', taxi), /taxi-card|기사님/, JSON.stringify(sourceUrl));
  }
  for (const sourceUrl of ['https://www.hotelairsky.co.kr/', 'https://www.sonohotelsresorts.com/belle_dy/location', 'http://ap73.yncmedia.kr/page/page3']) {
    const html = ctx.spotRow(it, '', { ...good, sourceUrl });
    assert.match(html, /taxi-card/, sourceUrl);
    assert.doesNotMatch(html.slice(html.indexOf('<section class="taxi-card"')), /yncmedia|hotelairsky|sonohotels|href=/);
  }
  const xss = { ...good, nameKo: '<img src=x onerror=alert(1)>', addressKo: '"><script>alert(1)</script>' };
  const html = ctx.spotRow(it, '', xss);
  assert.match(html, /taxi-card/);
  assert.doesNotMatch(html, /<img src=x|<script>|"><script/);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  // Real render does not mutate the itinerary object.
  const snapshot = JSON.stringify(data);
  for (let i = 0; i < 5; i++) { ctx.input = data; vm.runInContext('APP.data = input', ctx); ctx.renderDay(i); }
  assert.equal(JSON.stringify(data), snapshot);
});

test('taxi card CSS is a full-width readable light maple panel that wraps long addresses', () => {
  const css = fs.readFileSync('css/maple-theme.css', 'utf8');
  const rule = sel => (css.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
  const card = rule('.taxi-card'), ko = rule('.taxi-ko'), warn = rule('.taxi-warn');
  assert.match(card, /display:\s*block/); assert.match(card, /background:\s*var\(--paper-2\)/);
  assert.match(card, /border[^;]*var\(--maple/); assert.match(card, /max-width:\s*100%/);
  assert.match(card, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(card + ko, /min-width|(?<!max-)width:\s*\d|white-space:\s*nowrap|position:\s*(fixed|absolute)/);
  const size = Number((ko.match(/font-size:\s*([\d.]+)rem/) || [])[1]);
  assert.ok(size >= 1.25, 'Korean text at least ~20px');
  assert.match(ko, /word-break:\s*keep-all/);
  assert.match(warn, /color:\s*var\(--maple-dark\)/); assert.match(warn, /font-weight:\s*700/);
});
