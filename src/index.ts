import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  detectMarketType,
  evaluateDecision,
  fetchPolymarketMarkets,
  sendPredictionRequest,
} from "./services.js";
import { PredictionRequestBody } from "./types.js";
import { buildTeamPredictionPayload } from "./mapping.js";

const server = new McpServer({
  name: "de-polymarket-mcp",
  version: "0.1.0",
});

server.registerTool(
  "fetch_polymarket_markets",
  {
    title: "Fetch Polymarket Sports Markets",
    description: "Fetch active markets from Polymarket and tag them for Destiny Engine flow.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
  },
  async ({ limit }) => {
    const markets = await fetchPolymarketMarkets(limit);
    const tagged = markets.map((m) => ({ ...m, marketType: detectMarketType(m) }));

    return {
      content: [{ type: "text", text: JSON.stringify(tagged, null, 2) }],
    };
  },
);

server.registerTool(
  "submit_mj_prediction",
  {
    title: "Submit MJ Prediction Request",
    description:
      "Send normalized team/1v1 market payload to MJ (Mero Jyotis) prediction API /prediction endpoint.",
    inputSchema: {
      predictionApiBaseUrl: z.string().url(),
      payload: z.custom<PredictionRequestBody>(),
    },
  },
  async ({ predictionApiBaseUrl, payload }) => {
    const result = await sendPredictionRequest(predictionApiBaseUrl, payload);
    return {
      content: [{ type: "text", text: result }],
    };
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
  async (input) => {
    const decision = evaluateDecision(input);
    return {
      content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
    };
  },
);


server.registerTool(
  "build_team_prediction_payload",
  {
    title: "Build Team Payload with Captain/Coach Fallback",
    description:
      "Build MJ /prediction payload for team markets. Uses captain data, falls back to coach when captain is unavailable.",
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
      teamA: z.object({
        teamName: z.string(),
        captain: z.any().optional(),
        coach: z.any().optional(),
      }),
      teamB: z.object({
        teamName: z.string(),
        captain: z.any().optional(),
        coach: z.any().optional(),
      }),
    },
  },
  async ({ eventType, event, teamA, teamB }) => {
    const payload = buildTeamPredictionPayload({ eventType, event, teamA, teamB });
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
