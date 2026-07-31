/**
 * Generic progress card for a single LLM tool call, shared by all five tools
 * added in Task 14 (`run_deg`, `query_genes`, `color_by_cluster`,
 * `search_genes`, `highlight_clusters`). This task only builds and exports
 * the component — nothing here is wired into `renderToolCalls` yet.
 *
 * Two things the real API guarantees and this component must survive:
 *  - `result` arrives as a JSON string, not an object. A malformed or
 *    partial string (still streaming, or a bug upstream) must render
 *    something instead of throwing.
 *  - While `status === "inProgress"`, `args` is `Partial<T>` — fields land
 *    one at a time as the model streams them token by token, so every args
 *    access has to tolerate `undefined`.
 */
import { useMemo } from "react";

export type StepCardStatus = "inProgress" | "executing" | "complete";

export interface StepCardProps {
  name: string;
  status: StepCardStatus;
  args: any;
  result?: string;
}

const ICONS: Record<StepCardStatus, string> = {
  inProgress: "⏳",
  executing: "🔄",
  complete: "✅",
};

/** Renders whatever fields have arrived so far as "key: value" pairs, generic
 * across every tool's argument shape. Skips fields that haven't streamed in
 * yet (undefined/null/empty) rather than special-casing any one tool. */
function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "…";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    const display = Array.isArray(value) ? value.join(", ") : String(value);
    parts.push(`${key}: ${display}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "…";
}

/** Renders a one-line summary of a successful result, generic across result
 * shapes: an array of markers/genes/clusters gets counted (and, for markers,
 * the top few gene names surfaced), otherwise falls back to any `message`
 * field the tool provided. */
function summarizeResult(parsed: any): string {
  if (!parsed || typeof parsed !== "object") return "Done.";
  if (Array.isArray(parsed.markers)) {
    const top = parsed.markers
      .slice(0, 3)
      .map((m: any) => m?.gene)
      .filter(Boolean)
      .join(", ");
    return `${parsed.markers.length} markers${top ? ` · top: ${top}` : ""}`;
  }
  if (Array.isArray(parsed.genes)) return `${parsed.genes.length} genes`;
  if (Array.isArray(parsed.clusters)) return `${parsed.clusters.length} clusters`;
  if (typeof parsed.message === "string" && parsed.message) return parsed.message;
  return "Done.";
}

export function StepCard({ name, status, args, result }: StepCardProps) {
  const parsed = useMemo(() => {
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  const failed = status === "complete" && parsed?.success === false;

  let body: string;
  if (status === "complete") {
    body = failed
      ? typeof parsed?.message === "string" && parsed.message
        ? parsed.message
        : "Tool call failed."
      : summarizeResult(parsed);
  } else {
    body = summarizeArgs(args);
  }

  const icon = failed ? "⚠️" : ICONS[status];
  const stateClass = failed ? "failed" : status;

  return (
    <div className={`step-card step-card-${stateClass}`} role="status">
      <span className="step-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="step-card-name">{name}</span>
      <span className="step-card-body">{body}</span>
      {status === "executing" && !failed && (
        <span className="step-card-spinner" aria-hidden="true" />
      )}
    </div>
  );
}
