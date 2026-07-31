/**
 * `search_genes` — lets the model check whether a symbol exists (and find
 * the right one) before calling `query_genes`, instead of hallucinating a
 * symbol. Backed by `GET /api/genes?q=`, which never returns the full
 * 13,714-symbol catalog.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { searchGenes } from "../../lib/api";

const paramsSchema = z.object({
  q: z.string().describe("Gene symbol or substring to search for, e.g. 'MS4A' or 'CD3'."),
});

export function useSearchGenesTool(): void {
  useFrontendTool(
    {
      name: "search_genes",
      description:
        "Search the 13,714-gene catalog for symbols matching a query. Use this before query_genes if unsure a symbol exists.",
      parameters: paramsSchema,
      handler: async ({ q }, { signal }) => {
        try {
          const res = await searchGenes(q, signal);
          const top = res.genes.slice(0, 10).map((g) => g.symbol);
          return {
            success: res.genes.length > 0,
            message: res.genes.length
              ? `${res.total}${res.truncated ? "+" : ""} match(es) for "${q}": ${top.join(", ")}`
              : `No gene symbols match "${q}".`,
            genes: top,
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
    []
  );
}
