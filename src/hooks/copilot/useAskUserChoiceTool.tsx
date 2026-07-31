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
import { useHumanInTheLoop } from "@copilotkit/react-core";
import "../../styles/hitl.css";

/** Returned to the model when the user declines to choose. Deliberately a
 * sentence, not a code, so the model can relay it to the user directly
 * without needing to special-case the value. */
const CANCELLED = "User declined to choose; do not guess — ask a follow-up question instead.";

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

        // status === "executing" — `respond` is guaranteed defined here, and
        // every button below calls it exactly once. This is the only render
        // branch a user can interact with, and the only one where leaving a
        // button unclicked leaves the tool call (and the agent) waiting.
        const { respond } = props;
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
                    onClick={() => respond(option)}
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  className="hitl-cancel-btn"
                  onClick={() => respond(CANCELLED)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      },
    },
    []
  );
}
