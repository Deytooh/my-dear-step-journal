import { useServerFn } from "@tanstack/react-start";
import { retrieveMemory } from "@/lib/momo-tasks.functions";
import { memoryCandidates } from "@/lib/memory";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, getLocale } from "@/lib/i18n";
import { fmtMonthDay, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal } from "@/lib/journal";
import { useQuickAdd } from "./AppShell";
import { DemoTag, recordValue, recordWhen } from "./ui";
import { PhotoImg } from "./PhotoImg";
import { formatPurchaseMoney } from "@/lib/purchase-money";
import { findRecords, findPurchases } from "@/lib/record-search";

export function RecordFinder() {
  const { user } = useJournal();
  return <AccountRecordFinder key={user?.id ?? "guest"} />;
}

function AccountRecordFinder() {
  const j = useJournal();
  const open = useQuickAdd();
  const [q, setQ] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [asked, setAsked] = useState<string | null>(null);
  const retrieve = useServerFn(retrieveMemory);
  const [aiKeys, setAIKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [consent, setConsent] = useState(false);
  const request = useRef(0);
  const readyForAI = !!j.user && j.sync === "synced";
  useEffect(
    () => () => {
      request.current++;
    },
    [j.user?.id],
  );
  const run = async () => {
    if (!readyForAI || !consent || busy || !q.trim() || q.length > 300) return;
    const token = ++request.current;
    const keys = memoryCandidates(j.records, j.purchases, q, todayLocal(j.tz));
    setVisibleCount(20);
    setBusy(true);
    setFailure("");
    try {
      const result = await retrieve({
        data: { query: q, keys, locale: getLocale(), timezone: j.tz },
      });
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
      ? findRecords(j.records, asked, j.tz)
      : [];
  const purchaseResults = aiKeys
    ? j.purchases.filter((p) => aiKeys.includes(`purchase:${p.id}`))
    : asked
      ? findPurchases(j.purchases, asked)
      : [];
  const allResults = [
    ...results.map((record) => ({
      key: "record:" + record.id,
      date: record.localDate,
      record,
      purchase: undefined,
    })),
    ...purchaseResults.map((purchase) => ({
      key: "purchase:" + purchase.id,
      date: purchase.localDate,
      record: undefined,
      purchase,
    })),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (a.record && b.record ? sortByTime(a.record, b.record) : a.key.localeCompare(b.key)),
  );
  const shownRows = allResults.slice(0, visibleCount);
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
          setVisibleCount(20);
          setAIKeys(null);
          setBusy(false);
          setFailure("");
        }}
        role="search"
      >
        <input
          aria-label={t("find.title")}
          maxLength={300}
          aria-describedby={q.length >= 240 ? "find-query-limit" : undefined}
          value={q}
          onChange={(e) => {
            request.current++;
            setQ(e.target.value);
            setVisibleCount(20);
            setAsked(null);
            setAIKeys(null);
            setBusy(false);
            setFailure("");
          }}
          placeholder={t("find.placeholder")}
          className="h-12 min-w-0 flex-1 rounded-full border bg-card px-4 text-[16px] outline-none focus:border-primary"
        />
        <Button
          variant="unstyled"
          size="unstyled"
          type="submit"
          disabled={!q.trim()}
          aria-label={t("find.keywords")}
          className="press flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Search className="size-5" />
        </Button>
      </form>
      {q.length >= 240 && (
        <p id="find-query-limit" className="mt-2 text-sm text-muted-foreground">
          {t("find.queryLimit", { n: q.length })}
        </p>
      )}
      <details className="journal-disclosure mt-3">
        <summary>{t("find.ai")}</summary>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (!e.target.checked) {
                request.current++;
                setBusy(false);
              }
            }}
          />
          {t("find.consent")}
        </label>
        {!j.user && (
          <div className="mt-2 space-y-2">
            <p className="text-sm">{t("ai.signin")}</p>
            <a
              href="/auth"
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              {t("sync.signin")}
            </a>
          </div>
        )}
        {j.user && !readyForAI && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {t("find.syncRequired")}
          </p>
        )}
        <Button
          className="mt-2 min-h-12 w-full whitespace-normal rounded-full"
          disabled={!readyForAI || !consent || busy || !q.trim() || q.length > 300}
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
                {shownRows.map((row) => {
                  if (row.purchase) {
                    const p = row.purchase;
                    return (
                      <li key={row.key}>
                        <Button
                          variant="outline"
                          className="min-h-14 w-full whitespace-normal text-left"
                          onClick={() => open("purchase", p)}
                        >
                          <span className="min-w-0 flex-1 break-words">
                            {fmtMonthDay(p.localDate)} ·{" "}
                            {p.product ??
                              p.medication ??
                              t(p.addsStock === false ? "type.expense" : "type.purchase")}{" "}
                            · {formatPurchaseMoney(p)}
                          </span>
                          <DemoTag show={p.demo} />
                        </Button>
                      </li>
                    );
                  }
                  const r = row.record!;
                  return (
                    <li key={row.key}>
                      <Button
                        variant="unstyled"
                        size="unstyled"
                        onClick={() => open(r.type, r)}
                        aria-label={`${t("find.open")}: ${recordWhen(r, j.tz)} · ${t(`type.${r.type}`)} · ${recordValue(r).slice(0, 120)}`}
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
                            {recordWhen(r, j.tz)} · {t(`type.${r.type}`)}
                            <DemoTag show={r.demo} />
                          </span>
                          <span className="line-clamp-2 block text-[15px]">“{recordValue(r)}”</span>
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {shownRows.length < allResults.length && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("find.showing", { shown: shownRows.length, total: allResults.length })}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    onClick={() => setVisibleCount((count) => count + 20)}
                  >
                    {t("find.more")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
