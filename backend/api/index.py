import os
import sys

# Ensure backend root directory is in sys.path for module resolution
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from main import app as fastapi_app

async def app(scope, receive, send):
    """
    ASGI wrapper that normalizes paths from Vercel's routing layer.
    Handles x-matched-path rewrites and strips /api prefix if present.
    """
    if scope.get("type") == "http":
        headers = dict(scope.get("headers", []))
        matched_path = headers.get(b"x-matched-path", b"").decode("utf-8")
        current_path = scope.get("path", "")

        # If Vercel passed the file path instead of requested path, restore it
        if current_path in ["/api/index.py", "/api/index", "/api"]:
            if matched_path:
                scope["path"] = matched_path
            else:
                scope["path"] = "/"
        # If client requested /api/... strip /api prefix so FastAPI routes match
        elif current_path.startswith("/api/"):
            scope["path"] = current_path[4:]

    await fastapi_app(scope, receive, send)
