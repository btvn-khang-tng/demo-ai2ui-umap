/**
 * Dataset name, current colour-mode indicator, ramp toggle, and Reset.
 * Reset calls `colorByCluster()` — the same store action a "reset view" LLM
 * tool would call later, so there is exactly one way to get back to cluster
 * colouring.
 */
import { useDatasetStore } from "../state/useDatasetStore";
import { useViewStore } from "../state/useViewStore";

export function Toolbar() {
  const { data } = useDatasetStore();
  const { colorMode, genes, ramp, setRamp, colorByCluster } = useViewStore();

  const modeLabel =
    colorMode === "expression" && genes.length > 0
      ? `Expression: ${genes.map((g) => g.gene).join(", ")}`
      : "Cluster colors";

  return (
    <div className="toolbar">
      <div className="toolbar-dataset">{data?.dataset ?? "single-cell dataset"}</div>
      <div className="toolbar-mode" aria-live="polite">
        {modeLabel}
      </div>
      <div className="toolbar-spacer" />
      <button
        type="button"
        className="toolbar-ramp-toggle"
        onClick={() => setRamp(ramp === "expression" ? "viridis" : "expression")}
        title="Toggle expression colour ramp"
      >
        Ramp: {ramp === "expression" ? "grey → red" : "viridis"}
      </button>
      <button type="button" onClick={colorByCluster}>
        Reset
      </button>
    </div>
  );
}
