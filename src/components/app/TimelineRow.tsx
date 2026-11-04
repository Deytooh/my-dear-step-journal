import { Button } from "@/components/ui/button";
import { useQuickAdd } from "./AppShell";
import { DemoTag, RecordRow } from "./ui";
import { t } from "@/lib/i18n";
import { formatPurchaseMoney } from "@/lib/purchase-money";
import type { TimelineEntry } from "@/lib/journal-timeline";

export function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const open = useQuickAdd();
  if (entry.kind === "record") {
    const record = entry.value;
    return <RecordRow r={record} onEdit={() => open(record.type, record)} />;
  }
  const purchase = entry.value;
  const label = t(purchase.addsStock === false ? "type.expense" : "type.purchase");
  return (
    <Button
      variant="unstyled"
      size="unstyled"
      className="record-row press flex min-h-20 w-full items-center justify-between gap-3 py-3 text-left"
      onClick={() => open("purchase", purchase)}
    >
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">
          {label}
          <DemoTag show={purchase.demo} />
        </span>
        <span className="block break-words text-[16px] font-semibold">
          {purchase.product ?? purchase.medication ?? label}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold">{formatPurchaseMoney(purchase)}</span>
    </Button>
  );
}
