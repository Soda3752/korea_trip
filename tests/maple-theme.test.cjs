const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const luminance = hex => {
  const c = hex.slice(1).match(/../g).map(n => parseInt(n,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
};
const contrast = (a,b) => { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };

const read = p => fs.existsSync(path.join(root,p)) ? fs.readFileSync(path.join(root,p),'utf8') : '';

test('maple theme loads after base CSS with deployment cache key and browser chrome color', () => {
  const html = read('index.html');
  assert.match(html, /<meta name="theme-color" content="#922f27">/);
  assert.ok(html.indexOf('css/maple-theme.css?v=__BUILD_VERSION__') > html.indexOf('css/style.css?v=__BUILD_VERSION__'));
  assert.ok(read('css/maple-theme.css').length > 0);
});

test('self-authored local maple leaf is decorative, passive and script-free', () => {
  const html = read('index.html'), css = read('css/maple-theme.css'), svg = read('assets/maple-leaf.svg');
  assert.match(html, /<img[^>]*class="maple-leaf"[^>]*src="assets\/maple-leaf.svg"[^>]*alt=""[^>]*aria-hidden="true"/);
  assert.match(css, /\.maple-leaf\s*\{[^}]*pointer-events:\s*none/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /<path[^>]+d="M/);
  assert.doesNotMatch(svg.replace('xmlns="http://www.w3.org/2000/svg"', ''), /<script|<foreignObject|href=|https?:|onload=|<animate/i);
});

test('warm theme removes cold decoration, keeps progress and has readable palette pairs', () => {
  const css = read('css/maple-theme.css');
  const token = name => { const m=css.match(new RegExp('--'+name+':\\s*(#[0-9a-f]{6})','i')); assert.ok(m, name); return m[1]; };
  for (const [fg,bg] of [['ink','paper'],['ink-soft','paper-2'],['ink-mute','paper'],['maple','paper-2'],['paper-2','maple'],['rust','maple-soft']]) assert.ok(contrast(token(fg),token(bg))>=4.5,fg+'/'+bg);
  for (const name of ['teal','teal-dark','teal-soft','coral','coral-dark','purple','sky','seagreen']) assert.match(css,new RegExp('--'+name+':\\s*var\\(--'));
  assert.match(css,/\.topbar\s*\{[^}]*background-image:\s*none/);
  assert.match(css,/\.topbar-title\s*\{[^}]*text-shadow:\s*none/);
  assert.match(css,/\.media-ph\s*\{[^}]*background:\s*var\(--maple\)/);
  assert.match(css,/\.state-past \.card\s*\{[^}]*opacity:\s*1/);
  assert.match(css,/\.state-current \.tl-node\s*\{[^}]*animation:\s*none/);
  assert.match(css,/\.flip-digit\s*\{[^}]*background:\s*linear-gradient\(180deg, var\(--maple\), var\(--maple-dark\)\)/);
  assert.doesNotMatch(css,/#(?:2fa6a0|8e7cc3|5b9bd5|79b8a8)|rgba\(47,\s*166|@import/i);
});

test('controls have 44px targets, visible keyboard focus and nonblocking reduced motion', () => {
  const css = read('css/maple-theme.css');
  assert.match(css,/button, \.btn-nav, a\.transit-chip, \.footer a, \.checklist label\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px/);
  assert.match(css,/\.btn-nav\s*\{[^}]*display:\s*inline-flex/);
  assert.match(css,/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--maple-dark\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*animation:\s*none !important;[\s\S]*transition:\s*none !important/);
  assert.match(css,/\.deco-loader\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css,/\.deco-loader\s*\{\s*display:\s*none;/);
  assert.match(css,/\.timeline\.is-entering \.tl-item\s*\{[^}]*opacity:\s*1/);
  assert.match(css,/\.tab:hover:not\(\.is-active\)/);
});
