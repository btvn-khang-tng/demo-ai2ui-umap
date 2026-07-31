/**
 * `set_color_ramp` — switches the expression colour scale between the default
 * grey→red and viridis.
 *
 * Pure client state, like `highlight_clusters`: no fetch, no recomputation,
 * just the store action the toolbar's own swatch control calls. Same single
 * path, so the manual toggle and the agent can never disagree about which
 * ramp is active.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { useViewStore } from "../../state/useViewStore";

const paramsSchema = z.object({
  ramp: z
    .enum(["expression", "viridis"])
    .describe(
      "Which colour scale to use. 'expression' is the default grey→red " +
        "(zero-expression cells recede to light grey); 'viridis' is the " +
        "perceptually-uniform blue→green→yellow scale many people expect " +
        "from scanpy."
    ),
});

export function useSetColorRampTool(): void {
  const { ramp: currentRamp, setRamp, colorMode } = useViewStore();

  useFrontendTool(
    {
      name: "set_color_ramp",
      description:
        "Change the colour scale used to draw gene expression. Only affects " +
        "expression mode; it does nothing to cluster colours, which are a " +
        "fixed categorical palette.",
      parameters: paramsSchema,
      handler: async ({ ramp }) => {
        try {
          setRamp(ramp);
          const label = ramp === "viridis" ? "viridis" : "grey → red";

          // Report, don't refuse: switching the ramp while in cluster mode is
          // harmless and takes effect on the next gene, but the user would
          // otherwise see nothing happen and think the tool failed.
          const note =
            colorMode === "cluster"
              ? " (no visible change yet — the scatter is showing cluster colours; it will apply to the next gene displayed)"
              : "";

          return {
            success: true,
            message: `Colour ramp set to ${label}${note}.`,
            ramp,
            previousRamp: currentRamp,
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
    [setRamp, currentRamp, colorMode]
  );
}
