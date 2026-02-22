import { CandidateInput, EventInput, PredictionRequestBody } from "./types.js";

export interface TeamAstroProfile {
  teamName: string;
  captain?: CandidateInput;
  coach?: CandidateInput;
}

export function buildTeamPredictionPayload(args: {
  eventType: string;
  event: EventInput;
  teamA: TeamAstroProfile;
  teamB: TeamAstroProfile;
}): PredictionRequestBody {
  const resolveCandidate = (team: TeamAstroProfile): CandidateInput => {
    if (team.captain) return team.captain;
    if (team.coach) return team.coach;
    throw new Error(`Missing captain and coach profile for team: ${team.teamName}`);
  };

  return {
    event_type: args.eventType,
    event: args.event,
    candidates: [resolveCandidate(args.teamA), resolveCandidate(args.teamB)],
  };
}
