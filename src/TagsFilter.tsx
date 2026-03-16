import { useState, useEffect, useRef } from 'react';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';



interface TagsFilterProps {
  layerIds: string[];
  possibleTags: string[];
  position?: ControlPosition;
}

interface TagsFilterContentProps {
  layerIds: string[];
  possibleTags: string[];
  map: maplibregl.Map | null;
}

function TagsFilterContent({layerIds, possibleTags, map}: TagsFilterContentProps) {
  function buildTagConfig(tags: string[]) {
        return tags.reduce<Record<string, {selected: boolean; mode: 'include' | 'exclude'}>>((acc, tag) => {
              acc[tag] = { selected: true, mode: 'include' };
                    return acc;
    }, {});
  }

  const [tagConfig, setTagConfig] = useState<Record<string, {selected: boolean; mode: 'include' | 'exclude'}>>(() => buildTagConfig(possibleTags));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTagConfig(buildTagConfig(possibleTags));
  }, [possibleTags]);

  function toggleTag(tag: string) {
    if (!map) return;
    setTagConfig(prev => ({
      ...prev, [tag]: {...(prev[tag]), selected: !(prev[tag]?.selected ?? false)}
    }));
  }

  function toggleMode(tag: string) {
    setTagConfig(prev => ({
      ...prev, [tag]: {...(prev[tag]), mode: prev[tag]?.mode === 'include' ? 'exclude' : 'include'}
    }));
  }

  useEffect(() => {
    if (!map) return;
    
    const includedTags = Object.entries(tagConfig)
      .filter(([, config]) => config.selected && config.mode === 'include')
      .map(([t]) => t);

    const excludedTags = Object.entries(tagConfig)
      .filter(([, config]) => config.selected && config.mode === 'exclude')
      .map(([t]) => t);

    // Apply filter to all layers
    layerIds.forEach(layerId => {
      if (!map.getLayer(layerId)) return;
      if (includedTags.length === 0) {
        // Show all if no tags selected
        map.setFilter(layerId, null);
      } else {
        // Filter features where tags array contains any of the selected tags
        const includeFilters = includedTags.map(tag => ['in', tag, ['get', 'tags']])
        const excludeFilters = excludedTags.map(tag => ['!', ['in', tag, ['get', 'tags']]]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filterExpression: any = ['all', ['any', ...includeFilters], ['all', ...excludeFilters]];
        map.setFilter(layerId, filterExpression);
      }
    });

    console.log(`Tags filter updated: include ${includedTags.join(', ')}, exclude ${excludedTags.join(', ')}`);
  }, [tagConfig, layerIds, map]);

  return (
      <div style={{display: "flex", flexDirection: "column", margin: 5 }}>
        {possibleTags.map(tag => (
          <div key={tag} className="items-center cursor-pointer mb-1" 
            style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 6 }}
          >
            <label className="items-center" htmlFor={`tag-${tag}`} 
                style={{ flex: 1, minWidth: 0, height: 22, display: 'flex', alignItems: 'center' }}>
                <input
                  id={`tag-${tag}`} type="checkbox"
                  checked={tagConfig[tag]?.selected || false}
                  onChange={() => toggleTag(tag)}
                  className="tags-filter-checkbox"
                  data-mode={tagConfig[tag]?.mode}
                  style={{ marginRight: 8 }}
                />
              {tag}
            </label>
            <button type="button" className="maplibregl-ctrl-icon" title="Toggle include/exclude"
              style={{ height: 22, width: 22, lineHeight: '26px', fontSize: '0.75rem' }}
              onClick={() => toggleMode(tag)}
            >
              {tagConfig[tag]?.mode === 'exclude' ? '−' : '+'}
            </button>
          </div>
        ))}
      </div>
  );
}

function TagsFilterWrapper({layerIds, possibleTags, map}: TagsFilterContentProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div style={{display: 'flex', flexDirection: 'column'}}>
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
    <div style={{display: 'flex', flexDirection: 'column', minWidth: 175}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
        <div style={{height: 30, flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f2efefff', fontWeight: 600}}>
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
      <TagsFilterContent layerIds={layerIds} possibleTags={possibleTags} map={map} />
    </div>
  );
}

function TagsFilterControl({ layerIds, possibleTags, position }: TagsFilterProps) {
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { current: map } = useMap();
  const hasTags = possibleTags.length > 0;

  useControl(() => {

    return { 
      onAdd: (map) => {
        const container = document.createElement('div');
        containerRef.current = container;
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        container.style.display = hasTags ? '' : 'none';
        const root = createRoot(container);
        rootRef.current = root;        
        root.render(<TagsFilterWrapper layerIds={layerIds} possibleTags={possibleTags} map={map} />);
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
      rootRef.current.render(<TagsFilterWrapper layerIds={layerIds} possibleTags={possibleTags} map={map.getMap()!} />);
    }
  }, [hasTags, layerIds, possibleTags, map]);

  return null;
}

export function TagsFilter({layerIds, possibleTags, position}: TagsFilterProps) {
  return <TagsFilterControl layerIds={layerIds} possibleTags={possibleTags} position={position} />;
}