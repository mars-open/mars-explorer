import { useState, useEffect, useRef } from 'react';
import maplibregl, { ControlPosition } from 'maplibre-gl';
import { useControl, useMap } from 'react-map-gl/maplibre';
import { createRoot } from 'react-dom/client';


interface Layer {
  id: string;
  name: string;
}

interface LayerControlProps {
  layers: Layer[];
  position?: ControlPosition;
}

interface LayerControlContentProps {
  layers: Layer[];
  map: maplibregl.Map | null;
}

function LayerControlContent({layers, map}: LayerControlContentProps) {
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(false);

  useEffect(() => {
    layers.forEach(layer => setLayerStates(prev => ({ ...prev, [layer.id]: true })));
  }, [layers]);

  function toggleLayer(layerId: string) {
    if (!map) return;
    console.log(`Toggling layer ${layerId}`);
    const visibility = layerStates[layerId] ? 'none' : 'visible';
    map.setLayoutProperty(layerId, 'visibility', visibility);
    setLayerStates(prev => ({ ...prev, [layerId]: !prev[layerId] }));
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
      {layers.map(layer => (
        <label key={layer.id} className="flex items-center cursor-pointer mb-1 block">
          <input type="checkbox" checked={layerStates[layer.id] || false}
                 onChange={() => toggleLayer(layer.id)} className="mr-2" />
          {layer.name}
        </label>
      ))}
      <label key="terrain" className="flex items-center cursor-pointer mb-1 block">
        <input type="checkbox" checked={terrainEnabled}
                onChange={(e) => toogleTerrain(e.target.checked)} className="mr-2" />
        Terrain
      </label>
      </div>
  );
}

function LayerControlWrapper({layers, map}: LayerControlContentProps) {
  const [open, setOpen] = useState(false);

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
    <div style={{display: 'flex', flexDirection: 'column', minWidth: 150}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
        <div style={{height: 30, flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f2efefff', fontWeight: 600}}>
          Layers
        </div>
        <button
          className="maplibregl-ctrl-icon"
          title="Hide layers"
          onClick={() => setOpen(false)}
          style={{width: 30, height: 30, lineHeight: '28px', padding: 0}}
        >
          ×
        </button>
      </div>
      <LayerControlContent layers={layers} map={map} />
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
        if (map) root.render(<LayerControlWrapper layers={props.layers} map={map.getMap()} />);
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
      rootRef.current.render(<LayerControlWrapper layers={props.layers} map={map.getMap()!} />);
    }
  }, [props.layers, map]);

  return null;
};