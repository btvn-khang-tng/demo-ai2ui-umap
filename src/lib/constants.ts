/**
 * Small shared constants pulled out of call sites so the UI (Task 12+) and
 * the LLM tool handlers (Task 14) agree on the same numbers instead of each
 * hardcoding their own copy.
 */

/** Server caps `query_genes` at 4 symbols; small multiples layout assumes the same. */
export const MAX_GENES = 4;

/** Matches the server's `topN` default in `POST /api/run_deg`. */
export const DEFAULT_DEG_TOP_N = 100;

/** Matches the server's `limit` default in `GET /api/genes`. */
export const DEFAULT_GENE_SEARCH_LIMIT = 50;

/** Server clamps `limit` to this ceiling regardless of what is requested. */
export const MAX_GENE_SEARCH_LIMIT = 200;

/** Opacity applied to clusters NOT in `ViewState.highlighted` (~15%, per spec). */
export const DIMMED_OPACITY = 0.15;
