import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useJournal } from "@/lib/journal";
import { t, type Key } from "@/lib/i18n";
import { chooseContextQuestion } from "@/lib/context-prompts.functions";
import {
  opportunities,
  cacheKey,
  claimDaily,
  proposalState,
  questionOptions,
  validateProposal,
  type Proposal,
} from "@/lib/context-prompts";
import { useQuickAdd } from "./AppShell";
import { celebrateSave } from "./AppFeel";
import { ContextQuestionCard } from "./ContextQuestionCard";

type Cached = { proposal: Proposal; origin: "meta" | "deterministic" };
const inflight = new Map<string, Promise<Cached | null>>();
export function ContextQuestion({ day, fallback }: { day: string; fallback: React.ReactNode }) {
  const j = useJournal(),
    open = useQuickAdd();
  const locale = j.settings.locale ?? "ko",
    owner = j.user!.id;
  const candidates = useMemo(
    () => opportunities(j.records, j.settings.prompts, day),
    [j.records, j.settings.prompts, day],
  );
  const latest = useRef(candidates);
  latest.current = candidates;
  const request = useServerFn(chooseContextQuestion);
  const [cached, setCached] = useState<Cached | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const key = cacheKey(owner, locale, day);
    let displayed: Proposal | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw && j.settings.prompts?.context?.day === day) {
        setCached({
          origin: "deterministic",
          proposal: {
            opportunityId: j.settings.prompts.context.id,
            version: "closed",
            question: t("ctx.closed"),
          },
        });
        return;
      }
      if (raw) {
        const saved = JSON.parse(raw) as Cached;
        const match = latest.current.find(
          (o) => o.id === saved.proposal?.opportunityId && o.version === saved.proposal.version,
        );
        if (match)
          saved.proposal = validateProposal(
            { opportunityId: saved.proposal.opportunityId, question: saved.proposal.question },
            [match],
            locale,
          );
        else if (
          !saved.proposal ||
          typeof saved.proposal.opportunityId !== "string" ||
          typeof saved.proposal.version !== "string"
        )
          return;
        displayed = saved.proposal;
        setCached(saved);
      } else if (latest.current.length && claimDaily(localStorage, owner, day)) {
        const allowed = [...latest.current],
          first = allowed[0]!;
        const initial: Cached = {
          origin: "deterministic",
          proposal: {
            opportunityId: first.id,
            version: first.version,
            question: questionOptions(first, locale)[0]!,
          },
        };
        localStorage.setItem(key, JSON.stringify(initial));
        displayed = initial.proposal;
        setCached(initial);
        const promise = request({
          data: {
            consent: true,
            locale,
            timezone: j.tz,
            day,
            candidates: allowed.map((o) => ({ id: o.id, version: o.version })),
          },
        })
          .then((result) => {
            if (!result.proposal) return null;
            const match = allowed.find(
              (o) =>
                o.id === result.proposal!.opportunityId && o.version === result.proposal!.version,
            );
            if (!match) return null;
            const safe = validateProposal(
              { opportunityId: result.proposal.opportunityId, question: result.proposal.question },
              [match],
              locale,
            );
            const next: Cached = { origin: "meta", proposal: safe };
            return next;
          })
          .catch(() => null);
        inflight.set(key, promise);
        void promise.finally(() => inflight.delete(key));
      }
      const pending = inflight.get(key);
      if (pending)
        void pending.then((next) => {
          if (
            active &&
            displayed &&
            latest.current.some(
              (o) => o.id === displayed?.opportunityId && o.version === displayed?.version,
            ) &&
            next &&
            latest.current.some(
              (o) => o.id === next.proposal.opportunityId && o.version === next.proposal.version,
            )
          ) {
            try {
              localStorage.setItem(key, JSON.stringify(next));
              setCached(next);
            } catch {
              /* Keep the original usable question. */
            }
          }
        });
    } catch {
      /* Storage unavailable: deterministic carousel remains usable. */
    }
    return () => {
      active = false;
    };
  }, [owner, locale, day, j.tz, request, j.settings.prompts?.context]);
  if (!cached) return fallback;
  const state = proposalState(cached.proposal, candidates, j.settings.prompts, day, j.records);
  if (state === "disabled") return null;
  const opportunity = candidates.find(
    (o) => o.id === cached.proposal.opportunityId && o.version === cached.proposal.version,
  );
  const undo = (before: ReturnType<typeof j.snapshot>, label: Key) =>
    toast.success(t(label), { action: { label: t("toast.undo"), onClick: j.undoFor(before) } });
  const skip = () => {
    const before = j.snapshot();
    try {
      j.setSetting("prompts", {
        ...j.settings.prompts,
        context: { day, id: cached.proposal.opportunityId, status: "skipped" },
      });
      undo(before, "pr.skip");
    } catch {
      toast.error(t("sync.error"));
    }
  };
  const answer = (value: string) => {
    if (
      lock.current ||
      !opportunity ||
      !(opportunity.kind === "feel" || opportunity.kind === "water")
    )
      return;
    const current = j.snapshot();
    if (
      !opportunities(current.records, current.settings.prompts, day).some(
        (o) => o.id === opportunity.id && o.version === opportunity.version,
      )
    )
      return;
    lock.current = true;
    const before = j.snapshot(),
      now = new Date().toISOString();
    const base = {
      id: j.newId(),
      localDate: day,
      precision: "exact" as const,
      at: now,
      createdAt: now,
      source: "manual_text" as const,
    };
    try {
      j.respondPrompt(
        opportunity.kind,
        day,
        opportunity.kind === "feel"
          ? { ...base, type: "condition", label: value }
          : { ...base, type: "water", answer: value === "yes" ? "yes" : "not_yet" },
        opportunity.id,
      );
      celebrateSave();
      undo(before, "pr.saved");
    } catch {
      toast.error(t("sync.error"));
    } finally {
      lock.current = false;
    }
  };
  return (
    <ContextQuestionCard
      state={state}
      origin={cached.origin}
      question={cached.proposal.question}
      kind={opportunity?.kind}
      answer={answer}
      skip={skip}
      onOpen={() => {
        if (!opportunity) return;
        if (opportunity.kind === "meal_amount") {
          const record = j.records.find(
            (r) => r.id === opportunity.recordIds[0] && r.type === "meal",
          );
          if (record) open("meal", record);
        } else open(opportunity.kind === "memory" ? "memory" : "weight");
      }}
      hide={() => {
        const before = j.snapshot();
        try {
          j.setSetting("prompts", { ...j.settings.prompts, hidden: true });
          undo(before, "pr.hide");
        } catch {
          toast.error(t("sync.error"));
        }
      }}
    />
  );
}
