import { Layer, Map, MapGeoJSONFeature, MapRef, NavigationControl, Popup, Source, useControl, ControlPosition, AttributionControl, IControl, LngLat, useMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { useEffect, useRef, useState } from "react";
import { LayerControl } from "./LayerControl";
import { TagsFilter } from "./TagsFilter";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import * as flatgeobuf from "flatgeobuf";

class SelectedFeature {
  feature: MapGeoJSONFeature;
  lngLat: LngLat;
  layerName: string;
  constructor(feature: MapGeoJSONFeature, lngLat: LngLat) {
    this.feature = feature;
    this.lngLat = lngLat;
    this.layerName = feature.layer?.id || 'Unknown';
  }
}

function App() {

  const [selectedFeatures, setSelectedFeatures] = useState<SelectedFeature[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hoveredFeature, setHoveredFeature] = useState<MapGeoJSONFeature|null>();
  const mapRef = useRef<MapRef>(null);

  // traffimage or swisstopo... 
  const mapStyle = "https://maps.geops.io/styles/base_bright_v2_ch.sbb.netzkarte/style.json?key=5cc87b12d7c5370001c1d655352830d2fef24680ae3a1cda54418cb8"
  //const mapStyle = "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"

  async function loadFlatGeobufGeoJSON(url: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const features = [];
    for await (const feature of flatgeobuf.geojson.deserialize(new Uint8Array(arrayBuffer))) {
      features.push(feature);
    }
    return {
      type: 'FeatureCollection' as const,
      features: features
    };
  }

  function normalizeGeoJSON(geojson: any) {
    // Clone features to avoid mutating FlatGeobuf objects and normalize tags to arrays
    geojson.features.forEach((feature: any) => {
      if (feature.properties?.tags && typeof feature.properties.tags === 'string') {
        try {
          feature.properties.tags = JSON.parse(feature.properties.tags);
        } catch { }
      }
    })
    return geojson;
  }

  function formatValue(value: unknown): string {
    if (typeof value === 'number') {
      // Round to 5 significant digits
      return parseFloat(value.toPrecision(5)).toString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function initMap(map: maplibregl.Map) {
    console.log("initMap");    

    // Register PMTiles protocol
    const pmtProtocol = new pmtiles.Protocol({ errorOnMissingTile: true });
    maplibregl.addProtocol('pmtiles', pmtProtocol.tile);

    if (map) {
      // pps  
      map.addSource('pps', {
        type: 'vector', promoteId: 'id_positionpoint',
        url: 'pmtiles://https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/pp.pmtiles'
      });
      map.addLayer({id: 'pps', type: 'circle', source: 'pps', 'source-layer': 'pps', paint: {"circle-radius": 4, "circle-color": "#ff0000" }});

      // edges
      console.log("Loading edges");      
      loadFlatGeobufGeoJSON('https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/edges.fgb')
        .then(geojson => {
          const normalized = normalizeGeoJSON(geojson);
          const sampleEdgeTags = normalized.features?.[0]?.properties?.tags;
          console.log('edges normalized sample tags:', sampleEdgeTags, 'isArray:', Array.isArray(sampleEdgeTags));
          map.addSource('edges-fgb', {type: 'geojson', data: normalized, promoteId: 'uuid_edge'});
          map.addLayer({id: 'edges', type: 'line', source: 'edges-fgb', paint: {"line-color": "#0000f0ff", "line-width": 1}});
        })
        .catch(error => console.error("Error loading edges:", error));

      // nodes  
      console.log("Loading nodes");      
      loadFlatGeobufGeoJSON('https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/nodes.fgb')
        .then(geojson => {
          const normalized = normalizeGeoJSON(geojson);
          const sampleNodeTags = normalized.features?.[0]?.properties?.tags;
          console.log('nodes normalized sample tags:', sampleNodeTags, 'isArray:', Array.isArray(sampleNodeTags));
          map.addSource('nodes-fgb', {type: 'geojson', data: normalized, promoteId: 'uuid_node'});
          map.addLayer({id: 'nodes', type: 'circle', source: 'nodes-fgb', paint: {"circle-radius": 4, "circle-stroke-color": "#0000f0ff", "circle-stroke-width": 1, 'circle-opacity': 0 }});
        })
        .catch(error => console.error("Error loading nodes:", error));

    }
  };

  return (
    <>
      <main>
        <h1>Hello Positionspunkt!</h1>
        <Map
          ref={mapRef}
          initialViewState = {{
            longitude: 7.43885,  // Bern
            latitude: 46.95061,
            zoom: 15,
            pitch: 0,
            bearing: 0
          }}
          mapStyle={mapStyle}
          minZoom={7}
          interactiveLayerIds={["pps","edges","nodes"]}
          cursor={hoveredFeature ? 'pointer' : 'default'} // Dynamic cursor
          onLoad={(e) => initMap(e.target)}
          onClick={(e) => {
            if (e.features && e.features.length > 0) {
              // Deduplicate by feature ID
              const uniqueFeatures = Array.from(new globalThis.Map(
                e.features.map(f => [f.id, f])
              ).values());
              const newFeatures = uniqueFeatures.map(f => new SelectedFeature(f, e.lngLat));
              setSelectedFeatures(newFeatures);
              setExpandedIndex(0);
              console.log(`Features selected (${newFeatures.length}):`, newFeatures.map(sf => sf.feature.id));
            } else {
              setSelectedFeatures([]);
              setExpandedIndex(null);
              console.log("Features deselected");
            }
          }}
          onMouseEnter = {(e) => {
            if (e.features && e.features.length > 0) {
              setHoveredFeature(e.features[0]);
            } else {
              setHoveredFeature(null)
            }
          }}
          onMouseLeave = {() => {
            setHoveredFeature(null)
          }}
          onMoveEnd = {() => {
            const bbox = mapRef.current!.getMap().getBounds().toArray().flat();  // [minx, miny, maxx, maxy]
            //mapRef.current!.getMap().getSource('edges')!.setData(`http://localhost:8000/features/edge?bbox=${bbox.join(',')}&limit=1000`);
            //mapRef.current!.getMap().getSource('nodes')!.setData(`http://localhost:8000/features/node?bbox=${bbox.join(',')}&limit=1000`);
          }}
          attributionControl={false}
        >
          <NavigationControl />
          {selectedFeatures.length > 0 && (
            <div style={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              width: 320,
              maxHeight: '80vh',
              backgroundColor: 'white',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              overflowY: 'auto',
              zIndex: 1,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}>
              <div style={{padding: 12, borderBottom: '1px solid #e0e0e0', fontWeight: 'bold'}}>
                Selected Features ({selectedFeatures.length})
              </div>
              {selectedFeatures.map((sf, idx) => (
                <div key={sf.feature.id} style={{borderBottom: '1px solid #f0f0f0'}}>
                  <button
                    onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                    style={{
                      width: '100%',
                      padding: 12,
                      textAlign: 'left',
                      border: 'none',
                      backgroundColor: expandedIndex === idx ? '#f5f5f5' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                    <span>{sf.layerName} - {sf.feature.id}</span>
                    <span>{expandedIndex === idx ? '▼' : '▶'}</span>
                  </button>
                  {expandedIndex === idx && (
                    <div style={{padding: 12, backgroundColor: '#fafafa'}}>
                      <ul style={{paddingLeft: 0, margin: 0, listStyle: 'none', fontSize: 12}}>
                        {Object.entries(sf.feature.properties || {})
                          .filter(([, v]) => v !== sf.feature.id)
                          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                          .map(([k, v]) => (
                            <li key={k} style={{marginBottom: 6}}>
                              <strong>{k}:</strong> {formatValue(v)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
            <LayerControl layers={[
              {id: "pps", name: "Positionspunkte"}, 
              {id: "edges", name: "Tlm3d Kanten"},
              {id: "nodes", name: "Tlm3d Knoten"},
              ]}/>
            <TagsFilter layerIds={["pps", "edges", "nodes"]} possibleTags={['Normalspur', 'Schmalspur', 'Bahn']} position="top-right"/>
        </Map>
      </main>
    </>
  );
}

export default App;
