// Google Maps universal HTTPS links; app/browser opening is decided by the OS.
// Use only supplied targets: address > valid WGS84 "lng,lat" > existing keyword.
function googleMapTarget(place) {
  if (!place) return null;
  if (typeof place.address === 'string' && place.address.trim()) return place.address;
  if (typeof place.coord === 'string') {
    const parts = place.coord.split(',').map(s => s.trim());
    const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
    if (parts.length === 2 && parts.every(s => numeric.test(s))) {
      const [lng, lat] = parts.map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
        return `${lat},${lng}`;
      }
    }
  }
  return typeof place.keyword === 'string' && place.keyword.trim() ? place.keyword : null;
}

function googleSearchUrl(place) {
  const query = googleMapTarget(place);
  if (query === null) return null;
  return 'https://www.google.com/maps/search/?' + new URLSearchParams({api: '1', query});
}

function googleNavUrl(to, mode) {
  const destination = googleMapTarget(to);
  if (destination === null) return null;
  const params = new URLSearchParams({api: '1', destination});
  const modes = {walk: 'walking', walking: 'walking', taxi: 'driving', car: 'driving', driving: 'driving',
    bike: 'bicycling', bicycle: 'bicycling', bicycling: 'bicycling', metro: 'transit', bus: 'transit', transit: 'transit'};
  if (Object.hasOwn(modes, mode)) params.set('travelmode', modes[mode]);
  return 'https://www.google.com/maps/dir/?' + params;
}
