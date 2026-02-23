import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import * as flatgeobuf from "flatgeobuf";
import { Layer } from "./LayerControl";
import { layerPaint } from "./LayerControl";

export function registerProtocols(ppsZoomLevels: number[]) {
  const ppsZoomLevelMin = Math.min(...ppsZoomLevels);

  // Register PMTiles protocol
  const pmtProtocol = new pmtiles.Protocol({ errorOnMissingTile: true });
  maplibregl.addProtocol('pmtiles', pmtProtocol.tile);

  // mapterhorn terrain: delegates to different pmtiles files based on zoom
  maplibregl.addProtocol('mapterhorn', async (params, abortController) => {
      const [z, x, y] = params.url.replace('mapterhorn://', '').split('/').map(Number);
      const name = z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
      const url = `pmtiles://https://download.mapterhorn.com/${name}.pmtiles/${z}/${x}/${y}.webp`;
      const response = await pmtProtocol.tile({ ...params, url }, abortController);
      if (response['data'] === null) throw new Error(`mapterhorn tile z=${z} x=${x} y=${y} not found.`);
      return response;
  });

  // pps: delegates to pmtiles only for defined zoom levels 15, 18, 21. Other layers are displayed via explicit overzooming.
  maplibregl.addProtocol('pps', async (params, abortController) => {
    const pattern = /pps:\/\/(.*)\/(\d*)\/(\d*)\/(\d*)/;
    const match = params.url.match(pattern);
    if (match) {
      const [_, url, z, x, y] = match;
      if (+z < ppsZoomLevelMin) return { data: new Uint8Array(0) }; // No tiles below min zoom
      if (ppsZoomLevels.includes(+z)) {
        const newUrl = `pmtiles://${url}/${z}/${x}/${y}.mvt`;
        try {
          const response = await pmtProtocol.tile({ ...params, url: newUrl }, abortController);
          return response;
        } catch (error) {
          if (error instanceof Error && error.message == "Tile not found.") {
            throw Error("PPS Tile not found");
          } else throw error;
        }
      } else throw Error("PPS Tile overzoom");
    } else throw new Error("Invalid PPS URL: " + params.url);
  });
  
  // Suppress overzoom errors (clean console)
  const oldError = console.error;
  console.error = (...args) => {
    if (args[0].message == 'PPS Tile overzoom' || args[0].message == 'PPS Tile not found') return;
    oldError.apply(console, args);
  };
}

async function loadFlatGeobufGeoJSON(url: string) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const features = [];
  for await (const feature of flatgeobuf.geojson.deserialize(new Uint8Array(arrayBuffer))) {
    // parse tags property into array
    if (feature.properties?.tags && typeof feature.properties.tags === 'string' && feature.properties.tags.startsWith('["')) {
      try {
        feature.properties.tags = JSON.parse(feature.properties.tags);
      } catch {
        // Ignore JSON parse errors
      }
    }
    features.push(feature);
  }
  return {
    type: 'FeatureCollection' as const,
    features: features
  };
}

const sources: Record<string,any> = {}; // Keep track of registered sources for cleanup if needed
export function registerSource(map: maplibregl.Map, source: any) {
  if (source.type === 'vector') {
    map.addSource(source.id, {type: 'vector', tiles: source.tiles, promoteId: source.promoteId, minzoom: source.minzoom });
    sources[source.id] = true;
  } else if (source.type === 'raster-dem') {
    map.addSource(source.id, {type: 'raster-dem', tiles: source.tiles, encoding: source.encoding, tileSize: source.tileSize, attribution: source.attribution });
    sources[source.id] = true;
  } else if (source.type === 'fgb') {
    console.log(`Loading ${source.id}`);      
    sources[source.id] = loadFlatGeobufGeoJSON(source.data)
      .then((geojson: any) => {
        map.addSource(source.id, {type: 'geojson', data: geojson, promoteId: source.promoteId });
        sources[source.id] = true;
      });
  } else throw new Error(`Unsupported source type for ${source.id}: ${source.type}`);
}

export function registerLayerAsync(map: maplibregl.Map, layer: Layer) {
  if (sources[layer.source] === true) registerLayer(map, layer);
  else if (sources[layer.source] instanceof Promise) sources[layer.source].then(() => registerLayer(map, layer));
  else throw new Error(`Source not found for ${layer.id}: ${layer.source}`);
}

function registerLayer(map: maplibregl.Map, layer: Layer) {
  if (layer.type === 'circle') map.addLayer({id: layer.id, type: 'circle', source: layer.source, ...(layer.sourceLayer && {'source-layer': layer.sourceLayer}), ...(layer.minzoom && {minzoom: layer.minzoom}), ...(layer.maxzoom && {maxzoom: layer.maxzoom}), paint: layerPaint(layer.type, layer.color)});
  else if (layer.type === 'line') map.addLayer({id: layer.id, type: 'line', source: layer.source, ...(layer.sourceLayer && {'source-layer': layer.sourceLayer}), ...(layer.minzoom && {minzoom: layer.minzoom}), ...(layer.maxzoom && {maxzoom: layer.maxzoom}), paint: layerPaint(layer.type, layer.color)});
  else throw new Error(`Unsupported layer type for ${layer.id}: ${layer.type}`);
}


export const collapseAttributionControl = (map: maplibregl.Map) => {
  const container = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
  if (!container || !container.classList.contains("maplibregl-compact")) return;
  container.classList.remove("maplibregl-compact-show");
  container.removeAttribute("open");
};