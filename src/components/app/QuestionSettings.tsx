import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { useJournal, type PromptSettings } from "@/lib/journal";
import { t } from "@/lib/i18n";

export function QuestionSettings() {
  const j = useJournal();
  const [open, setOpen] = useState(false);
  const ps = j.settings.prompts ?? {};
  const update = (patch: Partial<PromptSettings>) => {
    try {
      j.setSetting("prompts", { ...j.snapshot().settings.prompts, ...patch });
    } catch {
      toast.error(t("sync.error"));
    }
  };
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <div className="pb-1 text-sm text-muted-foreground">
        <DrawerTrigger asChild>
          <Button
            variant="unstyled"
            size="unstyled"
            className="min-h-11 rounded-full px-2 font-medium"
          >
            {t("ctx.settings")}
          </Button>
        </DrawerTrigger>
        {!ps.hidden && !ps.aiConsent && <p className="px-2 pb-2 text-xs">{t("ctx.invite")}</p>}
      </div>
      <DrawerContent className="mx-auto max-h-[85dvh] max-w-md rounded-t-[28px] bg-background">
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 py-3">
            <DrawerTitle className="text-xl font-bold">{t("ctx.settings")}</DrawerTitle>
            <DrawerClose asChild>
              <Button
                variant="unstyled"
                size="unstyled"
                aria-label={t("evidence.close")}
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <X className="size-5" />
              </Button>
            </DrawerClose>
          </div>
          <DrawerDescription className="text-sm leading-relaxed">
            {t("ctx.privacy")}
          </DrawerDescription>
          <label className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border bg-card p-3">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={!ps.hidden}
              onChange={(e) => update({ hidden: !e.target.checked })}
            />
            <span className="text-sm font-medium">{t("pr.setting")}</span>
          </label>
          {!j.user && <p className="mt-4 text-sm text-muted-foreground">{t("ai.signin")}</p>}
          <label className="mt-3 flex min-h-14 items-start gap-3 rounded-2xl border bg-card p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0"
              disabled={!j.user}
              checked={!!j.user && !!ps.aiConsent}
              onChange={(e) => update({ aiConsent: e.target.checked })}
            />
            <span className="text-sm leading-relaxed">{t("ctx.consent")}</span>
          </label>
          {!!ps.off?.length && (
            <Button
              variant="ghost"
              className="mt-2 min-h-11 w-full whitespace-normal"
              onClick={() => update({ off: [] })}
            >
              {t("pr.restore")}
            </Button>
          )}
          <DrawerClose asChild>
            <Button className="mt-4 min-h-12 w-full rounded-full">{t("evidence.close")}</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
