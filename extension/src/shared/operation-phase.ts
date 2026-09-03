export type OperationPhase = "idle" | "recording" | "transcribing" | "refining" | "clarifying" | "inserted" | "error" | "permission-needed" | "complete";

const rank: Record<OperationPhase, number> = { idle: 0, recording: 1, transcribing: 2, refining: 3, clarifying: 4, inserted: 5, error: 5, "permission-needed": 5, complete: 6 };

export function shouldIgnoreState(current: OperationPhase, incoming: OperationPhase): boolean {
  if (incoming === "recording" && rank[current] > rank.recording) return true;
  if (incoming === "transcribing" && rank[current] >= rank.refining) return true;
  if (incoming === "refining" && rank[current] >= rank.clarifying) return true;
  return false;
}

export function acceptsEngineProgress(phase: OperationPhase): boolean { return phase === "recording" || phase === "transcribing"; }
