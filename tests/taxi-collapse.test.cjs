const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SUMMARY_WARN = '搭車前請先向導遊確認入住飯店';
const HINT = '點擊展開韓文飯店名稱與地址';
const GENERAL_WARN = '<p class="taxi-warn">實際入住飯店以旅行社安排為主，如有變動，請與導遊確認。</p>';
const HOUND_WARN_ZH = '<p class="taxi-warn">分店待確認：以下僅適用反月島2館，請先向領隊確認再使用。</p>';
const HOUND_WARN_KO = '<p class="taxi-warn-ko" lang="ko">이 주소가 실제 숙소인지 가이드에게 먼저 확인해 주세요.</p>';
const ZH = '<p class="taxi-zh">司機您好，請載我到這間飯店，地址如上。</p>';
const NAMES = ['AIR SKY HOTEL', '丹陽大明渡假村（二人一戶）', '安山HOUND HOTEL', '安山HOUND HOTEL'];

function app() {
  const els = { content: {}, 'app-title': {}, 'app-sub': {} };
  const ctx = vm.createContext({ URLSearchParams, URL, document: { addEventListener() {}, getElementById(k) { return els[k]; } }, navigator: { userAgent: '' }, window: {} });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  ctx.input = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
  vm.runInContext('APP.data = input; APP.state = {mode:"before",dayIndex:0,currentItemIndex:-1,nextItemIndex:-1};', ctx);
  return i => { ctx.renderDay(i); return els.content.innerHTML; };
}
function taxiBlock(html) {
  const start = html.indexOf('<section class="taxi-card"');
  return start === -1 ? null : html.slice(start, html.indexOf('</section>', start) + '</section>'.length);
}

test('taxi card D1-D4 is a native details element, closed by default, inside section.taxi-card', () => {
  const day = app();
  for (let i = 0; i < 4; i++) {
    const html = day(i);
    const block = taxiBlock(html);
    assert.ok(block, `D${i + 1} taxi block`);
    assert.ok(html.includes(`class="card-title">${NAMES[i]} `), `D${i + 1} hotel card`);
    const open = block.match(/<details class="taxi-details"[^>]*>/);
    assert.ok(open, `D${i + 1} details`);
    assert.doesNotMatch(open[0], /\bopen\b/, 'closed by default');
    assert.equal(block.split('<details').length, 2);
    assert.ok(block.indexOf('</details>') > block.indexOf('<p class="taxi-zh"'));
    assert.doesNotMatch(block, /onclick|onkeydown|<script|tabindex/);
  }
  assert.equal(taxiBlock(day(4)), null, 'D5 omitted');
  assert.doesNotMatch(day(4), /taxi-details|給計程車司機看|搭車前請先向導遊確認/);
});

test('summary holds title, expand hint and always-visible warning; all detail content is inside the body', () => {
  const day = app();
  for (let i = 0; i < 4; i++) {
    const block = taxiBlock(day(i));
    const s0 = block.indexOf('<summary class="taxi-summary">'), s1 = block.indexOf('</summary>');
    assert.ok(s0 !== -1 && s1 > s0, `D${i + 1} summary`);
    const summary = block.slice(s0, s1);
    assert.match(summary, /<span class="taxi-title">🚕 給計程車司機看<\/span>/);
    assert.ok(summary.includes(`<span class="taxi-hint">${HINT}</span>`));
    assert.ok(summary.includes(`<span class="taxi-summary-warn">${SUMMARY_WARN}</span>`));
    assert.doesNotMatch(summary, /taxi-ko|기사님|실제 숙소|旅行社安排|分店待確認/);
    const body = block.slice(s1, block.indexOf('</details>'));
    assert.ok(body.includes(GENERAL_WARN), `D${i + 1} general warning inside`);
    assert.match(body, /<p class="taxi-ko" lang="ko">기사님, .+<br>주소는 .+입니다\.<\/p>/);
    assert.ok(body.includes(ZH));
    const hound = i === 2 || i === 3;
    assert.equal(body.includes(HOUND_WARN_ZH), hound);
    assert.equal(body.includes(HOUND_WARN_KO), hound);
    assert.equal(block.split(SUMMARY_WARN).length, 2);
  }
});

test('taxi summary CSS: full-width ≥44px target, chevron flips on open, visible focus, Korean ≥20px', () => {
  const css = fs.readFileSync('css/maple-theme.css', 'utf8');
  const rule = sel => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]()>:]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
  const summary = rule('.taxi-summary');
  assert.match(summary, /display:\s*(flex|grid|block)/);
  assert.match(summary, /min-height:\s*44px/);
  assert.match(summary, /cursor:\s*pointer/);
  assert.match(css, /\.taxi-summary::-webkit-details-marker\s*\{[^}]*display:\s*none/);
  assert.match(rule('.taxi-summary::after'), /content:/);
  assert.match(rule('.taxi-details[open] > .taxi-summary::after'), /transform:\s*rotate/);
  assert.match(rule('.taxi-summary:focus-visible'), /outline:\s*[^;]*var\(--maple/);
  const size = Number((rule('.taxi-ko').match(/font-size:\s*([\d.]+)rem/) || [])[1]);
  assert.ok(size >= 1.25);
  assert.match(rule('.taxi-summary-warn'), /display:\s*block/);
});
