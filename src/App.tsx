import { DatasetProvider } from "./state/useDatasetStore";
import { ViewProvider, useViewStore } from "./state/useViewStore";
import { ScatterView } from "./components/ScatterView";
import { GenePanel } from "./components/GenePanel";
import { DegPanel } from "./components/DegPanel";
import { Toolbar } from "./components/Toolbar";
import "./styles/panels.css";

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
    <DatasetProvider>
      <ViewProvider>
        <div className="app-shell">
          <header className="app-header">
            <h1>single-cell copilot</h1>
            <Toolbar />
          </header>
          <main className="app-main">
            <div className="app-main-content">
              <ErrorBanner />
              <div className="app-body">
                <div className="app-scatter-area">
                  <ScatterView />
                </div>
                <div className="app-side-rail">
                  <GenePanel />
                  <DegPanel />
                </div>
              </div>
            </div>
          </main>
        </div>
      </ViewProvider>
    </DatasetProvider>
  );
}
