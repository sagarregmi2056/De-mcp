# DE Polymarket Auto-Trader (TypeScript + Node.js)

This branch is ready to run directly.

## Final runtime flow

- Fetch active markets from Polymarket.
- Optionally enrich event/team/captain/coach data with Gemini + web search.
- Send clean payload to Mero Jotis prediction endpoint.
- Apply strategy rules and auto BUY/SELL via Destiny Engine.

## Mero Jotis API integration (updated)

The bot now supports your endpoint/token style directly:

- `PREDICTION_API_URL` (can be full URL, e.g. `https://.../prediction`)
- `PREDICTION_API_TOKEN` (sent as `De-Token` header)

If `PREDICTION_API_URL` is a base URL, `/prediction` is appended automatically.

## Gemini integration

Optional but recommended for better enrichment fields:

- `GEMINI_API_KEY`
- `GEMINI_MODEL_NAME` (default `gemini-2.5-flash`)
- `GEMINI_USE_SEARCH` (default `true`)

## Required credentials

### Minimum
- `PREDICTION_API_URL`

### Live trading (`DRY_RUN=false`)
- `DESTINY_ENGINE_API_BASE_URL`

### Optional
- `PREDICTION_API_TOKEN`
- `DESTINY_ENGINE_API_KEY`
- `POLYMARKET_API_BASE_URL`
- Gemini vars above

## Run

```bash
npm install
npm run build
npm start
```

Controller commands:

```text
start
status
stop
tick
exit
```

## Direct bot mode

```bash
PREDICTION_API_URL=https://de.ideapreneurnepal.com.np/prediction \
PREDICTION_API_TOKEN=your_token \
GEMINI_MODEL_NAME=gemini-2.5-flash \
DRY_RUN=true \
npm run start:bot
```
