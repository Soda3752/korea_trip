const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function api() {
  const c = vm.createContext({URL, URLSearchParams, document:{addEventListener(){}}, window:{}});
  for (const file of ['js/google-maps.js','js/app.js']) vm.runInContext(fs.readFileSync(file,'utf8'), c);
  return c;
}

test('article labels cover editorial guides and related reading without declaring known places unknown',()=>{const c=api();const a={url:'https://example.org/guide',title:'中文旅遊介紹',siteName:'旅遊編輯站',scope:'exact',note:'旅遊參考'};const exact=c.articlesHTML({name:'已知景點',articles:[a]});assert.match(exact,/中文文章 ↗/);const related=c.articlesHTML({name:'已知景點',articles:[{...a,scope:'related'}]});assert.match(related,/參考文章 ↗/);assert.match(related,/非本次行程或場館的確認資訊/);assert.doesNotMatch(related,/非本團已確認場地/);});

test('helper and actual cards reject malformed URLs and required fields without mutating arrays', () => {
  const c = api();
  const urls = [undefined, null, 42, {}, [], '', ' ', 'http://example.org', '//example.org', '/blog', 'example.org/blog', 'javascript:alert(1)', 'data:text/html,test', 'ftp://example.org', 'https:', 'https://', 'https:///example.org', 'https:example.org', 'https://user@example.org', 'https://user:pass@example.org', 'https://@example.org', 'https://example.org:bad', 'https://exa mple.org', ' https://example.org', 'https://example.org\n', 'https://example.org/\tpath', 'https://example.org/\u0000path', 'https://example.org/\u007fpath', 'https://example.org\\path'];
  const invalid = urls.map(url => ({...article, url}));
  for (const key of ['title','siteName','scope','note']) {
    for (const value of [undefined, null, 1, false, {}, [], ' ']) invalid.push({...article, [key]:value});
  }
  invalid.push({...article,scope:'unknown'}, null, false, 'article', []);
  for (const a of invalid) {
    const items = Object.freeze([a && typeof a === 'object' ? Object.freeze(a) : a]);
    const spot = {name:'安全測試', articles:items};
    assert.equal(c.articlesHTML(spot), '', JSON.stringify(a));
    assert.doesNotMatch(c.spotRow(spot,''), /spot-articles|article-link/);
  }
  const articles = Object.freeze([Object.freeze({...article}), null, Object.freeze({...article,url:'http://bad.org'})]);
  const before = JSON.stringify(articles);
  assert.equal((c.articlesHTML({name:'景點',articles}).match(/article-link/g)||[]).length,1);
  assert.equal(JSON.stringify(articles),before);
});
test('all 25 actual spots and absent or non-array articles preserve original card markup', () => {
  const c = api();
  const spots = JSON.parse(fs.readFileSync('data/itinerary.json','utf8')).days.flatMap(d=>d.items.filter(i=>i.type==='spot'));
  assert.equal(spots.length,25);
  for (const spot of spots) for (const articles of [undefined,null,{},'x',false,[],[null]]) {
    assert.equal(c.articlesHTML({...spot,articles}), '');
    assert.equal(c.spotRow({...spot,articles},''),c.spotRow({...spot,articles:undefined},''));
  }
});

test('related articles visibly warn that the venue is unconfirmed even if note implies certainty', () => {
  const c = api();
  const html = c.spotRow({name:'體驗',articles:[{...article,scope:'related',note:'作者心得'}]},'');
  assert.match(html,/參考文章 ↗/);
  assert.match(html,/非本次行程或場館的確認資訊/);
  assert.match(html,/作者心得/);
  assert.doesNotMatch(html,/中文文章 ↗/);
  assert.doesNotMatch(c.articlesHTML({name:'景點',articles:[article]}),/非本團已確認場地/);
});
test('title source note name ARIA and URL attributes use existing escaping without injecting HTML', () => {
  const c = api();
  const evil = `<img src=x onerror="attack()"> & '文字'`;
  const a = {...article,title:evil,siteName:evil,note:evil,url:`https://example.org/blog?q="'><tag>&ok=1`};
  const html = c.articlesHTML({name:evil,articles:[a]});
  assert.ok(html.includes(`href="${c.esc(a.url)}"`));
  assert.ok(html.includes(`aria-label="${c.esc(evil)}：${c.esc(evil)}（${c.esc(evil)}）"`));
  assert.ok(html.includes(`<p class="article-note">${c.esc(evil)}</p>`));
  assert.doesNotMatch(html,/<img|<tag>|href="[^"]*"'/);
});

test('article-only layout wraps long titles while reusing existing touch and theme focus rules', () => {
  const css = fs.readFileSync('css/maple-theme.css','utf8');
  assert.match(css,/\.spot-articles\s*\{[^}]*display:\s*grid/);
  assert.match(css,/\.article-link\s*\{[^}]*white-space:\s*normal/);
  assert.match(css,/\.article-link\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css,/button, \.btn-nav,[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(css,/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--maple-dark\)/);
  assert.doesNotMatch(fs.readFileSync('js/app.js','utf8'),/preventDefault|attachArticleHandler|onclick=/);
});

test('parsed HTML contract preserves HTTPS href, blank target, rel tokens and safe text/ARIA', () => {
  const c = api();
  const hostile = `標題 <b>文字</b> & "引號"`;
  const entries = [article,{...article,scope:'related',title:hostile,siteName:hostile,note:hostile}];
  const html = c.spotRow({name:hostile,intro:'保留介紹',articles:entries},'');
  const parser = String.raw`
import json, sys
from html.parser import HTMLParser
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.tags=[]; self.text=[]
    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        if tag == 'a': self.links.append(dict(attrs))
    def handle_data(self, text): self.text.append(text)
p=Links(); p.feed(sys.stdin.read())
print(json.dumps({'links':p.links,'tags':p.tags,'text':''.join(p.text)}))
`;
  const result = require('node:child_process').spawnSync('python3',['-c',parser],{input:html,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const dom = JSON.parse(result.stdout);
  assert.equal(dom.links.length,2);
  for (const [i,a] of dom.links.entries()) {
    assert.equal(a.href,entries[i].url);
    assert.equal(new URL(a.href).protocol,'https:');
    assert.equal(a.target,'_blank');
    assert.deepEqual(a.rel.split(' '),['noopener','noreferrer']);
    assert.equal(a['aria-label'],`${hostile}：${entries[i].title}（${entries[i].siteName}）`);
    assert.equal(a.onclick,undefined);
    assert.equal(a['data-map'],undefined);
  }
  assert.ok(dom.text.includes(hostile));
  assert.ok(dom.text.includes('相關閱讀，非本次行程或場館的確認資訊。'));
  assert.equal(dom.tags.includes('b'),false);
  assert.equal(dom.tags.includes('script'),false);
});

const article = {url:'https://example.org/blog?lang=zh&trip=1', title:'秋日散步', siteName:'旅行筆記', scope:'exact', note:'個人遊記'};
test('actual spotRow inserts named Chinese blog anchors below unchanged intro inside card-body', () => {
  const c = api();
  const spot = {name:'公園', intro:'原介紹', stay:'60 分鐘', map:{keyword:'서울'}, image:'images/korea/test.jpg'};
  const original = c.spotRow(spot, '');
  const html = c.spotRow({...spot, articles:[article]}, '');
  assert.match(html, /class="spot-articles"/);
  assert.ok(html.indexOf('spot-articles') > html.indexOf('原介紹</p>'));
  assert.ok(html.indexOf('spot-articles') < html.indexOf('</article>'));
  assert.match(html, /中文文章 ↗/);
  assert.match(html, /秋日散步/);
  assert.match(html, /旅行筆記/);
  assert.match(html, /個人遊記/);
  assert.match(html, /class="btn-nav article-link"[^>]*href="https:\/\/example.org\/blog\?lang=zh&amp;trip=1"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.equal(html.replace(c.articlesHTML({...spot, articles:[article]}), ''), original);
});
