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
  onSelectPpsAlongEdge?: (edgeFeature: SelectedFeature) => void;
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

function getStringArrayValue(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.every((entry) => typeof entry === 'string') ? value : null;
  }

  if (typeof value !== 'string') return null;

  const parsed = tryParseJsonObjectOrArray(value);
  if (!Array.isArray(parsed)) return null;

  return parsed.every((entry) => typeof entry === 'string') ? (parsed as string[]) : null;
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
  const tagValues = renderTagsAsChips ? getStringArrayValue(value) : null;
  const objectLikeValue = getObjectLikeValue(value);

  const entries: [string, unknown][] = objectLikeValue
    ? (Array.isArray(objectLikeValue)
      ? objectLikeValue.map((entry, index) => [String(index), entry])
      : Object.entries(objectLikeValue).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)))
    : [];

  const preview = objectLikeValue ? toSingleLine(JSON.stringify(objectLikeValue)) : '';
  const rowSpacing = depth === 0 ? 6 : 4;

  return (
    <li style={{ marginBottom: rowSpacing }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <strong style={{ marginTop: 1, marginRight: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>{name}:</strong>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          {tagValues ? (
            <div style={{ display: 'inline-block' }}>
              {tagValues.map((tag, i) => <Chip key={`${tag}-${i}`} label={tag} />)}
            </div>
          ) : objectLikeValue ? (
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
          ) : (
            <div>
              {formatValue(value)}
            </div>
          )}
        </div>
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

function isEdgeLineFeature(sf: SelectedFeature): boolean {
  const geometryType = sf.feature.geometry?.type;
  return sf.layerName === 'edges' && (geometryType === 'LineString' || geometryType === 'MultiLineString');
}

export function SelectedFeaturesPanel({ selectedFeatures, onExpandedChange, onSelectPpsAlongEdge }: SelectedFeaturesPanelProps) {
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
      overflow: 'hidden',
      overflowX: 'hidden',
      zIndex: 1,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: 12,
        borderBottom: '1px solid #e0e0e0',
        fontWeight: 'bold',
        backgroundColor: 'white'
      }}>
        {headerText}
      </div>
      <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {displayFeatures.map((sf, idx) => (
          <div key={sf.feature.id} style={{borderBottom: '1px solid #f0f0f0'}}>
            <div
              style={{
                width: '100%',
                padding: '6px 2px 6px 6px',
                boxSizing: 'border-box',
                backgroundColor: expandedIndex === idx ? '#f2EFEF' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <button
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 4,
                  textAlign: 'left',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getFeatureTitle(sf)}</span>
              </button>
              {expandedIndex === idx && isEdgeLineFeature(sf) && onSelectPpsAlongEdge && (
                <button
                  type="button"
                  onClick={() => onSelectPpsAlongEdge(sf)}
                  style={{
                    border: '1px solid #d6d6d6',
                    backgroundColor: '#ffffff',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Select pps on edge within 25 cm"
                >
                  +pps
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#7b7b7b',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px'
                }}
                title={expandedIndex === idx ? 'Collapse' : 'Expand'}
              >
                {expandedIndex === idx ? '▼' : '▶'}
              </button>
            </div>
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
    </div>
  );
}
