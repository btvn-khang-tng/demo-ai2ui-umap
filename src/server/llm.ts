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

Every tool returns {success, message}. If success is false, tell the user what went wrong and what you'll try instead.`;

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
