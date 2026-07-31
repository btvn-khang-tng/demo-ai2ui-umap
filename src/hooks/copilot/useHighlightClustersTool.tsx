/**
 * `highlight_clusters` — the pure-UI tool. NO network request: it only
 * calls `setHighlight`, client state that dims every cluster not named here
 * to ~15% opacity (see `DIMMED_OPACITY`). Cluster labels are resolved
 * leniently (case/whitespace-insensitive exact match, falling back to
 * substring match against every cluster label so e.g. "monocytes" picks up
 * both "CD14+ Monocytes" and "FCGR3A+ Monocytes"); anything left unmatched
 * is reported back in the message instead of silently dropped.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { useViewStore } from "../../state/useViewStore";
import { useDatasetStore } from "../../state/useDatasetStore";

const paramsSchema = z.object({
  clusters: z
    .array(z.string())
    .describe(
      "Cluster labels to highlight; every other cluster dims. Pass an empty array to clear highlighting."
    ),
});

function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function useHighlightClustersTool(): void {
  const { setHighlight } = useViewStore();
  const { data } = useDatasetStore();
  const available = data?.clusters ?? [];

  useFrontendTool(
    {
      name: "highlight_clusters",
      description:
        "Highlight one or more clusters on the scatter plot by dimming everything else. Pure client-side state, no network request.",
      parameters: paramsSchema,
      handler: async ({ clusters: requested }) => {
        try {
          if (requested.length === 0) {
            setHighlight(null);
            return {
              success: true,
              message: "Highlight cleared; all clusters at full opacity.",
            };
          }

          const resolved = new Set<string>();
          const unmatched: string[] = [];

          for (const name of requested) {
            const target = normalize(name);
            const exact = available.find((c) => normalize(c.label) === target);
            if (exact) {
              resolved.add(exact.label);
              continue;
            }
            const partial = available.filter((c) =>
              normalize(c.label).includes(target)
            );
            if (partial.length > 0) {
              partial.forEach((c) => resolved.add(c.label));
            } else {
              unmatched.push(name);
            }
          }

          if (resolved.size === 0) {
            const validLabels = available.map((c) => c.label).join(", ");
            return {
              success: false,
              message: `No cluster labels matched: ${unmatched.join(", ")}. Valid labels: ${validLabels}`,
            };
          }

          const clusters = Array.from(resolved);
          setHighlight(clusters);
          return {
            success: true,
            message: `Highlighted ${clusters.join(", ")}${unmatched.length ? `. Unmatched: ${unmatched.join(", ")}` : ""}`,
            clusters,
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
    [setHighlight, available]
  );
}
