# How this app works

A simple guide. Short sentences on purpose.

---

## 1. What the app does

It shows **2,638 human immune cells** as dots on a map.

- Each dot = one cell.
- Cells that are alike sit close together.
- The map is called a **UMAP**.

You can:

1. **Colour the map by cell type** (8 groups, 8 colours).
2. **Colour the map by one gene** — bright red = the gene is high in that cell.
3. **Find marker genes** — genes that are high in one cell type but low in the others.
4. **Ask an AI to do all of the above for you**, by typing a question.

The data is real (the standard "PBMC 3k" dataset).

---

## 2. The two programs

The app is two programs running at the same time.

```
  BROWSER  (port 5173)          SERVER  (port 3001)
  ─────────────────────         ──────────────────────
  Draws the map                 Holds the big data file
  Buttons, chat box             Does the maths
                 │                        ▲
                 └──── asks for data ─────┘
```

One command starts both:

```bash
npm run dev
```

**Why two?** The gene data is about 18 MB. That is too big to send to the
browser. So the server keeps it and only sends the small piece you ask for.

The browser only holds:

- the position of each dot (x, y) — about 60 KB
- which group each cell is in
- any gene you looked up

---

## 3. The files

```
scripts/
  prepare-data.ts     runs ONCE. Downloads the data, converts it.

src/
  server/             the SERVER program
    index.ts          starts it
    llm.ts            connects to the AI
    data/             loads the data into memory
    stats/            the maths (this part is fully tested)
    routes/data.ts    the 4 web addresses the browser can call

  components/         the SERVER has no screen. All screen code is here.
    ScatterView.tsx   the map
    ClusterLegend.tsx the colour key (top-left of the map)
    GenePanel.tsx     the gene search box
    DegPanel.tsx      the marker gene table
    ChatPanel.tsx     the AI chat box

  state/              remembers what is on screen right now
  lib/                colours, number formatting, calling the server

  hooks/copilot/      the AI tools  ← see section 6
```

**One important rule:** if you delete the folder `src/hooks/copilot/`, the app
still works. You lose the AI chat, nothing else. The AI is a layer on top, not
mixed into the app.

---

## 4. The 4 server addresses

The browser can ask the server for 4 things.

| Address | What it does |
|---|---|
| `GET /api/data` | "Give me the map." Positions + group names. Sent once at start. |
| `GET /api/genes?q=CD3` | "Which genes start with CD3?" Used to check a name exists. |
| `POST /api/query_genes` | "Give me the values for gene MS4A1." Max 4 genes at a time. |
| `POST /api/run_deg` | "Which genes are special for B cells?" Returns 100 marker genes. |

---

## 5. How the maths works (short version)

The hard part is `run_deg` — finding marker genes.

For **one gene**, the question is:

> Is this gene higher in group A than in all other cells?

The steps:

1. Get the average value in group A. Get the average in everyone else.
2. Compare the two averages, allowing for how spread out the numbers are.
   This gives a **score**. Big score = big difference.
3. Repeat for all **13,714 genes**.
4. Sort by score. Keep the top 100.

Two extra numbers are reported for each gene:

- **log2FC** — how many times higher. `2.0` means 4× higher.
- **FDR** — the chance this is luck. Smaller = more trustworthy.
  `1.89e-216` means "basically not luck".
- **% in / % out** — how many cells actually have the gene.
  A gene with a big score but only 8% of cells is a weak result.

**How we know the maths is right.** The data file also contains the answers
from `scanpy` (a well-known scientific tool). The test compares our answers to
theirs for all 8 groups. The gene names match **exactly, in the same order**,
and the scores match to within 0.0014.

The whole calculation takes about **25 milliseconds**.

---

## 6. How the AI controls the app

This is the interesting part.

The AI does **not** draw anything. It **presses the same buttons you press**.

### The idea

The AI is given a list of 5 "tools". A tool is just a function with a name and
a description. The AI can ask to run one.

| Tool | What it does |
|---|---|
| `run_deg` | Find marker genes for a cell type |
| `query_genes` | Colour the map by a gene |
| `color_by_cluster` | Go back to cell-type colours |
| `search_genes` | Check a gene name exists |
| `highlight_clusters` | Fade out the cells you did not ask about |

### The loop

```
1. You type: "What is the top marker gene in T cells?"

2. Browser sends to the AI:
      your message
    + the 5 tool descriptions
    + what is on screen right now

3. The AI replies: "run the tool run_deg with group = CD4 T cells"

4. The BROWSER runs it. The screen changes.

5. The browser sends the result back to the AI.

6. The AI reads the result and decides the next step.
      → repeat from 3, or write an answer to you.
```

Step 5 is the important one. **The AI only learns what happened because we
send the result back.** There is no other channel.

### Two rules that matter

**Rule 1 — never crash, always return a message.**

If a tool fails, it returns `{success: false, message: "..."}`.
It must not throw an error. If it throws, the loop stops and you get silence
instead of an explanation.

**Rule 2 — the AI uses the same code path you do.**

When you type `MS4A1` in the box, and when the AI calls `query_genes`, both
run the *same function* (`displayGenes` in `src/lib/geneDisplay.ts`).

This matters. If they were two separate code paths, they could slowly drift
apart, and then one of them would be lying about what is on screen.

### What you see while it works

Every tool call draws a small card in the chat:

```
⏳  run_deg                        (starting)
🔄  run_deg   CD4 T cells vs rest… (running)
✅  run_deg   100 markers · top: LDHB, CD3D, RPS25
```

So you can always see what the AI is doing. Nothing happens invisibly.

---

## 7. The screen layout

```
┌──────────────────────────────────────────┬──────────────┐
│ title            ramp toggle    reset    │              │
├──────────────────────────────────────────┤              │
│                                          │              │
│   THE MAP                                │   AI CHAT    │
│    ┌──────────┐                          │              │
│    │ colour   │  ← legend floats on top  │              │
│    │ key      │    (click to collapse)   │              │
│    └──────────┘                          │              │
│                                          │              │
├──────────────────────────────────────────┤              │
│ gene box  [MS4A1 ×] [CD3D ×]             │              │
├──────────────────────────────────────────┤              │
│ marker table: gene · log2FC · FDR · %    │              │
└──────────────────────────────────────────┴──────────────┘
```

The colour key sits **on top of** the map, not beside it. This was changed on
purpose: as a side column it used 220px of width forever. Floating, it uses
none. Click its title to shrink it to a row of colour dots.

The gene box and the marker table sit **under** the map, not beside it. The
map is wide and short, which suits this kind of plot.

---

## 8. Running it

```bash
npm run prep     # once only — downloads and converts the data (~25 MB)
npm run dev      # starts both programs
npm test         # runs the maths tests
```

Then open http://localhost:5173

### Settings

The file `.env` holds three settings:

```
OPENAI_API_KEY=...                              your key
OPENAI_API_BASE=https://vn-llm.bioturing.com/v1 where the AI lives
LLM_MODEL=glm-5.2-Preserved-Think               which AI to use
```

---

## 9. Things worth knowing

**The gene data is stored "by gene", not "by cell".**
Every question in this app is about one gene at a time. Storing it by gene
means the answer is one continuous block of memory instead of a full scan.
The conversion happens once, in `npm run prep`.

**The colours are chosen, not random.**
They stay distinguishable for people with colour blindness. Do not swap them
for prettier ones without checking.

**Each gene gets its own colour scale.**
If you show two genes side by side, each has its own range printed under it.
Sharing one scale between genes with different ranges would be misleading.

**The map can look flipped.**
The drawing library points the Y axis downward by default. We turn that off in
one place only (`ScatterPanel.tsx`). Never flip Y anywhere else, or the two
flips cancel out and you are back to wrong.

---

## 10. Current status

Working and checked:

- the map, colours, zoom, pan
- gene search and colouring
- marker gene table
- the maths (tested against scanpy)

Not yet checked:

- the AI chat. The AI service was returning an error (502, their side, not
  ours) during testing. The connection code is correct and the request does
  reach them — but a full conversation has not been seen working yet.
