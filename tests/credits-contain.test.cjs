const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const root=path.join(__dirname,'..');

// Exercise the real async credits renderer; the minimal DOM implements only
// the native element operations it uses (no browser/npm dependencies).
function element(tag){return {tagName:tag,children:[],className:'',append(...children){this.children.push(...children);}};}
test('credits DOM preserves the actual KOGL4 boat contain flag without changing other previews',async()=>{
  const source=JSON.parse(fs.readFileSync(path.join(root,'data/photo-sources.json'),'utf8'));
  const list=element('section');const status=element('p');
  const context=vm.createContext({URL,document:{createElement:element,getElementById:id=>id==='credits-list'?list:status},fetch:async()=>({ok:true,json:async()=>source})});
  vm.runInContext(fs.readFileSync(path.join(root,'js/photo-credits.js'),'utf8'),context);
  // The script starts loading immediately. Drain its fetch/json continuations.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(list.children.length,source.photos.length);assert.equal(status.textContent,'共 '+source.photos.length+' 筆圖片來源');
  const previews=list.children.flatMap(article=>article.children.filter(child=>child.tagName==='img'));
  const boat=previews.find(image=>image.src==='images/korea/a-songdo-water-real.jpg');assert.ok(boat);
  assert.equal(boat.className,'credit-img--contain');
  assert.equal(boat.alt,source.photos.find(photo=>photo.image===boat.src).imageAlt);
  for(const image of previews.filter(image=>image!==boat))assert.equal(image.className,'');
});

test('credits CSS/browser contract gives contain previews an uncapped natural aspect ratio',()=>{
  const css=fs.readFileSync(path.join(root,'css/photo-credits.css'),'utf8');
  const override=css.match(/\.credit-card\s+img\.credit-img--contain\s*\{([^}]+)\}/);
  assert.ok(override,'a credits-specific, more-specific contain override must beat the default cover/max-height rule');
  assert.match(override[1],/object-fit:\s*contain\s*[;}]/);
  assert.match(override[1],/max-height:\s*none\s*[;}]/);
  assert.match(override[1],/height:\s*auto\s*[;}]/);
  assert.match(css,/\.credit-card img\{[^}]*object-fit:cover/);
  const html=fs.readFileSync(path.join(root,'photo-credits.html'),'utf8');
  assert.match(html,/css\/photo-credits\.css/);
});
