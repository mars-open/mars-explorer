# MARS visualization

`yarn install`

`yarn dev`


## Layers mit Duckdb
          <Source id="pp" type="vector" tiles={['http://localhost:8000/tiles/{z}/{x}/{y}.mvt']} promoteId={{'features': 'id'}} />
          <Source id="edges" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_edge'}} />
          <Source id="nodes" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_node'}} />
          <Layer id="pps" type="circle" source="pp" source-layer="features" paint={{"circle-radius": 4, "circle-color": "#ff0000" }} />
          <Layer id="edges" type="line" source="edges" paint={{"line-color": "#0000f0ff", "line-width": 1 }} />
          <Layer id="nodes" type="circle" source="nodes" paint={{"circle-radius": 4, "circle-stroke-color": "#0000f0ff", "circle-stroke-width": 1, 'circle-opacity': 0 }} />
