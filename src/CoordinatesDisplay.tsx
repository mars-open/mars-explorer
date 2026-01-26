import { useMap } from "react-map-gl/maplibre";
import { useEffect, useState } from "react";

export function CoordinatesDisplay() {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState<number>(0);
  const [lng, setLng] = useState<number>(0);
  const [lat, setLat] = useState<number>(0);

  useEffect(() => {
    if (!map) return;

    const updateZoom = () => {
      setZoom(map.getZoom());
    };

    const updateMousePosition = (e: maplibregl.MapMouseEvent) => {
      setLng(e.lngLat.lng);
      setLat(e.lngLat.lat);
    };

    // Initialize - use setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      updateZoom();
      const center = map.getCenter();
      setLng(center.lng);
      setLat(center.lat);
    }, 0);

    // Update zoom on map move
    map.on('zoom', updateZoom);
    
    // Update coordinates on mouse move
    map.on('mousemove', updateMousePosition);

    return () => {
      map.off('zoom', updateZoom);
      map.off('mousemove', updateMousePosition);
    };
  }, [map]);

  return (
    <div style={{
      position: 'absolute',
      right: 10,
      bottom: 10,
      backgroundColor: 'rgba(255, 255, 255, 0.5)',
      borderRadius: 4,
      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      padding: '4px 8px',
      zIndex: 1,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      minWidth: 140,
    }}>
      <div style={{ marginBottom: 2 }}>
        
      </div>
      <div style={{ marginBottom: 2 }}>
        <strong>lat/lon:</strong> {lng.toFixed(5)}&nbsp;{lat.toFixed(5)}&nbsp;<strong>z:</strong>{zoom.toFixed(1)}
      </div>
    </div>
  );
}
