/**
 * Persistent strip under the scatter reporting what the LLM agent is doing
 * right now — idle, thinking, calling a tool, applying its result, or
 * erroring out. This is app chrome (always mounted, fixed height, never
 * disappears), not a chat bubble: the goal is that a multi-second pause
 * between a user's message and the scatter updating reads as "the agent is
 * working" instead of "the app is stuck".
 *
 * Two event sources are combined:
 *  - `copilotkit.subscribe(...)` (the global bus) for the coarse phase
 *    transitions: `onAgentRunStarted` -> thinking, `onToolExecutionStart` ->
 *    calling, `onToolExecutionEnd` -> applying, `onError` -> error.
 *  - The per-run `agent` instance handed to `onAgentRunStarted` — per its own
 *    doc comment, this is the place to "subscribe to the running instance's
 *    AG-UI events" — for the two signals the global bus doesn't carry: "the
 *    run is truly over" (`onRunFinishedEvent` / `onRunFailed`) and live
 *    reasoning tokens (`onReasoningMessageContentEvent`).
 *
 * Verified against the installed @copilotkit/react-core@1.64.1 +
 * @ag-ui/client packages (see task-15-report.md for the exact type
 * definitions checked): every callback name below exists verbatim in
 * `CopilotKitCoreSubscriber` / `AgentSubscriber`. One correction from the
 * brief's sketch: the global `onError` event is `{ error: Error; code; ...
 * }`, not the error itself — `event.error` is what's rendered here.
 *
 * Acceptance criterion 11 ("always reflects the actual phase") is the reason
 * `applying` is not a dead end: without the agent-level `onRunFinishedEvent`
 * subscription below, a run that calls a tool and then just replies with
 * text (no further tool call) would leave the bar parked on "Applying
 * result" forever. Likewise `onRunFailed` / `onRunErrorEvent` are a second,
 * agent-level path to the same error state the global `onError` sets, so a
 * failed run can never look identical to a quietly-finished one — the known
 * gap this task fixes (a Bad Gateway that only ever reached the console).
 */
import { useEffect, useRef, useState } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";

type Phase =
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

export function AgentActivityBar() {
  const { copilotkit } = useCopilotKit();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reasoning, setReasoning] = useState("");
  // Ref, not state: this per-run subscription is torn down and recreated on
  // every `onAgentRunStarted`, and that bookkeeping must not itself cause a
  // render (only the `setPhase`/`setReasoning` calls inside it should).
  const agentSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    const teardownAgentSub = () => {
      agentSubRef.current?.unsubscribe();
      agentSubRef.current = null;
    };

    const sub = copilotkit.subscribe({
      onAgentRunStarted: (event) => {
        // A new run starting is also the moment any previous error should
        // clear (see file header: "the next successful run clears it").
        setPhase({ kind: "thinking" });
        setReasoning("");
        teardownAgentSub();
        agentSubRef.current = event.agent.subscribe({
          onReasoningMessageContentEvent: ({ reasoningMessageBuffer }) => {
            setReasoning(reasoningMessageBuffer);
          },
          onRunFinishedEvent: () => {
            setPhase({ kind: "idle" });
            setReasoning("");
          },
          onRunFailed: ({ error }) => {
            setPhase({ kind: "error", message: errorMessage(error) });
          },
          onRunErrorEvent: ({ event: runErrorEvent }) => {
            setPhase({ kind: "error", message: runErrorEvent.message });
          },
        });
      },
      onToolExecutionStart: (event) => {
        setPhase({ kind: "calling", tool: event.toolName });
      },
      onToolExecutionEnd: () => {
        setPhase({ kind: "applying" });
      },
      onError: (event) => {
        setPhase({ kind: "error", message: errorMessage(event.error) });
      },
    });

    return () => {
      teardownAgentSub();
      sub.unsubscribe();
    };
  }, [copilotkit]);

  const isBusy = phase.kind === "thinking" || phase.kind === "calling" || phase.kind === "applying";

  let label: string;
  let detail: string | null = null;
  let detailClass = "agent-activity-bar-detail";
  switch (phase.kind) {
    case "idle":
      label = "Ready";
      break;
    case "thinking":
      label = "Thinking";
      detail = reasoning || null;
      break;
    case "calling":
      label = "Calling";
      detail = phase.tool;
      detailClass += " agent-activity-bar-tool";
      break;
    case "applying":
      label = "Applying result";
      break;
    case "error":
      label = "Agent error";
      detail = phase.message;
      break;
  }

  const barClass =
    "agent-activity-bar" +
    (phase.kind === "error" ? " is-error" : "") +
    (phase.kind === "idle" ? " is-idle" : "");

  return (
    <div className={barClass} role="status" aria-live="polite">
      <span className="agent-activity-bar-icon" aria-hidden="true">
        {phase.kind === "error" ? (
          "⚠️"
        ) : isBusy ? (
          <span className="agent-activity-bar-spinner" />
        ) : (
          <span className="agent-activity-bar-dot" />
        )}
      </span>
      <span className="agent-activity-bar-label">{label}</span>
      {detail && <span className={detailClass}>{detail}</span>}
    </div>
  );
}
