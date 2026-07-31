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
import { FULL_MARKER_COUNT, TRANSCRIPT_MARKERS } from "../../lib/constants";
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
    .describe(
      "How many markers to REPORT back to you in the result. This does not " +
        "limit what the user sees — the marker table always fills with the " +
        "full ranked list regardless. Omit unless the user asked for a " +
        "specific number."
    ),
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
          // ⚠️ Always compute the FULL list, whatever `topN` the model chose.
          // It used to pass topN straight through, so "what's the top marker
          // in B cells?" made the model request topN=1 — and the marker table
          // the user is looking at filled with exactly one row. The panel is
          // the user's view, not the model's; its contents should not shrink
          // because of how the question was phrased.
          const deg = await runDeg(group, FULL_MARKER_COUNT, signal);
          setLastDeg(deg); // full ranked list -> DegPanel + chart

          // The transcript gets a bounded slice — the model re-reads every
          // tool result on every later turn, so 100 rows x 6 fields would be
          // ~3k tokens of dead weight per turn. Never fewer than 10, so the
          // in-chat chart stays worth drawing even if the model asked for 1.
          const reportCount = Math.min(
            Math.max(topN ?? TRANSCRIPT_MARKERS, TRANSCRIPT_MARKERS),
            25
          );

          return {
            success: true,
            message: `${deg.markers.length} markers for ${deg.group} (${deg.nCellsGroup} cells vs ${deg.nCellsReference}). The full ranked table is on screen; the top ${reportCount} are below.`,
            warning: deg.warning,
            markers: deg.markers.slice(0, reportCount),
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
