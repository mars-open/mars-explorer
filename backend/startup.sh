#!/bin/bash

. .venv/bin/activate

export GEOPARQUET_PATH='~/win-git/mars-pp/data/gld/'

uvicorn mvt_server:app --reload --port 8000