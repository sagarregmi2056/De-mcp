# DE Polymarket MCP Server (TypeScript + Node.js)

MCP server for **Destiny Engine (DE)** workflow:

1. Fetch sports markets from Polymarket.
2. Identify market type (`team`, `one_vs_one`, `unknown`).
3. Build the payload needed by MJ (Mero Jyotis) prediction API.
4. Submit payload to `POST /prediction`.
5. Apply MJ trading rules to decide entry/exit behavior.

## Tools exposed

- `fetch_polymarket_markets`
  - Input: `limit`
  - Output: active markets + detected market type

- `build_team_prediction_payload`
  - Builds `/prediction` payload for team events
  - Uses **captain info**, and falls back to **coach info** when captain data is missing

- `submit_mj_prediction`
  - Input: `predictionApiBaseUrl`, `payload`
  - Calls `POST {baseUrl}/prediction`

- `evaluate_mj_trade_rules`
  - Encodes the rules you listed:
    - avoid <10c
    - <40c needs >=5% edge
    - draw markets bias to `NO` on losing candidate
    - exit plan thresholds at 80c/90c/resolve and 10c/20c/resolve
    - no hedging

## Run

```bash
npm install
npm run build
npm start
```

For local dev:

```bash
npm run dev
```

## Notes

- `submit_mj_prediction` expects the same schema shape you provided for `/prediction`.
- Dates/times and geolocation fields should be provided pre-normalized by your upstream market mapper.
