import { MapGeoJSONFeature, LngLat } from "react-map-gl/maplibre";
import { useEffect, useState } from "react";

const EXPANDED_INDENT_PX = 15;

export class SelectedFeature {
  feature: MapGeoJSONFeature;
  lngLat: LngLat;
  layerName: string;
  constructor(feature: MapGeoJSONFeature, lngLat: LngLat) {
    this.feature = feature;
    this.lngLat = lngLat;
    this.layerName = feature.layer?.id || 'Unknown';
  }
}

interface SelectedFeaturesPanelProps {
  selectedFeatures: SelectedFeature[];
  onExpandedChange?: (feature: SelectedFeature | null) => void;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    // round to 5 significant digits if the number has a decimal point
    return parseFloat(value.toPrecision(5)).toString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isObjectLike(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function tryParseJsonObjectOrArray(value: unknown): Record<string, unknown> | unknown[] | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isObjectLike(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getObjectLikeValue(value: unknown): Record<string, unknown> | unknown[] | null {
  const parsedJsonObject = tryParseJsonObjectOrArray(value);
  if (parsedJsonObject) return parsedJsonObject;
  if (isObjectLike(value)) return value;
  return null;
}

function PropertyRow({
  name,
  value,
  depth = 0,
  renderTagsAsChips = false,
}: {
  name: string;
  value: unknown;
  depth?: number;
  renderTagsAsChips?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const objectLikeValue = getObjectLikeValue(value);

  const entries: [string, unknown][] = objectLikeValue
    ? (Array.isArray(objectLikeValue)
      ? objectLikeValue.map((entry, index) => [String(index), entry])
      : Object.entries(objectLikeValue).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)))
    : [];

  const preview = objectLikeValue ? toSingleLine(JSON.stringify(objectLikeValue)) : '';
  const rowSpacing = depth === 0 ? 6 : 4;

  const tagsAsChips = renderTagsAsChips && typeof value === 'string' && value.startsWith('["');

  return (
    <li style={{ marginBottom: rowSpacing }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <strong style={{ marginTop: 1, marginRight: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>{name}:</strong>
        {objectLikeValue ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              margin: 0,
              color: '#7b7b7b',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              textAlign: 'left',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flex: '1 1 auto',
              minWidth: 0,
              maxWidth: '100%'
            }}
            title={preview}
          >
            <span>{expanded ? '▼' : '▶'}</span>
            {!expanded && (
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: '1 1 auto'
                }}
              >
                {preview}
              </span>
            )}
          </button>
        ) : tagsAsChips ? (
          <div style={{ display: 'inline-block' }}>
            {(JSON.parse(value) as []).map((tag, i) => <Chip key={i} label={tag} />)}
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            {formatValue(value)}
          </div>
        )}
      </div>
      {objectLikeValue && expanded && (
        <ul
          style={{
            listStyle: 'none',
            margin: '6px 0 0 0',
            paddingLeft: EXPANDED_INDENT_PX
          }}
        >
          {entries.map(([key, entryValue]) => (
            <PropertyRow key={key} name={key} value={entryValue} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      margin: '2px',
      backgroundColor: '#e3f2fd',
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

export function SelectedFeaturesPanel({ selectedFeatures, onExpandedChange }: SelectedFeaturesPanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  
  const MAX_DISPLAY = 100;
  const displayFeatures = selectedFeatures.slice(0, MAX_DISPLAY);

  useEffect(() => {
    // Collapse all when selected features change - use setTimeout to avoid synchronous setState
    setTimeout(() => {
      setExpandedIndex(0);
      if (onExpandedChange && selectedFeatures.length > 0) {
        onExpandedChange(selectedFeatures[0]);
      }
    }, 0);
  }, [selectedFeatures, onExpandedChange]);

  useEffect(() => {
    // Notify when expanded index changes
    if (onExpandedChange) {
      const expandedFeature = expandedIndex !== null ? displayFeatures[expandedIndex] : null;
      onExpandedChange(expandedFeature || null);
    }
  }, [expandedIndex, displayFeatures, onExpandedChange]);

  if (selectedFeatures.length === 0) {
    return null;
  }

  const hasMore = selectedFeatures.length > MAX_DISPLAY;
  const headerText = hasMore ? `Selected Features (${MAX_DISPLAY}...)` : `Selected Features (${selectedFeatures.length})`;

  function getFeatureTitle(sf: SelectedFeature): string {
    return `[${sf.layerName}] ${sf.feature.id}`;
  }

  return (
    <div style={{
      position: 'absolute',
      left: 10,
      top: 10,
      width: 375,
      maxHeight: '80vh',
      backgroundColor: 'white',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      overflowY: 'auto',
      zIndex: 1,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{padding: 12, borderBottom: '1px solid #e0e0e0', fontWeight: 'bold'}}>
        {headerText}
      </div>
      {displayFeatures.map((sf, idx) => (
        <div key={sf.feature.id} style={{borderBottom: '1px solid #f0f0f0'}}>
          <button
            onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
            style={{
              width: '100%',
              padding: 12,
              textAlign: 'left',
              border: 'none',
              backgroundColor: expandedIndex === idx ? '#f2EFEF' : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
            <span>{getFeatureTitle(sf)}</span>
            <span style={{color: '#7b7b7b', fontSize: 10}}>{expandedIndex === idx ? '▼' : '▶'}</span>
          </button>
          {expandedIndex === idx && (
            <div style={{padding: 12, backgroundColor: '#fafafa'}}>
              <ul style={{paddingLeft: 0, margin: 0, listStyle: 'none', fontSize: 12}}>
                {Object.entries(sf.feature.properties || {})
                  .filter(([k, v]) => k == "id_positionpoint" || v !== sf.feature.id)
                  .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                  .map(([k, v]) => (
                    <PropertyRow key={k} name={k} value={v} renderTagsAsChips={k === 'tags'} />
                  ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
