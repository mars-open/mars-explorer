import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import * as flatgeobuf from "flatgeobuf";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

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
    }
  | {
      id: string;
      type: "geojson";
      data: FeatureCollection<Geometry, GeoJsonProperties>;
      promoteId?: string;
    };

const ppsPattern = /pps:\/\/(.*)\/(\d*)\/(\d*)\/(\d*)/;

function parsePpsUrl(url: string): { baseUrl: string; z: number; x: number; y: number } | null {
  const match = url.match(ppsPattern);
  if (!match) return null;
  const [, baseUrl, z, x, y] = match;
  return {
    baseUrl,
    z: Number(z),
    x: Number(x),
    y: Number(y)
  };
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function composePpsUnderzoomTile(
  pmtProtocol: pmtiles.Protocol,
  params: { url: string },
  abortController: AbortController,
  baseUrl: string,
  targetZ: number,
  targetX: number,
  targetY: number,
  sourceZ: number
): Promise<{ data: Uint8Array }> {
  const layerFeatures: Record<string, Feature<Geometry, GeoJsonProperties>[]> = {};

  const childRequests = [
    { x: targetX * 2, y: targetY * 2 },
    { x: targetX * 2 + 1, y: targetY * 2 },
    { x: targetX * 2, y: targetY * 2 + 1 },
    { x: targetX * 2 + 1, y: targetY * 2 + 1 }
  ];

  const childResponses = await Promise.all(
    childRequests.map(async ({ x, y }) => {
      const childUrl = `pmtiles://${baseUrl}/${sourceZ}/${x}/${y}.mvt`;
      try {
        const response = await pmtProtocol.tile({ ...params, url: childUrl }, abortController);
        return { x, y, data: toUint8Array(response.data as ArrayBuffer | Uint8Array) };
      } catch (error) {
        if (error instanceof Error && error.message == "Tile not found.") {
          return null;
        }
        throw error;
      }
    })
  );

  const presentChildren = childResponses.filter(Boolean) as Array<{ x: number; y: number; data: Uint8Array }>;
  if (presentChildren.length === 0) return { data: new Uint8Array(0) };

  for (const child of presentChildren) {
    const vectorTile = new VectorTile(new Pbf(child.data));
    const layerNames = Object.keys(vectorTile.layers);
    for (const layerName of layerNames) {
      const layer = vectorTile.layers[layerName];
      const features = layerFeatures[layerName] ?? [];
      for (let i = 0; i < layer.length; i += 1) {
        const feature = layer.feature(i).toGeoJSON(child.x, child.y, sourceZ) as Feature<Geometry, GeoJsonProperties>;
        features.push(feature);
      }
      layerFeatures[layerName] = features;
    }
  }

  const encodedLayers: Record<string, unknown> = {};
  for (const [layerName, features] of Object.entries(layerFeatures)) {
    if (features.length === 0) continue;
    const index = geojsonvt(
      {
        type: "FeatureCollection",
        features
      },
      {
        maxZoom: targetZ,
        indexMaxZoom: targetZ,
        indexMaxPoints: 0,
        tolerance: 0,
        extent: 4096,
        buffer: 64
      }
    );

    const tile = index.getTile(targetZ, targetX, targetY);
    if (tile) encodedLayers[layerName] = tile;
  }

  if (Object.keys(encodedLayers).length === 0) return { data: new Uint8Array(0) };
  return { data: vtpbf.fromGeojsonVt(encodedLayers) };
}

export function registerProtocols(ppsZoomLevels: number[], ppsZoomLevelMinOverride?: number) {
  const ppsZoomLevelMin = ppsZoomLevelMinOverride ?? Math.min(...ppsZoomLevels);

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

  // pps: delegates to pmtiles only for defined zoom levels 15, 18, 21. 
  // Zoom levels in between are displayed via explicit overzooming.
  // Zoom 14 is composed of zoom 15 tiles by underzooming.
  maplibregl.addProtocol('pps', async (params, abortController) => {
    const parsed = parsePpsUrl(params.url);
    if (parsed) {
      const { baseUrl, z, x, y } = parsed;
      if (z < ppsZoomLevelMin) return { data: new Uint8Array(0) }; // No tiles below min zoom
      if (ppsZoomLevels.includes(z)) {
        const newUrl = `pmtiles://${baseUrl}/${z}/${x}/${y}.mvt`;
        try {
          const response = await pmtProtocol.tile({ ...params, url: newUrl }, abortController);
          return response;
        } catch (error) {
          if (error instanceof Error && error.message == "Tile not found.") {
            throw Error("PPS Tile not found");
          } else throw error;
        }
      }

      const nextHigherZoom = ppsZoomLevels.find(level => level > z);
      if (nextHigherZoom === z + 1) {
        try {
          return await composePpsUnderzoomTile(
            pmtProtocol, params, abortController, baseUrl, z, x, y, nextHigherZoom
          );
        } catch (error) {
          if (error instanceof Error && error.message == "Tile not found.") {
            throw Error("PPS Tile not found");
          }
          throw error;
        }
      }

      throw Error("PPS Tile overzoom");
    } else throw new Error("Invalid PPS URL: " + params.url);
  });
  
  // Suppress overzoom errors (clean console)
  const oldError = console.error;
  console.error = (...args) => {
    if (args[0].message == 'PPS Tile overzoom' || args[0].message == 'PPS Tile not found') return;
    console.log(args)
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

export type GradientScaleId = 'green-orange-red' | 'red-orange-green' | 'white-blue' | 'blue-white';

export const gradientScales: Record<GradientScaleId, string[]> = {
  'green-orange-red': ['#1a9850', '#fdae61', '#d73027'],
  'red-orange-green': ['#d73027', '#fdae61', '#1a9850'],
  'white-blue': ['#ffffca', '#0571b0'],
  'blue-white': ['#0571b0', '#ffffca']
};

export type LayerColorFixed = {
  mode?: 'fixed';
  color: string;
  target?: 'stroke' | 'fill';
};

export type LayerColorGradient = {
  mode: 'gradient';
  attribute: string;
  scale: GradientScaleId;
  min: number;
  max: number;
  useAbsoluteValue?: boolean;
  target?: 'stroke' | 'fill';
};

export type LayerColor = LayerColorFixed | LayerColorGradient;

export const isGradientLayerColor = (color: LayerColor): color is LayerColorGradient =>
  color.mode === 'gradient';

export const getCircleColorTarget = (color: LayerColor): 'stroke' | 'fill' =>
  'target' in color ? color.target! : 'fill';

export const defaultLayerColor = (type: LayerType): LayerColor =>
  type === 'circle'
    ? { mode: 'fixed', color: '#2427c6', target: 'fill' }
    : { mode: 'fixed', color: '#2427c6' };

export const defaultGradientColor = '#bcbcbc';

export function reuseArrayReferenceIfEqual<T>(
  nextValues: T[],
  previousValues: T[],
  isEqual: (left: T, right: T) => boolean = Object.is
): T[] {
  if (nextValues.length !== previousValues.length) return nextValues;
  const hasDifference = previousValues.some((previousValue, idx) => !isEqual(previousValue, nextValues[idx]));
  return hasDifference ? nextValues : previousValues;
}

function gradientExpression(color: LayerColorGradient): unknown {
  const min = Number(color.min);
  const max = Number(color.max);
  const isRangeValid = Number.isFinite(min) && Number.isFinite(max) && min < max;
  const scale = gradientScales[color.scale];

  if (!isRangeValid || !scale?.length || !color.attribute) {
    console.log('Invalid gradient configuration, falling back to color "grey". Details:', { min, max, scale, attribute: color.attribute });
    return defaultGradientColor;
  }

  if (scale.length === 1) return scale[0];

  const expression: unknown[] = [
    'interpolate',
    ['linear'],
    ['to-number', ['feature-state', 'coloringValue'], min]
  ];

  const lastIdx = scale.length - 1;
  scale.forEach((scaleColor, idx) => {
    const stop = min + ((max - min) * idx) / lastIdx;
    expression.push(stop, scaleColor);
  });

  return [
    'case',
    ['!=', ['feature-state', 'coloringValue'], null],
    expression,
    defaultGradientColor
  ];
}

export const layerColorExpression = (color: LayerColor): unknown => {
  if (isGradientLayerColor(color)) return gradientExpression(color);
  return color.color;
};

export const selectedAwareLayerColorExpression = (color: LayerColor): unknown[] => [
  'case',
  ['boolean', ['feature-state', 'expanded'], false], '#ffff00',
  ['boolean', ['feature-state', 'selected'], false], '#ff8800',
  layerColorExpression(color)
];

export function layerPaint(type: LayerType, color: LayerColor): Record<string, unknown> {
  if (type === 'circle') {
    if (getCircleColorTarget(color) === 'stroke') {
      return {
        "circle-radius": 4, 'circle-opacity': 0,
        "circle-stroke-color": selectedAwareLayerColorExpression(color),
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
        "circle-color": selectedAwareLayerColorExpression(color)
      }
    }
  } else if (type === 'line') {
    return {
      "line-color": selectedAwareLayerColorExpression(color),
      "line-width": [
        "case",
        ["boolean", ["feature-state", "expanded"], false], 2,
        ["boolean", ["feature-state", "selected"], false], 2,
        1
      ],
    }
  } else {
    return { 'line-color': layerColorExpression(color), 'line-width': 1 };
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
  } else if (source.type === 'geojson') {
    map.addSource(source.id, {type: 'geojson', data: source.data, promoteId: source.promoteId });
    sources[source.id] = true
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