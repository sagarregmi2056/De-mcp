import { loadDotEnv } from "./env.js";
import { buildTeamPredictionPayload } from "./mapping.js";
import {
  detectMarketType,
  evaluateDecision,
  fetchPolymarketMarkets,
  parseMjPredictionResponse,
  sendPredictionRequest,
} from "./services.js";
import { CandidateInput, EventInput, NormalizedMarket } from "./types.js";
import { enrichTeamsEventFromGemini } from "./gemini.js";

export interface AutoTraderConfig {
  predictionApiUrl: string;
  predictionApiToken: string;
  destinyEngineApiBaseUrl: string;
  destinyEngineApiKey: string;
  polymarketApiBaseUrl: string;
  pollingSeconds: number;
  marketLimit: number;
  dryRun: boolean;
  approvedMarketKeywords: string[];
  geminiApiKey: string;
  geminiModel: string;
  geminiUseSearch: boolean;
}

type PositionSide = "YES" | "NO";

interface Position {
  marketId: string;
  optionLabel: string;
  side: PositionSide;
  entryCents: number;
  takeProfitCents: number | null;
  stopLossCents: number | null;
  openedAt: string;
}

interface AutoTraderState {
  running: boolean;
  startedAt: string | null;
  positions: number;
  dryRun: boolean;
}

export function readConfigFromEnv(): AutoTraderConfig {
  return {
    predictionApiUrl: process.env.PREDICTION_API_URL ?? process.env.PREDICTION_API_BASE_URL ?? "",
    predictionApiToken: process.env.PREDICTION_API_TOKEN ?? process.env.PREDICTION_API_KEY ?? "",
    destinyEngineApiBaseUrl: process.env.DESTINY_ENGINE_API_BASE_URL ?? "",
    destinyEngineApiKey: process.env.DESTINY_ENGINE_API_KEY ?? "",
    polymarketApiBaseUrl: process.env.POLYMARKET_API_BASE_URL ?? "https://gamma-api.polymarket.com",
    pollingSeconds: Number(process.env.POLLING_SECONDS ?? "30"),
    marketLimit: Number(process.env.MARKET_LIMIT ?? "30"),
    dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
    approvedMarketKeywords: (process.env.APPROVED_MARKET_KEYWORDS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL_NAME ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    geminiUseSearch: (process.env.GEMINI_USE_SEARCH ?? "true").toLowerCase() !== "false",
  };
}

export function createAutoTrader(config: AutoTraderConfig) {
  const cfg = config;
  const positions = new Map<string, Position>();
  let timer: NodeJS.Timeout | null = null;
  let startedAt: string | null = null;

  function validateConfig(): void {
    if (!cfg.predictionApiUrl) throw new Error("PREDICTION_API_URL (or PREDICTION_API_BASE_URL) is required");
    if (!cfg.destinyEngineApiBaseUrl && !cfg.dryRun) {
      throw new Error("DESTINY_ENGINE_API_BASE_URL is required when DRY_RUN=false");
    }
  }

  function isApprovedMarket(market: NormalizedMarket): boolean {
    if (cfg.approvedMarketKeywords.length === 0) return true;
    const q = market.question.toLowerCase();
    return cfg.approvedMarketKeywords.some((keyword) => q.includes(keyword));
  }

  function parseTeams(question: string): [string, string] | null {
    const normalized = question.replace(/\s+/g, " ");
    const separators = [" vs ", " v "];
    for (const sep of separators) {
      const index = normalized.toLowerCase().indexOf(sep);
      if (index > 0) {
        const left = normalized.slice(0, index).trim();
        const right = normalized.slice(index + sep.length).split("?")[0].trim();
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
      event_time: "00:00:00",
      event_location: market.eventLocation ?? "Unknown",
      event_timezone: "UTC",
      event_lat: 0,
      event_lon: 0,
      event_lat_dir: "N",
      event_lon_dir: "E",
    };
  }

  function findOutcomeIndexByName(outcomes: string[], winnerName: string): number {
    const winner = winnerName.toLowerCase();
    const idx = outcomes.findIndex((o) => winner.includes(o.toLowerCase()) || o.toLowerCase().includes(winner));
    return idx >= 0 ? idx : 0;
  }

  function computeExitTargets(entryCents: number): { tp: number | null; sl: number | null } {
    if (entryCents < 40) return { tp: 80, sl: 10 };
    if (entryCents < 50) return { tp: 90, sl: 20 };
    return { tp: null, sl: null };
  }

  async function placeEngineOrder(payload: Record<string, unknown>): Promise<void> {
    if (cfg.dryRun) {
      console.log("[DRY_RUN] ENGINE_ORDER", JSON.stringify(payload));
      return;
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.destinyEngineApiKey) headers.authorization = `Bearer ${cfg.destinyEngineApiKey}`;

    const response = await fetch(`${cfg.destinyEngineApiBaseUrl.replace(/\/$/, "")}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Destiny Engine order failed: ${response.status} ${response.statusText}`);
  }

  function getCurrentCents(market: NormalizedMarket, optionLabel: string): number {
    const idx = market.outcomes.findIndex((o) => o.toLowerCase() === optionLabel.toLowerCase());
    const raw = idx >= 0 ? market.outcomePrices[idx] : market.outcomePrices[0];
    return Math.round((raw ?? 0) * 100);
  }

  async function maybeClosePosition(market: NormalizedMarket): Promise<void> {
    const position = positions.get(market.id);
    if (!position) return;

    if (position.takeProfitCents === null && position.stopLossCents === null) return;

    const currentCents = getCurrentCents(market, position.optionLabel);
    const hitTp = position.takeProfitCents !== null && currentCents >= position.takeProfitCents;
    const hitSl = position.stopLossCents !== null && currentCents <= position.stopLossCents;

    if (!hitTp && !hitSl) return;

    await placeEngineOrder({
      action: "SELL",
      marketId: position.marketId,
      option: position.optionLabel,
      side: position.side,
      currentCents,
      reason: hitTp ? "TAKE_PROFIT" : "STOP_LOSS",
    });

    positions.delete(market.id);
    console.log(`[CLOSE] market=${market.id} option=${position.optionLabel} cents=${currentCents}`);
  }

  async function maybeOpenPosition(market: NormalizedMarket): Promise<void> {
    if (positions.has(market.id) || !isApprovedMarket(market)) return;

    const marketType = detectMarketType(market);
    if (marketType === "unknown") return;

    const teams = parseTeams(market.question);
    if (!teams) return;

    const [teamA, teamB] = teams;

    const geminiEnrichment = await enrichTeamsEventFromGemini({
      config: {
        apiKey: cfg.geminiApiKey || undefined,
        model: cfg.geminiModel,
        useSearch: cfg.geminiUseSearch,
      },
      question: market.question,
      teamA,
      teamB,
    });

    const payload = buildTeamPredictionPayload({
      eventType: marketType,
      event: geminiEnrichment?.event ?? fallbackEvent(market),
      teamA: geminiEnrichment?.teamA ?? { teamName: teamA, captain: fallbackCandidate(teamA) },
      teamB: geminiEnrichment?.teamB ?? { teamName: teamB, captain: fallbackCandidate(teamB) },
    });

    const mjRaw = await sendPredictionRequest(cfg.predictionApiUrl, payload, cfg.predictionApiToken || undefined);
    const prediction = parseMjPredictionResponse(mjRaw);

    const winnerIndex = findOutcomeIndexByName(market.outcomes, prediction.winnerName);
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const hasDrawOption = market.outcomes.some((o) => o.toLowerCase().includes("draw"));

    const selectedOption = hasDrawOption
      ? market.outcomes[loserIndex] ?? market.outcomes[0] ?? "Unknown"
      : market.outcomes[winnerIndex] ?? market.outcomes[0] ?? "Unknown";

    const selectedCents = Math.round((market.outcomePrices[hasDrawOption ? loserIndex : winnerIndex] ?? 0) * 100);

    const decision = evaluateDecision({
      selectedOption,
      selectedCents,
      hasDrawOption,
      predictionDiffPct: prediction.differencePct,
    });

    if (!decision.shouldTrade || !decision.side || decision.entryCents === undefined) return;

    const side = decision.side.startsWith("NO:") ? "NO" : "YES";
    const { tp, sl } = computeExitTargets(decision.entryCents);

    await placeEngineOrder({
      action: "BUY",
      marketId: market.id,
      option: selectedOption,
      side,
      entryCents: decision.entryCents,
      prediction,
      reason: decision.reason,
    });

    positions.set(market.id, {
      marketId: market.id,
      optionLabel: selectedOption,
      side,
      entryCents: decision.entryCents,
      takeProfitCents: tp,
      stopLossCents: sl,
      openedAt: new Date().toISOString(),
    });

    console.log(`[OPEN] market=${market.id} side=${side} option=${selectedOption} entry=${decision.entryCents}`);
  }

  async function tick(): Promise<void> {
    const markets = await fetchPolymarketMarkets({ limit: cfg.marketLimit, baseUrl: cfg.polymarketApiBaseUrl });
    for (const market of markets) {
      try {
        await maybeClosePosition(market);
        await maybeOpenPosition(market);
      } catch (error) {
        console.error(`[ERROR] market=${market.id}`, error);
      }
    }
  }

  async function start(): Promise<AutoTraderState> {
    if (timer) return getStatus();
    validateConfig();
    startedAt = new Date().toISOString();
    await tick();
    timer = setInterval(() => {
      void tick();
    }, cfg.pollingSeconds * 1000);
    return getStatus();
  }

  function stop(): AutoTraderState {
    if (timer) clearInterval(timer);
    timer = null;
    return getStatus();
  }

  function getStatus(): AutoTraderState {
    return {
      running: Boolean(timer),
      startedAt,
      positions: positions.size,
      dryRun: cfg.dryRun,
    };
  }

  return { start, stop, getStatus, tick };
}

loadDotEnv();

async function main(): Promise<void> {
  const trader = createAutoTrader(readConfigFromEnv());
  console.log("Auto trader starting...");
  const status = await trader.start();
  console.log("Auto trader started", status);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
