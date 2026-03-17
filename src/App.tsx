import { AttributionControl, Map, MapGeoJSONFeature, MapRef, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar } from "./AppBar";
import { LayerControl } from "./LayerControl";
import { TagsFilter } from "./TagsFilter";
import { CoordinatesDisplay } from "./CoordinatesDisplay";
import { SelectedFeaturesPanel, SelectedFeature } from "./SelectedFeaturesPanel";
import { BoxSelect } from "./BoxSelect";
import maplibregl from "maplibre-gl";
import { collapseAttributionControl, Layer, LayerColor, registerLayerAsync, registerProtocols, registerSource, SourceDefinition } from "./mapHelpers";
import { formatHash, parseHashViewState } from "./appHelpers";
import { LayerColorOverride, LayerConfiguration } from "./types/layerConfiguration";
import { importGbmZipAsLayer } from "./gbm";


// constants
const ppsZoomLevels = [15, 18, 21].sort((a,b) => b - a).reverse();
const ppsZoomLevelMin = Math.min(...ppsZoomLevels);
const edgesZoomLevelMin = 10;

const defaultViewState = {
  latitude: 46.95061,
  longitude: 7.43885,
  zoom: 15,
  pitch: 0,
  bearing: 0
};


// Define background layer
// traffimage, swisstopo or custom... 
//const mapStyle = "https://maps.geops.io/styles/base_bright_v2_ch.sbb.netzkarte/style.json?key=5cc87b12d7c5370001c1d655352830d2fef24680ae3a1cda54418cb8"
//const mapStyle = "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"
//const mapStyle = "https://tiles.openfreemap.org/styles/positron"  // or /liberty, /bright
const mapStyle = "swisstopo_lightbasemap_v1190_reduced.json"
// Editor: https://maplibre.org/maputnik

// Define sources and layers
const initialSourceDef: SourceDefinition[] = [
  {id: 'lines-fgb', type: 'fgb', data: 'https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-osm-line.fgb', promoteId: 'uuid_line'},
  {id: 'pps', type: 'vector', tiles: ['pps://https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-pp.pmtiles/{z}/{x}/{y}'], promoteId: 'token', minzoom: ppsZoomLevelMin},
  //{id: 'pps', type: 'vector', tiles: ['pps://https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-pp-raw.pmtiles/{z}/{x}/{y}'], promoteId: 'token', minzoom: ppsZoomLevelMin},
  {id: 'edges-fgb', type: 'fgb', data: 'https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-edges.fgb', promoteId: 'uuid_edge' },
  {id: 'nodes-fgb', type: 'fgb', data: 'https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/ch-nodes.fgb', promoteId: 'uuid_node'},
  // terrain source (always add source, but terrain/hillshade controlled by state)
  {id: 'pmt-3d', type: 'raster-dem', tiles: ['mapterhorn://{z}/{x}/{y}'], encoding: 'terrarium', tileSize: 512, attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'}
]
const initialLayerDef: Layer[] = [
  {id: "pps", name: "Positionspunkte", type: 'circle', source: 'pps', sourceLayer: 'pps', minzoom: ppsZoomLevelMin, color: { mode: 'fixed', color: '#ff0000', target: 'fill' }}, 
  {id: "edges", name: "Tlm3d Kanten", type: 'line', source: 'edges-fgb', minzoom: edgesZoomLevelMin, color: { mode: 'fixed', color: '#0000f0' }},
  {id: "nodes", name: "Tlm3d Knoten", type: 'circle', source: 'nodes-fgb', minzoom: edgesZoomLevelMin, color: { mode: 'fixed', color: '#0000f0', target: 'stroke' }},
  {id: 'lines', name: "Lines", type: 'line', source: 'lines-fgb', minzoom: 5, maxzoom: edgesZoomLevelMin, color: { mode: 'fixed', color: "rgb(100, 100, 100)" }}
]

const layerConfigurations: LayerConfiguration[] = (() => {
  const layerMap = initialLayerDef.reduce<Record<string, Layer>>((acc, layer) => {
    acc[layer.id] = layer;
    return acc;
  }, {});

  return [
    {
      id: 'ch',
      label: 'Switzerland TLM3D',
      description: 'Positionpoints of Switzerland, based on Swisstopo TLM3D data.',
      layers: [layerMap['pps'],layerMap['edges'], layerMap['nodes'], layerMap['lines']],
      interactive: ['pps', 'edges', 'nodes', 'lines'],
      filterableTags: ['Normalspur', 'Schmalspur', 'Tram']
    },
    {
      id: 'gbm',
      label: 'GBM',
      description: 'Load and analyze GBM files',
      layers: [layerMap['edges'], layerMap['lines']],
      interactive: ['lines', 'gbm-points'],
      filterableTags: [],
      colorOverrides: {
        edges: { color: { mode: 'fixed', color: 'rgb(100, 100, 100)' } },
      }
    }
  ];
})();

const defaultLayerConfigId = 'ch';

const applyColorOverride = (layer: Layer, override?: LayerColorOverride): Layer => {
  if (!override) return layer;

  return {
    ...layer,
    color: {
      ...override.color,
      ...('target' in layer.color ? { target: layer.color.target } : {})
    }
  };
};

const cloneLayers = (sourceLayers: Layer[], colorOverrides?: LayerConfiguration['colorOverrides']) =>
  sourceLayers.map(layer => applyColorOverride(layer, colorOverrides?.[layer.id]));

const normalizeBasePath = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
};

const parseLayerConfigIdFromPath = (configs: LayerConfiguration[]) => {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const candidate = pathSegments[pathSegments.length - 1];
  const matchingConfig = configs.find(config => config.id === candidate);
  return matchingConfig?.id ?? defaultLayerConfigId;
};

const formatPathForLayerConfig = (configId: string) => {
  const basePath = normalizeBasePath(import.meta.env.BASE_URL);
  return `${basePath}/${configId}`;
};
// "line-width": 1, "line-blur": 0.5, "line-opacity": 0.7


function App() {

  const initialLayerConfigId = parseLayerConfigIdFromPath(layerConfigurations);
  const initialLayerConfig = layerConfigurations.find(cfg => cfg.id === initialLayerConfigId)
    ?? layerConfigurations.find(cfg => cfg.id === defaultLayerConfigId)
    ?? layerConfigurations[0];

  const [selectedFeatures, setSelectedFeatures] = useState<SelectedFeature[]>([]);
  const [expandedFeature, setExpandedFeature] = useState<SelectedFeature | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<MapGeoJSONFeature|null>();
  const [boxSelectActive, setBoxSelectActive] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const gbmUploadInputRef = useRef<HTMLInputElement>(null);
  const prevExpandedFeatureRef = useRef<SelectedFeature | null>(null);
  const [layers, setLayers] = useState<Layer[]>(() => cloneLayers(initialLayerConfig.layers, initialLayerConfig.colorOverrides));
  const [selectedLayerConfigId, setSelectedLayerConfigId] = useState(initialLayerConfig.id);
  const selectedLayerConfig = layerConfigurations.find(cfg => cfg.id === selectedLayerConfigId)
    ?? layerConfigurations.find(cfg => cfg.id === defaultLayerConfigId)
    ?? layerConfigurations[0];
  const interactiveLayerIds = layers
    .filter(layer => selectedLayerConfig.interactive.includes(layer.id))
    .map(layer => layer.id);
  const prevLayerIdsRef = useRef<string[]>([]);

  const applyLayerConfig = useCallback((configId: string, map?: maplibregl.Map | null) => {
    const config = layerConfigurations.find(cfg => cfg.id === configId)
      ?? layerConfigurations.find(cfg => cfg.id === defaultLayerConfigId)
      ?? layerConfigurations[0];
    const clonedLayers = cloneLayers(config.layers, config.colorOverrides);
    setSelectedLayerConfigId(config.id);
    setLayers(clonedLayers);

    if (!map) return;

    const layerIdsToRemove = new Set([...prevLayerIdsRef.current, ...layers.map(layer => layer.id)]);
    layerIdsToRemove.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    clonedLayers.forEach(layer => registerLayerAsync(map, layer));
    prevLayerIdsRef.current = clonedLayers.map(layer => layer.id);
  }, [layers]);

  const handleLayerConfigChange = useCallback((configId: string) => {
    applyLayerConfig(configId, mapRef.current?.getMap() ?? null);
  }, [applyLayerConfig]);

  useEffect(() => {
    const targetPath = formatPathForLayerConfig(selectedLayerConfigId);
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', `${targetPath}${window.location.search}${window.location.hash}`);
    }
  }, [selectedLayerConfigId]);

  useEffect(() => {
    const onPopState = () => {
      const configIdFromPath = parseLayerConfigIdFromPath(layerConfigurations);
      if (configIdFromPath !== selectedLayerConfigId) {
        applyLayerConfig(configIdFromPath, mapRef.current?.getMap() ?? null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [applyLayerConfig, selectedLayerConfigId]);

  const handleLayerAdded = useCallback((layer: Layer) => {
    setLayers(prev => {
      if (prev.find(existing => existing.id === layer.id)) {
        return prev;
      }
      return [...prev, layer];
    });
  }, []);

  const handleLayerRemoved = useCallback((layerId: string) => {
    setLayers(prev => prev.filter(layer => layer.id !== layerId));
  }, []);

  const handleLayerColorChange = useCallback((layerId: string, color: LayerColor) => {
    setLayers(prev =>
      prev.map(layer =>
        layer.id === layerId
          ? { ...layer, color }
          : layer
      )
    );
  }, []);

  const handleGbmUploadClick = useCallback(() => {
    gbmUploadInputRef.current?.click();
  }, []);

  const handleGbmZipSelected = useCallback(async (file: File) => {
    if (selectedLayerConfigId !== 'gbm') {
      console.warn('GBM upload is only available in GBM configuration.');
      return;
    }

    const map = mapRef.current?.getMap();
    if (!map) return;

    try {
      const imported = await importGbmZipAsLayer(map, file);
      handleLayerAdded(imported.layerDefinition);
      console.log(`Loaded GBM points layer with ${imported.pointCount} points.`);
    } catch (error) {
      console.error('Failed to process GBM ZIP upload', error);
    }
  }, [handleLayerAdded, selectedLayerConfigId]);

  // Helper function to get feature identifier for setFeatureState/removeFeatureState
  const getFeatureIdentifier = (map: maplibregl.Map, layerId: string | undefined, featureId: string | number) => {
    if (!layerId) return null;
    const layer = map.getLayer(layerId);
    if (!layer) return null;
    const sourceId = layer.source as string;
    const source = map.getSource(sourceId);
    // Vector tile sources need sourceLayer, GeoJSON sources don't
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceLayer = source?.type === 'vector' ? (layer as any).sourceLayer : undefined;    
    return { source: sourceId, sourceLayer, id: featureId };
  };

  // Update feature state when selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    // Set selected state for new selections
    selectedFeatures.forEach(sf => {
      const identifier = getFeatureIdentifier(map, sf.feature.layer?.id, sf.feature.id!);
      if (identifier) {
        map.setFeatureState(identifier, { selected: true });
      }
    });

    // Cleanup: remove feature state when component unmounts or selection changes
    return () => {
      selectedFeatures.forEach(sf => {
        const identifier = getFeatureIdentifier(map, sf.feature.layer?.id, sf.feature.id!);
        if (identifier) {
          map.setFeatureState(identifier, { selected: false });
        }
      });
    };
  }, [selectedFeatures]);

  // Update feature state when expanded feature changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    // Clear previous expanded feature state
    if (prevExpandedFeatureRef.current) {
      const identifier = getFeatureIdentifier(
        map, 
        prevExpandedFeatureRef.current.feature.layer?.id, 
        prevExpandedFeatureRef.current.feature.id!
      );
      if (identifier) {
        map.setFeatureState(identifier, { expanded: false });
      }
    }

    // Set expanded state for the currently expanded feature
    if (expandedFeature) {
      const identifier = getFeatureIdentifier(map, expandedFeature.feature.layer?.id, expandedFeature.feature.id!);
      if (identifier) {
        map.setFeatureState(identifier, { expanded: true });
      }
    }

    // Update ref to current expanded feature
    prevExpandedFeatureRef.current = expandedFeature;
  }, [expandedFeature]);

  const initMap = useCallback((map: maplibregl.Map) => {
    console.log("initMap");

    registerProtocols(ppsZoomLevels);
    collapseAttributionControl(map);
    initialSourceDef.forEach(source => registerSource(map, source));
    applyLayerConfig(selectedLayerConfigId, map);
    setMapReady(true);
  }, [applyLayerConfig, selectedLayerConfigId]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const updateHashFromMap = () => {
      const center = map.getCenter();
      const hash = formatHash(center.lng, center.lat, map.getZoom());
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
    };

    const onMoveEnd = () => updateHashFromMap();
    const onHashChange = () => {
      const hashView = parseHashViewState();
      if (hashView) {
        map.jumpTo({ center: [hashView.longitude, hashView.latitude], zoom: hashView.zoom });
      }
    };

    map.on('moveend', onMoveEnd);
    window.addEventListener('hashchange', onHashChange);
    updateHashFromMap();
  }, [mapReady]);

  const initialViewState = parseHashViewState() ?? defaultViewState;

  return (
    <div className="app-shell">
      <input
        ref={gbmUploadInputRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          await handleGbmZipSelected(file);
        }}
      />
      <AppBar
        selectedLayerConfigId={selectedLayerConfigId}
        layerConfigurations={layerConfigurations}
        onLayerConfigChange={handleLayerConfigChange}
        onGbmUploadClick={handleGbmUploadClick}
      />
      <main className="map-wrapper">
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          mapStyle={mapStyle}
          minZoom={7}
          interactiveLayerIds={interactiveLayerIds}
          cursor={hoveredFeature ? 'pointer' : 'default'} // Dynamic cursor
          onLoad={(e) => initMap(e.target)}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (boxSelectActive) {
              setBoxSelectActive(false);
              return;
            }

            if (e.features && e.features.length > 0) {
              const uniqueFeatures = Array.from(
                new globalThis.Map(e.features.map(f => [f.id, f])).values()
              );
              const newFeatures = uniqueFeatures.map(f => new SelectedFeature(f, e.lngLat));
              setSelectedFeatures(newFeatures);
              console.log(`Features selected (${newFeatures.length}):`, newFeatures.map(sf => sf.feature.id));
            } else {
              setSelectedFeatures([]);
              console.log("Features deselected");
            }
          }}
          onMouseEnter={(e) => {
            if (e.features && e.features.length > 0) {
              setHoveredFeature(e.features[0]);
            } else {
              setHoveredFeature(null);
            }
          }}
          onMouseLeave={() => {
            setHoveredFeature(null);
          }}
        >
          <NavigationControl visualizePitch={true} visualizeRoll={true} showCompass={true} showZoom={true} />
          <BoxSelect 
            interactiveLayerIds={interactiveLayerIds}
            onSelect={(features, center) => {
              if (features.length > 0) {
                const newFeatures = features.map(f => new SelectedFeature(f, center));
                setSelectedFeatures(newFeatures);
                setBoxSelectActive(true);
                console.log(`Features selected via box (${newFeatures.length})`);
              }
            }}
          />
          <SelectedFeaturesPanel selectedFeatures={selectedFeatures} onExpandedChange={setExpandedFeature}/>
          <LayerControl layers={layers} onAddLayer={handleLayerAdded} onRemoveLayer={handleLayerRemoved} onLayerColorChange={handleLayerColorChange}/>
          <TagsFilter layerIds={interactiveLayerIds} possibleTags={selectedLayerConfig.filterableTags ?? []} position="top-right"/>
          <CoordinatesDisplay />
          <AttributionControl position="top-right" compact={true} />
        </Map>
      </main>
    </div>
  );
}

export default App;
