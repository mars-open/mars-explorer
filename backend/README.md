# MVT Tile Backend Server 

Using DuckDB to read geoparquet, and FastAPI to serve it as MVT Tiles using DuckDB queries.

`uv venv`

`. .venv/bin/activate`

`uv sync`

`export GEOPARQUET_PATH='~/win-git/mars-pp/data/gld/'`
`uvicorn mvt_server:app --reload --port 8000`