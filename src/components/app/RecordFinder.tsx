import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { fmtMonthDay } from "@/lib/dates";
import { sortByTime, useJournal, type JournalRecord } from "@/lib/journal";
import { useQuickAdd } from "./AppShell";
import { DemoTag, recordValue } from "./ui";
import { PhotoImg } from "./PhotoImg";

/** Searchable text of a record — only what the user actually wrote. */
export function recordText(r: JournalRecord) {
  switch (r.type) {
    case "memory": return r.note;
    case "condition": return `${r.label} ${r.note ?? ""}`;
    case "injection": return `${r.medication ?? ""} ${r.site ?? ""}`;
    default: return "";
  }
}

export function findRecords(records: JournalRecord[], q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return records.filter((r) => { const txt = recordText(r).toLowerCase(); return words.every((w) => txt.includes(w)); }).sort(sortByTime);
}

export function RecordFinder() {
  const j = useJournal();
  const open = useQuickAdd();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const results = asked ? findRecords(j.records, asked) : [];
  return (
    <section aria-labelledby="find-title" className="mt-2 rounded-[24px] bg-secondary p-4">
      <h2 id="find-title" className="text-[18px] font-bold">{t("find.title")}</h2>
      <p className="text-[15px] text-muted-foreground">{t("find.sub")}</p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setAsked(q); }} role="search">
        <input aria-label={t("find.title")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("find.placeholder")}
          className="h-12 min-w-0 flex-1 rounded-full border bg-card px-4 text-[16px] outline-none focus:border-primary" />
        <Button variant="unstyled" size="unstyled" type="submit" aria-label={t("find.title")} className="press flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Search className="size-5" /></Button>
      </form>
      {asked !== null && asked.trim() && (
        <div className="mt-3" aria-live="polite">
          {results.length === 0 ? <p className="text-[15px]">{t("find.none")}</p> : (
            <>
              <p className="text-[15px] font-medium">{t("find.count", { n: results.length })}</p>
              <ul className="mt-2 space-y-2">
                {results.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    <Button variant="unstyled" size="unstyled" onClick={() => open(r.type, r)} aria-label={`${t("find.open")}: ${fmtMonthDay(r.localDate)}`}
                      className="press flex w-full items-center gap-3 rounded-[16px] bg-card p-3 text-left">
                      {r.type === "memory" && r.photo && <PhotoImg src={r.photo} className="size-12 rounded-[10px] object-cover" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-muted-foreground">{fmtMonthDay(r.localDate)} · {t(`type.${r.type}`)}<DemoTag show={r.demo} /></span>
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
