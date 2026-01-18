import { Layer, Map, MapGeoJSONFeature, MapRef, NavigationControl, Popup, Source, useControl, ControlPosition, AttributionControl, IControl, LngLat, useMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { useEffect, useRef, useState } from "react";
import { LayerControl } from "./LayerControl";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";

class SelectedFeature {
  feature: MapGeoJSONFeature;
  lngLat: LngLat;
  constructor(feature: MapGeoJSONFeature, lngLat: LngLat) {
    this.feature = feature;
    this.lngLat = lngLat;
  }
}

// Register PMTiles protocol
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
console.log("Registered PMTiles protocol");

function App() {

  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature|null>();
  const [hoveredFeature, setHoveredFeature] = useState<MapGeoJSONFeature|null>();
  const mapRef = useRef<MapRef>(null);

  // traffimage or swisstopo... 
  const mapStyle = "https://maps.geops.io/styles/base_bright_v2_ch.sbb.netzkarte/style.json?key=5cc87b12d7c5370001c1d655352830d2fef24680ae3a1cda54418cb8"
  //const mapStyle = "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"

  useEffect(() => {
    const p = new pmtiles.PMTiles("https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/pp.pmtiles");
    p.getHeader().then(console.log);
  }, []);

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
          interactiveLayerIds={["pp-points","edges","nodes"]}
          cursor={hoveredFeature ? 'pointer' : 'default'} // Dynamic cursor
          onClick={(e) => {
            if (e.features && e.features.length > 0) {
              setSelectedFeature(new SelectedFeature(e.features[0], e.lngLat));
            } else {
              setSelectedFeature(null); // Close on map click
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
            mapRef.current!.getMap().getSource('edges')!.setData(`http://localhost:8000/features/edge?bbox=${bbox.join(',')}&limit=1000`);
            mapRef.current!.getMap().getSource('nodes')!.setData(`http://localhost:8000/features/node?bbox=${bbox.join(',')}&limit=1000`);
          }}
          attributionControl={false}
        >
          <NavigationControl />
          <Source id="pps" type="vector" url={`pmtiles://https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/pp.pmtiles`} promoteId={{'features': 'id'}} />
          <Source id="edges" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_edge'}} />
          <Source id="nodes" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_node'}} />
          <Layer id="pps" type="circle" source="pps" source-layer="pps" paint={{"circle-radius": 4, "circle-color": "#ff0000" }} />
          <Layer id="edges" type="line" source="edges" paint={{"line-color": "#0000f0ff", "line-width": 1 }} />
          <Layer id="nodes" type="circle" source="nodes" paint={{"circle-radius": 4, "circle-stroke-color": "#0000f0ff", "circle-stroke-width": 1, 'circle-opacity': 0 }} />
          {selectedFeature  && (
            <Popup 
              key={selectedFeature.feature.id}
              longitude={selectedFeature.lngLat.lng}
              latitude={selectedFeature.lngLat.lat}>
                <div style={{maxWidth: 320}}>
                  <ul style={{paddingLeft: 0, margin: 0, listStyle: 'none'}}>
                    {Object.entries(selectedFeature.feature.properties || {}).map(([k, v]) => (
                      <li key={k} style={{marginBottom: 3}}>
                        <strong>{k}</strong> = {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </li>
                    ))}
                  </ul>
                </div>
            </Popup>)}
            <LayerControl layers={[
              {id: "pps", name: "Positionspunkte"}, 
              {id: "edges", name: "Tlm3d Kanten"},
              {id: "nodes", name: "Tlm3d Knoten"},
              ]}/>
        </Map>
      </main>
    </>
  );
}

export default App;
