#!/usr/bin/env python3
"""
Bedrock Forge API Server.

This script starts the FastAPI server for Bedrock Forge.
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from forge.api.app import app
from forge.utils.logging import logger
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Bedrock Forge API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8001, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument("--log-level", default="info", help="Log level")

    args = parser.parse_args()

    logger.info(f"Starting Bedrock Forge API server on {args.host}:{args.port}")

    uvicorn.run(
        "forge.api.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level
    )


if __name__ == "__main__":
    main()