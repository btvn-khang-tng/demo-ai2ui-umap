/**
 * `query_genes` — puts gene expression on screen.
 *
 * MUST go through `displayGenes` (src/lib/geneDisplay.ts), the single
 * fetch-then-store path shared with the manual gene box (`GenePanel`) and
 * the DEG table (`DegPanel`). It owns the 4-gene cap, the merge-with-existing
 * logic, and the notFound handling — reimplementing `queryGenes` + `showGenes`
 * here would let the agent path drift from the manual path.
 *
 * `displayGenes` talks to the store via a `{showGenes, setError}` target and
 * returns `void`, so to build a useful tool result for the transcript this
 * wraps those two callbacks: they still do the real store writes (so
 * behaviour is byte-for-byte identical to the manual path) but also stash
 * the values locally so the handler can report what happened.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { useViewStore } from "../../state/useViewStore";
import { displayGenes } from "../../lib/geneDisplay";
import type { GeneVector } from "../../lib/types";

const paramsSchema = z.object({
  genes: z
    .array(z.string())
    .min(1)
    .describe(
      "Up to 4 HGNC gene symbols to display, e.g. ['CD3D', 'MS4A1']. Use search_genes first if unsure a symbol exists."
    ),
});

export function useQueryGenesTool(): void {
  const { genes, showGenes, setError } = useViewStore();

  useFrontendTool(
    {
      name: "query_genes",
      description:
        "Show gene expression on the scatter plot for up to 4 gene symbols (switches colour mode to expression).",
      parameters: paramsSchema,
      handler: async ({ genes: requested }, { signal }) => {
        try {
          let shown: GeneVector[] | null = null;
          let errorMsg: string | null = null;

          await displayGenes(
            requested,
            genes,
            {
              showGenes: (g) => {
                shown = g;
                showGenes(g);
              },
              setError: (e) => {
                errorMsg = e;
                setError(e);
              },
            },
            signal
          );

          // Cap rejected the whole request before/after merge: showGenes was
          // never called, errorMsg carries the cap message verbatim.
          if (!shown) {
            return {
              success: false,
              message:
                errorMsg ??
                "Request was cancelled before any genes could be shown.",
            };
          }

          const requestedUpper = new Set(
            requested
              .map((s) => s.trim().toUpperCase())
              .filter((s) => s.length > 0)
          );
          const shownList = shown as GeneVector[];
          const found = shownList.filter((g) =>
            requestedUpper.has(g.gene.toUpperCase())
          );
          const shownUpper = new Set(
            shownList.map((g) => g.gene.toUpperCase())
          );
          const notFound = [...requestedUpper].filter(
            (u) => !shownUpper.has(u)
          );

          return {
            success: found.length > 0,
            message: found.length
              ? `${found
                  .map(
                    (r) =>
                      `${r.gene} — ${r.values.length} values, range ${r.min.toFixed(2)}–${r.max.toFixed(2)}`
                  )
                  .join("; ")}${notFound.length ? `. Not found: ${notFound.join(", ")}` : ""}`
              : `None of these symbols exist: ${notFound.join(", ")}. Use search_genes to find the right symbol.`,
            notFound,
          };
        } catch (e) {
          return {
            success: false,
            message: e instanceof Error ? e.message : String(e),
          };
        }
      },
      render: (props) => <StepCard {...props} />,
    },
    [genes, showGenes, setError]
  );
}
