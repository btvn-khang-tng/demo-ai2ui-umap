/**
 * Clears the chat transcript.
 *
 * `copilotkit.agents` is the live registry; this app registers a single agent
 * under "default" (see src/server/llm.ts), but the first entry is taken rather
 * than hard-coding that key, so renaming the agent doesn't silently break the
 * button.
 *
 * Deliberately does NOT touch the view store. Clearing the conversation should
 * not wipe the scatter, the displayed genes, or the marker table — you often
 * want to start a fresh line of questioning about the same view. "Reset" in
 * the toolbar is the control that clears the *view*; this one clears the
 * *conversation*. Two different things, two different buttons.
 */
import { useCopilotKit } from "@copilotkit/react-core/v2";

export function ClearChatButton() {
  const { copilotkit } = useCopilotKit();

  const clear = () => {
    const agent =
      copilotkit.getAgent("default") ?? Object.values(copilotkit.agents)[0];
    // setMessages([]) rather than a thread swap: same agent, same tools, just
    // an empty transcript.
    agent?.setMessages([]);
  };

  return (
    <button
      type="button"
      className="clear-chat-button"
      onClick={clear}
      title="Clear the conversation (the plot and panels stay as they are)"
    >
      Clear chat
    </button>
  );
}
