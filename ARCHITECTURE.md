# Architecture & Flow

Everything an engineer needs to work on this app.
Short sentences on purpose. Diagrams over paragraphs.

> New to the project? Read **`HOW-IT-WORKS.md`** first — it is the gentler
> version. This file assumes you will be changing the code.

---

## 1. What this app is

A map of **2,638 human immune cells**. Each dot is one cell.

You can drive it two ways:

- **By hand** — type a gene, click a button.
- **By chat** — tell an AI what you want, and it presses the same buttons.

The second way is the point of the project.

---

## 2. The big picture

Two programs run at the same time. One command starts both: `npm run dev`

```
┌────────────────────────────┐        ┌────────────────────────────┐
│  BROWSER      :5173        │        │  SERVER        :3001       │
│  (Vite + React)            │        │  (Express + Node)          │
│                            │        │                            │
│  • draws the map           │──────▶ │  • holds 18 MB of gene data │
│  • holds the 7 AI tools    │  /api  │  • does the statistics      │
│  • runs the tools          │◀────── │  • talks to the AI          │
└────────────────────────────┘        └────────────┬───────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │  LLM GATEWAY (outside)       │
                                    │  vn-llm.bioturing.com/v1     │
                                    │  model: glm-5.2-Preserved-   │
                                    │         Think                │
                                    └──────────────────────────────┘
```

**Why two programs?**
The gene data is 18 MB. Too big for the browser.
The server keeps it. The browser asks for small pieces.

The browser only holds:

| What | Size |
|---|---|
| position of each cell (x, y) | ~60 KB |
| which group each cell is in | small |
| genes you looked at | 1 number per cell, per gene |

**Important:** the browser never talks to the AI directly.
It always goes through our server. The API key stays on the server.

---

## 3. Folder map

```
scripts/
  prepare-data.ts     run ONCE. Downloads + converts the data.

src/
  server/                    ← Node only. No DOM.
    index.ts                 starts Express. ORDER MATTERS (see §9)
    llm.ts                   connects to the AI + the system prompt
    data/load.ts             reads data/ into memory once
    data/store.ts            geneColumn(), clusterMask(), findGenes()
    stats/                   the maths. Fully tested.
      sparse.ts              mean + variance from sparse data
      ttest.ts               the t-test formula
      fdr.ts                 multiple-testing correction
      deg.ts                 puts the three together
    routes/data.ts           the 4 data endpoints

  components/                ← what you see
    ScatterView.tsx          the map
    ClusterLegend.tsx        colour key (floats on the map)
    GenePanel.tsx            gene search box + chips
    DegPanel.tsx             marker gene table
    ChatPanel.tsx            the chat + inline status line
    AgentActivityBar.tsx     status bar under the map
    StepCard.tsx             the ✅ tool cards in chat
    MarkerChart.tsx          the bar chart inside chat
    RampControl.tsx          the colour-scale swatch
    Toolbar.tsx              top bar

  hooks/
    copilot/                 ★ THE AI LAYER. Delete it → app still works.
      useRunDegTool.tsx
      useQueryGenesTool.tsx
      useColorByClusterTool.tsx
      useSearchGenesTool.tsx
      useHighlightClustersTool.tsx
      useSetColorRampTool.tsx
      useAskUserChoiceTool.tsx      ← asks YOU a question
      useSingleCellReadable.ts      ← tells the AI what is on screen
      useSingleCellCopilot.ts       ← barrel: registers all of them
    useAgentPhase.ts         "is the AI busy?" (one source of truth)
    useFlashOnChange.ts      makes a panel blink when it changes

  state/
    useDatasetStore.ts       the cells (loaded once)
    useViewStore.ts          what is on screen right now
  lib/
    geneDisplay.ts           ★ THE ONE PATH to show a gene
    api.ts                   typed fetch wrappers
    colors.ts                the palettes (do not change)
    types.ts                 shapes shared by server + browser
```

**The one rule about folders:**
`src/hooks/copilot/` is the only place that knows an AI exists.
Delete that folder → you lose chat, nothing else breaks.

---

## 4. THE MAIN TRACE — "Query top gene in B Cells"

This is the most important section. Read it slowly.

You type one sentence. **5 HTTP calls happen.** Measured, not estimated:

```
 #   Call                        Time    Who calls it
 ─   ─────────────────────────   ─────   ─────────────────
 1   POST /api/copilotkit         36 ms   browser → our server → AI
 2   POST /api/run_deg            35 ms   browser → our server
 3   POST /api/copilotkit        101 ms   browser → our server → AI
 4   POST /api/query_genes        27 ms   browser → our server
 5   POST /api/copilotkit         23 ms   browser → our server → AI
```

**Pattern:** `AI → tool → AI → tool → AI`

3 calls to the AI. 2 calls to our data API.

> ⏱ Note on the times: the `/api/copilotkit` numbers look small because that
> response is a **stream**. The fetch finishes when the first bytes arrive,
> not when the AI finishes talking. Real waiting time is a few seconds each.

### Step by step

```
YOU TYPE: "Query top gene in B Cells"
   │
   ▼
╔══════════════════════════════════════════════════════════════╗
║ CALL 1 — POST /api/copilotkit                                ║
╠══════════════════════════════════════════════════════════════╣
║ Browser sends:                                               ║
║   • your sentence                                            ║
║   • 7 tool descriptions   ← what the AI CAN DO               ║
║   • the readable          ← what is ON SCREEN right now      ║
║                                                              ║
║ Server adds the system prompt, forwards to the gateway.      ║
║                                                              ║
║ AI streams back:                                             ║
║   REASONING_*  → "Thought for a few seconds" panel  ①        ║
║   TEXT_*       → "Running analysis for B cells."             ║
║   TOOL_CALL_*  → run_deg { group: "B cells" }       ②        ║
║                                                              ║
║ ⚠ The server does NOT run the tool. It only reports it.      ║
╚══════════════════════════════════════════════════════════════╝
   │
   ▼
╔══════════════════════════════════════════════════════════════╗
║ CALL 2 — POST /api/run_deg   (the browser runs the tool)     ║
╠══════════════════════════════════════════════════════════════╣
║ useRunDegTool.tsx handler runs:                              ║
║   fetch('/api/run_deg', { group: "B cells", topN: 100 })     ║
║                                                              ║
║ Server: 13,714 genes × t-test  →  ~25 ms                     ║
║ Returns 100 markers.                                         ║
║                                                              ║
║ Handler then does TWO different things:                      ║
║   setLastDeg(all 100)        → fills the TABLE       ③       ║
║   return { markers: top 10 } → goes back to the AI   ④       ║
║                                                              ║
║ Why different? The AI re-reads every old result on every     ║
║ later turn. 100 rows would waste ~3k tokens every time.      ║
║ You can already see them on screen.                          ║
╚══════════════════════════════════════════════════════════════╝
   │
   ▼
╔══════════════════════════════════════════════════════════════╗
║ CALL 3 — POST /api/copilotkit                                ║
╠══════════════════════════════════════════════════════════════╣
║ Browser sends the tool result back. THIS IS THE ONLY WAY     ║
║ the AI learns what happened.                                 ║
║                                                              ║
║ AI reads "top: CD79A, CD74, CD79B" and streams:              ║
║   TEXT_*      → "The top marker is CD79A (log2FC 6.65…)"     ║
║   TOOL_CALL_* → query_genes { genes: ["CD79A"] }             ║
╚══════════════════════════════════════════════════════════════╝
   │
   ▼
╔══════════════════════════════════════════════════════════════╗
║ CALL 4 — POST /api/query_genes                               ║
╠══════════════════════════════════════════════════════════════╣
║ Handler calls displayGenes(["CD79A"], …)                     ║
║   → 2,638 expression values                                  ║
║   → showGenes()  → MAP RECOLOURS + chip appears     ⑤        ║
╚══════════════════════════════════════════════════════════════╝
   │
   ▼
╔══════════════════════════════════════════════════════════════╗
║ CALL 5 — POST /api/copilotkit  (last one)                    ║
╠══════════════════════════════════════════════════════════════╣
║ AI confirms: "CD79A is now shown on the map."                ║
║ No more tool calls → the run ends. Status goes to "Ready".    ║
╚══════════════════════════════════════════════════════════════╝
```

### The loop in one picture

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
   ask the AI ──▶ AI says "run tool X"         │
                        │                      │
                        ▼                      │
              BROWSER runs the tool            │
                        │                      │
                        ▼                      │
              screen changes NOW               │
                        │                      │
                        ▼                      │
              send the result back ────────────┘
                        │
                  (no more tools?)
                        │
                        ▼
                   AI writes the answer
```

---

## 4b. How does the AI know the tool worked? (READ THIS)

This is the part people get wrong. Two facts:

### Fact 1 — it is NOT one request. It is N+1.

**N tool calls = N+1 HTTP requests.**

The AI is **stateless**. No connection stays open. It remembers nothing.
Every request re-sends the whole conversation from the beginning.

```
Request 1 ──▶ your message + tools + screen state
          ◀── "call run_deg"            ✂ CONNECTION CLOSES

              browser runs the tool. Screen changes NOW.
              (the AI does not know this yet!)

Request 2 ──▶ everything above + THE TOOL RESULT
          ◀── "call query_genes"        ✂ CONNECTION CLOSES

              browser runs the tool. Screen changes again.

Request 3 ──▶ everything above + the 2nd result
          ◀── the final answer          ✂ done
```

### Fact 2 — there is NO success/failure channel. It reads English.

Your handler returns a plain object:

```js
return { success: true, message: "100 markers for B cells (342 vs 2,296)" };
```

The browser turns it into a message and puts it in the **next** request:

```json
{ "role": "tool",
  "tool_call_id": "call_abc",
  "content": "{\"success\":true,\"message\":\"100 markers for B cells…\"}" }
```

The AI reads that text. That is the whole mechanism.

On failure it reads:

```js
return { success:false,
         message:"Unknown group 'T cell'. Valid labels: CD4 T cells, CD8 T cells, …" };
```

…and fixes itself on the next round.

> 💡 That is why the error text lists the valid labels.
> **The error message is written for the AI, not for the user.**

### Why "return, never throw" is not a style rule

```
   return {success:false}          throw new Error()
          │                               │
          ▼                               ▼
   result message built           NO result message
          │                               │
          ▼                               ▼
   Request 2 happens              Request 2 NEVER happens
          │                               │
          ▼                               ▼
   AI explains the problem        silence. User sees nothing.
```

### Worked example — "Highlight top 1 expressed gene in B Cell"

Measured live:

```
1  POST /api/copilotkit   → AI calls highlight_clusters   (no server call)
2  POST /api/copilotkit   → AI writes the answer

2 LLM calls · 1 tool call · 0 data calls
```

**Zero data calls.** The AI saw in the readable that CD79A was already on
screen and the B-cell table was already loaded, so it did not re-run
anything. It answered:

> "The top marker gene for B cells is CD79A — and it's already displayed
> on the scatter plot! Here are its stats…"

This is the readable (§6) paying for itself: state it can see is state it
does not have to recompute.

---

## 4c. When does the loop STOP?

Short answer: **when the AI's reply has no tool call in it.**

Every reply from the AI is one of two shapes:

```
  Shape A                          Shape B
  ───────────────────────────      ───────────────────────────
  text + TOOL_CALL                 text only
        │                                │
        ▼                                ▼
  browser runs the tool            nothing to run
  sends result back                       │
  → LOOP AGAIN                            ▼
                                   RUN_FINISHED → "Ready"
```

That is the entire rule. There is **no code** that checks "is the task
complete?". Our app cannot know that. The AI decides it is done by simply
**not asking for another tool**.

### Three ways a run can end

| # | Ending | Who decides | What you see |
|---|---|---|---|
| 1 | **Normal** — reply has no tool call | the AI | status → "Ready" |
| 2 | **Step limit** — `maxSteps: 10` | our config (`llm.ts`) | run stops after 10 rounds |
| 3 | **You press Stop** | you | `abortRun()` → status → "Ready" |

### Why the step limit exists

Without it, a confused model could loop forever:

```
   "call run_deg"  →  result  →  "call run_deg"  →  result  →  …
```

Each round costs an LLM request. `maxSteps: 10` is the circuit breaker.
A normal question uses **2–3** rounds, so 10 is generous.

```
   maxSteps: 10   ← in src/server/llm.ts
   ├─ typical question .......... 2-3 rounds
   ├─ with a HITL pause ......... 3-4 rounds
   └─ runaway loop .............. cut off at 10
```

### What makes the AI choose to stop

The system prompt (`SYSTEM_PROMPT` in `llm.ts`) tells it the shape of a
finished job. For example this line:

> "call `run_deg`, say one sentence naming the marker you picked, then
> IMMEDIATELY call `query_genes` on that exact gene in your next turn.
> Asking permission to visualize is a failure to complete the task."

Before that line existed, the AI ran `run_deg`, described the result, and
**stopped early** — asking "would you like me to visualise this?" It thought
it was finished. The prompt is what defines "finished".

> ⚠️ So if the AI stops too early or loops too long, the fix is almost always
> **the system prompt**, not the code.

---

## 5. Where does each thing on screen come from?

This is the table people ask for most.

```
┌─────────────── CHAT PANEL ────────────────┐
│                                           │
│  "Thought for a few seconds"    ①         │
│                                           │
│  "Running analysis for B cells."          │
│                                           │
│  ✅ run_deg  10 markers · top: CD79A…  ②  │
│  ┌─────────────────────────────────┐      │
│  │ ▇▇▇▇▇▇▇▇▇ CD79A          38.7   │  ⑥  │
│  │ ▇▇▇▇▇▇▇   CD74           31.4   │      │
│  │ click a bar to plot it          │      │
│  └─────────────────────────────────┘      │
│                                           │
│  ● Applying result        [Stop]   ⑦      │
│  ┌─────────────────────────────────┐      │
│  │ Type a message…                 │      │
│  └─────────────────────────────────┘      │
└───────────────────────────────────────────┘
```

| # | What you see | Where it comes from | File |
|---|---|---|---|
| ① | "Thought for N seconds" | `REASONING_*` events from the AI. Built in to CopilotKit — we wrote no code | (library) |
| ② | ✅ green tool card | the tool's `render` | `StepCard.tsx` |
| ③ | **marker table** (100 rows) | `setLastDeg()` in the tool handler → store | `DegPanel.tsx` |
| ④ | top-10 list sent to the AI | `return` value of the handler | `useRunDegTool.tsx` |
| ⑤ | map recolours + gene chip | `displayGenes()` → `showGenes()` | `geneDisplay.ts` |
| ⑥ | **bar chart in chat** | the same `render`, drawing ECharts | `MarkerChart.tsx` |
| ⑦ | status pill + Stop | `useAgentPhase()` | `ChatPanel.tsx` |
| — | status bar under the map | same hook, second place | `AgentActivityBar.tsx` |

### The important idea about ② ③ ⑥

They all come from **one tool call**, but go to **three different places**:

```
                  run_deg handler
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   setLastDeg()    return value      render()
        │               │                │
        ▼               ▼                ▼
   TABLE (100)     AI reads (10)    CARD + CHART
   on the right     in chat          in chat
```

### The chart is a button

Clicking a bar in the chart calls `displayGenes()` —
**the same function** the manual search box uses.

```
   you type "CD79A"  ─┐
   you click a bar   ─┼──▶ displayGenes() ──▶ map recolours
   AI calls a tool   ─┘
```

Three doors, one room. They can never disagree.

---

## 6. The 7 tools

| Tool | Calls the server? | What it does |
|---|---|---|
| `run_deg` | yes | find marker genes |
| `query_genes` | yes | colour the map by gene(s), max 4 |
| `search_genes` | yes | check a gene name exists |
| `color_by_cluster` | **no** | back to group colours |
| `highlight_clusters` | **no** | dim the other cells |
| `set_color_ramp` | **no** | grey→red / viridis |
| `ask_user_choice` | **no** | **pause and ask you** |

### What the AI can SEE (`useSingleCellReadable.ts`)

Sent with **every** message. Keep it small.

```js
{
  colorMode: "expression",
  activeScale: "grey → red (light grey = zero, dark red = high)",

  clusters: [{ label:"B cells", nCells:342,
               color:"#009e73", colorName:"green",
               dimmed:false }, …],

  displayedGenes: [{ gene:"CD79A", min:0, max:3.95, … }],
  displayedGeneCount: 1,
  maxGenesAtOnce: 4,          // ← so it can WARN instead of truncating

  highlightedClusters: null,
  highlightActive: false,

  lastDeg: {
    group: "B cells",
    totalMarkers: 100,
    allMarkerGenes: ["CD79A","CD74", …],   // ← names only, all 100
    top10: [{ gene, log2fc, fdr, pctIn, pctOut }, …],
    warning: null
  }
}
```

Note the split inside `lastDeg`: **all 100 names** but **stats for only 10**.
Names are cheap and answer "is X in the list?".
Stats are expensive and you can read them on screen.

Because of this the AI can answer **"what colour are B cells?"**
or **"is GZMB in the table?"** with **no tool call at all**.

### `ask_user_choice` — the AI can pause

```
YOU: "Run DEG on T cells"

AI:  There are two T cell populations.
     ┌──────────────────────────────────────┐
     │ Which one?                           │
     │ [CD4 T cells] [CD8 T cells] [Cancel] │
     └──────────────────────────────────────┘
          ▲ the whole run STOPS here
```

⚠️ **Every** exit must call `respond()` — including Cancel.
If one path forgets, the AI waits forever.

---

## 7. Rules you must not break

| Rule | Why |
|---|---|
| **Tools return, never `throw`** | A throw kills the follow-up call. The user gets silence instead of an explanation. Always `return {success:false, message}`. |
| **Only `geneDisplay.ts` shows a gene** | Three callers share it. A second path would eventually lie about what is on screen. |
| **Pass `AbortSignal` into every fetch** | Otherwise "Stop" cannot cancel work already running. |
| **Keep the readable small** | It is re-sent on every call. 3 calls per question. |
| **Never truncate silently** | If a limit applies (4 genes), say so. See §10. |
| **Don't hide agent output behind tabs** | If the AI fills a panel you cannot see, its work is invisible. We tried tabs. It was wrong. |

---

## 8. The data and the maths

### Prepare once

```
pbmc3k.h5ad (25 MB)
        │  npm run prep
        ▼
data/pbmc3k.meta.json      cell positions, groups, gene names
data/pbmc3k.X.*            expression, stored BY GENE (CSC)
data/pbmc3k.oracle.json    scanpy's own answers (for tests)
```

**Stored by gene, not by cell.** Every question here is about one gene.
By gene = one continuous block of memory. By cell = a full scan.

### Finding marker genes

For each of 13,714 genes:

```
   mean in the group   vs   mean everywhere else
              ↓
    score = difference ÷ spread     (big score = strong marker)
```

Then sort, take the top 100.

Also reported per gene:

| Column | Meaning |
|---|---|
| `log2FC` | how many times higher. 2.0 = 4× |
| `FDR` | chance it is luck. Smaller = better |
| `% in` / `% out` | how many cells actually have it |

> A big score with **8% in** is a weak marker. Always read the percentages.

### How we know the maths is right

The data file contains **scanpy's own answers**.
The test compares ours to theirs for all 8 groups.

```
gene names   : match EXACTLY, in the same order
scores       : differ by at most 0.0014
speed        : ~25 ms for all 13,714 genes
```

---

## 9. Traps (real ones, already hit)

| Trap | What happens | Fix |
|---|---|---|
| `express.json()` before the CopilotKit mount | requests hang | mount CopilotKit **first** |
| `endpoint: "/api/copilotkit"` | plain 404 | mount on the path, pass `endpoint: "/"` |
| `BuiltInAgent` from package root | `undefined is not a constructor` | import from `@copilotkit/runtime/v2` |
| `@ai-sdk/openai` instead of `-compatible` | reasoning text disappears | use `@ai-sdk/openai-compatible` v2 |
| CSS vars inside the chat | **`--accent` becomes near-white** | use own names (`--hitl-*`). CopilotKit redefines `--accent` and `--radius` |
| one tsconfig | server code fails to build | split app / server configs |

---

## 10. Two bugs worth remembering

**"Show me 10 genes" only showed 4.**
The limit was real (4 panels). The bug was the **silence** — the AI cut the
list and said nothing. Now the limit is in the readable, so it tells you first.

**"What is the TOP 1 marker?" left 1 row in the table.**
The AI passed `topN=1` and the table shrank.
The table is the *user's* view. It must not shrink because of how a
question was phrased. `run_deg` now always computes 100 for the table;
`topN` only controls what goes back to the AI.

---

## 11. Running it

```bash
npm run prep     # once — downloads + converts (~25 MB)
npm run dev      # starts both programs
npm test         # 30 tests, the maths
npm run build    # type-checks app AND server
```

Open http://localhost:5173

`.env`:

```
OPENAI_API_KEY=...
OPENAI_API_BASE=https://vn-llm.bioturing.com/v1
LLM_MODEL=glm-5.2-Preserved-Think
```

---

## 12. If you change one thing, check this

| You change… | Also check |
|---|---|
| a tool handler | does it still `return` on error, not `throw`? |
| `geneDisplay.ts` | manual box, chart click, AND the AI tool |
| the readable | it is sent 3× per question — is it still small? |
| any CSS in chat | does CopilotKit shadow that variable name? |
| `stats/` | run `npm test` — the scanpy check will catch you |
