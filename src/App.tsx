import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { DatasetProvider } from "./state/useDatasetStore";
import { ViewProvider, useViewStore } from "./state/useViewStore";
import { ScatterView } from "./components/ScatterView";
import { Toolbar } from "./components/Toolbar";
import { DataRail } from "./components/DataRail";
import { ChatPanel } from "./components/ChatPanel";
import { AgentActivityBar } from "./components/AgentActivityBar";
import { useSingleCellCopilot } from "./hooks/copilot/useSingleCellCopilot";
import "./styles/panels.css";
import "./styles/chat.css";
import "./styles/rail.css";
import "./styles/activity.css";
import "./styles/chart.css";

/**
 * Registers the five LLM tools + the readable. Kept as its own component so
 * the hooks run inside the providers they depend on. Deleting
 * `src/hooks/copilot/` and this component leaves a fully working manual app.
 */
function CopilotTools() {
  useSingleCellCopilot();
  return null;
}

function ErrorBanner() {
  const { error, setError } = useViewStore();
  if (!error) return null;
  return (
    <div className="app-error-banner" role="alert">
      <span>{error}</span>
      <button
        type="button"
        className="app-error-dismiss"
        onClick={() => setError(null)}
      >
        Dismiss
      </button>
    </div>
  );
}

export default function App() {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      <DatasetProvider>
        <ViewProvider>
          <CopilotTools />
          <div className="app-shell">
            <header className="app-header">
              <h1>single-cell copilot</h1>
              <Toolbar />
            </header>
            <main className="app-main">
              <div className="app-main-content">
                <ErrorBanner />
                {/* Three columns, all visible at once: plot · data · chat.
                    The data panels were briefly tabbed, which defeated the
                    point of the app — the agent would fill the marker table
                    while that tab was hidden, so its work was invisible.
                    Everything the agent can change is now on screen while it
                    works. Freeing the legend into an overlay paid for the
                    third column. */}
                <div className="app-body">
                  <div className="app-work-area">
                    <div className="app-scatter-area">
                      <ScatterView />
                    </div>
                    {/* Under the plot, not in the chat — it reports on the
                        app, not the conversation. */}
                    <AgentActivityBar />
                  </div>
                  <div className="app-data-rail">
                    <DataRail />
                  </div>
                  <div className="app-chat-rail">
                    <ChatPanel />
                  </div>
                </div>
              </div>
            </main>
          </div>
        </ViewProvider>
      </DatasetProvider>
    </CopilotKitProvider>
  );
}
