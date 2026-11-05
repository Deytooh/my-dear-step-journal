/** Keep every localized question in one grid cell so rotation never moves the composer. */
export function MomoQuestion({
  question,
  questions,
}: {
  question: string;
  questions: readonly string[];
}) {
  return (
    <h1 className="momo-topic-question" id="momo-topic-question" aria-label={question}>
      {questions.map((text) => {
        const active = text === question;
        return (
          <span
            key={text}
            className="momo-topic-question-text"
            data-active={active}
            aria-hidden={!active}
            // Visibility is delayed by CSS on exit; inactive text still reserves its height.
            style={{ visibility: active ? "visible" : "hidden" }}
          >
            {text}
          </span>
        );
      })}
    </h1>
  );
}
