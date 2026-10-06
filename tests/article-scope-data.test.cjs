const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));

for (const {id, index, url, subjects} of [
  {id:'d3-i0', index:0, url:'https://niny.tw/mancheonha-skywalk/', subjects:[/丹陽/, /天空步道|空中走廊/, /玻璃|木棧道|南漢江/]},
  {id:'d3-i1', index:1, url:'https://niny.tw/danyang-market/', subjects:[/丹陽/, /九景.*市場/, /美食|大蒜/]},
  {id:'d3-i3', index:3, url:'https://www.koreagaja.com/korea_quilts/', subjects:[/東大門綜合市場/, /棉被/, /生活用品/, /不是完整布料採購攻略/]}
]) {
  test(`${id} actual article note describes its researched subject, not airport arrangements`, () => {
    const item = itinerary.days.find(day => day.day === 3).items[index];
    const article = item.articles.find(article => article.url === url);
    assert.ok(article, `${id} retains its researched source URL`);
    assert.doesNotMatch(article.note, /機場|航班|櫃台/, id);
    for (const subject of subjects) assert.match(article.note, subject, id);
  });
}

test('D4 self-paid dinner uses the verified Myeongdong alternative with unconfirmed-restaurant warning', () => {
  const day = itinerary.days.find(day => day.day === 4);
  assert.equal(day.mealArticles.dinner.length, 1);
  const article = day.mealArticles.dinner[0];
  assert.equal(article.url, 'https://alinalife.tw/myeongdong/');
  assert.equal(article.title, '【首爾明洞攻略】明洞 美食購物逛街推薦地圖,必訪景點明洞聖堂');
  assert.equal(article.siteName, 'Alina 愛琳娜');
  assert.equal(article.scope, 'related');
  assert.equal(article.note, '明洞商圈美食與逛街參考；自理晚餐未指定店家，文章中的餐廳與小吃不代表本團已安排，營業與菜單依現場確認。');
  assert.ok(day.items[5].articles.some(spotArticle => spotArticle.url === article.url), 'alternative is an existing researched D4-i5 source');
});
