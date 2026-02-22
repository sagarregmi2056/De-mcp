import { buildTeamPredictionPayload } from "./mapping.js";
import {
  detectMarketType,
  evaluateDecision,
  fetchPolymarketMarkets,
  sendPredictionRequest,
} from "./services.js";
import { CandidateInput, EventInput, NormalizedMarket } from "./types.js";

interface AutoTraderConfig {
  predictionApiBaseUrl: string;
  destinyEngineApiBaseUrl: string;
  pollingSeconds: number;
  marketLimit: number;
  dryRun: boolean;
  approvedMarketKeywords: string[];
}

interface Position {
  marketId: string;
  side: string;
  entryCents: number;
  openedAt: string;
}

const positions = new Map<string, Position>();

function readConfig(): AutoTraderConfig {
  return {
    predictionApiBaseUrl: process.env.PREDICTION_API_BASE_URL ?? "",
    destinyEngineApiBaseUrl: process.env.DESTINY_ENGINE_API_BASE_URL ?? "",
    pollingSeconds: Number(process.env.POLLING_SECONDS ?? "30"),
    marketLimit: Number(process.env.MARKET_LIMIT ?? "30"),
    dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
    approvedMarketKeywords: (process.env.APPROVED_MARKET_KEYWORDS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  };
}

function isApprovedMarket(market: NormalizedMarket, cfg: AutoTraderConfig): boolean {
  if (cfg.approvedMarketKeywords.length === 0) return true;
  const q = market.question.toLowerCase();
  return cfg.approvedMarketKeywords.some((keyword) => q.includes(keyword));
}

function parseTeams(question: string): [string, string] | null {
  const separators = [" vs ", " v "];
  for (const sep of separators) {
    const index = question.toLowerCase().indexOf(sep);
    if (index > 0) {
      const left = question.slice(0, index).trim();
      const right = question.slice(index + sep.length).split("?")[0].trim();
      if (left && right) return [left, right];
    }
  }
  return null;
}

function fallbackCandidate(name: string): CandidateInput {
  return {
    name,
    birth_date: "2000-01-01",
    birth_time: null,
    birth_place: "Unknown",
    birth_country: "Unknown",
    birth_timezone: "UTC",
    lat: 0,
    lon: 0,
    lat_dir: "N",
    lon_dir: "E",
    gender: "unknown",
  };
}

function fallbackEvent(market: NormalizedMarket): EventInput {
  return {
    event_name: market.question,
    event_date: market.eventDate ?? new Date().toISOString().slice(0, 10),
    event_time: "00:00",
    event_location: "Unknown",
    event_timezone: "UTC",
    event_lat: 0,
    event_lon: 0,
    event_lat_dir: "N",
    event_lon_dir: "E",
  };
}

function extractPredictionPercent(mjResult: string): number {
  const parsed = JSON.parse(mjResult) as unknown;
  if (typeof parsed === "number") return parsed;
  if (typeof parsed === "string") return Number(parsed);
  if (parsed && typeof parsed === "object") {
    const maybe = (parsed as Record<string, unknown>).win_probability;
    if (typeof maybe === "number") return maybe;
    if (typeof maybe === "string") return Number(maybe);
  }
  throw new Error("MJ response missing win_probability");
}

async function placeOrder(cfg: AutoTraderConfig, payload: Record<string, unknown>): Promise<void> {
  if (cfg.dryRun) {
    console.log("[DRY_RUN] order", JSON.stringify(payload));
    return;
  }

  const response = await fetch(`${cfg.destinyEngineApiBaseUrl.replace(/\/$/, "")}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Destiny Engine order failed: ${response.status} ${response.statusText}`);
  }
}

async function handleMarket(market: NormalizedMarket, cfg: AutoTraderConfig): Promise<void> {
  if (!isApprovedMarket(market, cfg)) return;
  if (positions.has(market.id)) return;

  const marketType = detectMarketType(market);
  if (marketType === "unknown") return;

  const teams = parseTeams(market.question);
  if (!teams) return;

  const [teamA, teamB] = teams;
  const requestBody = buildTeamPredictionPayload({
    eventType: marketType,
    event: fallbackEvent(market),
    teamA: { teamName: teamA, captain: fallbackCandidate(teamA) },
    teamB: { teamName: teamB, captain: fallbackCandidate(teamB) },
  });

  const predictionRaw = await sendPredictionRequest(cfg.predictionApiBaseUrl, requestBody);
  const winProbability = extractPredictionPercent(predictionRaw);
  const predictionDiffPct = Math.abs(winProbability - (100 - winProbability));

  const selectedCents = Math.round((market.outcomePrices[0] ?? 0) * 100);
  const hasDrawOption = market.outcomes.some((o) => o.toLowerCase().includes("draw"));

  const decision = evaluateDecision({
    selectedOption: market.outcomes[0] ?? teamA,
    selectedCents,
    hasDrawOption,
    predictionDiffPct,
  });

  if (!decision.shouldTrade || !decision.side || decision.entryCents === undefined) {
    return;
  }

  await placeOrder(cfg, {
    marketId: market.id,
    side: decision.side,
    entryCents: decision.entryCents,
    reason: decision.reason,
  });

  positions.set(market.id, {
    marketId: market.id,
    side: decision.side,
    entryCents: decision.entryCents,
    openedAt: new Date().toISOString(),
  });

  console.log(`[OPEN] ${market.id} ${decision.side} @ ${decision.entryCents}c`);
}

async function tick(cfg: AutoTraderConfig): Promise<void> {
  const markets = await fetchPolymarketMarkets(cfg.marketLimit);
  for (const market of markets) {
    try {
      await handleMarket(market, cfg);
    } catch (error) {
      console.error(`[ERROR] market=${market.id}`, error);
    }
  }
}

async function main(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.predictionApiBaseUrl) {
    throw new Error("PREDICTION_API_BASE_URL is required");
  }
  if (!cfg.destinyEngineApiBaseUrl && !cfg.dryRun) {
    throw new Error("DESTINY_ENGINE_API_BASE_URL is required when DRY_RUN=false");
  }

  console.log("Auto trader started", cfg);
  await tick(cfg);
  setInterval(() => {
    void tick(cfg);
  }, cfg.pollingSeconds * 1000);
}

void main();
