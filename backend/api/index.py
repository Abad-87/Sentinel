import os
import sys

# Ensure backend root directory is in sys.path for module resolution
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from main import app as fastapi_app


async def app(scope, receive, send):
    """
    ASGI wrapper for Vercel's routing layer.
    Vercel may hand the function its own file path (/api/index.py);
    restore the original requested path from the x-matched-path header
    in that case.

    Request paths are otherwise passed through UNCHANGED: every FastAPI
    route (including the /api/auth/* router prefix) already carries its
    own /api prefix, so stripping it here previously turned all /api/*
    requests into HTTP 404 responses on deployment.
    """
    if scope.get("type") == "http":
        headers = dict(scope.get("headers", []))
        matched_path = headers.get(b"x-matched-path", b"").decode("utf-8")
        current_path = scope.get("path", "")

        # If Vercel passed the function file path instead of the requested
        # path, restore the original URL so FastAPI routes can match.
        if current_path in ["/api/index.py", "/api/index"]:
            if matched_path:
                scope["path"] = matched_path
            else:
                scope["path"] = "/"

    await fastapi_app(scope, receive, send)
