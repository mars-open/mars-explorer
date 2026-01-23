import React, { useState, useEffect, useRef } from 'react';
import maplibregl, { ControlPosition, Map } from 'maplibre-gl';
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
  mapRef: any;
}

function LayerControlContent({layers, mapRef}: LayerControlContentProps) {
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    layers.forEach(layer => setLayerStates(prev => ({ ...prev, [layer.id]: true })));
  }, [layers]);

  function toggleLayer(layerId: string) {
    if (!mapRef || !mapRef.map) return;
    const map: Map = mapRef.map.getMap()
    console.log(`Toggling layer ${layerId}`);
    const visibility = layerStates[layerId] ? 'none' : 'visible';
    map.setLayoutProperty(layerId, 'visibility', visibility);
    setLayerStates(prev => ({ ...prev, [layerId]: !prev[layerId] }));
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
      </div>
  );
}

function LayerControlWrapper({layers, mapRef}: LayerControlContentProps) {
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
      <LayerControlContent layers={layers} mapRef={mapRef} />
    </div>
  );
}

export function LayerControl(props: LayerControlProps) {
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapContextRef = useRef<any>(null);
  
  useControl((mapContext) => {
      mapContextRef.current = mapContext;
      const container = document.createElement('div');
      containerRef.current = container;
      container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      rootRef.current = createRoot(container);
      rootRef.current.render(<LayerControlWrapper layers={props.layers} mapRef={mapContext} />);      
      return { 
        onAdd: () => container, 
        onRemove: () => {
          containerRef.current?.remove();
        }
      };
    }, {
      position: props.position
    }
  );

  useEffect(() => {
    if (rootRef.current && containerRef.current?.parentElement && mapContextRef.current) {
      rootRef.current.render(<LayerControlWrapper layers={props.layers} mapRef={mapContextRef.current} />);
    }
  }, [props.layers]);

  return null;
};