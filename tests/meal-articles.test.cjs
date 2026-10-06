const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function render(data, dayIndex, time = '12:00') {
  const before = JSON.stringify(data);
  const content = {};
  const context = vm.createContext({ URL, URLSearchParams,
    location: { search: `?now=${data.days[dayIndex].date}T${time}` },
    document: { addEventListener() {}, getElementById: () => content },
    navigator: { userAgent: '' }, window: {}, input: data, dayIndex });
  for (const file of ['js/google-maps.js', 'js/now.js', 'js/app.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const state = vm.runInContext('APP.data=input;recompute();renderDay(dayIndex);APP.state', context);
  assert.equal(JSON.stringify(data), before, 'render must not mutate source data');
  assert.equal(vm.runInContext('APP.data === input', context), true);
  const rows = [...content.innerHTML.matchAll(/<li class="tl-item ([^"]*)">([\s\S]*?)<\/li>/g)];
  return { context, state, rows, meals: rows.filter(row => row[1].includes('tl-meal')) };
}
test('meal reading uses safe related article links without naming a confirmed restaurant or changing source',()=>{
 const d=structuredClone(itinerary);
 d.days[0].mealArticles={dinner:[{url:'https://example.com/food',title:'飯卷介紹',siteName:'料理部落格',scope:'related',note:'料理參考，非本團餐廳。'}]};
 const html=render(d,0).meals[0][0];
 assert.match(html,/article-link/);assert.match(html,/相關文章（參考）↗/);assert.match(html,/非本次行程或場館/);assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/aria-label="[^"]*非本次行程或場館/);
 assert.doesNotMatch(html,/article-reference|article-note|btn-nav article-link/);
 d.days[0].mealArticles.dinner[0].url='javascript:alert(1)';
 assert.doesNotMatch(render(d,0).meals[0][0],/article-link|javascript:/);
});
