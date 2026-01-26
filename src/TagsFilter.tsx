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
  const [selectedTags, setSelectedTags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    possibleTags.forEach(tag => setSelectedTags(prev => ({ ...prev, [tag]: true })));
  }, [possibleTags]);

  function toggleTag(tag: string) {
    if (!map) return;
    
    const newSelectedTags = { ...selectedTags, [tag]: !selectedTags[tag] };
    setSelectedTags(newSelectedTags);

    // Get array of selected tags
    const selectedTagsArray = Object.entries(newSelectedTags)
      .filter(([, selected]) => selected)
      .map(([t]) => t);

    // Apply filter to all layers
    layerIds.forEach(layerId => {
      if (selectedTagsArray.length === 0) {
        // Show all if no tags selected
        map.setFilter(layerId, null);
      } else {
        // Filter features where tags array contains any of the selected tags
        const filters = selectedTagsArray.map(tag => ['in', tag, ['get', 'tags']]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filterExpression: any = ['any', ...filters];
        map.setFilter(layerId, filterExpression);
      }
    });

    console.log(`Tags filter updated: ${selectedTagsArray.join(', ')}`);
  }

  return (
    <div style={{display: "flex", flexDirection: "column", margin: 5 }}>
      {possibleTags.map(tag => (
        <label key={tag} className="flex items-center cursor-pointer mb-1 block">
          <input type="checkbox" checked={selectedTags[tag] || false}
                 onChange={() => toggleTag(tag)} className="mr-2" />
          {tag}
        </label>
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
    <div style={{display: 'flex', flexDirection: 'column', minWidth: 150}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
        <div style={{height: 30, flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f2efefff', fontWeight: 600}}>
          Tags
        </div>
        <button
          className="maplibregl-ctrl-icon"
          title="Hide tags filter"
          onClick={() => setOpen(false)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0}}
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

  useControl(() => {
    const container = document.createElement('div');
    containerRef.current = container;
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const root = createRoot(container);
    rootRef.current = root;
    
    // Defer initial render to avoid React warning
    setTimeout(() => {
      if (map) root.render(<TagsFilterWrapper layerIds={layerIds} possibleTags={possibleTags} map={map.getMap()} />);
    }, 0);
    
    return { 
      onAdd: () => container, 
      onRemove: () => {
        containerRef.current?.remove();
      }
    };
  }, {
    position: position || 'top-right'
  });

  useEffect(() => {
    if (!map) return;
    if (rootRef.current && containerRef.current?.parentElement) {
      rootRef.current.render(<TagsFilterWrapper layerIds={layerIds} possibleTags={possibleTags} map={map.getMap()!} />);
    }
  }, [layerIds, possibleTags, map]);

  return null;
}

export function TagsFilter({layerIds, possibleTags, position}: TagsFilterProps) {
  return <TagsFilterControl layerIds={layerIds} possibleTags={possibleTags} position={position} />;
}