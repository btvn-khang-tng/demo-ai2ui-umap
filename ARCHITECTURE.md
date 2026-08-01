# Architecture & Flow

For engineers changing this code.
New here? Read **`HOW-IT-WORKS.md`** first — it is the gentler version.

---

## 1. Two programs

```
┌──────────────────────┐        ┌──────────────────────┐
│  BROWSER   :5173     │        │  SERVER    :3001     │
│  React + DeckGL      │──/api─▶│  Express + Node      │
│  • draws the map     │◀───────│  • 18 MB gene data   │
│  • owns the 7 tools  │        │  • the statistics    │
│  • RUNS the tools    │        │  • talks to the AI   │
└──────────────────────┘        └──────────┬───────────┘
                                           ▼
                              vn-llm.bioturing.com/v1
                              glm-5.2-Preserved-Think
```

`npm run dev` starts both.

- Gene data is 18 MB → stays on the server.
- Browser holds only positions (~60 KB) + genes you asked for.
- Browser **never** calls the AI directly. The API key stays server-side.

---

## 2. Folders

```
src/
  server/          ← Node only, no DOM
    index.ts       Express wiring. ORDER MATTERS (§7)
    llm.ts         AI connection + SYSTEM_PROMPT
    stats/         the maths. Tested against scanpy.
    routes/data.ts 4 endpoints
  components/      what you see
  state/           what is on screen now
  lib/
    geneDisplay.ts ★ THE ONE PATH that shows a gene
  hooks/
    copilot/       ★ THE AI LAYER — delete it, app still works
```

Two starred rules:

- **`hooks/copilot/` is the only folder that knows an AI exists.**
- **`geneDisplay.ts` is the only place that displays a gene.** Three callers
  share it: the search box, a chart bar click, and the AI's tool.

---

## 3. The trace — "Query top gene in B Cells"

Measured, not estimated. **5 HTTP calls.**

```
 #  Call                    Who
 ─  ─────────────────────   ────────────────────
 1  POST /api/copilotkit    browser → server → AI
 2  POST /api/run_deg       browser → server
 3  POST /api/copilotkit    browser → server → AI
 4  POST /api/query_genes   browser → server
 5  POST /api/copilotkit    browser → server → AI
```

Pattern: **AI → tool → AI → tool → AI**

```
YOU: "Query top gene in B Cells"
  │
  ▼
① POST /api/copilotkit
     send: your text + 7 tool descriptions + what is on screen
     AI:   REASONING_* → "Thought for a few seconds"
           TEXT_*      → "Running analysis for B cells."
           TOOL_CALL_* → run_deg { group: "B cells" }
     ⚠ the server does NOT run the tool. It only reports it.
  │
  ▼
② POST /api/run_deg          ← the BROWSER runs the tool
     13,714 genes × t-test → ~25 ms → 100 markers
     handler does two things:
        setLastDeg(100)  → fills the TABLE
        return  top 10   → goes back to the AI
  │
  ▼
③ POST /api/copilotkit
     send the tool result back  ← the ONLY way the AI learns
     AI: "top marker is CD79A" + TOOL_CALL query_genes
  │
  ▼
④ POST /api/query_genes
     displayGenes(["CD79A"]) → MAP RECOLOURS
  │
  ▼
⑤ POST /api/copilotkit
     AI writes the final answer. No tool call → run ends.
```

> ⏱ The `/api/copilotkit` timings look tiny (20–100 ms) because the response
> is a **stream**. The fetch resolves on first byte, not on completion.

---

## 4. The loop (the part people get wrong)

### It is N+1 requests, not 1

The AI is **stateless**. No open connection. Every round re-sends the whole
conversation.

```
Request 1 ─▶ question + tools + screen state
          ◀─ "run run_deg"              ✂ closes

             browser runs it. SCREEN CHANGES NOW.
             (the AI does not know yet)

Request 2 ─▶ everything above + THE RESULT
          ◀─ "run query_genes"          ✂ closes

Request 3 ─▶ everything above + 2nd result
          ◀─ final answer               ✂ done
```

**The screen changes before the AI knows.** The browser acts; the AI is told
afterwards.

### How it knows the tool worked: it reads English

No success/failure channel exists. Your handler returns:

```js
{ success: true,  message: "100 markers for B cells" }
{ success: false, message: "Unknown group 'T cell'. Valid labels: CD4 T cells, …" }
```

That text is replayed as a `role:"tool"` message in the **next** request.

> 💡 The error text lists valid labels **for the AI**, not for the user.

**This is why tools must `return`, never `throw`:**

```
 return {success:false}        throw new Error()
        │                             │
   result message built         NO result message
        │                             │
   Request 2 happens            Request 2 NEVER happens
        │                             │
   AI explains the problem      silence
```

### When it stops

**When the reply has no tool call.**

```
 reply contains a tool? ──YES──▶ run it, send result, ask again
          │
          NO
          ▼
       finished → status "Ready"
```

No code decides "task complete". The AI decides, by not asking for a tool.

### Where the loop lives — NOT our code

`@copilotkit/core` → class `RunHandler`. It is recursion:

```js
async processAgentResult({ runAgentResult, agent }) {
  let needsFollowUp = false;
  for (…each toolCall in the AI's reply…)
    if (await this.executeSpecificTool(…)) needsFollowUp = true;

  if (needsFollowUp && !aborted) {
    if (this._runDepth >= MAX_FOLLOW_UP_DEPTH) logger.warn(…)
    else return await this.runAgent({ agent });   // ◀ THE RECURSION
  }
  return runAgentResult;                          // no tool ran → over
}
```

### ⚠️ `maxSteps: 10` does NOT cap these rounds

| Setting | Where | Really bounds |
|---|---|---|
| `MAX_FOLLOW_UP_DEPTH = 100` | CopilotKit, hardcoded | browser↔AI rounds |
| `maxSteps: 10` | our `llm.ts` | AI-SDK stepping **inside one request** |

Our tools are *frontend* tools with no server-side `execute`, so the SDK
reports the call and stops after one step anyway. The real guard is **100**.

Three endings: reply has no tool · depth 100 · you press **Stop**.

---

## 5. Where each thing in the chat comes from

```
┌────────── CHAT ──────────┐
│ "Thought for a few…"  ①  │
│ "Running analysis…"      │
│ ✅ run_deg  top: CD79A ② │
│ ┌──────────────────────┐ │
│ │ ▇▇▇▇ CD79A     38.7  │③│
│ │ click a bar to plot  │ │
│ └──────────────────────┘ │
│ ● Applying result [Stop]④│
└──────────────────────────┘
```

| # | What | From | File |
|---|---|---|---|
| ① | "Thought for N seconds" | `REASONING_*` events — library, we wrote none | (CopilotKit) |
| ② | green tool card | tool's `render` | `StepCard.tsx` |
| ③ | bar chart | same `render`, ECharts | `MarkerChart.tsx` |
| ④ | status + Stop | `useAgentPhase()` | `ChatPanel.tsx` |
| — | marker table (100) | `setLastDeg()` → store | `DegPanel.tsx` |
| — | map recolour + chip | `displayGenes()` | `geneDisplay.ts` |
| — | bar under the map | same hook, 2nd place | `AgentActivityBar.tsx` |

**One tool call → three destinations:**

```
              run_deg handler
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 setLastDeg()   return value    render()
  TABLE(100)    AI reads(10)   CARD + CHART
```

Sizes differ on purpose: the table is for you, the 10 is for the AI (it
re-reads every old result on every later turn).

**The chart is a button.** Clicking a bar calls `displayGenes()` — the same
function the search box uses.

```
 type a gene ─┐
 click a bar ─┼─▶ displayGenes() ─▶ map recolours
 AI tool call ┘
```

---

## 6. The 7 tools + what the AI can see

| Tool | Server call? | Does |
|---|---|---|
| `run_deg` | yes | find marker genes |
| `query_genes` | yes | colour by gene(s), max 4 |
| `search_genes` | yes | check a symbol exists |
| `color_by_cluster` | no | back to group colours |
| `highlight_clusters` | no | dim the others |
| `set_color_ramp` | no | grey→red / viridis |
| `ask_user_choice` | no | **pause and ask you** |

**The readable** (`useSingleCellReadable.ts`) is sent with every request —
keep it small:

```js
{ colorMode, activeScale,
  clusters: [{ label, nCells, color:"#009e73", colorName:"green", dimmed }],
  displayedGenes, displayedGeneCount, maxGenesAtOnce: 4,
  highlightedClusters, highlightActive,
  lastDeg: { group, totalMarkers,
             allMarkerGenes:[…100 names…],   // cheap, answers "is X in it?"
             top10:[{gene,log2fc,fdr,pctIn,pctOut}] } }
```

Because of this, "what colour are B cells?" and "is GZMB in the table?" cost
**zero tool calls**.

**`ask_user_choice`** pauses the whole run and renders buttons in chat.
⚠️ Every exit must call `respond()` — including Cancel — or the AI waits
forever.

---

## 7. Rules and traps

**Rules**

| Rule | Why |
|---|---|
| tools `return`, never `throw` | a throw kills the follow-up → user gets silence |
| only `geneDisplay.ts` shows a gene | 3 callers; a 2nd path would eventually lie |
| forward `AbortSignal` into every fetch | else Stop cannot cancel running work |
| keep the readable small | re-sent on every request |
| never truncate silently | say the limit instead (see below) |
| don't hide agent output behind tabs | invisible agent work defeats the app |

**Traps already hit**

| Trap | Symptom | Fix |
|---|---|---|
| `express.json()` before CopilotKit mount | requests hang | mount CopilotKit first |
| `endpoint:"/api/copilotkit"` | bare 404 | mount on path, pass `endpoint:"/"` |
| `BuiltInAgent` from package root | `undefined is not a constructor` | import from `/v2` |
| `@ai-sdk/openai` not `-compatible` | reasoning text vanishes | use `openai-compatible` v2 |
| CSS vars inside chat | `--accent` → near-white | use own names (`--hitl-*`) |
| one tsconfig | server build fails | split app / server |

**Two real bugs, both about silence**

- *"Show 10 genes" showed 4.* The cap was real; the **silence** was the bug.
  The limit is now in the readable, so the AI warns first.
- *"Top 1 marker" left 1 table row.* The AI passed `topN=1`. The table is the
  **user's** view — it must not shrink because of phrasing. `run_deg` now
  always computes 100; `topN` only bounds what goes back to the AI.

---

## 8. Data & maths (short)

```
pbmc3k.h5ad ──npm run prep──▶ data/pbmc3k.meta.json   positions, groups
                              data/pbmc3k.X.*         expression BY GENE (CSC)
                              data/pbmc3k.oracle.json scanpy's answers
```

Stored **by gene** because every query is about one gene — contiguous memory
instead of a full scan.

`run_deg`: for each of 13,714 genes compare mean-in-group vs mean-outside,
divided by spread → score → sort → top 100. Also `log2FC`, `FDR`,
`% in` / `% out`.

> A big score with **8% in** is a weak marker. Always read the percentages.

**Proof it is correct:** the file ships scanpy's own answers. Tests compare
all 8 groups — gene names match **exactly in order**, scores within
**0.0014**. Runtime ~25 ms.

---

## 9. Commands

```bash
npm run prep     # once — download + convert (~25 MB)
npm run dev      # both programs
npm test         # 30 tests (the maths)
npm run build    # type-checks app AND server
```

`.env`: `OPENAI_API_KEY`, `OPENAI_API_BASE`, `LLM_MODEL`

**Before you commit:**

| Changed | Check |
|---|---|
| a tool handler | does it `return` on error, not `throw`? |
| `geneDisplay.ts` | search box + chart click + AI tool |
| the readable | still small? sent every request |
| CSS in chat | does CopilotKit shadow that var name? |
| `stats/` | `npm test` — the scanpy check will catch you |
