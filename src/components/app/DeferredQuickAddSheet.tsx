import { useEffect, useState } from "react";
import { Description, Title } from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { EntrySheet } from "./EntrySheet";
import type { QuickAddSheet, QuickAddSheetProps } from "./QuickAddSheet";

import { getQuickAdd, preloadQuickAdd } from "./quick-add-loader";
type Sheet = typeof QuickAddSheet;

export function DeferredQuickAddSheet(props: QuickAddSheetProps) {
  const [Sheet, setSheet] = useState<Sheet | undefined>(getQuickAdd);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (Sheet || !props.open) return;
    let current = true;
    setFailed(false);
    void preloadQuickAdd().then((component) => {
      if (!current) return;
      if (component) setSheet(() => component);
      else setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [Sheet, props.open, attempt]);

  if (Sheet) return <Sheet {...props} />;
  return (
    <EntrySheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      returnFocusTo={props.returnFocusTo}
      fallbackFocus={props.fallbackFocus}
      header={
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Title className="text-2xl font-bold">{t("nav.add")}</Title>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("evidence.close")}
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <Description role={failed ? "alert" : "status"}>
          {t(failed ? "recovery.errorTitle" : "ui.loading")}
        </Description>
        {failed && (
          <Button onClick={() => setAttempt((value) => value + 1)}>{t("recovery.retry")}</Button>
        )}
      </div>
    </EntrySheet>
  );
}
