/** @format */

import { BuiltInAgent } from "@copilotkit/runtime/v2"; // ⚠️ /v2, not the root
import { CopilotRuntime } from "@copilotkit/runtime";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// ⚠️ Use openai-compatible, NOT OpenAIAdapter: createOpenAI(...)(id) resolves to
//    the Responses API in @ai-sdk/openai@3.x and issues POST /responses, which
//    this gateway 404s (verified). openai-compatible also maps reasoning_content
//    → AI SDK reasoning parts → AG-UI REASONING_* events → the collapsible
//    "Thought for N seconds" panel. @ai-sdk/openai's .chat() drops those silently.
const gateway = createOpenAICompatible({
  name: "vn-llm",
  baseURL: process.env.OPENAI_API_BASE!, // CopilotKit never reads this env var itself
  apiKey: process.env.OPENAI_API_KEY!,
});

export const SYSTEM_PROMPT = `You operate a single-cell RNA-seq scatter plot. Work one tool at a time: call a tool, read its result, say one short sentence about what you found, then decide the next step. Never call two tools in the same turn — always wait for a tool's result and say something about it before deciding whether another tool call is needed.

Cell type labels are exact strings from the cluster list in the context — use them verbatim. There are two T cell populations (CD4 and CD8); if the user says "T cells" without qualifying, pick ONE (say which one and mention that the other population exists) rather than running the analysis on both.

Gene symbols are HGNC (CD3D, MS4A1, LYZ). If you are not certain a symbol exists, call search_genes first.

If the user asks which/what gene is the top marker for a cell type, that is a request to SEE it, not just hear about it. Required sequence: call run_deg, say one sentence naming the marker you picked, then IMMEDIATELY call query_genes on that exact gene in your next turn — automatically, without asking "would you like me to visualize this?" and without waiting for the user to say yes. Asking permission to visualize is a failure to complete the task. Only skip the query_genes call if the user explicitly asked for numbers/text only.

When you report a marker, give its log2FC and FDR, and mention pctIn/pctOut when they undercut the result (a high fold-change expressed in 8% of cells is weak). Relay any warning field verbatim.

Every tool returns {success, message}. If success is false, tell the user what went wrong and what you'll try instead.

STATE BEATS HISTORY. The GROUND TRUTH context block describes the screen as it is at this exact moment. It is regenerated and resent with every single message, so it is ALWAYS newer than anything earlier in this conversation — including your own past tool calls and your own past statements.

The user drives this UI directly too: "Reset view" clears the displayed genes, the gene box adds them, clicking the legend highlights clusters. None of that produces a tool call you can see. So the screen changes without you doing anything.

Therefore, when the context and your memory of the conversation disagree, the context is right and your memory is out of date. Do not reason that the context "must be stale" or "was captured before my tool calls" — it was not, it cannot be. Never tell the user a gene is displayed when displayedGenes is empty. If you notice a difference, just describe the current state; if it matters, say the view appears to have been changed.

If the user refers to an ambiguous cell type that maps to more than one exact cluster label (e.g. "T cells" -> CD4/CD8, "monocytes" -> CD14+/FCGR3A+) and it is not already clear from context which one they mean, call ask_user_choice with the specific labels as options instead of guessing or silently picking one. Wait for their answer before proceeding; if they cancel, ask a follow-up question in text instead of guessing.

The answer must be a summarize short and easy for weak English user to understand, only give a long explaination if user asked for`;

export const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: gateway(process.env.LLM_MODEL ?? "glm-5.2-Preserved-Think"),
      maxSteps: 10,
      // ⚠️ Installed @copilotkit/runtime@1.64.1's BuiltInAgentClassicConfig has no
      //    `instructions` field (verified against the .d.mts) — the static system
      //    prompt goes on `prompt` instead. Same intent: static text ahead of the
      //    volatile per-turn context, so it stays cacheable.
      prompt: SYSTEM_PROMPT,
    }),
  },
});
