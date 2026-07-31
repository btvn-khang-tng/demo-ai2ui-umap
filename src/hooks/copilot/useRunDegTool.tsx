/**
 * `run_deg` — the LLM's entry point into differential expression.
 *
 * Computation happens server-side (`POST /api/run_deg`), but registration is
 * client-side via `useFrontendTool` so the browser sees `TOOL_CALL_*` events
 * and can render a progress card via `StepCard`.
 *
 * The server returns ~100 markers. Only ~10 go back through the transcript
 * (the model re-reads every tool result on every subsequent turn); the full
 * set is written to `useViewStore().lastDeg` for `DegPanel` to render.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { MarkerChart } from "../../components/MarkerChart";
import { useViewStore } from "../../state/useViewStore";
import { runDeg } from "../../lib/api";
import { displayGenes } from "../../lib/geneDisplay";
import type { Marker } from "../../lib/types";

const paramsSchema = z.object({
  group: z
    .string()
    .describe(
      "Exact cell type label from the cluster list, e.g. 'CD4 T cells'. Resolved leniently server-side."
    ),
  topN: z
    .number()
    .optional()
    .describe("Number of markers to compute (server default 100)."),
});

export function useRunDegTool(): void {
  const { setLastDeg, genes, showGenes, setError } = useViewStore();

  useFrontendTool(
    {
      name: "run_deg",
      description:
        "Find marker genes for a cell type versus all other cells (differential expression).",
      parameters: paramsSchema,
      handler: async ({ group, topN }, { signal }) => {
        try {
          const deg = await runDeg(group, topN ?? 100, signal);
          setLastDeg(deg); // full ~100 markers -> DegPanel
          return {
            success: true,
            message: `${deg.markers.length} markers for ${deg.group} (${deg.nCellsGroup} cells vs ${deg.nCellsReference})`,
            warning: deg.warning,
            markers: deg.markers.slice(0, 10), // only ~10 into the transcript
          };
        } catch (e) {
          return {
            success: false,
            message: e instanceof Error ? e.message : String(e),
          };
        }
      },
      /**
       * The agent's answer renders as an interactive chart, not just a status
       * line. `result` arrives as a string, so it is parsed defensively —
       * a malformed or partial result must fall back to the plain card rather
       * than break the transcript.
       *
       * Clicking a bar routes through `displayGenes`, the same fetch-then-
       * store path the manual gene box uses. So the chart the LLM produced is
       * a real control over the app, and it cannot drift from the manual path.
       */
      render: (props) => {
        let markers: Marker[] = [];
        let group = "";
        if (props.status === "complete" && typeof props.result === "string") {
          try {
            const parsed = JSON.parse(props.result);
            if (parsed?.success && Array.isArray(parsed.markers)) {
              markers = parsed.markers;
              group = String(parsed.message ?? "").split(" for ")[1] ?? "";
              group = group.split(" (")[0] ?? "";
            }
          } catch {
            /* fall through to the plain card */
          }
        }

        return (
          <>
            <StepCard {...props} />
            {markers.length > 0 && (
              <MarkerChart
                markers={markers}
                group={group}
                onSelectGene={(gene) =>
                  void displayGenes([gene], genes, { showGenes, setError })
                }
              />
            )}
          </>
        );
      },
    },
    [setLastDeg, genes, showGenes, setError]
  );
}
