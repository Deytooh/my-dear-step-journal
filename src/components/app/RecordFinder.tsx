import { useServerFn } from "@tanstack/react-start";
import { retrieveMemory } from "@/lib/momo-tasks.functions";
import { memoryCandidates } from "@/lib/memory";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, getLocale } from "@/lib/i18n";
import { fmtMonthDay, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal, type JournalRecord } from "@/lib/journal";
import { useQuickAdd } from "./AppShell";
import { DemoTag, recordValue } from "./ui";
import { PhotoImg } from "./PhotoImg";

/** Searchable text of a record — only what the user actually wrote. */
export function recordText(r: JournalRecord) {
  switch (r.type) {
    case "meal":
      return `${r.meal.title} ${r.meal.note ?? ""} ${r.meal.items.map((i) => i.name).join(" ")}`;
    case "memory":
      return r.note;
    case "condition":
      return `${r.label} ${r.note ?? ""}`;
    case "injection":
      return `${r.medication ?? ""} ${r.site ?? ""}`;
    default:
      return "";
  }
}

export function findRecords(records: JournalRecord[], q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return records
    .filter((r) => {
      const txt = recordText(r).toLowerCase();
      return words.every((w) => txt.includes(w));
    })
    .sort(sortByTime);
}

export function RecordFinder() {
  const j = useJournal();
  const open = useQuickAdd();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const retrieve = useServerFn(retrieveMemory);
  const [aiKeys, setAIKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [consent, setConsent] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [j.user?.id],
  );
  const run = async () => {
    if (!j.user || !consent || busy || !q.trim()) return;
    const token = ++request.current;
    const keys = memoryCandidates(j.records, j.purchases, q, todayLocal(j.tz));
    setBusy(true);
    setFailure("");
    try {
      const result = await retrieve({ data: { query: q, keys, locale: getLocale() } });
      if (token !== request.current) return;
      if (result.error) {
        setFailure(t(`ai.${result.error}`));
        setAsked(q);
        setAIKeys(null);
      } else {
        setAIKeys(result.ids.filter((id) => keys.includes(id)));
        setAsked(q);
      }
    } catch {
      if (token === request.current) {
        setFailure(t("ai.service"));
        setAsked(q);
        setAIKeys(null);
      }
    } finally {
      if (token === request.current) setBusy(false);
    }
  };
  const results = aiKeys
    ? j.records.filter((r) => aiKeys.includes(`record:${r.id}`)).sort(sortByTime)
    : asked
      ? findRecords(j.records, asked)
      : [];
  const purchaseResults = aiKeys
    ? j.purchases.filter((p) => aiKeys.includes(`purchase:${p.id}`))
    : [];
  return (
    <section
      aria-labelledby="find-title"
      className="app-surface mt-2 rounded-[24px] bg-secondary p-4"
    >
      <h2 id="find-title" className="text-[18px] font-bold">
        {t("find.title")}
      </h2>
      <p className="text-[15px] text-muted-foreground">{t("find.sub")}</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          request.current++;
          setAsked(q);
          setAIKeys(null);
        }}
        role="search"
      >
        <input
          aria-label={t("find.title")}
          value={q}
          onChange={(e) => {
            request.current++;
            setQ(e.target.value);
            setAIKeys(null);
            setBusy(false);
          }}
          placeholder={t("find.placeholder")}
          className="h-12 min-w-0 flex-1 rounded-full border bg-card px-4 text-[16px] outline-none focus:border-primary"
        />
        <Button
          variant="unstyled"
          size="unstyled"
          type="submit"
          aria-label={t("find.title")}
          className="press flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Search className="size-5" />
        </Button>
      </form>
      <details className="journal-disclosure mt-3">
        <summary>{t("find.ai")}</summary>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t("ai.consent")}
        </label>
        {!j.user && <p className="text-sm">{t("ai.signin")}</p>}
        <Button
          className="mt-2 min-h-12 w-full whitespace-normal rounded-full"
          disabled={!j.user || !consent || busy || !q.trim()}
          onClick={run}
        >
          {t(busy ? "momo.thinking" : "find.ai")}
        </Button>
      </details>
      {failure && (
        <p role="alert" className="mt-2 text-sm">
          {failure}
        </p>
      )}
      {asked !== null && asked.trim() && (
        <div className="mt-3" aria-live="polite">
          {!aiKeys && <p className="text-sm">{t("find.fallback")}</p>}
          {results.length + purchaseResults.length === 0 ? (
            <p className="text-[15px]">{t("find.none")}</p>
          ) : (
            <>
              <p className="text-[15px] font-medium">
                {t("find.count", { n: results.length + purchaseResults.length })}
              </p>
              <ul className="mt-2 space-y-2">
                {purchaseResults.map((p) => (
                  <li key={p.id}>
                    <Button
                      variant="outline"
                      className="min-h-14 w-full whitespace-normal text-left"
                      onClick={() => open("purchase", p)}
                    >
                      {fmtMonthDay(p.localDate)} · {p.product ?? p.medication ?? t("type.purchase")}{" "}
                      · {p.amount} {p.currency}
                    </Button>
                  </li>
                ))}
                {results.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    <Button
                      variant="unstyled"
                      size="unstyled"
                      onClick={() => open(r.type, r)}
                      aria-label={`${t("find.open")}: ${fmtMonthDay(r.localDate)}`}
                      className="record-row press flex w-full items-center gap-3 rounded-[16px] border border-primary/5 bg-card p-3 text-left"
                    >
                      {((r.type === "memory" && r.photo) ||
                        (r.type === "meal" && r.meal.photoRefs[0])) && (
                        <PhotoImg
                          src={
                            (r.type === "memory"
                              ? r.photo
                              : r.type === "meal"
                                ? r.meal.photoRefs[0]
                                : "")!
                          }
                          className="size-14 shrink-0 rounded-[14px] object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-muted-foreground">
                          {fmtMonthDay(r.localDate)} · {t(`type.${r.type}`)}
                          <DemoTag show={r.demo} />
                        </span>
                        <span className="line-clamp-2 block text-[15px]">“{recordValue(r)}”</span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
