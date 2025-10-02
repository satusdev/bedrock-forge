#!/bin/bash
source ../.venv/bin/activate
uvicorn forge.api:app --reload
