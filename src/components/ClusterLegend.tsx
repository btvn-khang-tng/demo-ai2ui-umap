/**
 * Cluster mode legend: swatch + label + cell count per cluster.
 *
 * Clicking an entry calls `setHighlight` — the SAME store action the LLM's
 * `highlight_clusters` tool will call later (Task 14+). There is no separate
 * "UI highlight" path; if there were, the manual click and the agent tool
 * could disagree about what's highlighted.
 */
import type { ClusterInfo } from "../lib/types";
import { clusterColor } from "../lib/colors";

export interface ClusterLegendProps {
  clusters: ClusterInfo[];
  highlighted: string[] | null;
  setHighlight: (c: string[] | null) => void;
}

export function ClusterLegend({ clusters, highlighted, setHighlight }: ClusterLegendProps) {
  const handleClick = (label: string) => {
    const isSoleHighlight = !!highlighted && highlighted.length === 1 && highlighted[0] === label;
    setHighlight(isSoleHighlight ? null : [label]);
  };

  return (
    <ul className="cluster-legend" aria-label="Cluster legend">
      {clusters.map((c) => {
        const [r, g, b] = clusterColor(c.id);
        const dimmed = !!highlighted && !highlighted.includes(c.label);
        return (
          <li key={c.id}>
            <button
              type="button"
              className={`cluster-legend-entry${dimmed ? " is-dimmed" : ""}`}
              onClick={() => handleClick(c.label)}
              aria-pressed={!!highlighted?.includes(c.label)}
            >
              <span
                className="cluster-legend-swatch"
                style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                aria-hidden="true"
              />
              <span className="cluster-legend-label">{c.label}</span>
              <span className="cluster-legend-count">{c.nCells.toLocaleString("en-US")}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
