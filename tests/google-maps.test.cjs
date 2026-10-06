const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function api() {
  const c = vm.createContext({URLSearchParams, document:{addEventListener(){}}, window:{}});
  for (const file of ['js/google-maps.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return c;
}
test('Google search helper encodes the existing Korean query as a universal HTTPS URL', () => {
  const c = api();
  assert.equal(typeof c.googleSearchUrl, 'function');
  assert.equal(c.googleSearchUrl({keyword:'인스파이어 오로라'}),
    'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:'인스파이어 오로라'}));
});
test('spot navigation renders an escaped Google search anchor', () => {
  const c = api();
  const html = c.spotRow({name:'景點',map:{keyword:'송도 센트럴파크 수상택시'}},'');
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);
});

test('transit uses Google directions with recognized travel modes and omits unknown modes', () => {
  const c=api();
  assert.equal(typeof c.googleNavUrl,'function');
  for (const [mode,expected] of Object.entries({walk:'walking',walking:'walking',taxi:'driving',car:'driving',driving:'driving',bike:'bicycling',bicycle:'bicycling',bicycling:'bicycling',metro:'transit',bus:'transit',transit:'transit',boat:null,unknown:null})) {
    const url=new URL(c.googleNavUrl({keyword:'서울 & "目的地"'},mode));
    assert.equal(url.origin,'https://www.google.com');
    assert.equal(url.pathname,'/maps/dir/');
    assert.equal(url.searchParams.get('api'),'1');
    assert.equal(url.searchParams.get('destination'),'서울 & "目的地"');
    assert.equal(url.searchParams.get('travelmode'),expected);
    const html=c.transitRow({to:{keyword:'서울 & "目的地"'},mode},'');
    assert.ok(html.includes('href="'+c.esc(url.href)+'"'));
    assert.match(html,/rel="noopener noreferrer"/);
  }
});
test('supplied address wins over validated WGS84 lng,lat and existing keyword without mutation', () => {
  const c=api();
  const cases=[
    [{address:'인천 & "飯店"',coord:'126.5,37.5',keyword:'原名'},'인천 & "飯店"'],
    [{coord:'126.5,37.5',keyword:'原名'},'37.5,126.5'],
    [{coord:' -180, -90 '},'-90,-180'], [{coord:'180,90'},'90,180'],
    [{coord:'0,0'},'0,0'], [{address:'   ',coord:'126,37',keyword:'原名'},'37,126'],
    [{keyword:'서울 & "quoted" \'名稱\''},'서울 & "quoted" \'名稱\''],
    [null,null], [undefined,null], [{},null], [{keyword:'   '},null],
    [{coord:123},null], [{keyword:123},null]
  ];
  for(const coord of ['', ' ', ',', ' ,37', '126, ', '126', '126,37,1', 'NaN,37', 'Infinity,37', '-Infinity,37', '181,37', '-181,37', '126,91', '126,-91', '1e309,37', '0x7e,37', 'true,37', '126x,37', [], {}, false]) {
    cases.push([{coord,keyword:'既有韓文 서울'},'既有韓文 서울']);
    cases.push([{coord},null]);
  }
  for(const [place,expected] of cases) {
    const before=JSON.stringify(place);
    for(const [fn,param] of [['googleSearchUrl','query'],['googleNavUrl','destination']]) {
      const raw=c[fn](place,'taxi');
      if(expected===null) assert.equal(raw,null,JSON.stringify(place));
      else {
        const u=new URL(raw);
        assert.equal(u.searchParams.get(param),expected,JSON.stringify(place));
        assert.equal(u.searchParams.get('api'),'1');
        assert.doesNotMatch(raw,/["'<>]/);
        assert.equal(u.searchParams.size,fn==='googleNavUrl'?3:2);
      }
    }
    assert.equal(JSON.stringify(place),before);
  }
});
test('all 25 current cards link only known supplied maps and keep unknown branches null-safe', () => {
  const c=api();
  const data=JSON.parse(fs.readFileSync('data/itinerary.json','utf8'));
  const cards=data.days.flatMap(d=>d.items.filter(it=>it.type==='spot'));
  assert.equal(cards.length,25);
  const known=cards.filter(it=>it.map);
  let links=0;
  for(const it of cards) {
    const html=c.spotRow(it,'');
    const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)];
    assert.equal(anchors.length,it.map?1:0,it.name);
    if(it.map) {
      links+=anchors.length;
      const u=new URL(anchors[0][1].replaceAll('&amp;','&'));
      assert.equal(u.searchParams.get('query'),it.map.address||it.map.keyword);
      assert.match(anchors[0][0],/target="_blank"/);
      assert.match(anchors[0][0],/rel="noopener noreferrer"/);
    }
  }
  assert.equal(links,known.length);
  assert.equal(known.length,19);
  for(const map of [null,undefined,{}, {keyword:' '}, {coord:'126,'}]) {
    assert.doesNotMatch(c.spotRow({name:'未知',map},''),/<a\b|href="null"/);
    assert.doesNotMatch(c.transitRow({to:map,mode:'bus'},''),/<a\b|href="null"/);
  }
  for(const d of data.days.slice(1,4)) {
    const it=d.items.at(-1);
    assert.ok(it.map.keyword); assert.equal(it.map.coord,undefined);
    assert.match(c.spotRow(it,''),/btn-nav/);
  }
});
test('entry loads Google before app and removes legacy interception, intents and installation UI', () => {
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/js\/google-maps\.js\?v=__BUILD_VERSION__/);
  assert.ok(html.indexOf('js/google-maps.js')<html.indexOf('js/app.js'));
  assert.doesNotMatch(html,/naver\.js/);
  const app=fs.readFileSync('js/app.js','utf8');
  assert.doesNotMatch(app,/attachMapHandler|showInstallDialog|naver|nmap:|intent:|preventDefault|install-sheet|browser_fallback_url|visibilitychange/);
  assert.equal(fs.existsSync('js/naver.js'),false);
  for(const file of ['README.md','CLAUDE.md']) {
    const text=fs.readFileSync(file,'utf8');
    assert.match(text,/Google Maps/);
    assert.match(text,/HTTPS/);
    assert.match(text,/API key|API KEY|金鑰/);
    assert.match(text,/作業系統|OS/);
    assert.doesNotMatch(text,/naver|Naver/);
  }
});