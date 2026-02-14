from fastapi import FastAPI, Response, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import duckdb
import os
import io
import json
from typing import Optional
from typing import Optional, List
from pydantic import BaseModel

app = FastAPI(title="GeoParquet MVT Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
# Get directory from command line (1st arg after script name)
GEOPARQUET_PATH = os.getenv("GEOPARQUET_PATH", "data/gld")
TILE_EXTENT = 4096
TILE_SIZE = 256

con = duckdb.connect()
con.execute("""
INSTALL spatial;
LOAD spatial;
INSTALL geography FROM community;
LOAD geography;
""")
print("loading data")
con.sql(
f"""
CREATE TABLE pp AS
    SELECT 
      ST_transform(geometry, 'EPSG:2056', 'EPSG:3857') geometry,
      id_positionpoint, token, zoom::INTEGER zoom,
      uuid_edge, position, direction::INTEGER direction,
      radius, grade, azimuth
    FROM read_parquet('{GEOPARQUET_PATH}/pp_tlm3d/*.parquet');
CREATE TABLE edge AS
    SELECT 
      ST_transform(geometry, 'EPSG:2056', 'EPSG:3857') geometry, 
      uuid_edge, uuid_node_from, uuid_node_to, tags
    FROM read_parquet('{GEOPARQUET_PATH}/edge/*.parquet');
CREATE TABLE node AS
    SELECT 
      ST_transform(geometry, 'EPSG:2056', 'EPSG:3857') geometry, 
      uuid_node, arity, tags,
      switch_type.tpe as switch_type, switch_type.sub_tpe as switch_subtype, switch_type.radius as switch_radius,
      filter(edges, lambda e : e.main_edge)[0].uuid_edge as uuid_edge_main
    FROM read_parquet('{GEOPARQUET_PATH}/node/*.parquet');    
"""
)
print("creating index")
con.sql("""
CREATE INDEX pp_geom_idx ON pp USING RTREE (geometry);
CREATE INDEX pp_zoom_idx ON pp (zoom);
CREATE INDEX edge_geom_idx ON edge USING RTREE (geometry);
CREATE INDEX node_geom_idx ON node USING RTREE (geometry);
""")
print("ready")

@app.get("/tiles/{z}/{x}/{y}.mvt")
async def get_mvt_tile(z: int, x: int, y: int, layer: Optional[str] = None):
    """Serve MVT tile from GeoParquet for zoom/x/y"""
    
    tile_env = f"ST_Extent(ST_TileEnvelope({z}, {x}, {y}))"
    maxZoom = 3
    if z <= 14:
        return Response(status_code=204)  # No content
    elif z <= 17:
        maxZoom = 1
    elif z <= 20:
        maxZoom = 2

    #ST_AsMVTGeom(geometry, ST_Extent(ST_Envelope(geometry)), {TILE_EXTENT}, {TILE_SIZE}, true)
    query = f"""
    SELECT ST_AsMVT(mvt_tile, 'features')
    FROM (
        SELECT 
            ST_AsMVTGeom(ST_ReducePrecision(geometry,0.001), {tile_env}, {TILE_EXTENT}, {TILE_SIZE}, true) geom,
            id_positionpoint, token, zoom,
            uuid_edge, position, direction,
            radius, grade, azimuth
        FROM pp
        WHERE ST_Intersects(geometry, {tile_env})
        AND zoom <= {maxZoom}
    ) AS mvt_tile
    """
    
    result = con.execute(query).fetchone()
    
    if result and result[0]:
        return StreamingResponse(
            io.BytesIO(result[0]), 
            media_type="application/vnd.mapbox-vector-tile",
            headers={"Content-Type": "application/vnd.mapbox-vector-tile", 
                    "Access-Control-Allow-Origin": "*"}
        )
    
    return Response(status_code=204)  # No content

class BBox(BaseModel):
    minx: float
    miny: float
    maxx: float
    maxy: float

@app.get("/features/{table_name}", response_model=dict)
async def get_features(
    table_name: str, # pp, edge, node
    bbox: Optional[str] = Query(None),  # "minx,miny,maxx,maxy"
    limit: int = Query(1000, ge=1, le=10000),
    properties: Optional[List[str]] = Query(None)
):
    """Serve features as GeoJSON FeatureCollection bbox filter"""
    
    # Build bbox geometry for spatial filter
    bbox_sql = ""
    if bbox:
        minx, miny, maxx, maxy = map(float, bbox.split(","))
        bbox_geom = f"ST_MakeBox2D(ST_Point({minx}, {miny}), ST_Point({maxx}, {maxy}))"
        bbox_sql = f"WHERE ST_Intersects(geometry, ST_Transform({bbox_geom}, 'EPSG:4326', 'EPSG:3857', xy_order := true))"
    
    # Select properties
    # transform stored geometries (EPSG:3857) back to EPSG:4326 (lon/lat), as this is GeoJson standard
    geom = f"ST_AsGeoJSON(ST_Transform(ST_ReducePrecision(ST_Force2D(geometry), 0.001), 'EPSG:3857', 'EPSG:4326', xy_order := true)) as geometry"
    tags = f"array_to_string(tags, ',') as tags"
    prop_sql = f"* exclude (geometry, tags), {tags}, {geom}" if not properties else ", ".join(properties + [geom])
    
    # Execute spatial query
    sql = f"""
    SELECT {prop_sql}
    FROM {table_name}
    {bbox_sql}
    LIMIT {limit}
    """

    df = con.execute(sql).fetch_df()
    print(df.size)
    features = []
    for _, row in df.iterrows():
        props = row.to_dict()
        geom = json.loads(props.pop("geometry"))
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": props,
        })
    
    return {
        "type": "FeatureCollection",
        "features": features
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "geoparquet": os.path.exists(GEOPARQUET_PATH)}
