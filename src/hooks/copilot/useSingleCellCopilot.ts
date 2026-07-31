/**
 * Barrel: registers the frontend tools and the ground-truth readable.
 * `App.tsx` calls this once, inside the providers. Deleting this whole
 * `src/hooks/copilot/` directory (and the one call site) must leave a fully
 * working manual app — nothing outside this directory depends on it.
 */
import { useRunDegTool } from "./useRunDegTool";
import { useQueryGenesTool } from "./useQueryGenesTool";
import { useColorByClusterTool } from "./useColorByClusterTool";
import { useSearchGenesTool } from "./useSearchGenesTool";
import { useHighlightClustersTool } from "./useHighlightClustersTool";
import { useSetColorRampTool } from "./useSetColorRampTool";
import { useSingleCellReadable } from "./useSingleCellReadable";
import { useAskUserChoiceTool } from "./useAskUserChoiceTool"; // TEMP: manual test only, revert before commit

export function useSingleCellCopilot(): void {
  useRunDegTool();
  useQueryGenesTool();
  useColorByClusterTool();
  useSearchGenesTool();
  useHighlightClustersTool();
  useSetColorRampTool();
  useSingleCellReadable();
  useAskUserChoiceTool(); // TEMP: manual test only, revert before commit
}
