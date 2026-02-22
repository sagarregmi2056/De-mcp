export type MarketType = "team" | "one_vs_one" | "unknown";

export interface CandidateInput {
  name: string;
  birth_date: string;
  birth_time?: string | null;
  birth_place: string;
  birth_country: string;
  birth_timezone: string;
  lat: number;
  lon: number;
  lat_dir: string;
  lon_dir: string;
  gender: string;
}

export interface EventInput {
  event_name: string;
  event_date: string;
  event_time: string;
  event_location: string;
  event_timezone: string;
  event_lat: number;
  event_lon: number;
  event_lat_dir: string;
  event_lon_dir: string;
}

export interface PredictionRequestBody {
  event_type: string;
  candidates: CandidateInput[];
  event: EventInput;
}

export interface NormalizedMarket {
  id: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  eventDate?: string;
  eventLocation?: string;
}

export interface TradingDecision {
  shouldTrade: boolean;
  side?: string;
  entryCents?: number;
  exitPlan?: string;
  reason: string;
}

export interface PredictionOutcome {
  winnerName: string;
  winnerProbability: number;
  loserName: string;
  loserProbability: number;
  differencePct: number;
}
