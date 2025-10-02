# Internal API Usage

## Running the API

```bash
bash scripts/run_api.sh
```

Or manually:

```bash
source .venv/bin/activate
uvicorn forge.api:app --reload
```

## Endpoints

- `GET /health`  
  Returns: `{"status": "ok"}`

## Testing

After running the API, test with:

```bash
curl http://127.0.0.1:8000/health
```

You should see:

```json
{ "status": "ok" }
```
