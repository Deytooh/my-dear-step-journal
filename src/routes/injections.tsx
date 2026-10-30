import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Calendar, ChevronRight, Info, Package, Plus, Wallet } from "lucide-react";
import { t, fmtMoney } from "@/lib/i18n";
import { fmtMonthDay, fmtMonthDayWeekday, fmtTime, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal, type InjectionRec } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import {
  Card,
  DemoTag,
  IconBubble,
  PageTitle,
  recordValue,
  SectionHeader,
  Segmented,
} from "@/components/app/ui";
import { NextReminder } from "@/components/app/ReminderCard";
import { AnimatedValue } from "@/components/app/AppFeel";
import { Syringe, Pencil } from "lucide-react";

export const Route = createFileRoute("/injections")({
  head: () => ({
    meta: [
      { title: "주사 관리 · my dear step" },
      {
        name: "description",
        content: "주사 기록, 남은 재고, 구매와 지출을 직접 입력한 내역으로 관리하세요.",
      },
      { property: "og:title", content: "주사 관리 · my dear step" },
      { property: "og:description", content: "일정부터 재고와 지출까지 한눈에." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Injections,
});

function Injections() {
  const j = useJournal();
  const open = useQuickAdd();
  const [tab, setTab] = useState<"records" | "stock">("records");
  const month = todayLocal(j.tz).slice(0, 7);
  const monthSpend = new Map<string, number>();
  for (const p of j.purchases.filter((p) => p.localDate.startsWith(month)))
    monthSpend.set(p.currency, (monthSpend.get(p.currency) ?? 0) + p.amount);
  const purchases = [...j.purchases].sort((a, b) => b.localDate.localeCompare(a.localDate));
  const injections = j.records
    .filter((r): r is InjectionRec => r.type === "injection")
    .sort(sortByTime);

  return (
    <div>
      <PageTitle title={t("inj.title")} sub={t("inj.sub")} />

      <Card className="bg-sage p-5 shadow-none">
        <div className="flex items-center gap-4">
          <IconBubble>
            <Package className="size-6" />
          </IconBubble>
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">{t("inv.left")}</div>
            {j.inventory.lots.map((l) => (
              <div key={l.id} className="mt-2 text-[17px] font-bold">
                {l.medication} {l.product}
                <DemoTag show={l.demo} /> · {fmtMonthDay(l.localDate)} · {l.id.slice(-6)}
                <div>
                  <AnimatedValue value={l.balance} digits={0} /> {t(`unit.${l.unit}`)}
                </div>
              </div>
            ))}
            {!j.inventory.lots.length && <p>{t("home.stockUnknown")}</p>}
          </div>
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={() => open("stock")}
            className="press h-11 rounded-full border border-primary px-4 text-[15px]"
          >
            {t("inv.edit")}
          </Button>
        </div>
        {j.stockNeedsReview && <p className="mt-3 text-sm">{t("stock.provisional")}</p>}
        {j.inventory.unresolved.length > 0 && (
          <p className="mt-3">{t("stock.unlinked", { n: j.inventory.unresolved.length })}</p>
        )}
        {j.inventory.unresolved.map((r) => (
          <Button
            key={r.id}
            variant="unstyled"
            size="unstyled"
            className="block min-h-11 underline"
            onClick={() => open("injection", r)}
          >
            {fmtMonthDay(r.localDate)} · {r.medication ?? t("stock.unknownMed")}
          </Button>
        ))}
        {j.inventory.unresolvedAdjustments.length > 0 && <p>{t("stock.adjustmentReview")}</p>}
        {j.inventory.unresolvedPurchases.length > 0 && (
          <p>{t("stock.purchaseReview", { n: j.inventory.unresolvedPurchases.length })}</p>
        )}
        {j.inventory.unresolvedPurchases.map((p) => (
          <Button
            key={p.id}
            variant="unstyled"
            size="unstyled"
            className="block min-h-11 underline"
            onClick={() => open("purchase", p)}
          >
            {fmtMonthDay(p.localDate)} · {p.medication ?? t("stock.unknownMed")}
          </Button>
        ))}
        {j.stockAdjust !== 0 && !j.settings.legacyAdjustmentConfirmed && (
          <div className="mt-3">
            <p>{t("stock.legacyAdjustment", { n: j.stockAdjust })}</p>
            <Button
              variant="unstyled"
              size="unstyled"
              className="min-h-11 underline"
              onClick={j.confirmLegacyAdjustment}
            >
              {t("stock.confirmAdjustment")}
            </Button>
          </div>
        )}
        <div className="my-4 h-px bg-border" />
        <NextReminder variant="plain" />
      </Card>

      <Card className="mt-4 bg-peach p-5 shadow-none">
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="flex items-center gap-3 pr-3">
            <IconBubble tone="peach" size="sm">
              <Wallet className="size-5" />
            </IconBubble>
            <div>
              <div className="text-sm text-muted-foreground">{t("inj.monthSpend")}</div>
              <div className="text-[20px] font-bold">
                {[...monthSpend].map(([currency, amount]) => (
                  <div key={currency}>{fmtMoney(amount, currency)}</div>
                ))}
                {monthSpend.size === 0 && fmtMoney(0)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-3">
            <IconBubble size="sm">
              <Calendar className="size-5" />
            </IconBubble>
            <div>
              <div className="text-sm text-muted-foreground">{t("inj.lastPurchase")}</div>
              <div className="text-[20px] font-bold">
                {purchases[0] ? fmtMonthDay(purchases[0].localDate) : "—"}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("inj.basis")}</span>
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={() => setTab("stock")}
            className="flex min-h-11 items-center font-semibold"
          >
            {t("inj.tabStock")} <ChevronRight className="size-4" />
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "records", label: t("inj.tabRecords") },
            { value: "stock", label: t("inj.tabStock") },
          ]}
        />
      </div>

      <div key={tab} className="feel-panel">
        {tab === "records" ? (
          <>
            <SectionHeader
              title={t("inj.recent")}
              action={
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={() => open("injection")}
                  className="press flex h-11 items-center gap-1 rounded-full border border-primary px-4 font-semibold"
                >
                  <Plus className="size-4" />
                  {t("inj.add")}
                </Button>
              }
            />
            <Card className="divide-y px-5">
              {injections.length === 0 && (
                <p className="py-6 text-center text-muted-foreground">{t("inj.noRecords")}</p>
              )}
              {injections.map((r) => (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  key={r.id}
                  onClick={() => open("injection", r)}
                  className="press flex w-full items-center gap-4 py-4 text-left"
                >
                  <IconBubble>
                    <Syringe className="size-6" />
                  </IconBubble>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-muted-foreground">
                      {fmtMonthDayWeekday(r.localDate)}
                      {r.at && r.precision === "exact"
                        ? ` · ${fmtTime(r.at, j.tz)}`
                        : ` · ${t("f.timeUnknown")}`}
                      <DemoTag show={r.demo} />
                    </div>
                    <div className="truncate text-[19px] font-bold">{recordValue(r)}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.site ?? t("site.unknown")}
                    </div>
                  </div>
                  <Pencil className="size-5 text-muted-foreground" />
                </Button>
              ))}
            </Card>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="size-4" />
              {t("inj.editNote")}
            </p>
          </>
        ) : (
          <>
            <SectionHeader
              title={t("type.purchase")}
              action={
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={() => open("purchase")}
                  className="press flex h-11 items-center gap-1 rounded-full border border-primary px-4 font-semibold"
                >
                  <Plus className="size-4" />
                  {t("inj.addPurchase")}
                </Button>
              }
            />
            <Card className="divide-y px-5">
              {purchases.length === 0 && (
                <p className="py-6 text-center text-muted-foreground">{t("inj.noPurchases")}</p>
              )}
              {purchases.map((p) => (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  key={p.id}
                  onClick={() => open("purchase", p)}
                  className="press flex w-full items-center gap-4 py-4 text-left"
                >
                  <IconBubble tone="peach">
                    <Package className="size-6" />
                  </IconBubble>
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">
                      {fmtMonthDayWeekday(p.localDate)}
                      <DemoTag show={p.demo} />
                    </div>
                    <div className="text-[19px] font-bold">{fmtMoney(p.amount, p.currency)}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.medication ?? t("med.none")} · {p.doses}{" "}
                      {p.stockUnit ? t(`unit.${p.stockUnit}`) : t("stock.review")}
                    </div>
                  </div>
                  <Pencil className="size-5 text-muted-foreground" />
                </Button>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
