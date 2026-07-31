import { DatasetProvider } from "./state/useDatasetStore";
import { ViewProvider } from "./state/useViewStore";
import { ScatterView } from "./components/ScatterView";

export default function App() {
  return (
    <DatasetProvider>
      <ViewProvider>
        <div className="app-shell">
          <header className="app-header">
            <h1>single-cell copilot</h1>
          </header>
          <main className="app-main">
            <ScatterView />
          </main>
        </div>
      </ViewProvider>
    </DatasetProvider>
  );
}
