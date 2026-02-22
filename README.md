# DE Polymarket MCP Server (TypeScript + Node.js)

This project supports:

1. **MCP runtime** (`src/index.ts`) for tool-based orchestration.
2. **Auto-trader runtime** (`src/autotrader.ts`) for continuous buy/sell execution.

## Polymarket integration

- Market ingestion is integrated via Polymarket Gamma API:
  - default base URL: `https://gamma-api.polymarket.com`
  - endpoint used: `GET /markets?active=true&closed=false&limit=N`
- Configure custom base URL with `POLYMARKET_API_BASE_URL`.

## MeroJotis (MJ) prediction integration

- Sends payload to `POST {PREDICTION_API_BASE_URL}/prediction`.
- Parses response using `PersonA.WinPercentage` and `PersonB.WinPercentage` to choose winner and edge.

## Auto buy/sell behavior implemented

Each polling cycle:

1. Fetch active markets from Polymarket.
2. Filter to approved markets (`APPROVED_MARKET_KEYWORDS`).
3. Build prediction payload and call MJ prediction API.
4. Choose side based on your rules:
   - draw market => trade `NO` on losing candidate
   - otherwise trade `YES` on predicted winner
5. Open BUY order on Destiny Engine.
6. Monitor open positions and SELL automatically based on rules:
   - entry < 40c => TP 80c, SL 10c
   - 40c <= entry < 50c => TP 90c, SL 20c
   - entry >= 50c => hold to resolution (no TP/SL sell trigger)

No hedging is used.

## Credentials required

### Required

- `PREDICTION_API_BASE_URL`
  - Your MeroJotis prediction engine base URL.

### Optional (depending on your deployment)

- `PREDICTION_API_KEY`
  - Bearer token for MJ API if auth is enabled.
- `POLYMARKET_API_BASE_URL`
  - Override Polymarket API host (defaults to gamma public API).

### Required for live trading (DRY_RUN=false)

- `DESTINY_ENGINE_API_BASE_URL`
  - Base URL for order placement (`POST /orders`).
- `DESTINY_ENGINE_API_KEY`
  - Bearer token for Destiny Engine auth.

## Environment variables

- `DRY_RUN` (default `true`)
- `POLLING_SECONDS` (default `30`)
- `MARKET_LIMIT` (default `30`)
- `APPROVED_MARKET_KEYWORDS` (comma-separated allowlist)

## Run

```bash
npm install
npm run build
```

### MCP server

```bash
npm start
```

### Auto-trader (paper mode)

```bash
PREDICTION_API_BASE_URL=https://your-mj-api.example.com \
DRY_RUN=true \
npm run start:bot
```

### Auto-trader (live mode)

```bash
PREDICTION_API_BASE_URL=https://your-mj-api.example.com \
PREDICTION_API_KEY=... \
DESTINY_ENGINE_API_BASE_URL=https://your-de-api.example.com \
DESTINY_ENGINE_API_KEY=... \
DRY_RUN=false \
APPROVED_MARKET_KEYWORDS="nfl,super bowl" \
npm run start:bot
```
