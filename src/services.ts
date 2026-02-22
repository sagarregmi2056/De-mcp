import { z } from "zod";
import {
  NormalizedMarket,
  PredictionRequestBody,
  TradingDecision,
  MarketType,
  PredictionOutcome,
} from "./types.js";

const PolyMarketSchema = z.object({
  id: z.union([z.string(), z.number()]),
  question: z.string().default(""),
  outcomes: z.array(z.string()).optional(),
  outcomePrices: z.array(z.union([z.number(), z.string()])).optional(),
  endDate: z.string().optional(),
});

interface FetchPolymarketOptions {
  limit?: number;
  baseUrl?: string;
}

export async function fetchPolymarketMarkets(options: FetchPolymarketOptions = {}): Promise<NormalizedMarket[]> {
  const { limit = 20, baseUrl = "https://gamma-api.polymarket.com" } = options;
  const url = new URL("/markets", baseUrl);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Polymarket request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error("Unexpected Polymarket response format");
  }

  const markets: NormalizedMarket[] = [];

  for (const item of json) {
    const parsed = PolyMarketSchema.safeParse(item);
    if (!parsed.success) continue;

    const outcomePrices = (parsed.data.outcomePrices ?? []).map((v) => Number(v));
    markets.push({
      id: String(parsed.data.id),
      question: parsed.data.question,
      outcomes: parsed.data.outcomes ?? [],
      outcomePrices,
      eventDate: parsed.data.endDate,
    });
  }

  return markets;
}

export function detectMarketType(market: NormalizedMarket): MarketType {
  const q = `${market.question} ${market.outcomes.join(" ")}`.toLowerCase();
  if (q.includes(" vs ") || q.includes(" v ")) return "one_vs_one";
  if (["team", "club", "fc", "united", "city"].some((k) => q.includes(k))) return "team";
  return "unknown";
}

export async function sendPredictionRequest(
  predictionApiUrl: string,
  body: PredictionRequestBody,
  apiToken?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiToken) headers["De-Token"] = apiToken;

  const url = predictionApiUrl.includes("/prediction")
    ? predictionApiUrl
    : `${predictionApiUrl.replace(/\/$/, "")}/prediction`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Prediction API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function parseMjPredictionResponse(result: unknown): PredictionOutcome {
  const object = result as Record<string, unknown>;
  const a = object.PersonA as Record<string, unknown> | undefined;
  const b = object.PersonB as Record<string, unknown> | undefined;

  const aName = String(a?.Name ?? "A");
  const bName = String(b?.Name ?? "B");
  const aWin = Number(a?.WinPercentage ?? Number.NaN);
  const bWin = Number(b?.WinPercentage ?? Number.NaN);

  if (!Number.isFinite(aWin) || !Number.isFinite(bWin)) {
    throw new Error("MJ response missing PersonA/PersonB WinPercentage fields");
  }

  if (aWin >= bWin) {
    return {
      winnerName: aName,
      winnerProbability: aWin,
      loserName: bName,
      loserProbability: bWin,
      differencePct: aWin - bWin,
    };
  }

  return {
    winnerName: bName,
    winnerProbability: bWin,
    loserName: aName,
    loserProbability: aWin,
    differencePct: bWin - aWin,
  };
}

interface DecisionInput {
  selectedOption: string;
  selectedCents: number;
  hasDrawOption: boolean;
  predictionDiffPct: number;
}

export function evaluateDecision(input: DecisionInput): TradingDecision {
  const { selectedOption, selectedCents, hasDrawOption, predictionDiffPct } = input;

  if (selectedCents < 10) {
    return { shouldTrade: false, reason: "Avoid market: selected option is below 10 cents." };
  }

  if (selectedCents < 40 && predictionDiffPct < 5) {
    return {
      shouldTrade: false,
      reason: "Avoid market: <40 cents requires >=5% prediction difference.",
    };
  }

  const side = hasDrawOption ? `NO:${selectedOption}` : `YES:${selectedOption}`;

  let exitPlan = "HOLD_TO_RESOLUTION";
  if (selectedCents < 40) exitPlan = "TP:80|SL:10";
  else if (selectedCents < 50) exitPlan = "TP:90|SL:20";
  else exitPlan = "HOLD_TO_RESOLUTION";

  return {
    shouldTrade: true,
    side,
    entryCents: selectedCents,
    exitPlan,
    reason: "Meets MJ execution rules. No hedging.",
  };
}
