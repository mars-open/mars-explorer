import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';
import { Checkbox, ColorArea, ColorField, ColorPicker, ColorSlider, ColorThumb, Input, SliderTrack, Switch, parseColor } from 'react-aria-components';
import * as flatgeobuf from 'flatgeobuf';
import './LayerControl.css';
import {
  defaultLayerColor,
  getCircleColorTarget,
  gradientScales,
  isGradientLayerColor,
  Layer,
  LayerColor,
  LayerType,
  registerLayerAsync,
  selectedAwareLayerColorExpression,
  type GradientScaleId
} from './mapHelpers';

interface NumericAttributeStats {
  attribute: string;
  min: number;
  max: number;
}

interface LayerControlProps {
  layers: Layer[];
  position?: ControlPosition;
  onAddLayer: (layer: Layer) => void;
  onRemoveLayer: (layerId: string) => void;
  onLayerColorChange: (layerId: string, color: LayerColor) => void;
}

interface LayerControlContentProps {
  layers: Layer[];
  map: maplibregl.Map | null;
  onRemoveLayer: (id: string) => void;
  onConfigureLayer: (layerId: string) => void;
  onColorChange: (layerId: string, colorHex: string) => void;
  onColorModeChange: (layerId: string, mode: 'fixed' | 'gradient') => void;
  onGradientAttributeChange: (layerId: string, attribute: string) => void;
  onGradientScaleChange: (layerId: string, scale: GradientScaleId) => void;
  attributeStatsByLayer: Record<string, NumericAttributeStats[]>;
  activeLayerId: string | undefined;
}

function LayerControlContent({
  layers,
  map,
  onRemoveLayer,
  onConfigureLayer,
  onColorChange,
  onColorModeChange,
  onGradientAttributeChange,
  onGradientScaleChange,
  attributeStatsByLayer,
  activeLayerId
}: LayerControlContentProps) {
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(false);

  if (!map || !layers) return null;

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

    <div className="layer-control-content" style={{display: "flex", flexDirection: "column", margin: 5 }}>
      {layers.map(layer => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} key={layer.id}>
          <div className="items-center cursor-pointer mb-1" 
            style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}
          >
            <Checkbox
              key={layer.id}
              className="layer-control-layer-checkbox"
              isSelected={layerStates[layer.id] ?? true}
              onChange={() => toggleLayer(layer.id)}
            >
              {({ isSelected }) => (
                <>
                  <span className="layer-control-layer-checkbox-box" data-selected={isSelected ? 'true' : undefined} aria-hidden="true" />
                  <span>{layer.name}</span>
                </>
              )}
            </Checkbox>
            {layer.removable && (
              <button
                type="button"
                className="maplibregl-ctrl-icon"
                title="Remove custom layer"
                onClick={() => onRemoveLayer(layer.id)}
                style={{ width: 20, height: 22, lineHeight: '22px', padding: 0, fontSize: '12px' }}
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
                style={{ width: 28, height: 22, lineHeight: '22px', padding: 0, fontSize: '12px' }}
              >
                ⚙
              </button>
            )}
          </div>
          {activeLayerId === layer.id && (
            <div className="layer-control-panel">
              <div className="layer-control-panel-stack">
                <div className="layer-control-switch-row">
                  <Switch
                    aria-label="Color mode"
                    className="layer-control-switch"
                    isSelected={isGradientLayerColor(layer.color)}
                    onChange={(selected) => onColorModeChange(layer.id, selected ? 'gradient' : 'fixed')}
                  >
                    {({ isSelected }) => (
                      <span className="layer-control-mode-toggle" data-selected={isSelected ? 'true' : 'false'}>
                        <span className={`layer-control-mode-label${!isSelected ? ' layer-control-mode-label-active' : ''}`}>Fixed color</span>
                        <span className="layer-control-switch-indicator">
                          <span className="layer-control-switch-thumb" />
                        </span>
                        <span className={`layer-control-mode-label${isSelected ? ' layer-control-mode-label-active' : ''}`}>Gradient color</span>
                      </span>
                    )}
                  </Switch>
                </div>
                {!isGradientLayerColor(layer.color) && (
                  <div className="layer-control-color-picker">
                    <ColorPicker
                      value={parseColor(layer.color.color).toFormat('hsb')}
                      onChange={(color) => onColorChange(layer.id, color.toString('hex'))}
                    >
                      <div className="layer-control-color-grid">
                        <ColorArea className="layer-control-color-area" colorSpace="hsb" xChannel="saturation" yChannel="brightness">
                          <ColorThumb className="layer-control-color-thumb" />
                        </ColorArea>
                        <ColorSlider className="layer-control-hue-slider" channel="hue">
                          <SliderTrack className="layer-control-hue-track">
                            <ColorThumb className="layer-control-hue-thumb" />
                          </SliderTrack>
                        </ColorSlider>
                      </div>
                      <ColorField className="layer-control-color-field">
                        <Input className="layer-control-color-input" />
                      </ColorField>
                    </ColorPicker>
                  </div>
                )}
                {isGradientLayerColor(layer.color) && (
                  <>
                    <label className="layer-control-field">
                      <span className="layer-control-label">Numeric attribute</span>
                      <select
                        className="layer-control-select"
                        value={layer.color.attribute}
                        onChange={(event) => onGradientAttributeChange(layer.id, event.target.value)}
                      >
                        {(attributeStatsByLayer[layer.id] ?? []).map(stat => (
                          <option value={stat.attribute} key={stat.attribute}>{stat.attribute}</option>
                        ))}
                      </select>
                    </label>
                    <div className="layer-control-field">
                      <span className="layer-control-label">Color scale</span>
                      <div className="layer-control-scale-list">
                        {(Object.entries(gradientScales) as [GradientScaleId, string[]][]).map(([scaleId, colors]) => (
                          <button
                            key={scaleId}
                            type="button"
                            onClick={() => onGradientScaleChange(layer.id, scaleId)}
                            title={scaleId}
                            className={`layer-control-scale-button${isGradientLayerColor(layer.color) && layer.color.scale === scaleId ? ' layer-control-scale-button-active' : ''}`}
                          >
                            <span
                              className="layer-control-scale-gradient"
                              style={{ background: `linear-gradient(to right, ${colors.join(', ')})` }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="layer-control-range">
                      Range: {layer.color.min} - {layer.color.max}
                    </div>
                    <div
                      className="layer-control-current-scale"
                      style={{ background: `linear-gradient(to right, ${gradientScales[layer.color.scale].join(', ')})` }}
                    />
                  </>
                )}
              </div>
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
  onLayerColorChange: (layerId: string, color: LayerColor) => void;
}

function LayerControlWrapper({layers, map, onAddLayer, onRemoveLayer, onLayerColorChange}: LayerControlWrapperProps) {
  const [open, setOpen] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>(undefined);
  const [attributeStatsByLayer, setAttributeStatsByLayer] = useState<Record<string, NumericAttributeStats[]>>({});
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

  function buildLayerId(name: string) {
    const withoutExtension = name.replace(/\.[^.]+$/, '');
    const sanitized = withoutExtension
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'layer';
    return `local-${sanitized}-${Date.now()}`;
  }

  const paintProperty = (layer: Layer, color: LayerColor): 'circle-color' | 'circle-stroke-color' | 'line-color' => {
    if (layer.type === 'line') return 'line-color';
    if (layer.type === 'circle') return getCircleColorTarget(color) === 'fill' ? 'circle-color' : 'circle-stroke-color';
    return 'line-color';
  };

  const applyLayerColor = (layer: Layer, color: LayerColor) => {
    if (!map) return;
    const nextProp = paintProperty(layer, color);
    const expr = selectedAwareLayerColorExpression(color);
    console.log(`Applying color to layer ${layer.id} with paint property ${nextProp}`, color, expr);
    map.setPaintProperty(layer.id, nextProp, expr);
    onLayerColorChange(layer.id, color);
  };

  const getLayerNumericAttributeStats = (layer: Layer): NumericAttributeStats[] => {
    if (!map) return [];

    try {
      const queryOptions = layer.sourceLayer ? { sourceLayer: layer.sourceLayer } : undefined;
      const features = map.querySourceFeatures(layer.source, queryOptions);
      const stats = new Map<string, { min: number; max: number }>();

      const updateStat = (attribute: string, value: number) => {
        const existing = stats.get(attribute);
        if (!existing) {
          stats.set(attribute, { min: value, max: value });
          return;
        }
        existing.min = Math.min(existing.min, value);
        existing.max = Math.max(existing.max, value);
      };

      const parsePossiblyNestedJson = (value: unknown): unknown => {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      };

      const visit = (path: string, value: unknown) => {
        const parsedValue = parsePossiblyNestedJson(value);

        if (typeof parsedValue === 'number' && Number.isFinite(parsedValue)) {
          updateStat(path, parsedValue);
          return;
        }

        if (typeof parsedValue === 'string') {
          const asNumber = Number(parsedValue);
          if (Number.isFinite(asNumber)) {
            updateStat(path, asNumber);
          }
          return;
        }

        if (Array.isArray(parsedValue) || !parsedValue || typeof parsedValue !== 'object') {
          return;
        }

        Object.entries(parsedValue as Record<string, unknown>).forEach(([key, nestedValue]) => {
          const nestedPath = path ? `${path}.${key}` : key;
          visit(nestedPath, nestedValue);
        });
      };

      features.forEach(feature => {
        const properties = feature.properties;
        if (!properties) return;
        Object.entries(properties).forEach(([key, value]) => {
          visit(key, value);
        });
      });

      return Array.from(stats.entries())
        .map(([attribute, value]) => ({ attribute, min: value.min, max: value.max }))
        .sort((a, b) => a.attribute.localeCompare(b.attribute));
    } catch (error) {
      console.warn(`Unable to read numeric attributes for layer ${layer.id}`, error);
      return [];
    }
  };

  const ensureLayerStats = (layer: Layer): NumericAttributeStats[] => {
    const existing = attributeStatsByLayer[layer.id];
    if (existing && existing.length > 0) return existing;
    const stats = getLayerNumericAttributeStats(layer);
    setAttributeStatsByLayer(prev => ({ ...prev, [layer.id]: stats }));
    return stats;
  };

  const handleConfigureLayer = (layerId: string) => {
    const layer = getLayerById(layerId);
    if (layer) {
      ensureLayerStats(layer);
    }
    setActiveLayerId(prev => prev === layerId ? undefined : layerId);
  };

  const handleColorChange = (layerId: string, colorHex: string) => {
    const layer = getLayerById(layerId);
    if (!layer) return;
    applyLayerColor(layer, { ...layer.color, mode: 'fixed', color: colorHex });
  };

  const handleColorModeChange = (layerId: string, mode: 'fixed' | 'gradient') => {
    const layer = getLayerById(layerId);
    if (!layer) return;

    if (mode === 'fixed') {
      const fixedColor = isGradientLayerColor(layer.color) ? '#24c6c6' : layer.color.color;
      applyLayerColor(layer, { mode: 'fixed', color: fixedColor, ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {}) });
      return;
    }

    const stats = ensureLayerStats(layer);
    if (!stats.length) {
      console.warn(`No numeric attributes available for gradient mode in layer ${layer.id}`);
      return;
    }

    const selectedStats = stats[0];
    applyLayerColor(layer, {
      mode: 'gradient',
      attribute: selectedStats.attribute,
      scale: 'green-orange-red',
      min: selectedStats.min,
      max: selectedStats.max,
      ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
    });
  };

  const handleGradientAttributeChange = (layerId: string, attribute: string) => {
    const layer = getLayerById(layerId);
    if (!layer) return;

    const stats = ensureLayerStats(layer);
    const selectedStats = stats.find(stat => stat.attribute === attribute);
    if (!selectedStats) return;

    const currentScale = isGradientLayerColor(layer.color) ? layer.color.scale : 'green-orange-red';
    applyLayerColor(layer, {
      mode: 'gradient',
      attribute,
      scale: currentScale,
      min: selectedStats.min,
      max: selectedStats.max,
      ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
    });
  };

  const handleGradientScaleChange = (layerId: string, scale: GradientScaleId) => {
    const layer = getLayerById(layerId);
    if (!layer || !isGradientLayerColor(layer.color)) return;

    applyLayerColor(layer, {
      ...layer.color,
      scale,
      ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
    });
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
    <div style={{display: 'flex', flexDirection: 'column', minWidth: 250}}>
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
            const newLayerColor = defaultLayerColor(layerType);
            registerLayerAsync(map, { id: layerId, name: file.name, type: layerType, source: layerId, color: newLayerColor });
            onAddLayer({ id: layerId, name: file.name, type: layerType, source: layerId, color: newLayerColor, removable: true });
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
        onColorModeChange={handleColorModeChange}
        onGradientAttributeChange={handleGradientAttributeChange}
        onGradientScaleChange={handleGradientScaleChange}
        attributeStatsByLayer={attributeStatsByLayer}
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
      return { 
        onAdd: (map) => {
          const container = document.createElement('div');
          containerRef.current = container;
          container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
          const root = createRoot(container);
          rootRef.current = root;          
          root.render(
            <LayerControlWrapper
              layers={props.layers}
              map={map}
              onAddLayer={props.onAddLayer}
              onRemoveLayer={props.onRemoveLayer}
              onLayerColorChange={props.onLayerColorChange}
            />
          );
          return container;          
        }, 
        onRemove: () => {
          rootRef.current?.unmount();
          containerRef.current?.remove();
          rootRef.current = null;
          containerRef.current = null;
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