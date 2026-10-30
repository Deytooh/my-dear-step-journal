import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/lib/i18n";

export function QuestionMenu({ onDisable, label }: { onDisable: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="unstyled"
          size="unstyled"
          aria-label={t("ctx.options")}
          className="absolute right-0 flex size-11 items-center justify-center rounded-full text-muted-foreground"
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] rounded-2xl p-1.5">
        <DropdownMenuItem
          onSelect={onDisable}
          className="min-h-11 max-w-72 whitespace-normal rounded-xl px-3 leading-snug"
        >
          {label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
