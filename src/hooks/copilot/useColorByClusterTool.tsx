/**
 * `color_by_cluster` — resets the scatter to categorical (cluster) colouring
 * and clears the displayed genes. Takes no parameters.
 */
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { StepCard } from "../../components/StepCard";
import { useViewStore } from "../../state/useViewStore";

const paramsSchema = z.object({});

export function useColorByClusterTool(): void {
  const { colorByCluster } = useViewStore();

  useFrontendTool(
    {
      name: "color_by_cluster",
      description:
        "Reset the scatter plot to categorical cluster colouring and clear any displayed genes.",
      parameters: paramsSchema,
      handler: async () => {
        try {
          colorByCluster();
          return { success: true, message: "Scatter reset to cluster colours." };
        } catch (e) {
          return {
            success: false,
            message: e instanceof Error ? e.message : String(e),
          };
        }
      },
      render: (props) => <StepCard {...props} />,
    },
    [colorByCluster]
  );
}
