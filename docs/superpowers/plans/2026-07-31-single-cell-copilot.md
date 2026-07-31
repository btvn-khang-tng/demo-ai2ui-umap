# Single-Cell Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-cell RNA-seq explorer (PBMC 3k) where an LLM operates the DeckGL scatter plot through frontend tool calls, with every state change visible as a progress card in chat.

**Architecture:** Vite/React 18 browser app (DeckGL `OrthographicView` scatter, ~31 KB of coords) talks to an Express server that holds the 18 MB sparse expression matrix in memory and computes DEG statistics. All five LLM tools are registered *client-side* via `useFrontendTool`; the DEG tool's handler is a `fetch` to the server. That split is deliberate — server-side tools execute inside one HTTP request and emit no `TOOL_CALL_*` events, so the browser could not render a progress card.

**Tech Stack:** Vite · React 18.3 · TypeScript (strict) · DeckGL 9 (scoped pkgs only) · Express 4 · CopilotKit 1.64.1 (v2 API) · `@ai-sdk/openai-compatible@^2` · Vitest · h5wasm (dev only)

## Global Constraints

These apply to **every** task. Values are copied verbatim from the spec.

- **React must be 18.x.** `npm ls react` reports 18.x, not 19. Verify after every dependency install.
- **DeckGL: scoped packages only.** Install `@deck.gl/core @deck.gl/layers @deck.gl/react @deck.gl/widgets` at `^9`. **Never** install the `deck.gl` umbrella — it pins exact versions, drags in arcgis/carto/mapbox (579 MB vs 58 MB), and nests a second `@deck.gl/core` that breaks `instanceof` on `Layer`/`View`.
- **`@ai-sdk/openai-compatible` must be `^2`** (2.0.63 at time of writing). Not 1.x, not 3.x — the runtime pins `@ai-sdk/provider@3.x`. A nested `1.0.39` copy under `@ai-sdk/google-vertex` is **not** usable.
- **`BuiltInAgent` is imported from `@copilotkit/runtime/v2`**, never the package root.
- **CopilotKit endpoint:** mount on `/api/copilotkit` but pass `endpoint: "/"`. Express strips the mount prefix before the handler reads `req.url`.
- **`express.json()` must be registered AFTER the CopilotKit mount** — the runtime reads the raw request stream itself.
- **Tool handlers return, never `throw`.** Always `{ success, message, ...data }`. A throw suppresses CopilotKit's follow-up round and the user gets silence.
- **`result` in a `render` is a string** — `JSON.parse` it. `args` is `Partial<T>` while `status === "inProgress"` — guard every field access.
- **Forward the `AbortSignal`** from the handler context into every `fetch`.
- **`useFrontendTool`, `CopilotKitProvider`, `CopilotChat`, `useCopilotKit`** come from `@copilotkit/react-core/v2`. **`useCopilotReadable` has no `/v2` export** — import it from the package root.
- **Deleting `src/hooks/copilot/` must leave a fully working manual application.** No AI-layer imports anywhere else.
- **Statistics use `ddof = 1` throughout**, and the `overestim_var` denominator uses `n_g` for *both* groups — including inside the Welch–Satterthwaite df.
- **BH FDR runs across all 13,714 genes, then slices to top N.** Never the reverse.
- Plain CSS in `src/styles/`. No Tailwind, no component library. Light theme only.
- Out of scope (do not add): Next.js · Tailwind · component libraries · `useCoAgent` · A2UI · MCP · auth · a database · persistence · thread history · Docker · CI · dark mode · a second dataset · lasso select · pseudotime · violin/dot/heatmap plots · enrichment · React snapshot tests.

## Pre-Verified Environment Facts

Confirmed against the live gateway and registry on 2026-07-31 — do not re-litigate:

| Claim | Result |
|---|---|
| `POST /v1/responses` | **404** → gateway is chat-completions only, as the spec predicted |
| `POST /v1/chat/completions` | **200** |
| `reasoning_content` on `glm-5.2-Preserved-Think` | **present** (verified on a live completion) |
| Dataset URL | **HTTP 200, 24,653,425 bytes** exactly as specified |
| `@ai-sdk/openai-compatible` v2 max | **2.0.63** |
| CopilotKit | **1.64.1** is latest |
| deck.gl scoped | **9.3.7** |

⚠️ **Model ID correction.** The spec's `glm-5.2-preserved-thinking` **does not exist** on this gateway, nor does `kimi-k2.6`. `GET /v1/models` returns, among others: `glm-5.2-Preserved-Think`, `glm-5.2-Preserved-Think-High`, `glm-5.2`, `glm-5.1`, `kimi-k3`, `kimi-k3-Max`. **This plan uses `glm-5.2-Preserved-Think`** (verified to emit `reasoning_content` and to accept tool calls). `glm-5.1` from the spec is valid and is the fallback.

---

## File Structure

```
scripts/
  prepare-data.ts          download + h5ad → CSC binaries + meta.json + oracle fixture
src/
  server/
    index.ts               express wiring only
    llm.ts                 gateway + BuiltInAgent + SYSTEM_PROMPT
    data/
      load.ts              read data/ into memory once at boot
      store.ts             typed accessors: geneColumn(), clusterMask(), findGenes()
    stats/
      sparse.ts            CSC column mean/var over a mask   ← TDD
      fdr.ts               Benjamini-Hochberg               ← TDD
      ttest.ts             t-test_overestim_var + tsf       ← TDD
      deg.ts               orchestrates the above           ← TDD (golden)
    routes/
      data.ts              4 endpoints, thin
  hooks/copilot/           ★ delete this dir → app still works
    useRunDegTool.tsx
    useQueryGenesTool.tsx
    useColorByClusterTool.tsx
    useSearchGenesTool.tsx
    useHighlightClustersTool.tsx
    useSingleCellReadable.ts
    useSingleCellCopilot.ts   barrel
  state/
    useDatasetStore.ts     cells, clusters, coords (load-once)
    useViewStore.ts        colorMode, genes, highlight
  components/
    ScatterView.tsx        DeckGL + OrthographicView, small-multiple layout
    ScatterPanel.tsx       one panel (single or small-multiple)
    ClusterLegend.tsx
    ColorBar.tsx
    GenePanel.tsx
    DegPanel.tsx
    AgentActivityBar.tsx
    StepCard.tsx
    ChatPanel.tsx
    Toolbar.tsx
  lib/
    colors.ts              §7 palettes + sampleRamp()
    api.ts                 typed fetch wrappers
    constants.ts
    types.ts               shared DTOs (server + client)
  styles/
tests/stats/*.test.ts
data/                      gitignored build artifact
```

**Dependency direction:** `components/` → `state/` → `lib/`. `hooks/copilot/` → `state/` + `lib/` only. Nothing imports *from* `hooks/copilot/` except `App.tsx` (one line, one import).

---

## Task 1: Scaffold, pin dependencies, verify the toolchain

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `.env`, `.env.example`, `.gitignore`, `src/main.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a booting two-process dev environment; `npm run dev` serves Vite on 5173 proxying `/api` → 3001

- [ ] **Step 1: Scaffold Vite in place**

Working directory is the project root (`demo-umap-ai`). Scaffold into the current directory:

```bash
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2: Pin React 18 and install all dependencies**

The Vite template ships React 19. Overwrite it:

```bash
npm i react@^18.3.1 react-dom@^18.3.1
npm i -D @types/react@^18 @types/react-dom@^18
npm i @copilotkit/react-core@1.64.1 zod@^3
npm i @deck.gl/core@^9 @deck.gl/layers@^9 @deck.gl/react@^9 @deck.gl/widgets@^9
npm i @copilotkit/runtime@1.64.1 @ai-sdk/openai-compatible@^2 express@^4.21.2 dotenv
npm i -D tsx concurrently @types/express @types/node vitest h5wasm@^0.10
```

- [ ] **Step 3: Verify the pins — this gate is non-negotiable**

```bash
npm ls react
npm ls @ai-sdk/openai-compatible
npm ls @deck.gl/core
```

Expected: `react@18.3.x` (and no second 19.x copy); `@ai-sdk/openai-compatible@2.0.x`; **exactly one** `@deck.gl/core@9.x`. If `deck.gl` (umbrella) appears anywhere, `npm uninstall deck.gl` and reinstall the scoped set. **Do not continue until all three are correct.**

- [ ] **Step 4: Write `package.json` scripts**

```json
"scripts": {
  "prep": "tsx scripts/prepare-data.ts",
  "dev":  "concurrently -n web,api -c cyan,magenta \"vite\" \"tsx watch src/server/index.ts\"",
  "test": "vitest run",
  "build": "tsc -b && vite build"
}
```

- [ ] **Step 5: Configure the Vite proxy**

`vite.config.ts` — proxy **all** of `/api`, not just `/api/copilotkit`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } },
  },
});
```

- [ ] **Step 6: Write `.env.example` and `.env`**

`.env.example` (committed):

```
OPENAI_API_KEY=sk-xxxx
OPENAI_API_BASE=https://vn-llm.bioturing.com/v1
LLM_MODEL=glm-5.2-Preserved-Think
```

`.env` (gitignored) — same keys with the real token. Note `OPENAI_API_BASE` is **never read by CopilotKit**; `src/server/llm.ts` passes it explicitly.

- [ ] **Step 7: Add `data/` to `.gitignore`**

Append to `.gitignore`:

```
data/
.env
```

- [ ] **Step 8: Minimal boot check**

Replace `src/App.tsx` with a placeholder `<h1>single-cell copilot</h1>`. Run:

```bash
npm run dev
```

Expected: Vite serves on 5173, page renders the heading, no console errors. (The `api` process will fail until Task 9 — that is expected; `tsx watch` will retry.)

- [ ] **Step 9: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold vite + react 18 + deps, pinned"
```

---

## Task 2: Data preparation script

**Files:**
- Create: `scripts/prepare-data.ts`
- Output (gitignored): `data/pbmc3k.meta.json`, `data/pbmc3k.X.{data.f32,indices.i32,indptr.i32}`, `data/pbmc3k.oracle.json`

**Interfaces:**
- Consumes: nothing
- Produces: the four `data/` artifacts. `meta.json` shape:
  ```ts
  { dataset: "pbmc3k", nCells: number, nGenes: number,
    genes: string[],                        // length nGenes
    clusters: { id: number; label: string; nCells: number }[],
    clusterIds: number[],                   // length nCells
    coords: [number, number][],             // length nCells, normalized UMAP
    bounds: { xMin, xMax, yMin, yMax } }
  ```
  `oracle.json`: `{ names: string[][], scores: number[][] }` — 8 groups × 100 ranked entries, extracted from `/uns/rank_genes_groups`, consumed by the Task 6 golden test.

- [ ] **Step 1: Download the h5ad if absent**

```ts
const URL = "https://raw.githubusercontent.com/chanzuckerberg/cellxgene/main/example-dataset/pbmc3k.h5ad";
const H5 = "data/pbmc3k.h5ad";
if (!fs.existsSync(H5)) {
  fs.mkdirSync("data", { recursive: true });
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(H5, Buffer.from(await res.arrayBuffer()));
}
console.log(`h5ad: ${(fs.statSync(H5).size / 1e6).toFixed(1)} MB`);
```

Expected size: 24,653,425 bytes.

- [ ] **Step 2: Open with h5wasm and read compound field order**

This is the **legacy** AnnData layout — there are no `encoding-type` attributes. Read field positions from metadata, never hardcode them:

```ts
import * as hdf5 from "h5wasm/node";
await hdf5.ready;
const f = new hdf5.File(H5, "r");

function fieldIndex(path: string, name: string): number {
  const members = (f.get(path) as any).metadata.compound_type.members;
  const i = members.findIndex((m: any) => m.name === name);
  if (i < 0) throw new Error(`field ${name} not found in ${path}; have: ${members.map((m:any)=>m.name).join(",")}`);
  return i;
}
```

- [ ] **Step 3: Read cluster labels, codes, and UMAP**

```ts
const obs = (f.get("obs") as any).value as any[][];      // array of positional tuples
const louvainIdx = fieldIndex("obs", "louvain");
const clusterIds = obs.map(r => Number(r[louvainIdx]));  // int64 → BigInt → Number
const clusterLabels = (f.get("uns/louvain_categories") as any).value as string[];

const obsm = (f.get("obsm") as any).value as any[][];
const umapIdx = fieldIndex("obsm", "X_umap");
const rawUmap = obsm.map(r => [Number(r[umapIdx][0]), Number(r[umapIdx][1])] as [number, number]);
```

⚠️ int64 columns come back as **BigInt** and make `JSON.stringify` throw — cast every one with `Number()`.

- [ ] **Step 4: Normalize UMAP coordinates**

Centre on the centroid and scale the larger extent to ±10, so the DeckGL view needs no magic numbers. Do **not** negate Y — Task 11 passes `flipY: false` instead. Pick one, never both.

```ts
const cx = rawUmap.reduce((s, p) => s + p[0], 0) / rawUmap.length;
const cy = rawUmap.reduce((s, p) => s + p[1], 0) / rawUmap.length;
const half = Math.max(
  ...rawUmap.map(p => Math.max(Math.abs(p[0] - cx), Math.abs(p[1] - cy)))
);
const scale = 10 / half;
const coords = rawUmap.map(p => [(p[0]-cx)*scale, (p[1]-cy)*scale] as [number, number]);
```

- [ ] **Step 5: Read gene symbols and the raw CSR matrix**

```ts
const rawVar = (f.get("raw.var") as any).value as any[][];
const geneIdx = fieldIndex("raw.var", "index");
const genes = rawVar.map(r => String(r[geneIdx]));

const data    = (f.get("raw.X/data")    as any).value as Float32Array;
const indices = (f.get("raw.X/indices") as any).value as Int32Array;
const indptr  = (f.get("raw.X/indptr")  as any).value;              // may be BigInt64Array
const shape   = (f.get("raw.X") as any).attrs.h5sparse_shape.value; // [2638, 13714]
const nCells = Number(shape[0]), nGenes = Number(shape[1]);
const rowPtr = Int32Array.from(Array.from(indptr as any, (v: any) => Number(v)));
```

Expected: `nCells=2638`, `nGenes=13714`, `data.length=2238732`.

- [ ] **Step 6: Transpose CSR → CSC**

Every query in this app is gene-major (`query_genes` wants one gene's column; DEG iterates gene by gene). With CSC both are a contiguous slice. Do it once, offline — counting sort, O(nnz):

```ts
const colCounts = new Int32Array(nGenes);
for (let k = 0; k < indices.length; k++) colCounts[indices[k]]++;

const colPtr = new Int32Array(nGenes + 1);
for (let j = 0; j < nGenes; j++) colPtr[j + 1] = colPtr[j] + colCounts[j];

const cursor = Int32Array.from(colPtr.subarray(0, nGenes));
const cscData = new Float32Array(data.length);
const cscRows = new Int32Array(data.length);
for (let row = 0; row < nCells; row++) {
  for (let k = rowPtr[row]; k < rowPtr[row + 1]; k++) {
    const dst = cursor[indices[k]]++;
    cscData[dst] = data[k];
    cscRows[dst] = row;
  }
}
```

- [ ] **Step 7: Extract the DEG oracle fixture**

The golden test must read real numbers, not hand-copied ones:

```ts
const rg = "uns/rank_genes_groups";
const namesRows  = (f.get(`${rg}/names`)  as any).value as any[][];
const scoresRows = (f.get(`${rg}/scores`) as any).value as any[][];
const nGroups = clusterLabels.length;
const oracle = {
  names:  Array.from({length: nGroups}, (_, g) => namesRows.map(r => String(r[g]))),
  scores: Array.from({length: nGroups}, (_, g) => scoresRows.map(r => Number(r[g]))),
};
```

`names`/`scores` are compound datasets with fields `'0'`…`'7'` (louvain codes), 100 ranked entries each.

- [ ] **Step 8: Write all outputs and print the loud summary**

The script must be **idempotent and loud**. Print cell count, gene count, nnz, the cluster histogram, and every output file size:

```ts
fs.writeFileSync("data/pbmc3k.X.data.f32",    Buffer.from(cscData.buffer));
fs.writeFileSync("data/pbmc3k.X.indices.i32", Buffer.from(cscRows.buffer));
fs.writeFileSync("data/pbmc3k.X.indptr.i32",  Buffer.from(colPtr.buffer));
fs.writeFileSync("data/pbmc3k.meta.json",   JSON.stringify(meta));
fs.writeFileSync("data/pbmc3k.oracle.json", JSON.stringify(oracle));

console.log(`cells ${nCells}  genes ${nGenes}  nnz ${cscData.length}`);
for (const c of meta.clusters) console.log(`  ${c.id}  ${c.label.padEnd(20)} ${c.nCells}`);
for (const p of outputs) console.log(`  ${p}  ${(fs.statSync(p).size/1e6).toFixed(2)} MB`);
```

- [ ] **Step 9: Run and verify against the expected histogram**

```bash
npm run prep
```

Expected output includes `cells 2638  genes 13714  nnz 2238732` and this histogram exactly:

```
0  CD4 T cells          1144
1  CD14+ Monocytes       480
2  B cells               342
3  CD8 T cells           316
4  NK cells              154
5  FCGR3A+ Monocytes     150
6  Dendritic cells        37
7  Megakaryocytes         15
```

If any number differs, **stop** — the field-order lookup is reading the wrong column. Do not proceed.

- [ ] **Step 10: Commit**

```bash
git add scripts/prepare-data.ts .gitignore && git commit -m "feat: h5ad → CSC data prep with oracle fixture"
```

---

## Task 3: Sparse CSC mean/variance (TDD)

**Files:**
- Create: `src/server/stats/sparse.ts`
- Test: `tests/stats/sparse.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export interface CSC { data: Float32Array; rows: Int32Array; colPtr: Int32Array; nRows: number; nCols: number }
  export interface MeanVar { meanIn: number; varIn: number; meanOut: number; varOut: number; nzIn: number; nzOut: number }
  export function columnMeanVar(m: CSC, col: number, mask: Uint8Array, nIn: number): MeanVar
  export function transposeCsrToCsc(data: Float32Array, cols: Int32Array, rowPtr: Int32Array, nRows: number, nCols: number): CSC
  ```

- [ ] **Step 1: Write the failing tests**

`tests/stats/sparse.test.ts`. Zeros contribute nothing to the sum or sum-of-squares but **do** count toward `n` — the test fixture must include implicit zeros to catch that.

```ts
import { describe, it, expect } from "vitest";
import { columnMeanVar, transposeCsrToCsc } from "../../src/server/stats/sparse";

// dense reference, ddof = 1
function denseMeanVar(xs: number[]) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, v };
}

describe("columnMeanVar", () => {
  it("matches a dense reference, counting implicit zeros toward n", () => {
    // 5 cells x 1 gene, values: [3, 0, 1, 0, 8]   (0s are implicit)
    const m = { data: new Float32Array([3, 1, 8]), rows: new Int32Array([0, 2, 4]),
                colPtr: new Int32Array([0, 3]), nRows: 5, nCols: 1 };
    const mask = new Uint8Array([1, 1, 1, 0, 0]);   // group = cells 0,1,2
    const r = columnMeanVar(m, 0, mask, 3);

    const inRef  = denseMeanVar([3, 0, 1]);
    const outRef = denseMeanVar([0, 8]);
    expect(r.meanIn).toBeCloseTo(inRef.mean, 10);
    expect(r.varIn).toBeCloseTo(inRef.v, 10);
    expect(r.meanOut).toBeCloseTo(outRef.mean, 10);
    expect(r.varOut).toBeCloseTo(outRef.v, 10);
    expect(r.nzIn).toBe(2);    // 3 and 1
    expect(r.nzOut).toBe(1);   // 8
  });

  it("returns zero variance for an all-zero column", () => {
    const m = { data: new Float32Array([]), rows: new Int32Array([]),
                colPtr: new Int32Array([0, 0]), nRows: 4, nCols: 1 };
    const r = columnMeanVar(m, 0, new Uint8Array([1, 1, 0, 0]), 2);
    expect(r.meanIn).toBe(0);
    expect(r.varIn).toBe(0);
  });
});

describe("transposeCsrToCsc", () => {
  it("round-trips a small fixture", () => {
    // dense 3x2:  [[1,0],[0,2],[3,4]]
    const csc = transposeCsrToCsc(
      new Float32Array([1, 2, 3, 4]), new Int32Array([0, 1, 0, 1]),
      new Int32Array([0, 1, 2, 4]), 3, 2);
    const dense = (col: number) => {
      const out = [0, 0, 0];
      for (let k = csc.colPtr[col]; k < csc.colPtr[col + 1]; k++) out[csc.rows[k]] = csc.data[k];
      return out;
    };
    expect(dense(0)).toEqual([1, 0, 3]);
    expect(dense(1)).toEqual([0, 2, 4]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/stats/sparse.test.ts`
Expected: FAIL — `Failed to resolve import ... src/server/stats/sparse`.

- [ ] **Step 3: Implement**

`var = (Σx² − n·mean²)/(n−1)` is exact without densifying:

```ts
export interface CSC { data: Float32Array; rows: Int32Array; colPtr: Int32Array; nRows: number; nCols: number }
export interface MeanVar { meanIn: number; varIn: number; meanOut: number; varOut: number; nzIn: number; nzOut: number }

export function columnMeanVar(m: CSC, col: number, mask: Uint8Array, nIn: number): MeanVar {
  const nOut = m.nRows - nIn;
  let sIn = 0, qIn = 0, nzIn = 0, sOut = 0, qOut = 0, nzOut = 0;

  for (let k = m.colPtr[col]; k < m.colPtr[col + 1]; k++) {
    const v = m.data[k];
    if (mask[m.rows[k]]) { sIn += v; qIn += v * v; nzIn++; }
    else                 { sOut += v; qOut += v * v; nzOut++; }
  }

  const meanIn = nIn > 0 ? sIn / nIn : 0;
  const meanOut = nOut > 0 ? sOut / nOut : 0;
  // ddof = 1; guard n < 2 and clamp float noise at zero
  const varIn  = nIn  > 1 ? Math.max(0, (qIn  - nIn  * meanIn  * meanIn))  / (nIn  - 1) : 0;
  const varOut = nOut > 1 ? Math.max(0, (qOut - nOut * meanOut * meanOut)) / (nOut - 1) : 0;

  return { meanIn, varIn, meanOut, varOut, nzIn, nzOut };
}

export function transposeCsrToCsc(
  data: Float32Array, cols: Int32Array, rowPtr: Int32Array, nRows: number, nCols: number,
): CSC {
  const colPtr = new Int32Array(nCols + 1);
  for (let k = 0; k < cols.length; k++) colPtr[cols[k] + 1]++;
  for (let j = 0; j < nCols; j++) colPtr[j + 1] += colPtr[j];

  const cursor = Int32Array.from(colPtr.subarray(0, nCols));
  const outData = new Float32Array(data.length);
  const outRows = new Int32Array(data.length);
  for (let row = 0; row < nRows; row++) {
    for (let k = rowPtr[row]; k < rowPtr[row + 1]; k++) {
      const dst = cursor[cols[k]]++;
      outData[dst] = data[k];
      outRows[dst] = row;
    }
  }
  return { data: outData, rows: outRows, colPtr, nRows, nCols };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/stats/sparse.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/stats/sparse.ts tests/stats/sparse.test.ts
git commit -m "feat(stats): sparse CSC mean/var and CSR transpose"
```

---

## Task 4: Benjamini-Hochberg FDR (TDD)

**Files:**
- Create: `src/server/stats/fdr.ts`
- Test: `tests/stats/fdr.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export function benjaminiHochberg(pvals: Float64Array | number[]): Float64Array`

- [ ] **Step 1: Write the failing test**

Hand-computed vector. With n=5 and p = [0.01, 0.02, 0.03, 0.04, 0.05], raw `q_i = p_i·n/(i+1)` gives [0.05, 0.05, 0.05, 0.05, 0.05] — the monotonicity step is what makes the last three correct, so this fixture exercises it directly.

```ts
import { describe, it, expect } from "vitest";
import { benjaminiHochberg } from "../../src/server/stats/fdr";

describe("benjaminiHochberg", () => {
  it("matches a hand-computed vector", () => {
    // p sorted: 0.01 0.02 0.03 0.04 0.05, n = 5
    //   raw q = p*n/rank = 0.05, 0.05, 0.05, 0.05, 0.05
    const q = benjaminiHochberg([0.01, 0.02, 0.03, 0.04, 0.05]);
    for (const v of q) expect(v).toBeCloseTo(0.05, 12);
  });

  it("enforces monotonicity from the largest p downward", () => {
    // p sorted: 0.001 0.5, n = 2 → raw q = 0.002, 0.5 → already monotone
    // p sorted: 0.04 0.05, n = 2 → raw q = 0.08, 0.05 → 0.08 must clamp DOWN to 0.05
    const q = benjaminiHochberg([0.04, 0.05]);
    expect(q[0]).toBeCloseTo(0.05, 12);
    expect(q[1]).toBeCloseTo(0.05, 12);
  });

  it("preserves input order and clamps at 1", () => {
    const q = benjaminiHochberg([0.9, 0.001, 0.8]);
    expect(q[1]).toBeLessThan(q[0]);        // smallest p keeps smallest q
    for (const v of q) expect(v).toBeLessThanOrEqual(1);
  });

  it("handles a single p-value", () => {
    expect(Array.from(benjaminiHochberg([0.3]))[0]).toBeCloseTo(0.3, 12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/stats/fdr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function benjaminiHochberg(pvals: Float64Array | number[]): Float64Array {
  const n = pvals.length;
  const out = new Float64Array(n);
  if (n === 0) return out;

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => pvals[a] - pvals[b]);

  // walk from the largest p down, carrying the running minimum
  let running = Infinity;
  for (let rank = n; rank >= 1; rank--) {
    const idx = order[rank - 1];
    const q = (pvals[idx] * n) / rank;
    running = Math.min(running, q);
    out[idx] = Math.min(1, running);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/stats/fdr.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/stats/fdr.ts tests/stats/fdr.test.ts
git commit -m "feat(stats): Benjamini-Hochberg FDR with monotonicity"
```

---

## Task 5: t-test_overestim_var and the t distribution (TDD)

**Files:**
- Create: `src/server/stats/ttest.ts`
- Test: `tests/stats/ttest.test.ts`

**Interfaces:**
- Consumes: `MeanVar` from `./sparse`
- Produces:
  ```ts
  export function overestimScore(meanIn, varIn, meanOut, varOut, nIn: number): number
  export function welchDf(varIn: number, varOut: number, nIn: number): number
  export function log2FoldChange(meanIn: number, meanOut: number): number
  export function tTwoSidedP(t: number, df: number): number
  ```

- [ ] **Step 1: Write the failing tests**

The `n_g`-not-`n_r` denominator is the single most important behaviour here, so test it explicitly against a value that would differ under the naive formula.

```ts
import { describe, it, expect } from "vitest";
import { overestimScore, welchDf, log2FoldChange, tTwoSidedP } from "../../src/server/stats/ttest";

describe("overestimScore", () => {
  it("uses n_g in BOTH variance denominators", () => {
    // mg=2, vg=1, ng=10; mr=1, vr=4
    // overestim: (2-1)/sqrt(1/10 + 4/10) = 1/sqrt(0.5) = 1.41421356
    expect(overestimScore(2, 1, 1, 4, 10)).toBeCloseTo(1 / Math.sqrt(0.5), 10);
  });

  it("differs from the naive n_r formula (regression guard)", () => {
    // naive with n_r=90 would be 1/sqrt(1/10 + 4/90) = 1/sqrt(0.14444) = 2.631
    expect(overestimScore(2, 1, 1, 4, 10)).not.toBeCloseTo(2.631, 2);
  });

  it("returns 0 when both variances are 0", () => {
    expect(overestimScore(1, 0, 1, 0, 5)).toBe(0);
  });
});

describe("welchDf", () => {
  it("reduces to (n_g-1)(vg+vr)^2 / (vg^2+vr^2)", () => {
    // vg=1, vr=4, ng=10 → 9 * 25 / 17 = 13.2353
    expect(welchDf(1, 4, 10)).toBeCloseTo((9 * 25) / 17, 10);
  });

  it("falls back to 1 when undefined", () => {
    expect(welchDf(0, 0, 10)).toBe(1);
  });
});

describe("log2FoldChange", () => {
  it("un-logs with expm1 before the ratio", () => {
    // mg=log1p(3)=1.386, mr=log1p(1)=0.693 → log2((3+1e-9)/(1+1e-9)) = log2(3)
    expect(log2FoldChange(Math.log1p(3), Math.log1p(1))).toBeCloseTo(Math.log2(3), 6);
  });

  it("is negative when the group is lower", () => {
    expect(log2FoldChange(Math.log1p(1), Math.log1p(4))).toBeCloseTo(-2, 6);
  });
});

describe("tTwoSidedP", () => {
  // reference values from scipy.stats.t.sf(t, df) * 2
  it("matches known two-sided p-values", () => {
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 10)).toBeCloseTo(1.0, 10);
    expect(tTwoSidedP(1.96, 1e6)).toBeCloseTo(0.05, 3);
  });

  it("is symmetric in the sign of t", () => {
    expect(tTwoSidedP(-3, 20)).toBeCloseTo(tTwoSidedP(3, 20), 12);
  });

  it("does not underflow to exactly 0 for large t", () => {
    expect(tTwoSidedP(35.55, 1200)).toBeGreaterThan(0);
    expect(tTwoSidedP(35.55, 1200)).toBeLessThan(1e-100);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/stats/ttest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the statistics**

```ts
export function overestimScore(
  meanIn: number, varIn: number, meanOut: number, varOut: number, nIn: number,
): number {
  // ⚠️ n_g in BOTH denominators — scanpy's "hack for overestimating the
  //    variance for small groups" (ttest_ind_from_stats with nobs2 = ns_group)
  const denom = Math.sqrt(varIn / nIn + varOut / nIn);
  if (!(denom > 0)) return 0;
  return (meanIn - meanOut) / denom;
}

export function welchDf(varIn: number, varOut: number, nIn: number): number {
  // Welch–Satterthwaite with n1 = n2 = nIn reduces to:
  const num = (varIn + varOut) ** 2;
  const den = varIn * varIn + varOut * varOut;
  if (!(den > 0)) return 1;
  const df = ((nIn - 1) * num) / den;
  return Number.isFinite(df) && df > 0 ? df : 1;
}

export function log2FoldChange(meanIn: number, meanOut: number): number {
  return Math.log2((Math.expm1(meanIn) + 1e-9) / (Math.expm1(meanOut) + 1e-9));
}
```

- [ ] **Step 4: Implement the t survival function**

Two-sided p = `I_x(df/2, 1/2)` with `x = df/(df + t²)`, via the regularized incomplete beta (Lentz continued fraction, Numerical Recipes):

```ts
function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300, EPS = 3e-16;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/stats/ttest.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/server/stats/ttest.ts tests/stats/ttest.test.ts
git commit -m "feat(stats): t-test_overestim_var, Welch df, log2FC, t distribution"
```

---

## Task 6: DEG orchestration and the golden test (TDD)

This is the task that proves the whole statistics module. It gets the oracle.

**Files:**
- Create: `src/server/stats/deg.ts`
- Test: `tests/stats/deg.test.ts`

**Interfaces:**
- Consumes: `columnMeanVar`/`CSC` from `./sparse`, `benjaminiHochberg` from `./fdr`, `overestimScore`/`welchDf`/`log2FoldChange`/`tTwoSidedP` from `./ttest`
- Produces:
  ```ts
  export interface Marker { gene: string; score: number; log2fc: number; pval: number; fdr: number; pctIn: number; pctOut: number }
  export function rankGenesGroups(
    m: CSC, genes: string[], mask: Uint8Array, nIn: number, topN: number,
  ): Marker[]
  ```

- [ ] **Step 1: Write the failing golden test**

Reads the oracle fixture written by `npm run prep` — never hand-copied numbers.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { rankGenesGroups } from "../../src/server/stats/deg";
import type { CSC } from "../../src/server/stats/sparse";

let m: CSC, meta: any, oracle: { names: string[][]; scores: number[][] };

beforeAll(() => {
  if (!fs.existsSync("data/pbmc3k.meta.json")) {
    throw new Error("run `npm run prep` before the golden test");
  }
  meta = JSON.parse(fs.readFileSync("data/pbmc3k.meta.json", "utf8"));
  oracle = JSON.parse(fs.readFileSync("data/pbmc3k.oracle.json", "utf8"));
  const rd = (p: string, T: any) => {
    const b = fs.readFileSync(p);
    return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
  };
  m = {
    data:   rd("data/pbmc3k.X.data.f32", Float32Array),
    rows:   rd("data/pbmc3k.X.indices.i32", Int32Array),
    colPtr: rd("data/pbmc3k.X.indptr.i32", Int32Array),
    nRows: meta.nCells, nCols: meta.nGenes,
  };
});

describe("rankGenesGroups — golden vs scanpy", () => {
  it("reproduces top-100 names in order and scores within 1e-2 for all 8 groups", () => {
    let worst = 0;
    for (let g = 0; g < meta.clusters.length; g++) {
      const mask = new Uint8Array(meta.nCells);
      let nIn = 0;
      for (let i = 0; i < meta.nCells; i++) {
        if (meta.clusterIds[i] === g) { mask[i] = 1; nIn++; }
      }
      const got = rankGenesGroups(m, meta.genes, mask, nIn, 100);

      expect(got.map(x => x.gene), `group ${g} ${meta.clusters[g].label}`)
        .toEqual(oracle.names[g]);

      for (let i = 0; i < 100; i++) {
        const d = Math.abs(got[i].score - oracle.scores[g][i]);
        worst = Math.max(worst, d);
        expect(d, `group ${g} rank ${i} gene ${got[i].gene}`).toBeLessThan(1e-2);
      }
    }
    // The oracle is stored as float32 and scanpy accumulates in a different
    // order — 1.45e-3 is the best achievable. Do NOT tighten to 1e-3.
    console.log(`golden: max |Δscore| = ${worst.toExponential(3)}`);
    expect(worst).toBeLessThan(1e-2);
  }, 120_000);

  it("reproduces the published CD4 T cells top marker figures", () => {
    const g = 0;
    const mask = new Uint8Array(meta.nCells);
    let nIn = 0;
    for (let i = 0; i < meta.nCells; i++) {
      if (meta.clusterIds[i] === g) { mask[i] = 1; nIn++; }
    }
    expect(nIn).toBe(1144);
    const top = rankGenesGroups(m, meta.genes, mask, nIn, 10)[0];
    expect(top.gene).toBe("LDHB");
    expect(top.score).toBeCloseTo(35.554, 1);
    expect(top.log2fc).toBeCloseTo(2.195, 2);
    expect(top.pctIn).toBeCloseTo(0.922, 2);
    expect(top.pctOut).toBeCloseTo(0.486, 2);
    expect(top.fdr).toBeLessThan(1e-200);
  }, 60_000);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/stats/deg.test.ts`
Expected: FAIL — module not found. (If it fails on the missing fixture instead, run `npm run prep` first.)

- [ ] **Step 3: Implement**

⚠️ The BH ordering trap: correct **all 13,714** p-values, *then* slice to top N. Doing it the other way gives wrong FDRs and is the bug you will actually write.

```ts
import { columnMeanVar, type CSC } from "./sparse";
import { benjaminiHochberg } from "./fdr";
import { overestimScore, welchDf, log2FoldChange, tTwoSidedP } from "./ttest";

export interface Marker {
  gene: string; score: number; log2fc: number;
  pval: number; fdr: number; pctIn: number; pctOut: number;
}

export function rankGenesGroups(
  m: CSC, genes: string[], mask: Uint8Array, nIn: number, topN: number,
): Marker[] {
  const nGenes = m.nCols;
  const nOut = m.nRows - nIn;

  const scores = new Float64Array(nGenes);
  const l2fc   = new Float64Array(nGenes);
  const pvals  = new Float64Array(nGenes);
  const pctIn  = new Float64Array(nGenes);
  const pctOut = new Float64Array(nGenes);

  for (let j = 0; j < nGenes; j++) {
    const s = columnMeanVar(m, j, mask, nIn);

    let sc = overestimScore(s.meanIn, s.varIn, s.meanOut, s.varOut, nIn);
    if (!Number.isFinite(sc)) sc = 0;              // scanpy: NaN scores → 0
    scores[j] = sc;

    l2fc[j] = log2FoldChange(s.meanIn, s.meanOut);

    const p = tTwoSidedP(sc, welchDf(s.varIn, s.varOut, nIn));
    pvals[j] = Number.isFinite(p) ? p : 1.0;       // scanpy: NaN p-values → 1.0

    pctIn[j]  = nIn  > 0 ? s.nzIn  / nIn  : 0;
    pctOut[j] = nOut > 0 ? s.nzOut / nOut : 0;
  }

  // ⚠️ BH across ALL genes, THEN slice. Never the reverse.
  const fdr = benjaminiHochberg(pvals);

  const order = Array.from({ length: nGenes }, (_, i) => i)
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, Math.min(topN, nGenes));

  return order.map(j => ({
    gene: genes[j], score: scores[j], log2fc: l2fc[j],
    pval: pvals[j], fdr: fdr[j], pctIn: pctIn[j], pctOut: pctOut[j],
  }));
}
```

- [ ] **Step 4: Run to verify pass and record the deviation**

```bash
npx vitest run tests/stats/deg.test.ts
```

Expected: PASS. The console prints `golden: max |Δscore| = …`. **Record this number — it is a required item in the final report.** Expect ~1.45e-3. If it is much larger, the mean/var, ddof, or `n_g`-vs-`n_r` denominator is wrong; if names mismatch, that is the signal that matters.

- [ ] **Step 5: Measure wall time**

Add a timing log and run once for all 13,714 genes on the largest group. Expected 50–200 ms. **Record it — also required in the final report.** Do *not* add artificial delay to make it feel weightier.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all four stats test files.

- [ ] **Step 7: Commit**

```bash
git add src/server/stats/deg.ts tests/stats/deg.test.ts
git commit -m "feat(stats): rank_genes_groups with golden test vs scanpy oracle"
```

---

## Task 7: Server data loading and typed store

**Files:**
- Create: `src/server/data/load.ts`, `src/server/data/store.ts`, `src/lib/types.ts`

**Interfaces:**
- Consumes: `CSC` from `../stats/sparse`
- Produces:
  ```ts
  // load.ts
  export function loadDataset(): Dataset            // called once at boot, memoized
  // store.ts
  export interface Dataset { meta: Meta; matrix: CSC; geneIndex: Map<string, number> }
  export function geneColumn(d: Dataset, gene: string): { values: Float32Array; min: number; max: number; pctExpressing: number } | null
  export function clusterMask(d: Dataset, label: string): { mask: Uint8Array; nIn: number; id: number } | null
  export function findGenes(d: Dataset, q: string, limit: number): { genes: { symbol: string; nCellsExpressing: number }[]; total: number; truncated: boolean }
  export function resolveClusterLabel(d: Dataset, input: string): string | null   // case/whitespace forgiving
  ```
  `src/lib/types.ts` holds the DTOs shared by server and client: `Meta`, `ClusterInfo`, `Marker`, `GeneVector`, `DegResponse`, `QueryGenesResponse`.

- [ ] **Step 1: Define the shared DTOs**

`src/lib/types.ts` — one source of truth for both sides of the wire:

```ts
export interface ClusterInfo { id: number; label: string; nCells: number }
export interface Meta {
  dataset: string; nCells: number; nGenes: number;
  genes: string[]; clusters: ClusterInfo[]; clusterIds: number[];
  coords: [number, number][];
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}
export interface Marker {
  gene: string; score: number; log2fc: number;
  pval: number; fdr: number; pctIn: number; pctOut: number;
}
export interface GeneVector {
  gene: string; values: number[]; min: number; max: number; pctExpressing: number;
}
export interface DegResponse {
  group: string; reference: string;
  nCellsGroup: number; nCellsReference: number;
  markers: Marker[]; warning: string | null;
}
export interface QueryGenesResponse { results: GeneVector[]; notFound: string[] }
```

`DatasetResponse` is `Omit<Meta, "genes">` — the browser gets clusters/coords/bounds but **never** the 13,714-symbol list (that is what `search_genes` is for).

- [ ] **Step 2: Implement `load.ts`**

Reads the four `data/` artifacts once, memoized in a module-level variable. Fail loudly with the exact remediation:

```ts
import fs from "node:fs";
import type { Dataset } from "./store";

let cached: Dataset | null = null;

function readTyped<T>(path: string, T: any): T {
  const b = fs.readFileSync(path);
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
}

export function loadDataset(): Dataset {
  if (cached) return cached;
  if (!fs.existsSync("data/pbmc3k.meta.json")) {
    throw new Error("data/ is missing — run `npm run prep` first");
  }
  const meta = JSON.parse(fs.readFileSync("data/pbmc3k.meta.json", "utf8"));
  const matrix = {
    data:   readTyped<Float32Array>("data/pbmc3k.X.data.f32", Float32Array),
    rows:   readTyped<Int32Array>("data/pbmc3k.X.indices.i32", Int32Array),
    colPtr: readTyped<Int32Array>("data/pbmc3k.X.indptr.i32", Int32Array),
    nRows: meta.nCells, nCols: meta.nGenes,
  };
  const geneIndex = new Map<string, number>();
  meta.genes.forEach((g: string, i: number) => geneIndex.set(g.toUpperCase(), i));
  console.log(`[data] ${meta.nCells} cells × ${meta.nGenes} genes, nnz ${matrix.data.length}`);
  cached = { meta, matrix, geneIndex };
  return cached;
}
```

- [ ] **Step 3: Implement `store.ts` accessors**

`geneColumn` densifies one CSC column into a `Float32Array` of length nCells:

```ts
export function geneColumn(d: Dataset, gene: string) {
  const j = d.geneIndex.get(gene.trim().toUpperCase());
  if (j === undefined) return null;
  const values = new Float32Array(d.meta.nCells);   // implicit zeros
  let max = 0, nz = 0;
  for (let k = d.matrix.colPtr[j]; k < d.matrix.colPtr[j + 1]; k++) {
    const v = d.matrix.data[k];
    values[d.matrix.rows[k]] = v;
    if (v > max) max = v;
    nz++;
  }
  return { values, min: 0, max, pctExpressing: nz / d.meta.nCells };
}
```

`resolveClusterLabel` must be forgiving — the LLM will paraphrase. Match on lowercased, whitespace-collapsed labels:

```ts
export function resolveClusterLabel(d: Dataset, input: string): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(input);
  const exact = d.meta.clusters.find(c => norm(c.label) === target);
  if (exact) return exact.label;
  const partial = d.meta.clusters.filter(c => norm(c.label).includes(target));
  return partial.length === 1 ? partial[0].label : null;
}
```

`findGenes` ranks prefix matches before substring matches, case-insensitive, and never returns all 13,714.

- [ ] **Step 4: Smoke-test from the command line**

```bash
npx tsx -e "import {loadDataset} from './src/server/data/load.ts'; import {geneColumn,resolveClusterLabel} from './src/server/data/store.ts'; const d=loadDataset(); console.log(geneColumn(d,'MS4A1')?.max, resolveClusterLabel(d,'  cd4 t CELLS '));"
```

Expected: a positive max, and `CD4 T cells`.

- [ ] **Step 5: Commit**

```bash
git add src/server/data src/lib/types.ts
git commit -m "feat(server): dataset loading and typed accessors"
```

---

## Task 8: The four data endpoints

**Files:**
- Create: `src/server/routes/data.ts`

**Interfaces:**
- Consumes: `loadDataset`, `geneColumn`, `clusterMask`, `findGenes`, `resolveClusterLabel`, `rankGenesGroups`
- Produces: `export const dataRouter: express.Router` with `GET /data`, `GET /genes`, `POST /query_genes`, `POST /run_deg`

Handlers stay **thin** — validate, call `stats/`, serialize. Business logic does not live here.

- [ ] **Step 1: `GET /api/data`**

Returns everything the browser needs for the default view (~60 KB). Note it omits `genes`:

```ts
router.get("/data", (_req, res) => {
  const d = loadDataset();
  const { genes, ...rest } = d.meta;
  res.json(rest);
});
```

- [ ] **Step 2: `GET /api/genes?q=&limit=50`**

Never return all 13,714. Prefix matches first, then substring, case-insensitive:

```ts
router.get("/genes", (req, res) => {
  const q = String(req.query.q ?? "");
  const limit = Math.min(200, Number(req.query.limit ?? 50));
  res.json(findGenes(loadDataset(), q, limit));
});
```

- [ ] **Step 3: `POST /api/query_genes`**

Cap at **4** genes. Unknown symbols go in `notFound` with the rest still returned — a partial success the LLM can act on beats a 400 it can only apologise for:

```ts
router.post("/query_genes", (req, res) => {
  const d = loadDataset();
  const requested: string[] = Array.isArray(req.body?.genes) ? req.body.genes : [];
  if (requested.length === 0) return res.status(400).json({ error: "genes[] is required" });

  const results = [], notFound = [];
  for (const g of requested.slice(0, 4)) {
    const col = geneColumn(d, g);
    if (!col) { notFound.push(g); continue; }
    results.push({
      gene: d.meta.genes[d.geneIndex.get(g.trim().toUpperCase())!],
      values: Array.from(col.values), min: col.min, max: col.max,
      pctExpressing: col.pctExpressing,
    });
  }
  res.json({ results, notFound });
});
```

- [ ] **Step 4: `POST /api/run_deg`**

On a label miss, return the valid labels **in the error message** so the model can correct itself on the next round rather than guessing again. Emit `warning` for any group under 30 cells:

```ts
router.post("/run_deg", (req, res) => {
  const d = loadDataset();
  const topN = Math.min(200, Number(req.body?.topN ?? 100));
  const label = resolveClusterLabel(d, String(req.body?.group ?? ""));
  if (!label) {
    return res.status(400).json({
      error: `Unknown group "${req.body?.group}". Valid labels: ${
        d.meta.clusters.map(c => c.label).join(", ")}`,
    });
  }
  const { mask, nIn } = clusterMask(d, label)!;
  const t0 = performance.now();
  const markers = rankGenesGroups(d.matrix, d.meta.genes, mask, nIn, topN);
  console.log(`[deg] ${label}: ${d.meta.nGenes} genes in ${(performance.now()-t0).toFixed(0)} ms`);

  res.json({
    group: label, reference: "rest",
    nCellsGroup: nIn, nCellsReference: d.meta.nCells - nIn,
    markers,
    warning: nIn < 30
      ? `${label} has only ${nIn} cells; results are noisy.`
      : null,
  });
});
```

- [ ] **Step 5: Verify with curl (after Task 9 wires the server)**

Deferred to Task 9 Step 5 — the router has no listener until then.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/data.ts
git commit -m "feat(server): four data endpoints"
```

---

## Task 9: Express wiring and the LLM gateway

**Files:**
- Create: `src/server/llm.ts`, `src/server/index.ts`

**Interfaces:**
- Consumes: `dataRouter` from `./routes/data.js`
- Produces: a listening server on 3001; `export const runtime: CopilotRuntime`, `export const SYSTEM_PROMPT: string`

⚠️ **Four ordering traps, all producing confusing symptoms.** Get these exactly right:

| Trap | Symptom |
|---|---|
| `endpoint: "/api/copilotkit"` when mounted on that path | plain `404`, no detail |
| `BuiltInAgent` from `@copilotkit/runtime` root | `undefined is not a constructor` |
| `@ai-sdk/openai-compatible` 1.x or 3.x | provider-spec mismatch |
| `express.json()` before the CopilotKit mount | requests hang or 400 |

- [ ] **Step 1: Write `src/server/llm.ts`**

```ts
import { BuiltInAgent } from "@copilotkit/runtime/v2";     // ⚠️ /v2, not the root
import { CopilotRuntime } from "@copilotkit/runtime";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// ⚠️ Use openai-compatible, NOT OpenAIAdapter: createOpenAI(...)(id) resolves to
//    the Responses API in @ai-sdk/openai@3.x and issues POST /responses, which
//    this gateway 404s (verified). openai-compatible also maps reasoning_content
//    → AI SDK reasoning parts → AG-UI REASONING_* events → the collapsible
//    "Thought for N seconds" panel. @ai-sdk/openai's .chat() drops those silently.
const gateway = createOpenAICompatible({
  name: "vn-llm",
  baseURL: process.env.OPENAI_API_BASE!,   // CopilotKit never reads this env var itself
  apiKey: process.env.OPENAI_API_KEY!,
});

export const SYSTEM_PROMPT = `You operate a single-cell RNA-seq scatter plot. Work one tool at a time: call a tool, read its result, say one short sentence about what you found, then decide the next step. Do not call several tools in one turn.

Cell type labels are exact strings from the cluster list in the context — use them verbatim. There are two T cell populations (CD4 and CD8); if the user says "T cells" without qualifying, pick one, say which, and offer the other.

Gene symbols are HGNC (CD3D, MS4A1, LYZ). If you are not certain a symbol exists, call search_genes first.

When you report a marker, give its log2FC and FDR, and mention pctIn/pctOut when they undercut the result (a high fold-change expressed in 8% of cells is weak). Relay any warning field verbatim.

Every tool returns {success, message}. If success is false, tell the user what went wrong and what you'll try instead.`;

export const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: gateway(process.env.LLM_MODEL ?? "glm-5.2-Preserved-Think"),
      maxSteps: 10,
      instructions: SYSTEM_PROMPT,          // static → sits ahead of the volatile readable, stays cacheable
    }),
  },
});
```

- [ ] **Step 2: Write `src/server/index.ts` with the mount order**

```ts
import "dotenv/config";
import express from "express";
import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";
import { runtime } from "./llm.js";
import { dataRouter } from "./routes/data.js";
import { loadDataset } from "./data/load.js";

const app = express();

// CopilotKit FIRST, mounted on a path, with endpoint: "/".
// ⚠️ Express strips the mount prefix and the handler reads req.url post-strip.
//    Passing endpoint: "/api/copilotkit" here yields a bare 404.
app.use("/api/copilotkit", copilotRuntimeNodeExpressEndpoint({ runtime, endpoint: "/" }));

// ⚠️ express.json() AFTER the CopilotKit handler — the runtime reads the raw stream.
app.use(express.json({ limit: "2mb" }));
app.use("/api", dataRouter);

loadDataset();                                  // fail fast at boot, not on first request
app.listen(3001, () => console.log("http://localhost:3001"));
```

- [ ] **Step 3: Boot the server**

```bash
npx tsx src/server/index.ts
```

Expected: `[data] 2638 cells × 13714 genes, nnz 2238732` then `http://localhost:3001`.

- [ ] **Step 4: Verify the data endpoints**

```bash
curl -s localhost:3001/api/data | head -c 200
curl -s 'localhost:3001/api/genes?q=CD3&limit=5'
curl -s -X POST localhost:3001/api/query_genes -H 'content-type: application/json' -d '{"genes":["MS4A1","FAKEGENE1"]}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['results'][0]['gene'],d['results'][0]['max'],d['notFound'])"
```

Expected: JSON with `nCells: 2638`; CD3D/CD3E/CD3G in the gene search; `MS4A1 <max> ['FAKEGENE1']`.

- [ ] **Step 5: Verify the DEG smoke test against the published figures**

```bash
curl -s -X POST localhost:3001/api/run_deg -H 'content-type: application/json' -d '{"group":"CD4 T cells","topN":5}' | python3 -m json.tool | head -20
```

Expected: `nCellsGroup: 1144`, first marker `LDHB` with `score ≈ 35.554`, `log2fc ≈ 2.195`, `fdr ≈ 1.9e-216`, `pctIn ≈ 0.922`, `pctOut ≈ 0.486`. Also check the small-group warning:

```bash
curl -s -X POST localhost:3001/api/run_deg -H 'content-type: application/json' -d '{"group":"megakaryocytes","topN":3}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['group'],d['nCellsGroup'],'|',d['warning'],'|',[m['gene'] for m in d['markers']])"
```

Expected: `Megakaryocytes 15 | Megakaryocytes has only 15 cells; results are noisy. | ['PPBP', 'PF4', 'GPX1']` — note the lowercase input resolved, proving `resolveClusterLabel`.

- [ ] **Step 6: Verify the CopilotKit mount answers**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/api/copilotkit -H 'content-type: application/json' -d '{}'
```

Expected: **not 404.** A 400/422 is fine here (malformed body). A bare 404 means the `endpoint: "/"` trap — fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/server/index.ts src/server/llm.ts
git commit -m "feat(server): express wiring + BuiltInAgent on openai-compatible gateway"
```

---

## Task 10: Client foundation — colors, api, stores

**Files:**
- Create: `src/lib/colors.ts`, `src/lib/api.ts`, `src/lib/constants.ts`, `src/state/useDatasetStore.ts`, `src/state/useViewStore.ts`

**Interfaces:**
- Consumes: `src/lib/types.ts` from Task 7
- Produces:
  ```ts
  // colors.ts
  export const CLUSTER_COLORS: [number, number, number][]     // 12 entries
  export const EXPRESSION_RAMP: [number, number, number][]    // 9 anchors
  export const VIRIDIS_RAMP: [number, number, number][]       // 9 anchors
  export function sampleRamp(ramp: [number,number,number][], t: number): [number,number,number]
  // api.ts
  export function fetchDataset(signal?: AbortSignal): Promise<DatasetResponse>
  export function searchGenes(q: string, signal?: AbortSignal): Promise<GeneSearchResponse>
  export function queryGenes(genes: string[], signal?: AbortSignal): Promise<QueryGenesResponse>
  export function runDeg(group: string, topN?: number, signal?: AbortSignal): Promise<DegResponse>
  // useViewStore.ts
  export interface ViewState {
    colorMode: "cluster" | "expression";
    genes: GeneVector[];                 // 0-4, drives small multiples
    ramp: "expression" | "viridis";
    highlighted: string[] | null;
    lastDeg: DegResponse | null;
    error: string | null;
  }
  export function useViewStore(): ViewState & {
    showGenes(g: GeneVector[]): void;    // ← the ONE code path for gene display
    colorByCluster(): void;
    setHighlight(c: string[] | null): void;
    setLastDeg(d: DegResponse | null): void;
    setRamp(r: "expression" | "viridis"): void;
    setError(e: string | null): void;
  }
  ```

**Critical:** `showGenes` is the single store action used by *both* the manual gene box (Task 12) and the `query_genes` tool (Task 14). If the manual path and the agent path diverge, one of them is a lie.

- [ ] **Step 1: Write `src/lib/colors.ts`**

Use these exact tuples — they were generated and validated (worst-case pairwise ΔE 20.7 normal / 8.8 protanomaly). Do not substitute.

```ts
export const CLUSTER_COLORS: [number, number, number][] = [
  [  0, 114, 178], [230, 159,   0], [  0, 158, 115], [213,  94,   0],
  [204, 121, 167], [ 86, 180, 233], [240, 228,  66], [140, 109,  49],
  [135,   0,  75], [ 90,  15, 195], [ 75,  75,   0], [165, 195, 165],
];

export const EXPRESSION_RAMP: [number, number, number][] = [
  [237, 237, 237], [243, 214, 199], [245, 186, 160], [241, 151, 120],
  [231, 111,  85], [216,  71,  58], [188,  37,  47], [149,  15,  38],
  [103,   0,  31],
];

export const VIRIDIS_RAMP: [number, number, number][] = [
  [ 68,   1,  84], [ 71,  45, 123], [ 59,  82, 139], [ 44, 114, 142],
  [ 33, 145, 140], [ 40, 174, 128], [ 94, 201,  98], [173, 220,  48],
  [253, 231,  37],
];

/** Linear RGB interpolation between anchors. Measured max ΔE 1.0 vs true 256-stop viridis. */
export function sampleRamp(
  ramp: [number, number, number][], t: number,
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const x = clamped * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i], b = ramp[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export const clusterColor = (i: number) => CLUSTER_COLORS[i % CLUSTER_COLORS.length];
```

- [ ] **Step 2: Write `src/lib/api.ts`**

One place for typed fetch wrappers. Every one takes an optional `AbortSignal`:

```ts
async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const runDeg = (group: string, topN = 100, signal?: AbortSignal) =>
  post<DegResponse>("/api/run_deg", { group, topN }, signal);
export const queryGenes = (genes: string[], signal?: AbortSignal) =>
  post<QueryGenesResponse>("/api/query_genes", { genes }, signal);
```

- [ ] **Step 3: Write the stores**

Plain React context + `useReducer` (no state library — YAGNI). `useDatasetStore` loads `/api/data` once on mount and exposes `{ data, loading, error }`. `useViewStore` holds the view state above.

⚠️ Every mutator must use the functional form (`setX(prev => …)`) — tool handlers capture state from the render they were registered in, and stale closures here are subtle and infuriating.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/state
git commit -m "feat(client): colors, typed api client, dataset and view stores"
```

---

## Task 11: The scatter plot

**Files:**
- Create: `src/components/ScatterView.tsx`, `src/components/ScatterPanel.tsx`, `src/components/ClusterLegend.tsx`, `src/components/ColorBar.tsx`, `src/styles/scatter.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useDatasetStore`, `useViewStore`, `clusterColor`, `sampleRamp`
- Produces: `<ScatterView />` — renders 1 panel in cluster mode, N panels (small multiples) when `genes.length > 1`

- [ ] **Step 1: Write `ScatterPanel.tsx` with the verified DeckGL form**

⚠️ Two traps, both verified:
- **Pass a single view, not an array.** `views={[new OrthographicView()]}` makes the view-state type resolve to `{ [viewId: string]: OrthographicViewState }`, so a flat `{target, zoom}` fails with `TS2559`.
- **`flipY` defaults to `true`**, so +Y points down and the UMAP renders mirrored vs every scanpy figure. Task 2 already declined to negate Y — so pass `flipY: false` here. Never both.

```tsx
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";

export function ScatterPanel({ coords, colors, label, updateKey }: Props) {
  const layer = new ScatterplotLayer<number>({
    id: `scatter-${label ?? "cluster"}`,
    data: Array.from({ length: coords.length }, (_, i) => i),
    getPosition: (i) => [coords[i][0], coords[i][1]],
    getFillColor: (i) => colors(i),
    radiusUnits: "pixels",
    getRadius: 2,
    pickable: true,
    transitions: { getFillColor: 300 },     // §9: animate, don't snap
    updateTriggers: { getFillColor: [updateKey] },
  });

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho", flipY: false })}
      controller={true}
      initialViewState={{ target: [0, 0, 0], zoom: 4, minZoom: -2, maxZoom: 10 }}
      layers={[layer]}
    />
  );
}
```

The view state is `{ target, zoom }` — there is no `longitude`/`latitude` here. 2,638 points is trivial; do **not** reach for binary attribute packing.

- [ ] **Step 2: Colour accessors**

Cluster mode: `clusterColor(clusterIds[i])` — clusterId 0 (CD4 T cells) → `CLUSTER_COLORS[0]`, exactly as specified. Expression mode: `sampleRamp(ramp, values[i] / max)` where `max` is **that gene's** observed maximum.

Highlight dims non-matching cells to ~15% opacity via a 4th alpha channel — pure client state, no fetch.

- [ ] **Step 3: `ScatterView.tsx` — small multiples**

`genes.length <= 1` → one panel filling the area. `genes.length > 1` → a CSS grid of panels, **each with its own scale and its own labelled colorbar**. A shared scale across genes with different dynamic ranges is a lie.

- [ ] **Step 4: Legend and colorbar (not optional)**

`ClusterLegend` — swatch + label + count, shown in cluster mode. **Clicking an entry calls the same store action as `highlight_clusters`** (`setHighlight`), not a parallel code path.

`ColorBar` — gradient with numeric min/max and the gene symbol, shown in expression mode. Never silently clip; always show the real numeric range.

- [ ] **Step 5: Verify in a browser**

```bash
npm run dev
```

Open http://localhost:5173. Expected: 2,638 cells coloured by cluster in 8 visible islands, legend listing all 8 labels with counts matching the Task 2 histogram, pan and zoom working. Compare orientation against a published scanpy PBMC3k UMAP — if it is vertically mirrored, `flipY` is wrong.

- [ ] **Step 6: Commit**

```bash
git add src/components src/styles src/App.tsx
git commit -m "feat(client): DeckGL scatter, cluster legend, colorbar"
```

---

## Task 12: Gene panel, DEG panel, toolbar — the manual application

At the end of this task the app is **fully usable with no AI whatsoever**. That is the constraint that keeps the AI layer from leaking.

**Files:**
- Create: `src/components/GenePanel.tsx`, `src/components/DegPanel.tsx`, `src/components/Toolbar.tsx`, `src/styles/panels.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useViewStore().showGenes`, `colorByCluster`, `setLastDeg`; `queryGenes`, `runDeg`, `searchGenes` from `lib/api`
- Produces: the complete manual UI

- [ ] **Step 1: `GenePanel.tsx` — the gene box is a real control**

Typing a gene and pressing Enter calls `queryGenes([symbol])` then `showGenes(...)` — **the exact same store action `query_genes` will call in Task 14.** Chips show the displayed genes with their ranges; an × removes one.

- [ ] **Step 2: `DegPanel.tsx` — marker table**

Columns: gene, log2FC, FDR, pctIn, pctOut. Reads `useViewStore().lastDeg`. Holds the **full 100 markers** (the tool result in Task 14 will carry only ~10). Clicking a gene row calls `showGenes` — same path again.

- [ ] **Step 3: `Toolbar.tsx`**

Dataset name, colour-mode indicator, ramp toggle (grey→red default / viridis), and a Reset button calling `colorByCluster()`.

- [ ] **Step 4: Errors are visible, not swallowed**

Failed fetch, unknown gene, and empty DEG group all render in the UI via `useViewStore().error`. (Task 14 additionally returns them in the tool result.)

- [ ] **Step 5: Verify the full manual path in a browser**

With `npm run dev` running, at http://localhost:5173:
1. Type `MS4A1` in the gene box, press Enter → scatter recolours grey→red, a colorbar appears with the **real numeric range**, and the B cell island lights up.
2. Add `CD3D` → two panels side by side, each with its own labelled colorbar.
3. Click Reset → back to cluster colours, chips cleared.
4. Type `FAKEGENE1` → a visible inline error, no console exception.
5. Click a legend entry → the other clusters dim to ~15%.

- [ ] **Step 6: Commit**

```bash
git add src/components src/styles src/App.tsx
git commit -m "feat(client): gene panel, DEG panel, toolbar — manual app complete"
```

---

## Task 13: CopilotKit provider, chat panel, StepCard

**Files:**
- Create: `src/components/ChatPanel.tsx`, `src/components/StepCard.tsx`, `src/styles/chat.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CopilotKitProvider`, `CopilotChat` from `@copilotkit/react-core/v2`
- Produces: `<ChatPanel />` (420 px right column); `export function StepCard(props: { name: string; status: "inProgress"|"executing"|"complete"; args: any; result?: string }): JSX.Element`

- [ ] **Step 1: Wire the provider**

```tsx
import { CopilotKitProvider, CopilotChat } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

<CopilotKitProvider runtimeUrl="/api/copilotkit">
  <App />
</CopilotKitProvider>
```

Keep `<StrictMode>`. React 18 StrictMode double-invokes effects in dev, so "tool already registered" warnings will appear — **that is StrictMode, not a bug. Do not delete StrictMode to silence it.** Report it only if it causes real breakage.

- [ ] **Step 2: Write `StepCard.tsx` — three states**

```
inProgress  ⏳  run_deg     args still streaming (args is Partial<T> — guard every field)
executing   🔄  run_deg     "CD4 T cells vs rest…" + spinner
complete    ✅  run_deg     "100 markers · top: LDHB, CD3D, RPS25"
            ⚠️              failure message when success === false
```

⚠️ `result` is a **string** — `JSON.parse` it, inside a try/catch:

```tsx
const parsed = useMemo(() => {
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}, [result]);
const failed = parsed?.success === false;
```

And every `args` access must tolerate `undefined` while streaming: `args?.group ?? "…"`.

- [ ] **Step 3: Verify reasoning panel and chat round-trip**

Ask the agent something with no tools: *"What dataset is loaded?"*. Expected: a collapsible reasoning panel that auto-opens while streaming and reports "Thought for N seconds", then a text answer. If no reasoning panel appears, the provider is on `@ai-sdk/openai`'s `.chat()` instead of `openai-compatible` — fix Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatPanel.tsx src/components/StepCard.tsx src/styles/chat.css src/App.tsx
git commit -m "feat(client): CopilotKit provider, chat panel, tool StepCard"
```

---

## Task 14: The five frontend tools and the readable

**Files:**
- Create: `src/hooks/copilot/useRunDegTool.tsx`, `useQueryGenesTool.tsx`, `useColorByClusterTool.tsx`, `useSearchGenesTool.tsx`, `useHighlightClustersTool.tsx`, `useSingleCellReadable.ts`, `useSingleCellCopilot.ts`
- Modify: `src/App.tsx` (one line: `useSingleCellCopilot()`)

**Interfaces:**
- Consumes: `useViewStore` actions, `lib/api` wrappers
- Produces: `export function useSingleCellCopilot(): void` — the barrel that calls all five tool hooks plus the readable

⚠️ **Imports — the split is real and not symmetrical:**

```ts
import { useFrontendTool } from "@copilotkit/react-core/v2";   // exported from BOTH paths; always use /v2
import { useCopilotReadable } from "@copilotkit/react-core";   // NO /v2 export — package root
```

- [ ] **Step 1: `useRunDegTool.tsx`**

Computation is server-side; **registration is client-side** so the browser sees `TOOL_CALL_*` events and can render a progress card. Return ~10 markers, not all 100 — shipping 100 rows × 6 fields back through the transcript is ~3k tokens the model re-reads every subsequent turn, for information it can already see in the UI.

```tsx
useFrontendTool({
  name: "run_deg",
  description: "Find marker genes for a cell type versus all other cells.",
  parameters: z.object({
    group: z.string().describe("Exact cell type label, e.g. 'CD4 T cells'"),
    topN: z.number().optional(),
  }),
  handler: async ({ group, topN }, { abortSignal }) => {   // ⚠️ forward the signal
    try {
      const deg = await runDeg(group, topN ?? 100, abortSignal);
      setLastDeg(deg);                                      // full 100 → DegPanel
      return {
        success: true,
        message: `${deg.markers.length} markers for ${deg.group} (${deg.nCellsGroup} cells vs ${deg.nCellsReference})`,
        warning: deg.warning,
        markers: deg.markers.slice(0, 10),                  // only 10 into the transcript
      };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  render: (props) => <StepCard name="run_deg" {...props} />,
}, [setLastDeg]);                                            // ⚠️ dependency array
```

**Return, never `throw`** — a throw suppresses the follow-up round and the user gets silence instead of an explanation.

- [ ] **Step 2: `useQueryGenesTool.tsx`**

Max 4 genes. On success calls `showGenes(...)` — the **same store action** the manual gene box uses — which switches colour mode to `expression` and adds chips. Partial success is reported, not thrown:

```tsx
const res = await queryGenes(genes.slice(0, 4), abortSignal);
showGenes(res.results);
return {
  success: res.results.length > 0,
  message: res.results.length
    ? `${res.results.map(r => `${r.gene} — ${r.values.length} values, range ${r.min.toFixed(2)}–${r.max.toFixed(2)}`).join("; ")}${res.notFound.length ? `. Not found: ${res.notFound.join(", ")}` : ""}`
    : `None of these symbols exist: ${res.notFound.join(", ")}. Use search_genes to find the right symbol.`,
  notFound: res.notFound,
};
```

That last branch is what makes acceptance criterion 9 (`FAKEGENE1`) produce a graceful spoken explanation rather than a hang.

- [ ] **Step 3: `useColorByClusterTool.tsx`**

`{}` params. Calls `colorByCluster()` — resets to categorical and clears gene selection. Returns `{ success: true, message: "Scatter reset to cluster colours." }`.

- [ ] **Step 4: `useSearchGenesTool.tsx`**

`fetch('/api/genes?q=')`. Lets the model check a symbol exists before querying it, instead of hallucinating one.

- [ ] **Step 5: `useHighlightClustersTool.tsx` — the pure-UI tool**

**No fetch.** Calls `setHighlight(clusters)` and returns. This is the one that proves UI-only tools work — acceptance criterion 8 checks DevTools shows no network request. Resolve labels leniently client-side and report unmatched names in the message.

- [ ] **Step 6: `useSingleCellReadable.ts`**

Keep it small — it is re-serialized on every one of the ~8 requests a full solve produces. Label it **ground truth** in the description, or the model answers from stale conversation memory instead of re-reading state. **Do not** put the gene list or any expression vector in here.

```ts
useCopilotReadable({
  description: "GROUND TRUTH — the current state of the single-cell viewer. Always trust this over conversation memory.",
  value: {
    dataset: "pbmc3k — 2,638 human PBMCs, log1p-normalized",
    nCells, nGenes,
    clusters: clusters.map(c => ({ label: c.label, nCells: c.nCells })),
    colorMode, displayedGenes, lastDeg, highlightedClusters,
    note: "13,714 genes available. Use search_genes to check a symbol before querying it — do not guess.",
  },
});
```

- [ ] **Step 7: Barrel + the deletability check**

`useSingleCellCopilot.ts` calls all six hooks. `App.tsx` gets exactly one line: `useSingleCellCopilot();`.

Then verify the constraint:

```bash
mv src/hooks/copilot /tmp/copilot-backup
# temporarily comment out the one call + import in App.tsx
npx tsc -b --noEmit && npm run dev
```

Expected: the manual app still builds and works end to end. Restore afterwards:

```bash
mv /tmp/copilot-backup src/hooks/copilot
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/copilot src/App.tsx
git commit -m "feat(copilot): five frontend tools and the ground-truth readable"
```

---

## Task 15: AgentActivityBar

**Files:**
- Create: `src/components/AgentActivityBar.tsx`, `src/styles/activity.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCopilotKit` from `@copilotkit/react-core/v2`
- Produces: `<AgentActivityBar />` — a persistent strip **under the scatter**, not in the chat

This is what makes the pauses feel deliberate instead of broken.

- [ ] **Step 1: Subscribe to the documented exported subscriber**

No prop-drilling out of the chat and nothing to invent:

```tsx
const { copilotkit } = useCopilotKit();
useEffect(() => {
  const sub = copilotkit.subscribe({
    onToolExecutionStart: e => setPhase({ kind: "calling", tool: e.toolName }),
    onToolExecutionEnd:   () => setPhase({ kind: "applying" }),
    onAgentRunStarted:    () => setPhase({ kind: "thinking" }),
    onError:              e  => setPhase({ kind: "error", message: String(e) }),
  });
  return () => sub.unsubscribe();
}, [copilotkit]);
```

- [ ] **Step 2: Return to idle so the bar is never stale**

Acceptance criterion 11 requires the bar always reflects the actual phase. Subscribe to the run-finished event to reset to `idle`; do not leave it parked on `applying` after a run ends.

- [ ] **Step 3: Optional live reasoning line**

For a truncated line of live thinking, subscribe at the agent level: `copilotkit.getAgent(agentId).subscribe({ onReasoningMessageContentEvent, onRunStartedEvent, onRunFinishedEvent })`.

- [ ] **Step 4: Verify**

Send a message and watch the bar transition `idle → thinking → calling run_deg → applying → idle`. Confirm it returns to `idle` after the final round.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentActivityBar.tsx src/styles/activity.css src/App.tsx
git commit -m "feat(client): agent activity bar via copilotkit subscriber"
```

---

## Task 16: End-to-end verification against the acceptance criteria

**Files:** none created — this task is evidence-gathering.

**REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`. **"It compiles" is not evidence.** Every item below is exercised in a real browser.

- [ ] **Step 1: Re-verify the toolchain gates**

```bash
npm ls react && npm run prep && npm test
```

Expected: react 18.x; prep prints 2,638 / 13,714 / 2,238,732; all tests pass **including the 8-group golden test**.

- [ ] **Step 2: Criteria 3–4 — the manual path**

Scatter renders 2,638 cells by cluster, legend matches, pan/zoom work. Typing `MS4A1` recolours with a real numeric range and lights up the B cell island.

- [ ] **Step 3: Criterion 5 — the showcase flow (one of the two failure modes that matter)**

Type: **"What's the most highly expressed marker gene in T cells?"**

Expected: `run_deg`, then `query_genes`, in **separate rounds with a chat message between them**, progress cards for both, and the scatter ending up coloured by the gene it named. The agent should note there are two T cell populations and say which it picked.

⚠️ **If both tools fire in one round, stop.** Strengthen the *prompt wording*, not the code, and record the phrasing that finally worked — that is an explicitly requested finding.

- [ ] **Step 4: Criteria 6–8 — follow-ups**

- "Now show me CD3D and MS4A1 side by side" → two panels, each with its own colorbar and label.
- "Colour by cluster again" → resets cleanly, gene chips clear.
- "Highlight the monocytes" → both monocyte populations dim in, and **DevTools Network shows no request** (the pure-UI tool).

- [ ] **Step 5: Criterion 9 — the other failure mode that matters**

"show me FAKEGENE1" → a graceful spoken explanation. **If it hangs, stop and report.** A hang means something threw instead of returning.

- [ ] **Step 6: Criteria 10–11**

- "Run DEG on megakaryocytes" → the small-group warning reaches the user in the chat, relayed verbatim.
- `AgentActivityBar` is never stale across all of the above.

- [ ] **Step 7: Collect the numbers for the final report**

Record, from actual runs:
1. Gateway surface + model settled on *(already known: `/chat/completions`, `glm-5.2-Preserved-Think`)*
2. **The exact prompt wording that produced one tool call per round** ← the most-wanted finding
3. Golden-test max absolute score deviation across all 8 groups (expect ~1.45e-3)
4. DEG wall time for 13,714 genes, and the **count of `POST /api/copilotkit` requests** a full showcase solve produces (count them in DevTools Network)
5. Anything in the spec that turned out to be wrong

- [ ] **Step 8: Final commit**

```bash
git add -A && git commit -m "docs: verification results"
```

---

## Notes carried from the spec

- **Performance honesty:** DEG is ~50–200 ms, a single O(nnz) pass. Do not add artificial delay. The real latency is the gateway: one tool call = two HTTP round-trips, so a four-tool solve is ~8 requests.
- **Wilcoxon** is optional and only if everything else is done and tested. `t-test_overestim_var` is the specified method because it has an oracle.
- **`/X` is not expression** — it is the z-scored `(2638, 1838)` PCA input, range −2.85 to 10. Never display it. Expression is `/raw.X`.
- Verified no-ops on the v2 path, in case of temptation: `OpenAIAdapter`'s `disableParallelToolCalls` / `keepSystemRole` / `maxInputTokens`; `AnthropicAdapter`'s `promptCaching`.
