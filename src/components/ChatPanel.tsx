/**
 * Mounts CopilotKit's chat UI in the right column, with a live status line
 * pinned above the composer.
 *
 * The status also appears in `AgentActivityBar` under the plot, and that is
 * deliberate rather than redundant: while you are reading the transcript your
 * eyes are here, not on the far side of the window. Both read the same
 * `useAgentPhase` hook, so they cannot disagree.
 */
import { CopilotChat } from "@copilotkit/react-core/v2";
import { useAgentPhase } from "../hooks/useAgentPhase";

function ChatStatusLine() {
  const { phase, reasoning, isBusy, stop, label } = useAgentPhase();

  // Idle is the resting state — a permanent "Ready" line next to the composer
  // would just be furniture.
  if (phase.kind === "idle") return null;

  return (
    <div
      className={`chat-status${phase.kind === "error" ? " is-error" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="chat-status-icon" aria-hidden="true">
        {phase.kind === "error" ? "⚠️" : <span className="chat-status-dot" />}
      </span>
      <span className="chat-status-label">{label}</span>
      {/* Live reasoning, truncated by CSS — a hint that thinking is happening,
          not a second transcript. The full text is in the collapsible
          "Thought for N seconds" panel CopilotKit already renders. */}
      {phase.kind === "thinking" && reasoning && (
        <span className="chat-status-detail">{reasoning}</span>
      )}
      {phase.kind === "error" && (
        <span className="chat-status-detail">{phase.message}</span>
      )}
      {isBusy && (
        <button type="button" className="chat-status-stop" onClick={stop}>
          Stop
        </button>
      )}
    </div>
  );
}

export function ChatPanel() {
  return (
    <div className="chat-panel">
      <CopilotChat className="chat-panel-chat" />
      <ChatStatusLine />
    </div>
  );
}
