'use strict';
function safePhotoUrl(value) {
  try {
    // Inspect the raw HTTP authority: URL normalization erases explicit :80.
    const httpAuthority = typeof value === 'string' && value.trim().match(/^http:\/\/([^/?#\\]*)/i);
    if (httpAuthority && httpAuthority[1].includes(':')) return null;
    const url = new URL(value);
    if (url.username || url.password) return null;
    // Verified public hotel-gallery citation; HTTPS has a mismatched certificate.
    // This exception does not load remote photos: all displayed images are local JPEGs.
    const legacy = url.protocol === 'http:' && httpAuthority && url.hostname === 'ap73.yncmedia.kr' && !url.port &&
      (url.pathname === '/page/page3' || url.pathname.startsWith('/img_up/shop_pds/ap73/contents/'));
    return url.protocol === 'https:' || legacy ? url.href : null;
  } catch (_) { return null; }
}
function photoElement(tag, text, cls) {
  const element = document.createElement(tag); if (text) element.textContent = text; if (cls) element.className = cls; return element;
}
function photoLink(label, value) {
  const href = safePhotoUrl(value); if (!href) return photoElement('span', label + '（連結不可用）');
  const link = photoElement('a', label); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
async function loadPhotoCredits() {
  const status = document.getElementById('credits-status');
  try {
    const response = await fetch('data/photo-sources.json'); if (!response.ok) throw new Error('source unavailable');
    const source = await response.json(); if (!Array.isArray(source.photos)) throw new Error('invalid source');
    const list = document.getElementById('credits-list');
    for (const photo of source.photos) {
      const article = photoElement('article', '', 'credit-card');
      article.append(photoElement('h2', photo.imageAlt || photo.key));
      if (/^images\/korea\/[abc]-[a-z0-9-]+\.jpg$/.test(photo.image)) {
        const image = photoElement('img', '', photo.imageFit === 'contain' ? 'credit-img--contain' : ''); image.src = photo.image; image.alt = photo.imageAlt || photo.key; image.loading = 'lazy'; article.append(image);
      }
      article.append(photoElement('p', '作者：' + photo.author), photoElement('p', '授權：' + photo.license));
      if (photo.imageNote) article.append(photoElement('p', photo.imageNote));
      if (photo.modifications) article.append(photoElement('p', photo.modifications));
      const links = photoElement('p', '', 'credit-links'); links.append(photoLink('來源頁', photo.sourceUrl), photoLink('原始圖片', photo.originalUrl), photoLink('授權說明', photo.licenseUrl)); article.append(links); list.append(article);
    }
    status.textContent = '共 ' + source.photos.length + ' 筆圖片來源';
  } catch (_) { status.textContent = '圖片來源暫時無法載入，請稍後重新整理。'; }
}
loadPhotoCredits();
