import { AttributionControl, Map, MapGeoJSONFeature, MapRef, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { useEffect, useRef, useState } from "react";
import { LayerControl } from "./LayerControl";
import { TagsFilter } from "./TagsFilter";
import { CoordinatesDisplay } from "./CoordinatesDisplay";
import { SelectedFeaturesPanel, SelectedFeature } from "./SelectedFeaturesPanel";
import { BoxSelect } from "./BoxSelect";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import * as flatgeobuf from "flatgeobuf";
import { simplify } from "@turf/simplify";

// constants
const ppsZoomLevels = [15, 18, 21].sort((a,b) => b - a).reverse();
const ppsZoomLevelMin = Math.min(...ppsZoomLevels);

const collapseAttributionControl = (map: maplibregl.Map) => {
  const container = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
  if (!container || !container.classList.contains("maplibregl-compact")) return;
  container.classList.remove("maplibregl-compact-show");
  container.removeAttribute("open");
};

const defaultViewState = {
  latitude: 46.95061,
  longitude: 7.43885,
  zoom: 15,
  pitch: 0,
  bearing: 0
};

const parseHashViewState = () => {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const [lng, lat, zoom] = hash.split('/').map(Number);
  if ([lng, lat, zoom].some(value => Number.isNaN(value))) return null;
  return { latitude: lat, longitude: lng, zoom };
};

const formatHash = (lng: number, lat: number, zoom: number) => {
  return `#${lng.toFixed(5)}/${lat.toFixed(5)}/${zoom.toFixed(2)}`;
};


function App() {

  const [selectedFeatures, setSelectedFeatures] = useState<SelectedFeature[]>([]);
  const [expandedFeature, setExpandedFeature] = useState<SelectedFeature | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<MapGeoJSONFeature|null>();
  const [boxSelectActive, setBoxSelectActive] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const prevExpandedFeatureRef = useRef<SelectedFeature | null>(null);

  // Helper function to get feature identifier for setFeatureState/removeFeatureState
  const getFeatureIdentifier = (map: maplibregl.Map, layerId: string | undefined, featureId: string | number) => {
    if (!layerId) return null;
    const layer = map.getLayer(layerId)!;
    const sourceId = layer.source as string;
    const source = map.getSource(sourceId);
    // Vector tile sources need sourceLayer, GeoJSON sources don't
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceLayer = source?.type === 'vector' ? (layer as any).sourceLayer : undefined;    
    return { source: sourceId, sourceLayer, id: featureId };
  };

  // Update feature state when selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    // Set selected state for new selections
    selectedFeatures.forEach(sf => {
      const identifier = getFeatureIdentifier(map, sf.feature.layer?.id, sf.feature.id!);
      if (identifier) {
        map.setFeatureState(identifier, { selected: true });
      }
    });

    // Cleanup: remove feature state when component unmounts or selection changes
    return () => {
      selectedFeatures.forEach(sf => {
        const identifier = getFeatureIdentifier(map, sf.feature.layer?.id, sf.feature.id!);
        if (identifier) {
          map.removeFeatureState(identifier);
        }
      });
    };
  }, [selectedFeatures]);

  // Update feature state when expanded feature changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    // Clear previous expanded feature state
    if (prevExpandedFeatureRef.current) {
      const identifier = getFeatureIdentifier(
        map, 
        prevExpandedFeatureRef.current.feature.layer?.id, 
        prevExpandedFeatureRef.current.feature.id!
      );
      if (identifier) {
        map.setFeatureState(identifier, { expanded: false });
      }
    }

    // Set expanded state for the currently expanded feature
    if (expandedFeature) {
      const identifier = getFeatureIdentifier(map, expandedFeature.feature.layer?.id, expandedFeature.feature.id!);
      if (identifier) {
        map.setFeatureState(identifier, { expanded: true });
      }
    }

    // Update ref to current expanded feature
    prevExpandedFeatureRef.current = expandedFeature;
  }, [expandedFeature]);

  // traffimage, swisstopo or custom... 
  //const mapStyle = "https://maps.geops.io/styles/base_bright_v2_ch.sbb.netzkarte/style.json?key=5cc87b12d7c5370001c1d655352830d2fef24680ae3a1cda54418cb8"
  //const mapStyle = "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"
  const mapStyle = "lightbasemap_v1190_reduced.json"
  // Editor: https://maplibre.org/maputnik

  async function loadFlatGeobufGeoJSON(url: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const features = [];
    for await (const feature of flatgeobuf.geojson.deserialize(new Uint8Array(arrayBuffer))) {
      // parse tags property into array
      if (feature.properties?.tags && typeof feature.properties.tags === 'string' && feature.properties.tags.startsWith('["')) {
        try {
          feature.properties.tags = JSON.parse(feature.properties.tags);
        } catch {
          // Ignore JSON parse errors
        }
      }
      features.push(feature);
    }
    return {
      type: 'FeatureCollection' as const,
      features: features
    };
  }

  function initMap(map: maplibregl.Map) {
    console.log("initMap");    

    // Register PMTiles protocol
    const pmtProtocol = new pmtiles.Protocol({ errorOnMissingTile: true });
    maplibregl.addProtocol('pmtiles', pmtProtocol.tile);
    // mapterhorn terrain: delegetes to different pmtiles files based on zoom
    maplibregl.addProtocol('mapterhorn', async (params, abortController) => {
        const [z, x, y] = params.url.replace('mapterhorn://', '').split('/').map(Number);
        const name = z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
        const url = `pmtiles://https://download.mapterhorn.com/${name}.pmtiles/${z}/${x}/${y}.webp`;
        const response = await pmtProtocol.tile({ ...params, url }, abortController);
        if (response['data'] === null) throw new Error(`mapterhorn tile z=${z} x=${x} y=${y} not found.`);
        return response;
    });    
    // pps: delegates to pmtiles only for defined zoom levels 15, 18, 21. Other layers are displayed via explicit overzooming.
    maplibregl.addProtocol('pps', async (params, abortController) => {
      const [z, x, y] = params.url.replace('pps://', '').split('/').map(Number);
      if (z < ppsZoomLevelMin) return { data: new Uint8Array(0) }; // No tiles below min zoom
      if (ppsZoomLevels.includes(z)) {
        const url = `pmtiles://https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/pp.pmtiles/${z}/${x}/${y}.mvt`;
        try {
          const response = await pmtProtocol.tile({ ...params, url }, abortController);
          return response;
        } catch (error) {
          if (error instanceof Error && error.message == "Tile not found.") {
            throw Error("PPS Tile not found");
          } else throw error;
        }
      } else {
        throw Error("PPS Tile overzoom");
      }
    });

    if (map) {

      collapseAttributionControl(map);

      // terrain source (always add source, but terrain/hillshade controlled by state)
      map.addSource('pmt-3d', {
        type: 'raster-dem', tiles: ['mapterhorn://{z}/{x}/{y}'], encoding: 'terrarium', tileSize: 512, attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
      });

      // pps  
      map.addSource('pps', {
        type: 'vector', promoteId: 'token', minzoom: ppsZoomLevelMin,
        tiles: ['pps://{z}/{x}/{y}']
      });
      map.addLayer({id: 'pps', type: 'circle', source: 'pps', 'source-layer': 'pps', minzoom: ppsZoomLevelMin, paint: {
        "circle-radius": 4, "circle-stroke-width": 0,
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "expanded"], false], "#ffff00",
          ["boolean", ["feature-state", "selected"], false], "#ff8800",
          "#ff0000"
        ]
      }});
      // Suppress ONLY overzoom errors (clean console)
      const oldError = console.error;
      console.error = (...args) => {
        if (args[0].message == 'PPS Tile overzoom' || args[0].message == 'PPS Tile not found') return;
        oldError.apply(console, args);
      };

      // edges
      console.log("Loading edges");      
      loadFlatGeobufGeoJSON('https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/edges.fgb')
        .then(geojson => {

          // Create multiple simplified versions for high zoom level
          const edgesZoom7 = simplify({
            type: 'FeatureCollection' as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            features: geojson.features.filter((f: any) => f.properties?.tags?.includes("achse_dkm") && !f.properties?.tags?.includes("Tram") && !f.properties?.tags?.includes("standseilbahn"))
          }, {tolerance: 0.005, highQuality: false});
          const edgesZoomDetail = geojson; // No simplification at high zoom
          
          map.addSource('edges-fgb', {type: 'geojson', data: (edgesZoomDetail), promoteId: 'uuid_edge'});
          map.addLayer({id: 'edges', type: 'line', source: 'edges-fgb', minzoom: 10, 
            paint: {
              "line-color": [
                "case",
                ["boolean", ["feature-state", "expanded"], false], "#ffff00",
                ["boolean", ["feature-state", "selected"], false], "#ff8800",
                "#0000f0ff"
              ],
              "line-width": [
                "case",
                ["boolean", ["feature-state", "expanded"], false], 2,
                ["boolean", ["feature-state", "selected"], false], 2,
                1
              ],
            }         
          }, "pps");

          map.addSource('edges-reduced', {type: 'geojson', data: (edgesZoom7), promoteId: 'uuid_edge'});
          map.addLayer({id: 'edges-reduced', type: 'line', source: 'edges-reduced', maxzoom: 10, 
            paint: {
              "line-color": "rgb(100, 100, 100)",
              "line-width": 1,
              "line-blur": 0.5,
              "line-opacity": 0.7
            }         
          });        
        })
        .catch(error => console.error("Error loading edges:", error));

      // nodes  
      console.log("Loading nodes");      
      loadFlatGeobufGeoJSON('https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/nodes.fgb')
        .then(geojson => {
          map.addSource('nodes-fgb', {type: 'geojson', data: geojson, promoteId: 'uuid_node'});
          map.addLayer({id: 'nodes', type: 'circle', source: 'nodes-fgb', minzoom: 15, paint: {
            "circle-radius": 4, 'circle-opacity': 0,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "expanded"], false], "#ffff00",
              ["boolean", ["feature-state", "selected"], false], "#ff8800",
              "#0000f0ff"
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "expanded"], false], 2,
              ["boolean", ["feature-state", "selected"], false], 2,
              1
            ]
          }});
        })
        .catch(error => console.error("Error loading nodes:", error));

      setMapReady(true);
    }
  };

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const updateHashFromMap = () => {
      const center = map.getCenter();
      const hash = formatHash(center.lng, center.lat, map.getZoom());
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
    };

    const onMoveEnd = () => updateHashFromMap();
    const onHashChange = () => {
      const hashView = parseHashViewState();
      if (hashView) {
        map.jumpTo({ center: [hashView.longitude, hashView.latitude], zoom: hashView.zoom });
      }
    };

    map.on('moveend', onMoveEnd);
    window.addEventListener('hashchange', onHashChange);
    updateHashFromMap();
  }, [mapReady]);

  const initialViewState = parseHashViewState() ?? defaultViewState;

  return (
    <>
      <main>
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          mapStyle={mapStyle}
          minZoom={7}
          interactiveLayerIds={["pps","edges","nodes"]}
          cursor={hoveredFeature ? 'pointer' : 'default'} // Dynamic cursor
          onLoad={(e) => initMap(e.target)}
          attributionControl={false}
          onClick={(e) => {
            // Don't handle click if box select just completed
            if (boxSelectActive) {
              setBoxSelectActive(false);
              return;
            }
            
            if (e.features && e.features.length > 0) {
              // Deduplicate by feature ID
              const uniqueFeatures = Array.from(new globalThis.Map(
                e.features.map(f => [f.id, f])
              ).values());
              const newFeatures = uniqueFeatures.map(f => new SelectedFeature(f, e.lngLat));
              setSelectedFeatures(newFeatures);
              console.log(`Features selected (${newFeatures.length}):`, newFeatures.map(sf => sf.feature.id));
            } else {
              setSelectedFeatures([]);
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
        >
          <NavigationControl visualizePitch={true} visualizeRoll={true} showCompass={true} showZoom={true} />
          <BoxSelect 
            interactiveLayerIds={["pps", "edges", "nodes"]}
            onSelect={(features, center) => {
              if (features.length > 0) {
                const newFeatures = features.map(f => new SelectedFeature(f, center));
                setSelectedFeatures(newFeatures);
                setBoxSelectActive(true);
                console.log(`Features selected via box (${newFeatures.length})`);
              }
            }}
          />
          <SelectedFeaturesPanel 
            selectedFeatures={selectedFeatures} 
            onExpandedChange={setExpandedFeature}
          />
          <LayerControl layers={[
              {id: "pps", name: "Positionspunkte"}, 
              {id: "edges", name: "Tlm3d Kanten"},
              {id: "nodes", name: "Tlm3d Knoten"},
            ]}
          />
          <TagsFilter layerIds={["pps", "edges", "nodes"]} possibleTags={['Normalspur', 'Schmalspur', 'Tram']} position="top-right"/>
          <CoordinatesDisplay />
          <AttributionControl position="top-right" compact={true} />
        </Map>
      </main>
    </>
  );
}

export default App;
