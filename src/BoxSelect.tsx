import { useMap, MapGeoJSONFeature } from "react-map-gl/maplibre";
import { useEffect } from "react";
import maplibregl from "maplibre-gl";

interface BoxSelectProps {
  onSelect: (features: MapGeoJSONFeature[], center: maplibregl.LngLat) => void;
  interactiveLayerIds: string[];
}

export function BoxSelect({ onSelect, interactiveLayerIds }: BoxSelectProps) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    if (!mapInstance) return;

    // Disable drag rotate (ctrl+click rotation)
    mapInstance.dragRotate.disable();

    const canvas = mapInstance.getCanvasContainer();
    
    let start: maplibregl.Point | null = null;
    let current: maplibregl.Point | null = null;
    let box: HTMLDivElement | null = null;

    function onMouseDown(e: MouseEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;

      // Don't interfere with buttons or right-click
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();
      
      // Disable default map panning while selecting
      mapInstance.dragPan.disable();

      const rect = canvas.getBoundingClientRect();
      start = new maplibregl.Point(
        e.clientX - rect.left,
        e.clientY - rect.top
      );

      // Create selection box
      box = document.createElement('div');
      box.style.position = 'absolute';
      box.style.border = '2px dashed #0080ff';
      box.style.backgroundColor = 'rgba(0, 128, 255, 0.1)';
      box.style.pointerEvents = 'none';
      box.style.zIndex = '10';
      canvas.appendChild(box);
    }

    function onMouseMove(e: MouseEvent) {
      if (!start || !box) return;

      e.preventDefault();
      e.stopPropagation();
      
      const rect = canvas.getBoundingClientRect();
      current = new maplibregl.Point(
        e.clientX - rect.left,
        e.clientY - rect.top
      );

      const minX = Math.min(start.x, current.x);
      const maxX = Math.max(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxY = Math.max(start.y, current.y);

      box.style.left = minX + 'px';
      box.style.top = minY + 'px';
      box.style.width = (maxX - minX) + 'px';
      box.style.height = (maxY - minY) + 'px';
    }

    function onMouseUp(e: MouseEvent) {
      if (!start || !box) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      current = new maplibregl.Point(
        e.clientX - rect.left,
        e.clientY - rect.top
      );

      // Clean up
      if (box.parentNode) {
        box.parentNode.removeChild(box);
      }

      mapInstance.dragPan.enable();

      // Query features in the box
      const features = mapInstance.queryRenderedFeatures(
        [start, current],
        { layers: interactiveLayerIds }
      );

      // Calculate center of the box for LngLat
      const centerPoint = new maplibregl.Point(
        (start.x + current.x) / 2,
        (start.y + current.y) / 2
      );
      const centerLngLat = mapInstance.unproject(centerPoint);

      // Deduplicate by feature ID
      const uniqueFeatures = Array.from(
        new globalThis.Map(features.map(f => [f.id, f])).values()
      );

      onSelect(uniqueFeatures, centerLngLat);

      start = null;
      current = null;
      box = null;
    }

    canvas.addEventListener('mousedown', onMouseDown, true);
    canvas.addEventListener('mousemove', onMouseMove, true);
    canvas.addEventListener('mouseup', onMouseUp, true);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown, true);
      canvas.removeEventListener('mousemove', onMouseMove, true);
      canvas.removeEventListener('mouseup', onMouseUp, true);
      
      // Clean up box if still present
      if (box && box.parentNode) {
        box.parentNode.removeChild(box);
      }
      
      // Re-enable drag rotate and pan
      mapInstance.dragRotate.enable();
      mapInstance.dragPan.enable();
    };
  }, [map, onSelect, interactiveLayerIds]);

  return null;
}
