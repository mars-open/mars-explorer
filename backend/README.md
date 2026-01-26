# MVT Tile Backend Server

!experimental!

Instead of creating FlatGeobuf- and PMTiles-Files and reading them in the UI, the geometry features can be loaded into DuckDB and served as MVT Tiles and GeoJson.


## Starting the backend

The mvt_server.py script will start DuckDB, read geoparquet files, and use FastAPI to serve it as MVT Tiles using DuckDB queries.

`uv venv`

`. .venv/bin/activate`

`uv sync`

`export GEOPARQUET_PATH='~/git/mars-pp/data/gld/'`
`uvicorn mvt_server:app --reload --port 8000`


## Layer definitions in Maplibre

The following are some sample source/layer definitions to use the MVT-Tiles in Maplibre.

    <Source id="pp" type="vector" tiles={['http://localhost:8000/tiles/{z}/{x}/{y}.mvt']} promoteId={{'features': 'id'}} />
    <Source id="edges" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_edge'}} />
    <Source id="nodes" type="geojson" data={{type: 'FeatureCollection', features: []}} promoteId={{'features': 'uuid_node'}} />
    <Layer id="pps" type="circle" source="pp" source-layer="features" paint={{"circle-radius": 4, "circle-color": "#ff0000" }} />
    <Layer id="edges" type="line" source="edges" paint={{"line-color": "#0000f0ff", "line-width": 1 }} />
    <Layer id="nodes" type="circle" source="nodes" paint={{"circle-radius": 4, "circle-stroke-color": "#0000f0ff", "circle-stroke-width": 1, 'circle-opacity': 0 }} />
