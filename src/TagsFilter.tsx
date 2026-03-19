import { useState, useEffect, useRef } from 'react';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';
import { Checkbox } from 'react-aria-components';
import './Checkbox.css';
import './TagsFilter.css';



interface TagsFilterProps {
  layerIds: string[];
  possibleTags: string[];
  tagConfig: Record<string, {selected: boolean; mode: 'include' | 'exclude'}>;
  onToggleTag: (tag: string) => void;
  onToggleMode: (tag: string) => void;
  position?: ControlPosition;
}

interface TagsFilterContentProps {
  possibleTags: string[];
  tagConfig: Record<string, {selected: boolean; mode: 'include' | 'exclude'}>;
  onToggleTag: (tag: string) => void;
  onToggleMode: (tag: string) => void;
}

interface TagsFilterWrapperProps {
  layerIds: string[];
  possibleTags: string[];
  map: maplibregl.Map | null;
  tagConfig: Record<string, {selected: boolean; mode: 'include' | 'exclude'}>;
  onToggleTag: (tag: string) => void;
  onToggleMode: (tag: string) => void;
}

function TagsFilterContent({possibleTags, tagConfig, onToggleTag, onToggleMode}: TagsFilterContentProps) {
  return (
      <div className="tags-filter-content">
        {possibleTags.map(tag => (
          <div
            key={tag}
            className="items-center cursor-pointer mb-1"
            style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}
          >
            <Checkbox
              className="map-checkbox-root tags-filter-checkbox"
              isSelected={tagConfig[tag]?.selected || false}
              onChange={() => onToggleTag(tag)}
            >
              {({ isSelected }) => (
                <>
                  <span
                    className="map-checkbox-box"
                    data-selected={isSelected ? 'true' : undefined}
                    data-mode={tagConfig[tag]?.mode}
                    aria-hidden="true"
                  />
                  <span>{tag}</span>
                </>
              )}
            </Checkbox>
            <button type="button" className="maplibregl-ctrl-icon" title="Toggle include/exclude"
              style={{ width: 22, height: 22, lineHeight: '22px', padding: 0, fontSize: '12px' }}
              onClick={() => onToggleMode(tag)}
            >
              {tagConfig[tag]?.mode === 'exclude' ? '−' : '+'}
            </button>
          </div>
        ))}
      </div>
  );
}

function TagsFilterWrapper({layerIds, possibleTags, map, tagConfig, onToggleTag, onToggleMode}: TagsFilterWrapperProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!map) return;

    const includedTags = Object.entries(tagConfig)
      .filter(([, config]) => config.selected && config.mode === 'include')
      .map(([t]) => t);

    const excludedTags = Object.entries(tagConfig)
      .filter(([, config]) => config.selected && config.mode === 'exclude')
      .map(([t]) => t);

    // Apply filter to all layers even when the panel UI is collapsed.
    layerIds.forEach(layerId => {
      if (!map.getLayer(layerId)) return;
      if (includedTags.length === 0) {
        map.setFilter(layerId, null);
        return;
      }

      const includeFilters = includedTags.map(tag => ['in', tag, ['get', 'tags']]);
      const excludeFilters = excludedTags.map(tag => ['!', ['in', tag, ['get', 'tags']]]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filterExpression: any = ['all', ['any', ...includeFilters], ['all', ...excludeFilters]];
      map.setFilter(layerId, filterExpression);
    });

    console.log(`Tags filter updated: include ${includedTags.join(', ')}, exclude ${excludedTags.join(', ')}`, layerIds);
  }, [layerIds, tagConfig]);

  if (!open) {
    return (
      <div className="tags-filter-toggle-shell">
        <button
          className="maplibregl-ctrl-icon"
          title="Show tags filter"
          onClick={() => setOpen(true)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0}}
        >
          #
        </button>
      </div>
    );
  }

  return (
    <div className="tags-filter-panel">
      <div className="tags-filter-header">
        <div className="tags-filter-title">
          Tags
        </div>
        <button
          className="maplibregl-ctrl-icon"
          title="Hide tags filter"
          onClick={() => setOpen(false)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0, borderTop: "0px", borderBottom: "1px solid #f2efefff"}}
        >
          ×
        </button>
      </div>
      <TagsFilterContent
        possibleTags={possibleTags}
        tagConfig={tagConfig}
        onToggleTag={onToggleTag}
        onToggleMode={onToggleMode}
      />
    </div>
  );
}

function TagsFilterControl({ layerIds, possibleTags, tagConfig, onToggleTag, onToggleMode, position }: TagsFilterProps) {
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { current: map } = useMap();
  const hasTags = possibleTags.length > 0;
  const possibleTagsKey = possibleTags.join('|');

  useControl(() => {

    return { 
      onAdd: (map) => {
        const container = document.createElement('div');
        containerRef.current = container;
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        container.style.display = hasTags ? '' : 'none';
        const root = createRoot(container);
        rootRef.current = root;        
        root.render(
          <TagsFilterWrapper
            key={possibleTagsKey}
            layerIds={layerIds}
            possibleTags={possibleTags}
            map={map}
            tagConfig={tagConfig}
            onToggleTag={onToggleTag}
            onToggleMode={onToggleMode}
          />
        );
        return container;
      }, 
      onRemove: () => {
        rootRef.current?.unmount();
        rootRef.current = null;
        containerRef.current?.remove();
        containerRef.current = null;
      }
    };
  }, {
    position: position || 'top-right'
  });

  useEffect(() => {
    if (!map) return;
    if (containerRef.current) {
      containerRef.current.style.display = hasTags ? '' : 'none';
    }
    if (rootRef.current && containerRef.current?.parentElement) {
      rootRef.current.render(
        <TagsFilterWrapper
          key={possibleTagsKey}
          layerIds={layerIds}
          possibleTags={possibleTags}
          map={map.getMap()!}
          tagConfig={tagConfig}
          onToggleTag={onToggleTag}
          onToggleMode={onToggleMode}
        />
      );
    }
  }, [hasTags, layerIds, map, onToggleMode, onToggleTag, possibleTags, possibleTagsKey, tagConfig]);

  return null;
}

export function TagsFilter({layerIds, possibleTags, tagConfig, onToggleTag, onToggleMode, position}: TagsFilterProps) {
  return (
    <TagsFilterControl
      layerIds={layerIds}
      possibleTags={possibleTags}
      tagConfig={tagConfig}
      onToggleTag={onToggleTag}
      onToggleMode={onToggleMode}
      position={position}
    />
  );
}