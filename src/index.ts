import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  detectMarketType,
  evaluateDecision,
  fetchPolymarketMarkets,
  parseMjPredictionResponse,
  sendPredictionRequest,
} from "./services.js";
import { PredictionRequestBody } from "./types.js";
import { buildTeamPredictionPayload } from "./mapping.js";
import { createAutoTrader, readConfigFromEnv } from "./autotrader.js";

const server = new McpServer({ name: "de-polymarket-mcp", version: "0.3.0" });
const trader = createAutoTrader(readConfigFromEnv());

server.registerTool(
  "fetch_polymarket_markets",
  {
    title: "Fetch Polymarket Sports Markets",
    description: "Fetch active markets from Polymarket and tag them for Destiny Engine flow.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20),
      polymarketApiBaseUrl: z.string().url().default("https://gamma-api.polymarket.com"),
    },
  },
  async ({ limit, polymarketApiBaseUrl }) => {
    const markets = await fetchPolymarketMarkets({ limit, baseUrl: polymarketApiBaseUrl });
    const tagged = markets.map((m) => ({ ...m, marketType: detectMarketType(m) }));
    return { content: [{ type: "text", text: JSON.stringify(tagged, null, 2) }] };
  },
);

server.registerTool(
  "submit_mj_prediction",
  {
    title: "Submit MJ Prediction Request",
    description: "Send normalized payload to MJ prediction API and parse PersonA/PersonB winner.",
    inputSchema: {
      predictionApiBaseUrl: z.string().url(),
      predictionApiKey: z.string().optional(),
      payload: z.custom<PredictionRequestBody>(),
    },
  },
  async ({ predictionApiBaseUrl, predictionApiKey, payload }) => {
    const raw = await sendPredictionRequest(predictionApiBaseUrl, payload, predictionApiKey);
    const parsed = parseMjPredictionResponse(raw);
    return { content: [{ type: "text", text: JSON.stringify({ raw, parsed }, null, 2) }] };
  },
);

server.registerTool(
  "evaluate_mj_trade_rules",
  {
    title: "Evaluate MJ Execution Rules",
    description: "Apply the MJ trading rules to decide entry side and exit plan.",
    inputSchema: {
      selectedOption: z.string(),
      selectedCents: z.number().min(0).max(100),
      hasDrawOption: z.boolean().default(false),
      predictionDiffPct: z.number().min(0).max(100),
    },
  },
  async (input) => ({ content: [{ type: "text", text: JSON.stringify(evaluateDecision(input), null, 2) }] }),
);

server.registerTool(
  "build_team_prediction_payload",
  {
    title: "Build Team Payload with Captain/Coach Fallback",
    description: "Build MJ /prediction payload for team markets.",
    inputSchema: {
      eventType: z.string(),
      event: z.object({
        event_name: z.string(),
        event_date: z.string(),
        event_time: z.string(),
        event_location: z.string(),
        event_timezone: z.string(),
        event_lat: z.number(),
        event_lon: z.number(),
        event_lat_dir: z.string(),
        event_lon_dir: z.string(),
      }),
      teamA: z.object({ teamName: z.string(), captain: z.any().optional(), coach: z.any().optional() }),
      teamB: z.object({ teamName: z.string(), captain: z.any().optional(), coach: z.any().optional() }),
    },
  },
  async ({ eventType, event, teamA, teamB }) => {
    const payload = buildTeamPredictionPayload({ eventType, event, teamA, teamB });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.registerTool(
  "start_auto_trader",
  {
    title: "Start Auto Trader",
    description: "Starts continuous market polling and auto trading loop.",
    inputSchema: {},
  },
  async () => {
    const status = await trader.start();
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  },
);

server.registerTool(
  "stop_auto_trader",
  {
    title: "Stop Auto Trader",
    description: "Stops the running auto trader loop.",
    inputSchema: {},
  },
  async () => {
    const status = trader.stop();
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  },
);

server.registerTool(
  "get_auto_trader_status",
  {
    title: "Get Auto Trader Status",
    description: "Returns whether bot is running and current in-memory position count.",
    inputSchema: {},
  },
  async () => {
    const status = trader.getStatus();
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
