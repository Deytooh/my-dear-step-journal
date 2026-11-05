import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MomoQuestion } from "@/components/app/MomoQuestion";
import { tFor } from "@/lib/i18n";

const keys = ["mq.day", "mq.feeling", "mq.food", "mq.treatment", "mq.moment"] as const;

afterEach(cleanup);

it.each(["ko", "en", "fr"] as const)(
  "keeps one accessible question and a stable heading through rapid %s changes",
  (locale) => {
    const questions = keys.map((key) => tFor(locale, key));
    const { rerender } = render(<MomoQuestion question={questions[0]!} questions={questions} />);
    const heading = screen.getByRole("heading", { name: questions[0]!, level: 1 });
    const layers = [...heading.children];

    for (const question of [...questions.slice(1), questions[0]!]) {
      rerender(<MomoQuestion question={question} questions={questions} />);
      expect(screen.getByRole("heading", { name: question, level: 1 })).toBe(heading);
      expect([...heading.children]).toEqual(layers);
      expect(heading.querySelectorAll('[aria-hidden="false"]')).toHaveLength(1);
      expect(heading).not.toHaveAttribute("aria-live");
      for (const text of questions) {
        const layer = screen.getByText(text);
        expect(layer).toHaveAttribute("data-active", String(text === question));
        if (text === question) expect(layer).toBeVisible();
        else expect(layer).not.toBeVisible();
      }
    }
  },
);

it("describes the composer with only the current question, including during a transition", () => {
  const questions = keys.map((key) => tFor("ko", key));
  const content = (question: string) => (
    <>
      <MomoQuestion question={question} questions={questions} />
      <textarea aria-label="Journal" aria-describedby="momo-topic-question" />
    </>
  );
  const { rerender } = render(content(questions[0]!));
  const input = screen.getByRole("textbox");
  input.focus();
  expect(input).toHaveAccessibleDescription(questions[0]);
  rerender(content(questions[3]!));
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription(questions[3]);
});

it("replaces the sizing layers and accessible text when the locale changes", () => {
  const korean = keys.map((key) => tFor("ko", key));
  const french = keys.map((key) => tFor("fr", key));
  const { rerender } = render(<MomoQuestion question={korean[0]!} questions={korean} />);
  const heading = screen.getByRole("heading", { name: korean[0]! });
  rerender(<MomoQuestion question={french[0]!} questions={french} />);
  expect(screen.getByRole("heading", { name: french[0]! })).toBe(heading);
  expect(heading.children).toHaveLength(5);
  for (const text of korean) expect(screen.queryByText(text)).not.toBeInTheDocument();
});
