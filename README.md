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


## Where to place credentials

Create a `.env` file in the project root (same level as `package.json`).

1. Copy the template:

```bash
cp .env.example .env
```

2. Put your real values in `.env`:

```env
PREDICTION_API_URL=https://de.ideapreneurnepal.com.np/prediction
PREDICTION_API_TOKEN=your_real_token
GEMINI_MODEL_NAME=gemini-2.5-flash
# optional
GEMINI_API_KEY=...
```

`npm start` and `npm run start:bot` now auto-load `.env`.

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


## MCP Inspector fix (ENOENT: mcp-server-everything)

That error means the command `mcp-server-everything` was not found in PATH.
This repo now includes a local binary + MCP stdio server.

### Use with MCP Inspector

1. Build first:

```bash
npm install
npm run build
```

2. In Inspector, set:
- **command**: `mcp-server-everything`
- **args**: *(empty)*

Or use direct Node command:
- **command**: `node`
- **args**: `dist/mcp-server.js`

If you pass `dist/index.js`, that starts CLI mode (not MCP protocol), so Inspector will fail.

## Direct bot mode

```bash
PREDICTION_API_URL=https://de.ideapreneurnepal.com.np/prediction \
PREDICTION_API_TOKEN=your_token \
GEMINI_MODEL_NAME=gemini-2.5-flash \
DRY_RUN=true \
npm run start:bot
```
