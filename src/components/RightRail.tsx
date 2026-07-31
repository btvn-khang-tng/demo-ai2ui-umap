/**
 * The right rail: one column holding the assistant and the two data panels,
 * switched by a segmented control.
 *
 * Why tabs rather than stacking: gene search + a 100-row marker table + a
 * chat transcript cannot share one 420px column vertically without all three
 * being useless. Tabs give each the full height of the rail.
 *
 * ⚠️ The chat is ALWAYS MOUNTED and hidden with CSS when another tab is
 * active. Conditionally rendering it would unmount `CopilotChat` and destroy
 * the conversation every time the user glanced at the marker table. The two
 * data panels are cheap and read from the store, so they can unmount freely.
 *
 * The tab labels carry live counts, so the state of a hidden panel is still
 * visible — you can see "Genes 2" without leaving the assistant.
 */
import { useState } from "react";
import { useViewStore } from "../state/useViewStore";
import { GenePanel } from "./GenePanel";
import { DegPanel } from "./DegPanel";
import { ChatPanel } from "./ChatPanel";

type Tab = "assistant" | "genes" | "markers";

export function RightRail() {
  const [tab, setTab] = useState<Tab>("assistant");
  const { genes, lastDeg } = useViewStore();

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: "assistant", label: "Assistant" },
    {
      id: "genes",
      label: "Genes",
      badge: genes.length > 0 ? String(genes.length) : undefined,
    },
    {
      id: "markers",
      label: "Markers",
      badge: lastDeg ? String(lastDeg.markers.length) : undefined,
    },
  ];

  return (
    <div className="rail">
      <div className="rail-tabs" role="tablist" aria-label="Side panel">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rail-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`rail-panel-${t.id}`}
            className={`rail-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.badge && <span className="rail-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="rail-body">
        {/* Kept mounted always — see the note at the top of this file. */}
        <div
          role="tabpanel"
          id="rail-panel-assistant"
          aria-labelledby="rail-tab-assistant"
          className={`rail-panel${tab === "assistant" ? "" : " is-hidden"}`}
          /* aria-hidden so screen readers don't read a visually hidden
             transcript while the user is looking at the marker table. */
          aria-hidden={tab !== "assistant"}
        >
          <ChatPanel />
        </div>

        {tab === "genes" && (
          <div
            role="tabpanel"
            id="rail-panel-genes"
            aria-labelledby="rail-tab-genes"
            className="rail-panel"
          >
            <GenePanel />
          </div>
        )}

        {tab === "markers" && (
          <div
            role="tabpanel"
            id="rail-panel-markers"
            aria-labelledby="rail-tab-markers"
            className="rail-panel"
          >
            <DegPanel />
          </div>
        )}
      </div>
    </div>
  );
}
