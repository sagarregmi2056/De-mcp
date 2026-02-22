import { z } from "zod";
import {
  NormalizedMarket,
  PredictionRequestBody,
  TradingDecision,
  MarketType,
} from "./types.js";

const PolyMarketSchema = z.object({
  id: z.union([z.string(), z.number()]),
  question: z.string().default(""),
  outcomes: z.array(z.string()).optional(),
  outcomePrices: z.array(z.union([z.number(), z.string()])).optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

export async function fetchPolymarketMarkets(limit = 20): Promise<NormalizedMarket[]> {
  const url = new URL("https://gamma-api.polymarket.com/markets");
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

  return json
    .map((item) => {
      const parsed = PolyMarketSchema.safeParse(item);
      if (!parsed.success) {
        return null;
      }

      const outcomePrices = (parsed.data.outcomePrices ?? []).map((v) => Number(v));
      return {
        id: String(parsed.data.id),
        question: parsed.data.question,
        outcomes: parsed.data.outcomes ?? [],
        outcomePrices,
        eventDate: parsed.data.endDate,
      } satisfies NormalizedMarket;
    })
    .filter((v): v is NormalizedMarket => Boolean(v));
}

export function detectMarketType(market: NormalizedMarket): MarketType {
  const q = `${market.question} ${market.outcomes.join(" ")}`.toLowerCase();
  if (q.includes(" vs ") || q.includes(" v ")) {
    return "one_vs_one";
  }

  if (["team", "club", "fc", "united", "city"].some((k) => q.includes(k))) {
    return "team";
  }

  return "unknown";
}

export async function sendPredictionRequest(
  predictionApiBaseUrl: string,
  body: PredictionRequestBody,
): Promise<string> {
  const response = await fetch(`${predictionApiBaseUrl.replace(/\/$/, "")}/prediction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Prediction API request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return typeof result === "string" ? result : JSON.stringify(result);
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
    return {
      shouldTrade: false,
      reason: "Avoid market: selected option is below 10 cents.",
    };
  }

  if (selectedCents < 40 && predictionDiffPct < 5) {
    return {
      shouldTrade: false,
      reason: "Avoid market: <40 cents requires >=5% prediction difference.",
    };
  }

  const side = hasDrawOption ? `NO on losing candidate (selected: ${selectedOption})` : selectedOption;

  let exitPlan = "Hold to resolution";
  if (selectedCents < 40) exitPlan = "Take profit at 80c, stop at 10c";
  else if (selectedCents < 50) exitPlan = "Take profit at 90c, stop at 20c";
  else exitPlan = "Hold to resolution (100c win / 0c loss)";

  return {
    shouldTrade: true,
    side,
    entryCents: selectedCents,
    exitPlan,
    reason: "Meets MJ execution rules. No hedging.",
  };
}
