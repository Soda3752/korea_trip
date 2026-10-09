const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const meals = ['d1-dinner', 'd2-lunch', 'd2-dinner', 'd3-lunch', 'd3-dinner', 'd4-lunch', 'd4-dinner'].map(id => `images/korea/meal-${id}.jpg`);
function element(tag) { return { tagName: tag, children: [], append(...children) { this.children.push(...children); } }; }
async function render(source) {
  const list = element('section'), status = element('p');
  const context = vm.createContext({ URL, document: { createElement: element, getElementById: id => id === 'credits-list' ? list : status }, fetch: async () => ({ ok: true, json: async () => source }) });
  vm.runInContext(fs.readFileSync('js/photo-credits.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { list, status, previews: list.children.flatMap(article => article.children.filter(child => child.tagName === 'img')) };
}
test('actual async credits renderer creates all 28 images including exactly seven meal previews', async () => {
  const source = JSON.parse(fs.readFileSync('data/photo-sources.json', 'utf8'));
  const { list, status, previews } = await render(source);
  assert.equal(list.children.length, 28);
  assert.equal(previews.length, 28);
  const mealPreviews = previews.filter(image => image.src.startsWith('images/korea/meal-'));
  assert.equal(mealPreviews.length, 7);
  assert.deepEqual(mealPreviews.map(image => image.src).sort(), [...meals].sort());
  assert.equal(status.textContent, '共 28 筆圖片來源');
  for (const image of previews) {
    const record = source.photos.find(photo => photo.image === image.src);
    assert.equal(image.alt, record.imageAlt);
    assert.equal(image.loading, 'lazy');
    assert.equal(image.className || '', record.imageFit === 'contain' ? 'credit-img--contain' : '');
    assert.equal(fs.readFileSync(image.src).readUInt16BE(0), 0xffd8);
  }
});
test('credits renderer rejects unlisted meal filenames and malformed or remote image paths', async () => {
  const invalid = [null, undefined, [], ['images/korea/meal-d1-dinner.jpg'], 'images/korea/meal-d1-lunch.jpg', 'images/korea/meal-d5-dinner.jpg', 'images/korea/meal-d2-breakfast.jpg', 'images/korea/meal-d02-lunch.jpg', 'images/korea/meal-d2-lunch.png', '/images/korea/meal-d2-lunch.jpg', 'images/korea/../meal-d2-lunch.jpg', 'images/korea/%2e%2e/meal-d2-lunch.jpg', 'images\\korea\\meal-d2-lunch.jpg', 'images/korea/meal-d2-lunch.jpg?x=1', 'images/korea/meal-d2-lunch.jpg#x', 'images/korea/meal-d2-lunch.jpg\n', ' images/korea/meal-d2-lunch.jpg', 'images/korea/MEAL-d2-lunch.jpg', 'https://example.com/meal-d2-lunch.jpg', 'https://user:pass@example.com:443/meal-d2-lunch.jpg', 'http://ap73.yncmedia.kr:80/img_up/shop_pds/ap73/contents/meal-d2-lunch.jpg', '//example.com/meal-d2-lunch.jpg', 'javascript:alert(1)'];
  const { list, previews } = await render({ photos: invalid.map(image => ({ image, key: 'invalid' })) });
  assert.equal(list.children.length, invalid.length);
  assert.equal(previews.length, 0);
});
test('original source records and itinerary core remain identical to pre-meal baseline', () => {
  const baseline = '7f770b3fc2a89379afca466cff26864a048c98c9';
  const original = file => JSON.parse(execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' }));
  const sources = JSON.parse(fs.readFileSync('data/photo-sources.json', 'utf8'));
  const baseSources = original('data/photo-sources.json');
  assert.equal(baseSources.photos.length, 21);
  assert.deepEqual(sources.photos.slice(0, 21), baseSources.photos);
  sources.photos = sources.photos.slice(0, 21);
  assert.deepEqual(sources, baseSources);
  const itinerary = JSON.parse(fs.readFileSync('data/itinerary.json', 'utf8'));
  const baseItinerary = original('data/itinerary.json');
  itinerary.days.forEach((day, i) => {
    delete day.mealPhotos;
    delete day.hotel.taxi; // optional taxi-card metadata only; canonical hotel fields stay compared
    const baseTransport = baseItinerary.days[i].transport; // shade advice may only be appended after the original text
    assert.ok(day.transport.startsWith(baseTransport + '遊覽車避曬：'));
    day.transport = baseTransport;
  });
  assert.deepEqual(itinerary, baseItinerary);
});
