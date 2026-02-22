import { CandidateInput, EventInput } from "./types.js";

export interface GeminiEnrichmentConfig {
  apiKey?: string;
  model: string;
  useSearch: boolean;
}

interface RawPerson {
  name?: string;
  birth_date?: string;
  birth_time?: string | null;
  birth_place?: string;
  birth_country?: string;
  birth_timezone?: string;
  lat?: number;
  lon?: number;
  lat_dir?: string;
  lon_dir?: string;
  gender?: string;
}

interface RawTeam {
  team_name?: string;
  captain?: RawPerson;
  coach?: RawPerson;
}

interface RawEnrichment {
  event_type?: string;
  candidates?: RawTeam[];
  event?: {
    event_name?: string;
    event_date?: string;
    event_time?: string;
    event_location?: string;
    event_timezone?: string;
    event_lat?: number;
    event_lon?: number;
    event_lat_dir?: string;
    event_lon_dir?: string;
  };
}

function toCandidateInput(person: RawPerson | undefined, fallbackName: string): CandidateInput {
  return {
    name: person?.name ?? fallbackName,
    birth_date: person?.birth_date ?? "2000-01-01",
    birth_time: person?.birth_time ?? null,
    birth_place: person?.birth_place ?? "Unknown",
    birth_country: person?.birth_country ?? "Unknown",
    birth_timezone: person?.birth_timezone ?? "UTC",
    lat: Number(person?.lat ?? 0),
    lon: Number(person?.lon ?? 0),
    lat_dir: person?.lat_dir ?? "N",
    lon_dir: person?.lon_dir ?? "E",
    gender: person?.gender ?? "unknown",
  };
}

function toEventInput(raw: RawEnrichment["event"] | undefined, fallbackName: string): EventInput {
  return {
    event_name: raw?.event_name ?? fallbackName,
    event_date: raw?.event_date ?? new Date().toISOString().slice(0, 10),
    event_time: raw?.event_time ?? "00:00:00",
    event_location: raw?.event_location ?? "Unknown",
    event_timezone: raw?.event_timezone ?? "UTC",
    event_lat: Number(raw?.event_lat ?? 0),
    event_lon: Number(raw?.event_lon ?? 0),
    event_lat_dir: raw?.event_lat_dir ?? "N",
    event_lon_dir: raw?.event_lon_dir ?? "E",
  };
}

function extractJsonObject(input: string): RawEnrichment {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response did not contain JSON");
  }

  return JSON.parse(input.slice(start, end + 1)) as RawEnrichment;
}

async function callGemini(config: GeminiEnrichmentConfig, prompt: string): Promise<string> {
  if (!config.apiKey) throw new Error("Missing GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: config.useSearch ? [{ google_search: {} }] : undefined,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
  const first = candidates?.[0];
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const text = parts?.map((p) => String(p.text ?? "")).join("\n").trim();

  if (!text) throw new Error("Gemini response missing text content");
  return text;
}

export async function enrichTeamsEventFromGemini(params: {
  config: GeminiEnrichmentConfig;
  question: string;
  teamA: string;
  teamB: string;
}): Promise<{
  event: EventInput;
  teamA: { teamName: string; captain?: CandidateInput; coach?: CandidateInput };
  teamB: { teamName: string; captain?: CandidateInput; coach?: CandidateInput };
} | null> {
  if (!params.config.apiKey) return null;

  const prompt = `You are a sports data extraction engine. Return JSON only.\n\nGiven this market question: "${params.question}"\n\nFind best current data for teams, captains/coaches, and event metadata (date/time/location/timezone/lat/lon).\n\nSchema:\n{\n  "event_type": "teams",\n  "candidates": [\n    { "team_name": "...", "captain": {...}, "coach": {...} },\n    { "team_name": "...", "captain": {...}, "coach": {...} }\n  ],\n  "event": {\n    "event_name": "...",\n    "event_date": "YYYY-MM-DD",\n    "event_time": "HH:MM:SS",\n    "event_location": "...",\n    "event_timezone": "...",\n    "event_lat": 0,\n    "event_lon": 0,\n    "event_lat_dir": "N|S",\n    "event_lon_dir": "E|W"\n  }\n}`;

  const text = await callGemini(params.config, prompt);
  const parsed = extractJsonObject(text);
  const candidates = parsed.candidates ?? [];

  const teamARaw =
    candidates.find((c) => (c.team_name ?? "").toLowerCase().includes(params.teamA.toLowerCase())) ??
    candidates[0];
  const teamBRaw =
    candidates.find((c) => (c.team_name ?? "").toLowerCase().includes(params.teamB.toLowerCase())) ??
    candidates[1];

  return {
    event: toEventInput(parsed.event, params.question),
    teamA: {
      teamName: teamARaw?.team_name ?? params.teamA,
      captain: toCandidateInput(teamARaw?.captain, params.teamA),
      coach: toCandidateInput(teamARaw?.coach, params.teamA),
    },
    teamB: {
      teamName: teamBRaw?.team_name ?? params.teamB,
      captain: toCandidateInput(teamBRaw?.captain, params.teamB),
      coach: toCandidateInput(teamBRaw?.coach, params.teamB),
    },
  };
}
