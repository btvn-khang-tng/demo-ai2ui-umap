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
import { useAskUserChoiceTool } from "./useAskUserChoiceTool";
import { useSingleCellReadable } from "./useSingleCellReadable";

export function useSingleCellCopilot(): void {
  useRunDegTool();
  useQueryGenesTool();
  useColorByClusterTool();
  useSearchGenesTool();
  useHighlightClustersTool();
  useSetColorRampTool();
  // Human-in-the-loop: pauses the run and asks, instead of guessing, when a
  // cell-type reference is ambiguous (two T-cell and two monocyte populations).
  useAskUserChoiceTool();
  useSingleCellReadable();
}
