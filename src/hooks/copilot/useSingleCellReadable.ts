/**
 * The one piece of context the model always sees, re-serialized on every one
 * of the ~8 requests a full solve produces — so it MUST stay small.
 * Labelled "GROUND TRUTH" so the model re-reads this instead of trusting
 * stale conversation memory about what's currently on screen.
 *
 * Deliberately excludes the 13,714-gene catalog and any expression vector —
 * that's what `search_genes` and `query_genes` are for.
 */
import { useCopilotReadable } from "@copilotkit/react-core";
import { useViewStore } from "../../state/useViewStore";
import { useDatasetStore } from "../../state/useDatasetStore";

export function useSingleCellReadable(): void {
  const { data } = useDatasetStore();
  const { colorMode, genes, lastDeg, highlighted } = useViewStore();

  const clusters = data?.clusters ?? [];
  const displayedGenes = genes.map((g) => ({
    gene: g.gene,
    min: g.min,
    max: g.max,
    pctExpressing: g.pctExpressing,
  }));
  const lastDegSummary = lastDeg
    ? {
        group: lastDeg.group,
        topMarkers: lastDeg.markers.slice(0, 10).map((m) => m.gene),
      }
    : null;

  useCopilotReadable(
    {
      description:
        "GROUND TRUTH — the current state of the single-cell viewer. Always trust this over conversation memory.",
      value: {
        dataset: "pbmc3k — 2,638 human PBMCs, log1p-normalized",
        nCells: data?.nCells ?? null,
        nGenes: data?.nGenes ?? null,
        clusters: clusters.map((c) => ({ label: c.label, nCells: c.nCells })),
        colorMode,
        displayedGenes,
        lastDeg: lastDegSummary,
        highlightedClusters: highlighted,
        note: "13,714 genes available. Use search_genes to check a symbol before querying it — do not guess.",
      },
    },
    [data, colorMode, genes, lastDeg, highlighted]
  );
}
