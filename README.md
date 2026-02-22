# DE Polymarket Auto-Trader (TypeScript + Node.js)

This repository now has **two runtime modes**:

1. **MCP mode** (tool server over stdio) for orchestration.
2. **Auto-trader mode** (bot loop) that can automatically place buy orders based on MJ predictions and your rules.

## What was missing before

The earlier version only exposed MCP tools. It did **not** run a continuous worker that fetches markets, evaluates, and places orders automatically.

The new `autotrader` runtime fixes that by polling markets and executing the strategy continuously.

## MCP tools exposed

- `fetch_polymarket_markets`
- `build_team_prediction_payload`
- `submit_mj_prediction`
- `evaluate_mj_trade_rules`

## Auto trader behavior

`src/autotrader.ts` performs this flow repeatedly:

1. Fetch active Polymarket markets.
2. Keep only approved markets (by keyword allowlist).
3. Detect market type (team / 1v1).
4. Build MJ payload (captain first, coach fallback model is available in mapper).
5. Call MJ `POST /prediction`.
6. Apply execution rules.
7. Place an order to Destiny Engine `/orders` (or print the order in dry-run mode).

## Run

```bash
npm install
npm run build
```

### Start MCP server

```bash
npm start
```

### Start auto-trader loop

```bash
# safe mode (default) - no real orders
PREDICTION_API_BASE_URL=https://your-mj-api.example.com \
npm run start:bot

# live mode (real orders)
PREDICTION_API_BASE_URL=https://your-mj-api.example.com \
DESTINY_ENGINE_API_BASE_URL=https://your-de-api.example.com \
DRY_RUN=false \
npm run start:bot
```

## Auto-trader env vars

- `PREDICTION_API_BASE_URL` (required)
- `DESTINY_ENGINE_API_BASE_URL` (required if `DRY_RUN=false`)
- `DRY_RUN` (`true` by default)
- `POLLING_SECONDS` (default `30`)
- `MARKET_LIMIT` (default `30`)
- `APPROVED_MARKET_KEYWORDS` (comma-separated allowlist; empty means all)

## Strategy notes

- Avoid selected option < 10 cents.
- For selected option < 40 cents, require prediction edge >= 5%.
- Draw markets: bias to `NO` on losing candidate.
- Exit plan bands encoded from your specification.
- No hedging.
