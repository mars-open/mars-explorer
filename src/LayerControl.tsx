import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';
import { Checkbox, ColorArea, ColorField, ColorPicker, ColorSlider, ColorThumb, Input, SliderTrack, Switch, parseColor } from 'react-aria-components';
import * as flatgeobuf from 'flatgeobuf';
import './Checkbox.css';
import './LayerControl.css';
import {
  defaultLayerColor,
  getCircleColorTarget,
  gradientScales,
  isGradientLayerColor,
  Layer,
  LayerColor,
  LayerColorFixed,
  LayerColorGradient,
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
  layerStates: Record<string, boolean>;
  terrainEnabled: boolean;
  onRemoveLayer: (id: string) => void;
  onConfigureLayer: (layerId: string) => void;
  onToggleLayer: (layerId: string) => void;
  onToggleTerrain: (enabled: boolean) => void;
  onColorChange: (layerId: string, colorHex: string) => void;
  onColorModeChange: (layerId: string, mode: 'fixed' | 'gradient') => void;
  onGradientAttributeChange: (layerId: string, attribute: string) => void;
  onGradientScaleChange: (layerId: string, scale: GradientScaleId) => void;
  onGradientRangeChange: (layerId: string, min: number, max: number) => void;
  onGradientUseAbsoluteChange: (layerId: string, useAbsoluteValue: boolean) => void;
  gradientRangeErrorByLayer: Record<string, string | undefined>;
  attributeStatsByLayer: Record<string, NumericAttributeStats[]>;
  activeLayerId: string | undefined;
}

const LAYER_CONTROL_STATE_STORAGE_KEY = 'mars-explorer.layer-control-state.v1';

interface LayerControlPersistedState {
  layerStates?: Record<string, boolean>;
  terrainEnabled?: boolean;
}

function readLayerControlPersistedState(): LayerControlPersistedState {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(LAYER_CONTROL_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LayerControlPersistedState;
    return {
      layerStates: parsed.layerStates && typeof parsed.layerStates === 'object' ? parsed.layerStates : {},
      terrainEnabled: typeof parsed.terrainEnabled === 'boolean' ? parsed.terrainEnabled : false
    };
  } catch {
    return {};
  }
}

function roundToSignificantDigits(value: number, digits = 3): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number.parseFloat(value.toPrecision(digits));
}

function toAbsoluteRange(min: number, max: number): { min: number; max: number } {
  const absMin = min <= 0 && max >= 0 ? 0 : Math.min(Math.abs(min), Math.abs(max));
  const absMax = Math.max(Math.abs(min), Math.abs(max));
  return {
    min: roundToSignificantDigits(absMin),
    max: roundToSignificantDigits(absMax)
  };
}

function LayerControlContent({
  layers,
  map,
  layerStates,
  terrainEnabled,
  onRemoveLayer,
  onConfigureLayer,
  onToggleLayer,
  onToggleTerrain,
  onColorChange,
  onColorModeChange,
  onGradientAttributeChange,
  onGradientScaleChange,
  onGradientRangeChange,
  onGradientUseAbsoluteChange,
  gradientRangeErrorByLayer,
  attributeStatsByLayer,
  activeLayerId
}: LayerControlContentProps) {
  if (!map || !layers) return null;

  return (

    <div className="layer-control-content" style={{display: "flex", flexDirection: "column", margin: 5 }}>
      {layers.map(layer => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} key={layer.id}>
          <div className="items-center cursor-pointer mb-1" 
            style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}
          >
            <Checkbox
              key={layer.id}
              className="layer-control-layer-checkbox map-checkbox-root"
              isSelected={layerStates[layer.id] ?? true}
              onChange={() => onToggleLayer(layer.id)}
            >
              {({ isSelected }) => (
                <>
                  <span className="layer-control-layer-checkbox-box map-checkbox-box" data-selected={isSelected ? 'true' : undefined} aria-hidden="true" />
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
                style={{ width: 22, height: 22, lineHeight: '22px', padding: 0, fontSize: '12px' }}
              >
                ⋮
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
                      aria-label={`Color picker for ${layer.name}`}
                      value={parseColor(layer.color.color).toFormat('hsb')}
                      onChange={(color) => onColorChange(layer.id, color.toString('hex'))}
                    >
                      <div className="layer-control-color-grid">
                        <ColorArea
                          aria-label={`Saturation and brightness for ${layer.name}`}
                          className="layer-control-color-area"
                          colorSpace="hsb"
                          xChannel="saturation"
                          yChannel="brightness"
                        >
                          <ColorThumb className="layer-control-color-thumb" />
                        </ColorArea>
                        <ColorSlider aria-label={`Hue for ${layer.name}`} className="layer-control-hue-slider" channel="hue">
                          <SliderTrack className="layer-control-hue-track">
                            <ColorThumb className="layer-control-hue-thumb" />
                          </SliderTrack>
                        </ColorSlider>
                      </div>
                      <ColorField aria-label={`Hex color for ${layer.name}`} className="layer-control-color-field">
                        <Input aria-label={`Hex color input for ${layer.name}`} className="layer-control-color-input" />
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
                        {(
                          (attributeStatsByLayer[layer.id]?.length
                            ? attributeStatsByLayer[layer.id]
                            : [{
                                attribute: layer.color.attribute,
                                min: layer.color.min,
                                max: layer.color.max
                              }])
                        ).map(stat => (
                          <option value={stat.attribute} key={stat.attribute}>{stat.attribute}</option>
                        ))}
                      </select>
                    <label className="layer-control-field">
                      <Checkbox
                        className="layer-control-layer-checkbox map-checkbox-root"
                        isSelected={Boolean(layer.color.useAbsoluteValue)}
                        onChange={(selected) => onGradientUseAbsoluteChange(layer.id, selected)}
                      >
                        {({ isSelected }) => (
                          <>
                            <span className="layer-control-layer-checkbox-box map-checkbox-box" data-selected={isSelected ? 'true' : undefined} aria-hidden="true" />
                            <span>Use absolute value</span>
                          </>
                        )}
                      </Checkbox>
                    </label>
                      <div className="layer-control-range-editor">
                        <label className="layer-control-range-field">
                          <span>Min</span>
                          <input
                            type="number"
                            className="layer-control-range-input"
                            value={layer.color.min}
                            step="any"
                            min={layer.color.useAbsoluteValue ? 0 : undefined}
                            aria-invalid={Boolean(gradientRangeErrorByLayer[layer.id])}
                            onChange={(event) => {
                              const nextMin = Number(event.target.value);
                              if (!Number.isFinite(nextMin)) return;
                              const currentColor = layer.color;
                              if (!isGradientLayerColor(currentColor)) return;
                              onGradientRangeChange(layer.id, nextMin, currentColor.max);
                            }}
                          />
                        </label>
                        <label className="layer-control-range-field">
                          <span>Max</span>
                          <input
                            type="number"
                            className="layer-control-range-input"
                            value={layer.color.max}
                            step="any"
                            aria-invalid={Boolean(gradientRangeErrorByLayer[layer.id])}
                            onChange={(event) => {
                              const nextMax = Number(event.target.value);
                              if (!Number.isFinite(nextMax)) return;
                              const currentColor = layer.color;
                              if (!isGradientLayerColor(currentColor)) return;
                              onGradientRangeChange(layer.id, currentColor.min, nextMax);
                            }}
                          />
                        </label>
                      </div>
                      {gradientRangeErrorByLayer[layer.id] && (
                        <div className="layer-control-range-error" role="alert">
                          {gradientRangeErrorByLayer[layer.id]}
                        </div>
                      )}
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
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      <div
        key="terrain"
        className="items-center cursor-pointer mb-1"
        style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}
      >
        <Checkbox
          className="layer-control-layer-checkbox map-checkbox-root"
          isSelected={terrainEnabled}
          onChange={(selected) => onToggleTerrain(selected)}
        >
          {({ isSelected }) => (
            <>
              <span className="layer-control-layer-checkbox-box map-checkbox-box" data-selected={isSelected ? 'true' : undefined} aria-hidden="true" />
              <span>Terrain</span>
            </>
          )}
        </Checkbox>
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
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>(() => readLayerControlPersistedState().layerStates ?? {});
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(() => Boolean(readLayerControlPersistedState().terrainEnabled));
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>(undefined);
  const [attributeStatsByLayer, setAttributeStatsByLayer] = useState<Record<string, NumericAttributeStats[]>>({});
  const [gradientRangeErrorByLayer, setGradientRangeErrorByLayer] = useState<Record<string, string | undefined>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFixedColorByLayerRef = useRef<Record<string, LayerColorFixed>>({});
  const lastGradientColorByLayerRef = useRef<Record<string, LayerColorGradient>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      LAYER_CONTROL_STATE_STORAGE_KEY,
      JSON.stringify({ layerStates, terrainEnabled })
    );
  }, [layerStates, terrainEnabled]);

  useEffect(() => {
    if (!map) return;

    layers.forEach(layer => {
      if (!map.getLayer(layer.id)) return;
      const isVisible = layerStates[layer.id] ?? true;
      map.setLayoutProperty(layer.id, 'visibility', isVisible ? 'visible' : 'none');
    });
  }, [layerStates, layers, map]);

  useEffect(() => {
    if (!map) return;

    if (terrainEnabled) {
      map.setTerrain({ source: 'pmt-3d', exaggeration: 1 });
      if (!map.getLayer('hillshade')) {
        map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'pmt-3d', paint: {'hillshade-shadow-color': '#473B24'}});
      }
      return;
    }

    map.setTerrain(null);
    if (map.getLayer('hillshade')) {
      map.removeLayer('hillshade');
    }
  }, [map, terrainEnabled]);

  useEffect(() => {
    layers.forEach((layer) => {
      if (isGradientLayerColor(layer.color)) {
        lastGradientColorByLayerRef.current[layer.id] = { ...layer.color };
        return;
      }

      lastFixedColorByLayerRef.current[layer.id] = {
        mode: 'fixed',
        color: layer.color.color,
        ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
      };
    });
  }, [layers]);

  const getLayerById = (layerId?: string): Layer | undefined => {
    if (!layerId) return undefined;
    return layers.find(layer => layer.id === layerId);
  };

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

  const parsePossiblyNestedJson = useCallback((value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }, []);

  const getNumericValueByAttributePath = useCallback((properties: maplibregl.MapGeoJSONFeature['properties'], attributePath: string): number | null => {
    if (!properties || !attributePath) return null;

    const direct = properties[attributePath];
    const asDirectNumber = Number(direct);
    if (Number.isFinite(asDirectNumber)) return asDirectNumber;

    const segments = attributePath.split('.').filter(Boolean);
    if (!segments.length) return null;

    let current: unknown = properties;
    for (const segment of segments) {
      current = parsePossiblyNestedJson(current);
      if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
      current = (current as Record<string, unknown>)[segment];
    }

    current = parsePossiblyNestedJson(current);
    const asNumber = Number(current);
    return Number.isFinite(asNumber) ? asNumber : null;
  }, [parsePossiblyNestedJson]);

  const populateColoringValueState = useCallback((layer: Layer, attribute: string, useAbsoluteValue = false) => {
    if (!map || !attribute) return;

    try {
      const queryOptions = layer.sourceLayer ? { sourceLayer: layer.sourceLayer } : undefined;
      const features = map.querySourceFeatures(layer.source, queryOptions);
      for (const feature of features) {
        if (feature.id == null) continue;

        const identifier = layer.sourceLayer
          ? { source: layer.source, sourceLayer: layer.sourceLayer, id: feature.id }
          : { source: layer.source, id: feature.id };
        const value = getNumericValueByAttributePath(feature.properties, attribute);
        const stateValue = value == null
          ? null
          : (useAbsoluteValue ? Math.abs(value) : value);

        // Avoid removeFeatureState during frequent move/zoom sync; some MapLibre
        // versions can throw while coalescing changes for missing state objects.
        map.setFeatureState(identifier, {
          coloringValue: stateValue
        });
      }
    } catch (error) {
      console.warn(`Unable to populate coloring state for layer ${layer.id}`, error);
    }
  }, [map, getNumericValueByAttributePath]);

  useEffect(() => {
    if (!map) return;

    const syncGradientState = () => {
      layers.forEach(layer => {
        if (!isGradientLayerColor(layer.color)) return;
        populateColoringValueState(layer, layer.color.attribute, Boolean(layer.color.useAbsoluteValue));
      });
    };

    syncGradientState();
    // Also recalculate after initial source/tile loading settles.
    map.on('idle', syncGradientState);
    map.on('moveend', syncGradientState);
    return () => {
      map.off('idle', syncGradientState);
      map.off('moveend', syncGradientState);
    };
  }, [layers, map, populateColoringValueState]);

  const applyLayerColor = (layer: Layer, color: LayerColor) => {
    if (!map) return;
    const nextProp = paintProperty(layer, color);
    const expr = selectedAwareLayerColorExpression(color);
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

  const handleToggleLayer = (layerId: string) => {
    console.log(`Toggling layer ${layerId}`);
    setLayerStates(prev => ({
      ...prev,
      [layerId]: !(prev[layerId] ?? true)
    }));
  };

  const handleToggleTerrain = (enabled: boolean) => {
    setTerrainEnabled(enabled);
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
      const cachedFixed = lastFixedColorByLayerRef.current[layer.id];
      const defaultColor = defaultLayerColor(layer.type);
      const defaultFixedColor = isGradientLayerColor(defaultColor) ? '#2427c6' : defaultColor.color;
      const fallbackFixed = {
        mode: 'fixed' as const,
        color: isGradientLayerColor(layer.color) ? defaultFixedColor : layer.color.color,
        ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
      };
      const nextFixed: LayerColorFixed = cachedFixed
        ? {
            ...cachedFixed,
            ...(layer.type === 'circle' ? { target: cachedFixed.target ?? getCircleColorTarget(layer.color) } : {})
          }
        : fallbackFixed;

      applyLayerColor(layer, nextFixed);
      return;
    }

    const cachedGradient = lastGradientColorByLayerRef.current[layer.id];
    if (cachedGradient) {
      const stats = ensureLayerStats(layer);
      const matchedAttribute = stats.find(stat => stat.attribute === cachedGradient.attribute);
      const fallbackAttribute = stats[0]?.attribute;
      const nextAttribute = matchedAttribute
        ? cachedGradient.attribute
        : fallbackAttribute ?? cachedGradient.attribute;

      populateColoringValueState(layer, nextAttribute, Boolean(cachedGradient.useAbsoluteValue));
      applyLayerColor(layer, {
        ...cachedGradient,
        attribute: nextAttribute,
        ...(layer.type === 'circle' ? { target: cachedGradient.target ?? getCircleColorTarget(layer.color) } : {})
      });
      setGradientRangeErrorByLayer(prev => ({ ...prev, [layerId]: undefined }));
      return;
    }

    const stats = ensureLayerStats(layer);
    if (!stats.length) {
      console.warn(`No numeric attributes available for gradient mode in layer ${layer.id}`);
      return;
    }

    const selectedStats = stats[0];
    populateColoringValueState(layer, selectedStats.attribute, false);
    applyLayerColor(layer, {
      mode: 'gradient',
      attribute: selectedStats.attribute,
      scale: 'green-orange-red',
      min: roundToSignificantDigits(selectedStats.min),
      max: roundToSignificantDigits(selectedStats.max),
      useAbsoluteValue: false,
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
    const useAbsoluteValue = isGradientLayerColor(layer.color) ? Boolean(layer.color.useAbsoluteValue) : false;
    populateColoringValueState(layer, attribute, useAbsoluteValue);
    const nextRange = useAbsoluteValue
      ? toAbsoluteRange(selectedStats.min, selectedStats.max)
      : {
          min: roundToSignificantDigits(selectedStats.min),
          max: roundToSignificantDigits(selectedStats.max)
        };
    applyLayerColor(layer, {
      mode: 'gradient',
      attribute,
      scale: currentScale,
      min: nextRange.min,
      max: nextRange.max,
      useAbsoluteValue,
      ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
    });
    setGradientRangeErrorByLayer(prev => ({ ...prev, [layerId]: undefined }));
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

  const handleGradientRangeChange = (layerId: string, min: number, max: number) => {
    const layer = getLayerById(layerId);
    if (!layer || !isGradientLayerColor(layer.color)) return;

    if (layer.color.useAbsoluteValue && min < 0) {
      setGradientRangeErrorByLayer(prev => ({
        ...prev,
        [layerId]: 'Min cannot be negative when absolute value is enabled.'
      }));
      return;
    }

    if (min >= max) {
      setGradientRangeErrorByLayer(prev => ({
        ...prev,
        [layerId]: 'Min must be smaller than max.'
      }));
      return;
    }

    setGradientRangeErrorByLayer(prev => ({ ...prev, [layerId]: undefined }));

    applyLayerColor(layer, {
      ...layer.color,
      min,
      max,
      ...(layer.type === 'circle' ? { target: getCircleColorTarget(layer.color) } : {})
    });
  };

  const handleGradientUseAbsoluteChange = (layerId: string, useAbsoluteValue: boolean) => {
    const layer = getLayerById(layerId);
    if (!layer || !isGradientLayerColor(layer.color)) return;
    const currentColor = layer.color;

    populateColoringValueState(layer, currentColor.attribute, useAbsoluteValue);

    let nextMin = layer.color.min;
    let nextMax = layer.color.max;

    if (useAbsoluteValue) {
      const matchingStats = (attributeStatsByLayer[layerId] ?? [])
        .find(stat => stat.attribute === currentColor.attribute);

      if (matchingStats) {
        const absoluteRange = toAbsoluteRange(matchingStats.min, matchingStats.max);
        nextMin = absoluteRange.min;
        nextMax = absoluteRange.max;
      } else {
        nextMin = Math.max(0, nextMin);
      }

      if (nextMin >= nextMax) {
        setGradientRangeErrorByLayer(prev => ({
          ...prev,
          [layerId]: 'Min must be smaller than max.'
        }));
        return;
      }
    }

    setGradientRangeErrorByLayer(prev => ({ ...prev, [layerId]: undefined }));

    applyLayerColor(layer, {
      ...currentColor,
      useAbsoluteValue,
      min: nextMin,
      max: nextMax,
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
    setLayerStates(prev => {
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
    onRemoveLayer(layerId);
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
            map.addSource(layerId, { type: 'geojson', data: geojson, generateId: true });
            const newLayerColor = defaultLayerColor(layerType);
            registerLayerAsync(map, { id: layerId, name: file.name, type: layerType, source: layerId, color: newLayerColor });
            onAddLayer({ id: layerId, name: file.name, type: layerType, source: layerId, color: newLayerColor, removable: true });
          } catch (error) {
            console.error('Failed to load FlatGeobuf file', error);
          }
        }}
      />
      <div style={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
        <div style={{height: 30, flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f2efefff', fontWeight: 600, borderTopLeftRadius: 4}}>
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
        layerStates={layerStates}
        terrainEnabled={terrainEnabled}
        onRemoveLayer={handleRemoveLayer}
        onConfigureLayer={handleConfigureLayer}
        onToggleLayer={handleToggleLayer}
        onToggleTerrain={handleToggleTerrain}
        onColorChange={handleColorChange}
        onColorModeChange={handleColorModeChange}
        onGradientAttributeChange={handleGradientAttributeChange}
        onGradientScaleChange={handleGradientScaleChange}
        onGradientRangeChange={handleGradientRangeChange}
        onGradientUseAbsoluteChange={handleGradientUseAbsoluteChange}
        gradientRangeErrorByLayer={gradientRangeErrorByLayer}
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