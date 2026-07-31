/**
 * The agent's current phase, plus a way to stop it.
 *
 * Extracted from `AgentActivityBar` because two surfaces now need the same
 * answer: the bar under the plot, and the inline status line in the chat.
 * One subscription shape, one label vocabulary — if these drifted apart the
 * app would be telling the user two different things about the same run.
 *
 * Callback names verified against the installed @copilotkit/react-core and
 * @ag-ui/client type definitions. Note `onError`'s payload is `{error, code,
 * context}`, not the error itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";

export type Phase =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "calling"; tool: string }
  | { kind: "applying" }
  | { kind: "error"; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error) return error;
  return "The agent hit an error.";
}

/** Human-readable label for a phase. Shared so the bar and the chat agree. */
export function phaseLabel(phase: Phase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready";
    case "thinking":
      return "Thinking";
    case "calling":
      return `Calling ${phase.tool}`;
    case "applying":
      return "Applying result";
    case "error":
      return "Agent error";
  }
}

export function useAgentPhase() {
  const { copilotkit } = useCopilotKit();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reasoning, setReasoning] = useState("");
  // Refs, not state: this per-run bookkeeping must not itself cause a render.
  const agentSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const activeAgentRef = useRef<{ abortRun?: () => void } | null>(null);

  useEffect(() => {
    const teardownAgentSub = () => {
      agentSubRef.current?.unsubscribe();
      agentSubRef.current = null;
    };

    const sub = copilotkit.subscribe({
      onAgentRunStarted: (event: any) => {
        // A new run starting is also when any previous error clears.
        setPhase({ kind: "thinking" });
        setReasoning("");
        activeAgentRef.current = event.agent;
        teardownAgentSub();
        agentSubRef.current = event.agent.subscribe({
          onReasoningMessageContentEvent: ({ reasoningMessageBuffer }: any) => {
            setReasoning(reasoningMessageBuffer);
          },
          onRunFinishedEvent: () => {
            setPhase({ kind: "idle" });
            setReasoning("");
          },
          onRunFailed: ({ error }: any) => {
            setPhase({ kind: "error", message: errorMessage(error) });
          },
          onRunErrorEvent: ({ event: runErrorEvent }: any) => {
            setPhase({ kind: "error", message: runErrorEvent.message });
          },
        });
      },
      onToolExecutionStart: (event: any) => {
        setPhase({ kind: "calling", tool: event.toolName });
      },
      onToolExecutionEnd: () => {
        setPhase({ kind: "applying" });
      },
      onError: (event: any) => {
        setPhase({ kind: "error", message: errorMessage(event.error) });
      },
    });

    return () => {
      teardownAgentSub();
      sub.unsubscribe();
    };
  }, [copilotkit]);

  const stop = useCallback(() => {
    const agent = activeAgentRef.current;
    if (!agent) return;
    (copilotkit as any).stopAgent({ agent });
    // Don't wait for an event to land us back at idle — the point of Stop is
    // immediate feedback.
    setPhase({ kind: "idle" });
    setReasoning("");
  }, [copilotkit]);

  const isBusy =
    phase.kind === "thinking" ||
    phase.kind === "calling" ||
    phase.kind === "applying";

  return { phase, reasoning, isBusy, stop, label: phaseLabel(phase) };
}
