import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { DatasetProvider } from "./state/useDatasetStore";
import { ViewProvider, useViewStore } from "./state/useViewStore";
import { ScatterView } from "./components/ScatterView";
import { Toolbar } from "./components/Toolbar";
import { RightRail } from "./components/RightRail";
import { AgentActivityBar } from "./components/AgentActivityBar";
import { useSingleCellCopilot } from "./hooks/copilot/useSingleCellCopilot";
import "./styles/panels.css";
import "./styles/chat.css";
import "./styles/rail.css";
import "./styles/activity.css";

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
                {/* Plot left, everything else in one tabbed rail right.
                    The gene box and marker table were briefly a bottom drawer;
                    horizontally split reads better for a wide plot, and the
                    rail lets each panel use the full column height instead of
                    three things fighting over one. */}
                <div className="app-body">
                  <div className="app-work-area">
                    <div className="app-scatter-area">
                      <ScatterView />
                    </div>
                    {/* Under the plot, not in the chat — it reports on the
                        app, not the conversation. */}
                    <AgentActivityBar />
                  </div>
                  <div className="app-chat-rail">
                    <RightRail />
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
