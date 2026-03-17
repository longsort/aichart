#!/usr/bin/env python3
"""Start the FastAPI trading signal server."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn
from api.server import app

if __name__ == "__main__":
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=False)
