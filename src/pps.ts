import { MapGeoJSONFeature } from "react-map-gl/maplibre";
import * as pmtiles from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import * as tileCover from "@mapbox/tile-cover";

const ppsDirectQueryPmtilesUrl = "https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-pp.pmtiles";
const ppsDirectQueryZoom = 18;
const ppsDirectQueryMaxTiles = 4000;

export interface QueryPpsAlongEdgeResult {
  status: "ok" | "invalid-geometry" | "no-candidate-tiles" | "too-many-tiles";
  tileCount: number;
  queryZoom: number;
  matches: MapGeoJSONFeature[];
}

export interface EdgeProfilePoint {
  xMeters: number;
  yValue: number;
  yKey: string;
  ppId: string;
  edgeLngLat: [number, number];
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function findFirstNumericProperty(
  properties: GeoJSON.GeoJsonProperties | null | undefined,
  excludedKeys: string[] = []
): { key: string; value: number } | null {
  if (!properties) return null;
  const excluded = new Set(excludedKeys);

  for (const [key, rawValue] of Object.entries(properties)) {
    if (excluded.has(key)) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return { key, value: rawValue };
    }
  }

  return null;
}

export function buildEdgeProfileFromPpsMatches(
  matches: MapGeoJSONFeature[]
): EdgeProfilePoint[] {
  if (matches.length === 0) return [];

  const profilePoints: EdgeProfilePoint[] = [];

  matches.forEach((match) => {
    if (match.geometry.type !== "Point") return;
    const properties = match.properties as GeoJSON.GeoJsonProperties | null | undefined;
    const xRaw = properties?.positoin ?? properties?.position;
    const xValue = parseNumericValue(xRaw) ?? 0;
    const numericProperty = findFirstNumericProperty(properties, ["positoin", "position"])
      ?? { key: "missing->0", value: 0 };
    const point = match.geometry.coordinates as [number, number];

    profilePoints.push({
      xMeters: xValue,
      yValue: numericProperty.value,
      yKey: numericProperty.key,
      ppId: String(match.id ?? match.properties?.token ?? ""),
      edgeLngLat: [point[0], point[1]]
    });
  });

  profilePoints.sort((a, b) => a.xMeters - b.xMeters);
  return profilePoints;
}

export function getLinePartsFromFeatureGeometry(geometry: GeoJSON.Geometry | null | undefined): [number, number][][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") {
    return [geometry.coordinates as [number, number][]];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates as [number, number][][];
  }
  return [];
}

function getTileCoordsForBufferedEdge(
  lineParts: [number, number][][],
  z: number
): Array<{ z: number; x: number; y: number }> {
  const dedupedTiles = new Map<string, { z: number; x: number; y: number }>();

  lineParts.forEach((linePart) => {
    if (linePart.length < 2) return;

    const geometry: GeoJSON.LineString = {
      type: "LineString",
      coordinates: linePart
    };

    const tiles = tileCover.tiles(geometry, { min_zoom: z, max_zoom: z }) as [number, number, number][];
    tiles.forEach(([x, y, tileZ]) => {
      dedupedTiles.set(`${tileZ}/${x}/${y}`, { z: tileZ, x, y });
    });
  });

  return Array.from(dedupedTiles.values());
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function buildPpsFeatureDedupeKey(
  tile: { z: number; x: number; y: number },
  featureIndex: number,
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties | null | undefined,
  candidateId: string | number | undefined
): string {
  if (geometry.type !== "Point") {
    return `tile:${tile.z}/${tile.x}/${tile.y}:${featureIndex}`;
  }

  const [lng, lat] = geometry.coordinates as [number, number];
  const roundedLng = Number.isFinite(lng) ? lng.toFixed(7) : "nan";
  const roundedLat = Number.isFinite(lat) ? lat.toFixed(7) : "nan";
  const position = properties?.positoin ?? properties?.position ?? "";
  const edge = properties?.uuid_edge ?? "";
  const idPart = candidateId === undefined || candidateId === null ? "no-id" : String(candidateId);

  return `id:${idPart}|edge:${String(edge)}|pt:${roundedLng},${roundedLat}|pos:${String(position)}`;
}

let ppsPmtilesProtocol: pmtiles.Protocol | null = null;

function getPpsPmtilesProtocol(): pmtiles.Protocol {
  if (!ppsPmtilesProtocol) {
    ppsPmtilesProtocol = new pmtiles.Protocol({ errorOnMissingTile: true });
  }
  return ppsPmtilesProtocol;
}

async function fetchTileAndCollectMatches(
  protocol: pmtiles.Protocol,
  tile: { z: number; x: number; y: number },
  matchedById: Map<string, MapGeoJSONFeature>,
  layerName: string,
  edgeUuid: string,
  abortController: AbortController
): Promise<void> {
  const tileUrl = `pmtiles://${ppsDirectQueryPmtilesUrl}/${tile.z}/${tile.x}/${tile.y}.mvt`;

  let tileData: Uint8Array;
  try {
    const response = await protocol.tile({ url: tileUrl } as Parameters<pmtiles.Protocol["tile"]>[0],
      abortController
    );
    tileData = toUint8Array(response.data as ArrayBuffer | Uint8Array);
  } catch (error) {
    if (error instanceof Error && error.message === "Tile not found.") return;
    throw error;
  }

  if (tileData.length === 0) return;

  const vectorTile = new VectorTile(new Pbf(tileData));
  const ppsLayer = vectorTile.layers[layerName];
  if (!ppsLayer) return;

  for (let i = 0; i < ppsLayer.length; i += 1) {
    const rawFeature = ppsLayer.feature(i);
    const geojsonFeature = rawFeature.toGeoJSON(tile.x, tile.y, tile.z) as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
    if (geojsonFeature.geometry.type !== "Point") continue;

    if (geojsonFeature.properties?.uuid_edge !== edgeUuid) {
      continue;
    }

    const feature = {
      id: geojsonFeature.properties?.token,
      type: "Feature",
      properties: geojsonFeature.properties ?? {},
      geometry: geojsonFeature.geometry,
      layer: { id: "pps" },
      source: "pps",
      sourceLayer: "pps"
    } as unknown as MapGeoJSONFeature;

    matchedById.set(geojsonFeature.properties?.token, feature);
  }
}

export async function queryPpsAlongEdgeFromPmtiles(
  geometry: GeoJSON.Geometry | null | undefined,
  edgeUuid: string
): Promise<MapGeoJSONFeature[]> {
  const lineParts = getLinePartsFromFeatureGeometry(geometry);
  if (lineParts.length === 0 ) throw new Error("Geometry invalid");

  const selectedTileCoords = getTileCoordsForBufferedEdge(lineParts, ppsDirectQueryZoom);
  if (selectedTileCoords.length === 0) throw new Error("No tiles found for edge");
  if (selectedTileCoords.length > ppsDirectQueryMaxTiles) throw new Error("Too many tiles found for edge: "+selectedTileCoords.length);

  const protocol = getPpsPmtilesProtocol();
  const abortController = new AbortController();
  const matchedById = new globalThis.Map<string, MapGeoJSONFeature>();

  const batchSize = 16;
  for (let idx = 0; idx < selectedTileCoords.length; idx += batchSize) {
    const batch = selectedTileCoords.slice(idx, idx + batchSize);
    await Promise.all(batch.map((tile) => fetchTileAndCollectMatches(protocol, tile, matchedById, 'pps', edgeUuid, abortController)));
  }

  return Array.from(matchedById.values());
}
