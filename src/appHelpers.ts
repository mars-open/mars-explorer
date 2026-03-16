
export const parseHashViewState = () => {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const [lng, lat, zoom] = hash.split('/').map(Number);
  if ([lng, lat, zoom].some(value => Number.isNaN(value))) return null;
  return { latitude: lat, longitude: lng, zoom };
};

export const formatHash = (lng: number, lat: number, zoom: number) => {
  return `#${lng.toFixed(5)}/${lat.toFixed(5)}/${zoom.toFixed(2)}`;
};