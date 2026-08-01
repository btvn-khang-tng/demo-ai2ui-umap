/**
 * `ask_user_choice` — human-in-the-loop tool. When the agent's request is
 * ambiguous (e.g. the user says "T cells" when the dataset has two T-cell
 * populations), it asks the user to pick from a short list of options
 * instead of guessing. Renders as real clickable buttons in chat; the run
 * PAUSES until one is clicked (or the user cancels), then that choice is
 * returned to the model as the tool result and the conversation resumes.
 *
 * Uses `useHumanInTheLoop` from the package ROOT (`@copilotkit/react-core`),
 * not `/v2` — verified against `node_modules/@copilotkit/react-core/dist/`,
 * this hook isn't exported from `/v2`. The v2 provider runs it fine, same as
 * `useCopilotReadable` (also a root import — see `useSingleCellReadable.ts`),
 * so mixing entry points is already established practice in this directory.
 *
 * ⚠️ Unlike every other tool in this directory, `parameters` here is typed as
 * the v1 `Parameter[]` array shape (checked in
 * `@copilotkit/shared/dist/types/action.d.cts`), not a Zod schema — do not
 * copy the Zod pattern from the sibling `use*Tool.tsx` files for this one.
 *
 * The render prop receives `ActionRenderPropsWait`: a `respond(value)`
 * function is present only while `status === "executing"` (`undefined` in
 * "inProgress" and "complete"). Every interactive path — each option button
 * AND Cancel — must call `respond` exactly once. A HITL tool whose `respond`
 * is never invoked leaves the agent waiting forever, so Cancel is not an
 * afterthought here: it resolves with a plain string the model can act on.
 */
import { useState } from "react";
import { useHumanInTheLoop } from "@copilotkit/react-core";
import "../../styles/hitl.css";

/** Returned to the model when the user declines to choose. Deliberately a
 * sentence, not a code, so the model can relay it to the user directly
 * without needing to special-case the value. */
const CANCELLED = "User declined to choose; do not guess — ask a follow-up question instead.";

/**
 * The interactive branch, as a real component so it can own input state.
 *
 * Buttons cover the options the model thought of. The text box covers the
 * ones it did not — "neither, use NK cells", "both", "actually show me
 * GZMB". Without it the user's only escape from a wrong pair of options is
 * Cancel, which throws away the turn.
 *
 * `respond` must fire exactly once. `sent` guards every path: a double click,
 * or Enter followed by a button click, would otherwise resolve the same tool
 * call twice.
 */
function ChoicePrompt({
  question,
  options,
  onRespond,
}: {
  question: string;
  options: string[];
  onRespond: (value: string) => void;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  const send = (value: string) => {
    if (sent) return;
    const v = value.trim();
    if (!v) return;
    setSent(true);
    onRespond(v);
  };

  return (
    <div className="hitl-card hitl-card-executing" role="group" aria-label={question}>
      <div className="hitl-card-body">
        <div className="hitl-question">{question}</div>

        <div className="hitl-options">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="hitl-option-btn"
              disabled={sent}
              onClick={() => send(option)}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            className="hitl-cancel-btn"
            disabled={sent}
            onClick={() => {
              if (sent) return;
              setSent(true);
              onRespond(CANCELLED);
            }}
          >
            Cancel
          </button>
        </div>

        {/* Free-text escape hatch for answers the model did not offer. */}
        <div className="hitl-freetext">
          <input
            type="text"
            className="hitl-freetext-input"
            placeholder="Or type your own answer…"
            value={text}
            disabled={sent}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send(text);
              }
            }}
            aria-label="Type your own answer"
          />
          <button
            type="button"
            className="hitl-freetext-send"
            disabled={sent || !text.trim()}
            onClick={() => send(text)}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAskUserChoiceTool(): void {
  useHumanInTheLoop(
    {
      name: "ask_user_choice",
      description:
        "Ask the user to pick between two or more options when their request is ambiguous instead of guessing (e.g. which of two similarly-named cell populations they mean). Renders clickable buttons and waits for the user's choice before continuing.",
      parameters: [
        {
          name: "question",
          type: "string",
          description:
            "Short question to show the user, e.g. 'Which T cell population did you mean?'",
          required: true,
        },
        {
          name: "options",
          type: "string[]",
          description:
            "2-6 short, exact option labels to render as buttons, e.g. ['CD4 T cells', 'CD8 T cells']. Use exact cell type labels from the cluster list where applicable.",
          required: true,
        },
      ],
      render: (props) => {
        const { status, args } = props;
        const question = typeof args?.question === "string" ? args.question : "";
        const options = Array.isArray(args?.options) ? args.options : [];

        if (status === "complete") {
          const answer = typeof props.result === "string" ? props.result : "";
          const skipped = !answer || answer === CANCELLED;
          return (
            <div className="hitl-card hitl-card-complete" role="status">
              <span className="hitl-card-icon" aria-hidden="true">
                {skipped ? "⏭️" : "✅"}
              </span>
              <div className="hitl-card-body">
                <div className="hitl-question">{question || "Asked the user to choose"}</div>
                <div className="hitl-answer">
                  {skipped ? "Skipped." : `Chose: ${answer}`}
                </div>
              </div>
            </div>
          );
        }

        if (status === "inProgress") {
          return (
            <div className="hitl-card" role="status">
              <span className="hitl-card-icon" aria-hidden="true">
                ⏳
              </span>
              <div className="hitl-card-body">
                <div className="hitl-question">{question || "…"}</div>
              </div>
            </div>
          );
        }

        // status === "executing" — the only interactive branch. `respond` is
        // guaranteed defined here. ChoicePrompt owns the guarantee that it is
        // called exactly once; leaving it uncalled leaves the agent waiting
        // forever.
        const { respond } = props;
        return (
          <ChoicePrompt
            question={question}
            options={options}
            onRespond={(value) => respond(value)}
          />
        );
      },
    },
    []
  );
}
