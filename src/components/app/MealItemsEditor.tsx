import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedValue } from "./AppFeel";
import { t } from "@/lib/i18n";
import { mealTotals, type MealDetails, type MealItem } from "@/lib/meals";

const input = "min-h-12 w-full min-w-0 rounded-xl border bg-card px-3 py-2 text-[16px]";
export function MealItemsEditor({
  meal,
  patch,
  fraction,
  setFraction,
  newId,
}: {
  meal: MealDetails;
  patch: (patch: Partial<MealDetails>) => void;
  fraction: string;
  setFraction: (value: string) => void;
  newId: () => string;
}) {
  const itemPatch = (id: string, change: Partial<MealItem>) =>
    patch({ items: meal.items.map((item) => (item.id === id ? { ...item, ...change } : item)) });
  const totals = mealTotals({
    ...meal,
    consumedFraction: fraction === "" ? null : Number(fraction),
  });
  const energy = totals.consumed ?? totals.pictured;
  return (
    <div className="space-y-3">
      {" "}
      <ul className="space-y-3">
        {meal.items.map((item) => (
          <li key={item.id} className="meal-food space-y-3 rounded-[20px] border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.included}
                  onChange={(e) => itemPatch(item.id, { included: e.target.checked })}
                />
                {t("momo.include")}
              </label>
              <Button
                type="button"
                variant="ghost"
                className="size-11 shrink-0 rounded-full text-muted-foreground"
                aria-label={t("ux.removeFood", { name: item.name || t("meal.food") })}
                onClick={() => patch({ items: meal.items.filter((i) => i.id !== item.id) })}
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
            <label className="block">
              {t("meal.food")}
              <input
                className={input}
                value={item.name}
                onChange={(e) => itemPatch(item.id, { name: e.target.value })}
              />
            </label>
            <label className="block">
              {t("meal.portion")}
              <input
                className={input}
                value={item.portionDescription ?? ""}
                onChange={(e) => itemPatch(item.id, { portionDescription: e.target.value || null })}
              />
            </label>
            <details>
              <summary>
                <span>{t("meal.energyKnown")}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.kcal && Number.isFinite(item.kcal.low) && Number.isFinite(item.kcal.high)
                    ? `${item.kcal.low}–${item.kcal.high} kcal`
                    : t("unknown")}
                </span>
              </summary>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.kcal !== null}
                  onChange={(e) =>
                    itemPatch(item.id, {
                      kcal: e.target.checked
                        ? { low: NaN, high: NaN, basis: "user_entered" }
                        : null,
                    })
                  }
                />
                {t("meal.energyKnown")}
              </label>
              {item.kcal && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["low", "high"] as const).map((side) => (
                      <label key={side}>
                        {t(`meal.${side}`)} kcal
                        <input
                          className={input}
                          type="number"
                          step="any"
                          min="0"
                          max="10000"
                          value={Number.isFinite(item.kcal![side]) ? item.kcal![side] : ""}
                          onChange={(e) =>
                            itemPatch(item.id, {
                              kcal: {
                                ...item.kcal!,
                                [side]: e.target.value === "" ? NaN : Number(e.target.value),
                                basis: "user_entered",
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-sm">{t(`meal.${item.kcal.basis}`)}</p>
                </>
              )}
            </details>
            <details>
              <summary className="min-h-11 cursor-pointer py-2">{t("meal.ingredients")}</summary>
              <p className="text-sm">
                {item.ingredients.map((i) => `${i.name} (${t(`meal.${i.basis}`)})`).join(", ")}
              </p>
              <textarea
                aria-label={t("meal.ingredients")}
                className={input}
                value={item.ingredients.map((i) => i.name).join("\n")}
                onChange={(e) =>
                  itemPatch(item.id, {
                    ingredients: e.target.value
                      .split("\n")
                      .filter(Boolean)
                      .map((name) => ({ name, basis: "user_provided" })),
                  })
                }
              />
            </details>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        onClick={() =>
          patch({
            items: [
              ...meal.items,
              {
                id: newId(),
                name: "",
                portionDescription: null,
                ingredients: [],
                kcal: null,
                included: true,
              },
            ],
          })
        }
      >
        <Plus />
        {t("meal.addFood")}
      </Button>
      <label className="block">
        {t("meal.eaten")}
        <select
          className={input}
          value={fraction === "" || ["1", "0.5"].includes(fraction) ? fraction : "other"}
          onChange={(e) => setFraction(e.target.value === "other" ? "0.75" : e.target.value)}
        >
          <option value="">{t("unknown")}</option>
          <option value="1">{t("meal.all")}</option>
          <option value="0.5">{t("meal.half")}</option>
          <option value="other">{t("meal.other")}</option>
        </select>
      </label>
      {fraction !== "" && !["1", "0.5"].includes(fraction) && (
        <label className="block">
          {t("meal.fraction")}
          <input
            className={input}
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={fraction}
            onChange={(e) => setFraction(e.target.value)}
          />
        </label>
      )}
      <div className="app-surface rounded-[20px] bg-peach p-4" aria-live="polite">
        <p className="text-sm">
          {t(totals.consumed ? "meal.consumedEstimate" : "meal.picturedEstimate")}
        </p>
        <p className="mt-1 text-[23px] font-semibold tracking-tight tabular-nums">
          {energy ? (
            <>
              <AnimatedValue value={Math.round(energy.low)} digits={0} />–
              <AnimatedValue value={Math.round(energy.high)} digits={0} /> kcal
            </>
          ) : (
            t("unknown")
          )}
        </p>
        {totals.partial && <p>{t("meal.partial")}</p>}
      </div>
    </div>
  );
}
