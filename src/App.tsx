import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { DatasetProvider } from "./state/useDatasetStore";
import { ViewProvider, useViewStore } from "./state/useViewStore";
import { ScatterView } from "./components/ScatterView";
import { GenePanel } from "./components/GenePanel";
import { DegPanel } from "./components/DegPanel";
import { Toolbar } from "./components/Toolbar";
import { ChatPanel } from "./components/ChatPanel";
import { useSingleCellCopilot } from "./hooks/copilot/useSingleCellCopilot";
import "./styles/panels.css";
import "./styles/chat.css";

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
                <div className="app-body">
                  {/* Scatter on top, gene + marker panels in a drawer beneath.
                      Previously both panels were a fixed 320px side column and
                      the legend another 220px; with the 420px chat rail that
                      left the plot under half the window. Stacking them gives
                      the scatter the full working width, which suits a
                      landscape UMAP better than a narrow portrait strip. */}
                  <div className="app-work-area">
                    <div className="app-scatter-area">
                      <ScatterView />
                    </div>
                    <div className="app-drawer">
                      <GenePanel />
                      <DegPanel />
                    </div>
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
