import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import * as flatgeobuf from "flatgeobuf";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export type SourceDefinition =
  | {
      id: string;
      type: "vector";
      tiles: string[];
      promoteId?: string;
      minzoom?: number;
    }
  | {
      id: string;
      type: "raster-dem";
      tiles: string[];
      encoding: "terrarium" | "mapbox" | "custom" | undefined;
      tileSize: number;
      attribution?: string;
    }
  | {
      id: string;
      type: "fgb";
      data: string;
      promoteId?: string;
    };

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
      const [, url, z, x, y] = match;
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


export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  source: string;
  sourceLayer?: string;
  minzoom?: number;
  maxzoom?: number;
  color: LayerColor;
  removable?: boolean;
  active?: boolean;
}

export type LayerType = 'circle' | 'line';

export type LayerColor =
  | { color: string }
  | { color: string; target: 'stroke' | 'fill' };

export const getCircleColorTarget = (color: LayerColor): 'stroke' | 'fill' =>
  'target' in color ? color.target : 'fill';

export const defaultLayerColor = (type: LayerType): LayerColor =>
  type === 'circle'
    ? { color: '#24c6c6', target: 'fill' }
    : { color: '#24c6c6' };

export function layerPaint(type: LayerType, color: LayerColor): Record<string, unknown> {
  if (type === 'circle') {
    if (getCircleColorTarget(color) === 'stroke') {
      return {
        "circle-radius": 4, 'circle-opacity': 0,
        "circle-stroke-color": [
          "case",
          ["boolean", ["feature-state", "expanded"], false], "#ffff00",
          ["boolean", ["feature-state", "selected"], false], "#ff8800",
          color.color
        ],
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "expanded"], false], 2,
          ["boolean", ["feature-state", "selected"], false], 2,
          1
        ]
      };
    } else {
      return {
        "circle-radius": 4, "circle-stroke-width": 0,
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "expanded"], false], "#ffff00",
          ["boolean", ["feature-state", "selected"], false], "#ff8800",
          color.color
        ]      
      }
    }
  } else if (type === 'line') {
    return {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "expanded"], false], "#ffff00",
        ["boolean", ["feature-state", "selected"], false], "#ff8800",
        color.color
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "expanded"], false], 2,
        ["boolean", ["feature-state", "selected"], false], 2,
        1
      ],
    }
  } else {
    return { 'line-color': color.color!, 'line-width': 1 };
  }
}  

async function loadFlatGeobufGeoJSON(url: string): Promise<FeatureCollection> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  for await (const feature of flatgeobuf.geojson.deserialize(new Uint8Array(arrayBuffer))) {
    const parsedFeature = feature as Feature<Geometry, GeoJsonProperties>;
    // parse tags property into array
    if (parsedFeature.properties?.tags && typeof parsedFeature.properties.tags === 'string' && parsedFeature.properties.tags.startsWith('["')) {
      try {
        parsedFeature.properties.tags = JSON.parse(parsedFeature.properties.tags);
      } catch {
        // Ignore JSON parse errors
      }
    }
    features.push(parsedFeature);
  }
  return {
    type: 'FeatureCollection' as const,
    features: features
  };
}

const sources: Record<string, true | Promise<void>> = {}; // Keep track of registered sources for cleanup if needed
export function registerSource(map: maplibregl.Map, source: SourceDefinition) {
  if (source.type === 'vector') {
    map.addSource(source.id, {type: 'vector', tiles: source.tiles, promoteId: source.promoteId, minzoom: source.minzoom });
    sources[source.id] = true;
  } else if (source.type === 'raster-dem') {
    map.addSource(source.id, {type: 'raster-dem', tiles: source.tiles, encoding: source.encoding, tileSize: source.tileSize, attribution: source.attribution });
    sources[source.id] = true;
  } else if (source.type === 'fgb') {
    console.log(`Loading ${source.id}`);      
    sources[source.id] = loadFlatGeobufGeoJSON(source.data)
      .then((geojson) => {
        map.addSource(source.id, {type: 'geojson', data: geojson, promoteId: source.promoteId });
        sources[source.id] = true;
      });
  }
}

export function registerLayerAsync(map: maplibregl.Map, layer: Layer) {
  if (sources[layer.source] === true) registerLayer(map, layer);
  else if (sources[layer.source] instanceof Promise) (sources[layer.source] as Promise<void>).then(() => registerLayer(map, layer));
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