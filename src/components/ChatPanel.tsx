/**
 * Mounts CopilotKit's chat UI in the fixed-width right column. The provider
 * itself lives in App.tsx (it has to wrap the whole app, not just this
 * panel); this component only renders the chat surface. No LLM tools are
 * registered here — that's Task 14, which will wire `StepCard.tsx` in via
 * `renderToolCalls` on the provider.
 */
import { CopilotChat } from "@copilotkit/react-core/v2";

export function ChatPanel() {
  return (
    <div className="chat-panel">
      <CopilotChat className="chat-panel-chat" />
    </div>
  );
}
