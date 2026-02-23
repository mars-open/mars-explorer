import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';
import { ColorResult, SliderPicker } from 'react-color';
import * as flatgeobuf from 'flatgeobuf';


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

type LayerType = 'circle' | 'line';

type LayerColor =
  | { color: string }
  | { color: string; target: 'stroke' | 'fill' };

const defaultLayerColor = (type: LayerType): LayerColor =>
  type === 'circle'
    ? { color: '#24c6c6', target: 'fill' }
    : { color: '#24c6c6' };

export function layerPaint(type: LayerType, color: LayerColor): any {
  if (type === 'circle') {
    if ((color as any).target === 'stroke') {
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

interface LayerControlProps {
  layers: Layer[];
  position?: ControlPosition;
  onAddLayer: (layer: Layer) => void;
  onRemoveLayer: (layerId: string) => void;
  onLayerColorChange: (layerId: string, color: string) => void;
}

interface LayerControlContentProps {
  layers: Layer[];
  map: maplibregl.Map | null;
  onRemoveLayer: (id: string) => void;
  onConfigureLayer: (layerId: string) => void;
  onColorChange: (layerId: string, color: ColorResult) => void;
  activeLayerId: string | undefined;
}

function LayerControlContent({layers, map, onRemoveLayer, onConfigureLayer, onColorChange, activeLayerId}: LayerControlContentProps) {
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(false);
  const allLayers = layers;

  useEffect(() => {
    console.log("layers changed")
    setLayerStates(prev => {
      let changed = false;
      const next = { ...prev };
      layers.forEach(layer => {
        if (!(layer.id in next)) {
          next[layer.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [layers]);

  function toggleLayer(layerId: string) {
    if (!map) return;
    console.log(`Toggling layer ${layerId}`);
    const currentlyVisible = layerStates[layerId] ?? true;
    const visibility = currentlyVisible ? 'none' : 'visible';
    map.setLayoutProperty(layerId, 'visibility', visibility);
    setLayerStates(prev => ({ ...prev, [layerId]: !currentlyVisible }));
  }

  function toogleTerrain(enabled: boolean) {
    if (!map) return;    
    if (enabled) {
      // Enable terrain if source exists
      map.setTerrain({ source: 'pmt-3d', exaggeration: 1 });
      if (!map.getLayer('hillshade')) {
        map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'pmt-3d', paint: {'hillshade-shadow-color': '#473B24'}});
      }
    } else {
      // Disable terrain
      map.setTerrain(null);
      if (map.getLayer('hillshade')) {
        map.removeLayer('hillshade');
      }
    }
    setTerrainEnabled(enabled);
  }

  return (

    <div style={{display: "flex", flexDirection: "column", margin: 5 }}>
      {allLayers.map(layer => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} key={layer.id}>
          <div className="items-center cursor-pointer mb-1" 
            style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}
          >
            <label key={layer.id} className="flex items-center cursor-pointer mb-1 block" 
              style={{ flex: 1, display: 'flex', height: 22, alignItems: 'center', lineHeight: '26px'}}>
              <input
                id={`layer-${layer.id}`} type="checkbox"
                checked={layerStates[layer.id] ?? true}
                onChange={() => toggleLayer(layer.id)}
                className="tags-filter-checkbox"
                style={{ marginRight: 8 }}
              />
              {layer.name}
            </label>
            {layer.removable && (
              <button
                type="button"
                className="maplibregl-ctrl-icon"
                title="Remove custom layer"
                onClick={() => onRemoveLayer(layer.id)}
                style={{ width: 20, height: 22, lineHeight: '22px', padding: 0, fontSize: '0.7rem' }}
              >
                −
              </button>
            )}
            {layer.id !== 'hillshade' && (
              <button
                type="button"
                className="maplibregl-ctrl-icon"
                title="Configure layer"
                onClick={() => onConfigureLayer(layer.id)}
                style={{ width: 28, height: 22, lineHeight: '22px', padding: 0, fontSize: '0.7rem' }}
              >
                ⚙
              </button>
            )}
          </div>
          {activeLayerId === layer.id && (
            <div style={{ padding: '1px 6px 8px 6px', borderBottom: '1px solid rgba(0,0,0,0.12)', background: 'white' }}>
              <SliderPicker key={layer.id} color={layer.color.color} onChange={(colorResult: ColorResult) => onColorChange(layer.id, colorResult)} />
            </div>
          )}
        </div>
      ))}
      <div key="terrain" className="items-center cursor-pointer mb-1" 
        style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 6 }}>
        <label key="terrain" className="flex items-center cursor-pointer mb-1 block"
          style={{ flex: 1, display: 'flex', height: 22, alignItems: 'center', lineHeight: '26px'}}>
          <input
            type="checkbox" checked={terrainEnabled}
            onChange={(e) => toogleTerrain(e.target.checked)}
            className="tags-filter-checkbox"
            style={{ marginRight: 8 }}
          />
          Terrain
        </label>
      </div>      
    </div>
  );
}

interface LayerControlWrapperProps {
  layers: Layer[];
  map: maplibregl.Map | null;
  onAddLayer: (layer: Layer) => void;
  onRemoveLayer: (layerId: string) => void;
  onLayerColorChange: (layerId: string, color: string) => void;
}

function LayerControlWrapper({layers, map, onAddLayer, onRemoveLayer, onLayerColorChange}: LayerControlWrapperProps) {
  const [open, setOpen] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getLayerById = (layerId?: string): Layer | undefined => {
    if (!layerId) return undefined;
    return layers.find(layer => layer.id === layerId);
  };

  if (!open) {
    return (
      <div style={{display: 'flex', flexDirection: 'column'}}>
        <button
          className="maplibregl-ctrl-icon"
          title="Show layers"
          onClick={() => setOpen(true)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0}}
        >
          ≡
        </button>
      </div>
    );
  }

  async function loadFlatGeobuf(file: File): Promise<FeatureCollection> {
    const arrayBuffer = await file.arrayBuffer();
    const features = [];
    for await (const feature of flatgeobuf.geojson.deserialize(new Uint8Array(arrayBuffer))) {
      features.push(feature);
    }
    return { type: 'FeatureCollection', features };
  }

  function detectLayerType(geojson: FeatureCollection): LayerType {
    const type = geojson.features[0]?.geometry?.type ?? '';
    if (type.includes('Point')) return 'circle';
    if (type.includes('Line')) return 'line';
    if (type.includes('Polygon')) return 'line';
    return 'line';
  }

  function paintForType(type: LayerType) {
    if (type === 'circle') {
      return { 'circle-radius': 4, 'circle-stroke-width': 1 };
    }
    return { 'line-width': 2 };
  }

  function buildLayerId(name: string) {
    const withoutExtension = name.replace(/\.[^.]+$/, '');
    const sanitized = withoutExtension
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'layer';
    return `local-${sanitized}-${Date.now()}`;
  }

  const paintProperty = (layer: Layer): 'circle-color' | 'circle-stroke-color' | 'line-color' => {
    if (layer.type === 'line') return 'line-color';
    if (layer.type === 'circle') return (layer.color as any).target === 'fill' ? 'circle-color' : 'circle-stroke-color';
    return 'line-color';
  };

  const applyLayerColor = (layer: Layer, colorHex: string) => {
    if (!map) return;
    const prop = paintProperty(layer);
    map.setPaintProperty(layer.id, prop, colorHex);
    onLayerColorChange(layer.id, colorHex);
  };

  const handleConfigureLayer = (layerId: string) => {
    setActiveLayerId(prev => prev === layerId ? undefined : layerId);
  };

  const handleColorChange = (layerId: string, colorResult: ColorResult) => {
    const layer = getLayerById(layerId);
    if (!layer) return;
    applyLayerColor(layer, colorResult.hex);
  };

  const handleRemoveLayer = (layerId: string) => {
    if (!map) return;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(layerId)) map.removeSource(layerId);
    if (activeLayerId === layerId) {
      setActiveLayerId(undefined);
    }
    onRemoveLayer(layerId);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', minWidth: 175}}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".fgb,.flatgeobuf"
        style={{ display: 'none' }}
        onChange={async (event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!map) return;
          event.currentTarget.value = '';
          try {
            const geojson = await loadFlatGeobuf(file);
            if (!geojson.features.length) {
              console.warn('FlatGeobuf file contains no features.');
              return;
            }
            const layerType = detectLayerType(geojson);
            const layerId = buildLayerId(file.name);
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
              map.removeSource(layerId);
            }
            map.addSource(layerId, { type: 'geojson', data: geojson });
            map.addLayer({
              id: layerId,
              type: (layerType as any),
              source: layerId,
              layout: { visibility: 'visible' },
              paint: paintForType(layerType)
            });
            const newLayerColor = defaultLayerColor(layerType);
            onAddLayer({
              id: layerId,
              name: file.name,
              type: layerType,
              source: layerId,
              color: newLayerColor,
              removable: true
            });
          } catch (error) {
            console.error('Failed to load FlatGeobuf file', error);
          }
        }}
      />
      <div style={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
        <div style={{height: 30, flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f2efefff', fontWeight: 600}}>
          Layers
        </div>
        <button
          className="maplibregl-ctrl-icon"
          title="Add FlatGeobuf layer"
          onClick={() => fileInputRef.current?.click()}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0, borderRight: "1px solid #f2efefff", borderBottom: "1px solid #f2efefff"}}
        >
          +
        </button>
        <button
          className="maplibregl-ctrl-icon"
          title="Hide layers control"
          onClick={() => setOpen(false)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0, borderTop: "0px", borderBottom: "1px solid #f2efefff"}}
        >
          ×
        </button>
      </div>
      <LayerControlContent
        layers={layers}
        map={map}
        onRemoveLayer={handleRemoveLayer}
        onConfigureLayer={handleConfigureLayer}
        onColorChange={handleColorChange}
        activeLayerId={activeLayerId}
      />
    </div>
  );
}

export function LayerControl(props: LayerControlProps) {
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
    const { current: map } = useMap();
  
  useControl(() => {
      const container = document.createElement('div');
      containerRef.current = container;
      container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      const root = createRoot(container);
      rootRef.current = root;
      
      // Defer initial render to avoid React warning
      setTimeout(() => {
        if (map) {
          root.render(
            <LayerControlWrapper
              layers={props.layers}
              map={map.getMap()}
              onAddLayer={props.onAddLayer}
              onRemoveLayer={props.onRemoveLayer}
              onLayerColorChange={props.onLayerColorChange}
            />
          );
        }
      }, 0);
      
      return { 
        onAdd: () => container, 
        onRemove: () => {
          containerRef.current?.remove();
        }
      };
    }, {
      position: props.position || 'top-right'
    }
  );

  useEffect(() => {
    if (!map) return;
    if (rootRef.current && containerRef.current?.parentElement) {
      rootRef.current.render(
        <LayerControlWrapper
          layers={props.layers}
          map={map.getMap()!}
          onAddLayer={props.onAddLayer}
          onRemoveLayer={props.onRemoveLayer}
          onLayerColorChange={props.onLayerColorChange}
        />
      );
    }
  }, [props.layers, map, props.onAddLayer, props.onRemoveLayer, props.onLayerColorChange]);

  return null;
};