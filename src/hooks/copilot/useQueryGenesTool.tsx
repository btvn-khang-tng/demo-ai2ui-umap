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
import { MAX_GENES } from "../../lib/constants";

/**
 * ⚠️ Deliberately NOT capped in the schema. It used to say "up to 4", which
 * made the model quietly truncate a 10-gene request to 4 and say nothing —
 * the user asked for ten genes and got four with no explanation. Now the
 * model passes everything the user asked for and the handler reports exactly
 * what was shown and what was left out. Silent truncation is worse than a
 * limit, because the user cannot tell it happened.
 */
const paramsSchema = z.object({
  genes: z
    .array(z.string())
    .min(1)
    .describe(
      "Every HGNC gene symbol the user asked for, e.g. ['CD3D', 'MS4A1'] — " +
        "do NOT pre-truncate this list. The scatter can only draw a few at " +
        "once; if there are too many the tool shows the first ones and tells " +
        "you which were omitted, so you can relay that to the user. Use " +
        "search_genes first if unsure a symbol exists."
    ),
});

export function useQueryGenesTool(): void {
  const { genes, showGenes, setError } = useViewStore();

  useFrontendTool(
    {
      name: "query_genes",
      description:
        "Show gene expression on the scatter plot (switches colour mode to " +
        "expression). Pass every gene the user named — the tool will draw as " +
        "many as fit and tell you which it could not, so relay that instead " +
        "of shortening the list yourself.",
      parameters: paramsSchema,
      handler: async ({ genes: requested }, { signal }) => {
        try {
          let shown: GeneVector[] | null = null;
          let errorMsg: string | null = null;

          // Over-cap handling lives here, not in `displayGenes`: the manual
          // gene box adds one chip at a time, where "reject, you're at the
          // limit" is the right answer. An agent asked for ten genes means
          // "show me these", so take the first MAX_GENES as a fresh set
          // rather than refusing outright — and report the omission.
          const cleaned = requested
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          const overCap = cleaned.length > MAX_GENES;
          const toShow = overCap ? cleaned.slice(0, MAX_GENES) : cleaned;
          const omitted = overCap ? cleaned.slice(MAX_GENES) : [];
          // A request at or over the cap replaces what's on screen; merging
          // would silently drop part of what the user just asked for.
          const baseline = overCap ? [] : genes;

          await displayGenes(
            toShow,
            baseline,
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
            toShow.map((s) => s.toUpperCase())
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

          // Say the quiet part out loud: if the request was trimmed, that
          // fact leads the message so the model relays it instead of
          // reporting a clean success for a partial job.
          const capNote = overCap
            ? `Only ${MAX_GENES} genes can be drawn at once (one scatter panel each), so ${omitted.length} of the ${cleaned.length} you asked for were not shown: ${omitted.join(", ")}. `
            : "";

          return {
            success: found.length > 0,
            truncated: overCap,
            omitted,
            message: found.length
              ? `${capNote}${found
                  .map(
                    (r) =>
                      `${r.gene} — ${r.values.length} values, range ${r.min.toFixed(2)}–${r.max.toFixed(2)}`
                  )
                  .join("; ")}${notFound.length ? `. Not found: ${notFound.join(", ")}` : ""}`
              : `${capNote}None of these symbols exist: ${notFound.join(", ")}. Use search_genes to find the right symbol.`,
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
