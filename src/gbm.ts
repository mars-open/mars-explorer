import JSZip from "jszip";
import { ungzip } from "pako";
import type { Feature, Point } from "geojson";
import type maplibregl from "maplibre-gl";
import { registerLayerAsync, registerSource, type Layer } from "./mapHelpers";

interface GbmDataEntry {
  topoelement?: Record<string, unknown>;
  points?: unknown[];
}

interface GbmDocument {
  header?: Record<string, unknown>;
  data?: GbmDataEntry[];
}

const gbmJsonGzPathPattern = /^.*\.json\.gz$/i;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLngLat(point: any): [number, number] | null {
  if (point == null || typeof point !== 'object') return null;
  const lat = toNumber(point.lat);
  const lng = toNumber(point.lon ?? point.lng);
  if (lng !== null && lat !== null && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
    return [lng, lat];
  } else {
    return null;
  }
}

// feature cache for append/merge new GBM data to existing source
const features: Map<string, Feature<Point | null>> = new Map();

export async function parseGbmZipToPoints(file: File): Promise<Feature<Point | null>[]> {
  const zipContent = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(zipContent);
  let foundGbmData = false;

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const match = path.match(gbmJsonGzPathPattern);
    if (!match) continue;
    foundGbmData = true;
    console.log(`Processing GBM ZIP entry: ${path}`);

    const jsonText = new TextDecoder().decode(ungzip(await zipEntry.async('uint8array')));
    const document = JSON.parse(jsonText) as GbmDocument;
    const dataEntries = Array.isArray(document.data) ? document.data : [];
    dataEntries.forEach(entry => {
      if (!Array.isArray(entry.points)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entry.points.forEach((rawPoint: any) => {
        // extract position, remove from rawPoint
        const positionpointId = rawPoint.position?.id_positionpoint?.toString();
        const topoelementId = Object.values(entry.topoelement ?? {})[0];
        const positionAttr = Object.keys(rawPoint.position ?? {}).find(key => /position/i.test(key)) || 'position';
        const position = rawPoint.position?.[positionAttr];
        delete rawPoint.position;
        // merge with existing feature properties if exists
        const props = {...rawPoint, topoelements: [{id: topoelementId, position: position}]};
        const existing = features.get(positionpointId);
        const existingProps = existing?.properties ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topoelements = props.topoelements.concat((existingProps.topoelements ?? []).filter((x: any) => !props.topoelements.some((y: any) => y.id === x.id)));
        const newProps = { ...existingProps, ...props, topoelements: topoelements, id_positionpoint: positionpointId };
        const coordinates = toLngLat(rawPoint.point)
        if (positionpointId) {
          features.set(positionpointId, {
            type: 'Feature',
            geometry: coordinates ? { type: 'Point', coordinates: coordinates } : existing?.geometry || null,
            properties: newProps
          });
        }
      });
    });
  }

  if (!foundGbmData) throw new Error('No *.json.gz files found in ZIP.');

  return [...features.values()];
}

interface ImportedGbmLayerResult {
  layerId: string;
  layerDefinition: Layer;
  pointCount: number;
}

export async function importGbmZipAsLayer(
  map: maplibregl.Map,
  file: File,
): Promise<ImportedGbmLayerResult> {
  const features = await parseGbmZipToPoints(file);
  if (!features.length) throw new Error('No GBM points loaded.');
  const featuresWithGeom = features.filter(f => f.geometry !== null) as Feature<Point>[];
  const featuresWithoutGeom = features.filter(f => f.geometry === null);
  console.log(`Found ${featuresWithGeom.length} GBM points with valid geometry, and ${featuresWithoutGeom.length} without geometry.`);
  if (!featuresWithGeom.length) throw new Error('No GBM points with valid geometry loaded.');

  const layerId = 'gbm-points';
  const layerDefinition: Layer = {
    id: layerId,
    name: `GBM points`,
    type: 'circle',
    source: layerId,
    color: { color: '#ff2d55', target: 'fill' },
    removable: true
  };

  const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: featuresWithGeom
  }
  if (map.getSource(layerId)) {
    const source = map.getSource(layerId) as maplibregl.GeoJSONSource;
    source.setData(geojson);
    if (!map.getLayer(layerId)) {
      registerLayerAsync(map, layerDefinition);
    }
  } else {
    registerSource(map, {id: layerId, type: 'geojson', data: geojson, promoteId: 'id_positionpoint' });
    registerLayerAsync(map, layerDefinition);
  }

  // zoom to layer bounds
  const source = map.getSource(layerId) as maplibregl.GeoJSONSource;
  source.getBounds().then(bounds => {
    map.fitBounds(bounds, {padding: 20, maxZoom: 18});
  });

  return {
    layerId,
    layerDefinition,
    pointCount: features.length
  };
}
