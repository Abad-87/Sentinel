# Entrypoint for running the FastAPI application from project root
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')

for p in [BASE_DIR, BACKEND_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.main import (
    app,
    UserInput,
    predict,
    health_check,
    get_visuals_metadata,
    regenerate_visuals_from_data,
    analyze_batch_upload,
    get_recommendations
)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
