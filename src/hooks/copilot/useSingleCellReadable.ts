/**
 * The one piece of context the model always sees, re-serialized on every
 * request a solve produces — so it must stay lean. Labelled "GROUND TRUTH"
 * so the model re-reads this instead of trusting stale conversation memory
 * about what is currently on screen.
 *
 * What is deliberately IN here: everything a user can point at and say "that".
 * If you can see it on screen, the model must be able to answer a question
 * about it without calling a tool — which colour a cluster is, whether a gene
 * is in the marker list, what is dimmed, which ramp is active.
 *
 * What is deliberately OUT: the 13,714-gene catalog and any expression
 * vector. Those are what `search_genes` and `query_genes` are for. Marker
 * *symbols* are cheap (~100 short strings); marker *rows* are not (100 × 6
 * fields is ~3k tokens re-read every turn), so only the top 10 carry stats.
 */
import { useCopilotReadable } from "@copilotkit/react-core";
import { useViewStore } from "../../state/useViewStore";
import { useDatasetStore } from "../../state/useDatasetStore";
import { clusterColor } from "../../lib/colors";
import { MAX_GENES } from "../../lib/constants";

const hex = (rgb: [number, number, number]) =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

/** Plain-language names so the model can say "the blue cluster", not "#0072b2". */
const COLOR_NAMES = [
  "blue",
  "orange",
  "green",
  "vermillion",
  "pink",
  "sky blue",
  "yellow",
  "brown",
  "magenta",
  "violet",
  "olive",
  "sage",
];

export function useSingleCellReadable(): void {
  const { data } = useDatasetStore();
  const { colorMode, genes, lastDeg, highlighted, ramp } = useViewStore();

  const clusters = data?.clusters ?? [];

  // Cluster identity + the colour it is actually drawn in, so "what colour are
  // the B cells?" and "highlight the orange one" both work without a tool call.
  const clusterRows = clusters.map((c) => ({
    label: c.label,
    nCells: c.nCells,
    color: hex(clusterColor(c.id)),
    colorName: COLOR_NAMES[c.id % COLOR_NAMES.length],
    dimmed: highlighted ? !highlighted.includes(c.label) : false,
  }));

  const displayedGenes = genes.map((g) => ({
    gene: g.gene,
    min: g.min,
    max: g.max,
    pctExpressing: g.pctExpressing,
  }));

  const lastDegSummary = lastDeg
    ? {
        group: lastDeg.group,
        reference: lastDeg.reference,
        nCellsGroup: lastDeg.nCellsGroup,
        totalMarkers: lastDeg.markers.length,
        warning: lastDeg.warning,
        // Full symbol list: needed to answer "is GZMB in the marker list?"
        // without re-running DEG. Symbols only — stats stay on the top 10.
        allMarkerGenes: lastDeg.markers.map((m) => m.gene),
        top10: lastDeg.markers.slice(0, 10).map((m) => ({
          gene: m.gene,
          log2fc: Number(m.log2fc.toFixed(2)),
          fdr: m.fdr,
          pctIn: Number(m.pctIn.toFixed(3)),
          pctOut: Number(m.pctOut.toFixed(3)),
        })),
      }
    : null;

  useCopilotReadable(
    {
      description:
        "GROUND TRUTH — exactly what the single-cell viewer is showing right now. " +
        "Always trust this over conversation memory. If the user says 'it', 'that gene', " +
        "'the highlighted ones' or 'that colour', resolve it from here. " +
        // Without the next two sentences the model treats a conflict as proof
        // that the context is stale. Observed: after the user pressed "Reset
        // view", this block correctly reported displayedGenes: [], and the
        // model reasoned "the ground truth must have been captured before my
        // tool calls" and answered from its own transcript instead — telling
        // the user two genes were displayed when the scatter was empty.
        "This block is RECOMPUTED AND RESENT WITH EVERY MESSAGE. It is never stale and " +
        "never cached from earlier in the conversation. " +
        "The user also drives this UI directly with buttons — Reset view, the gene box, " +
        "clicking the legend — so the state CAN change without any tool call from you. " +
        "If this disagrees with what you remember doing, the user changed it by hand: " +
        "this block is right and your memory is out of date. Never tell the user something " +
        "is on screen when this says it is not.",
      value: {
        dataset: "pbmc3k — 2,638 human PBMCs, log1p-normalized",
        nCells: data?.nCells ?? null,
        nGenes: data?.nGenes ?? null,

        // --- what the map is currently drawing ---
        colorMode,
        colorRamp:
          colorMode === "expression"
            ? ramp === "viridis"
              ? "viridis (dark blue = low, yellow = high)"
              : "grey → red (light grey = zero, dark red = high)"
            : "categorical cluster palette (see clusters[].color)",
        clusters: clusterRows,

        // --- genes on screen ---
        displayedGenes,
        displayedGeneCount: genes.length,
        maxGenesAtOnce: MAX_GENES,

        // --- highlight state ---
        highlightedClusters: highlighted,
        highlightActive: !!highlighted,

        // --- marker table contents ---
        lastDeg: lastDegSummary,

        notes: [
          `13,714 genes exist; only the ${genes.length} in displayedGenes are drawn. Use search_genes to check a symbol before querying it — do not guess.`,
          `At most ${MAX_GENES} genes can be shown at once (the scatter renders one panel each). If the user asks for more, say so BEFORE calling query_genes and offer to show the ${MAX_GENES} most relevant.`,
          "lastDeg.allMarkerGenes is the complete marker list for the current table — check membership there instead of re-running run_deg.",
        ],
      },
    },
    [data, colorMode, genes, lastDeg, highlighted, ramp]
  );
}
