import type { JournalSnapshot, JournalRecord, Purchase } from "./journal";
import { tFor, type Key, type Locale } from "./i18n";
import { timeOf } from "./dates";
import { purchaseMoneyFacts } from "./purchase-money";
import { SITE_ZONES } from "./injection-sites";

type Options = {
  locale: Locale;
  tz: string;
  from: string | null;
  to: string | null;
  includeDemo: boolean;
};
/** A local text overview of saved facts. It performs no inference or journal writes. */
export function journalSummary(
  state: Pick<JournalSnapshot, "records" | "purchases">,
  options: Options,
) {
  const tr = (key: Key, vars?: Record<string, string | number>) => tFor(options.locale, key, vars);
  const unknown = tr("unknown");
  const formatter = new Intl.NumberFormat(
    { ko: "ko-KR", en: "en-US", fr: "fr-FR" }[options.locale],
    { maximumSignificantDigits: 21 },
  );
  const percent = new Intl.NumberFormat({ ko: "ko-KR", en: "en-US", fr: "fr-FR" }[options.locale], {
    style: "percent",
    maximumSignificantDigits: 21,
  });
  const number = (value: number | null | undefined) =>
    value == null ? unknown : formatter.format(value);
  const field = (label: Key, value: string | null | undefined) =>
    tr(label) + ": " + (value?.trim() || unknown);
  const eligible = (entry: { localDate: string; demo?: boolean }) =>
    (options.includeDemo || !entry.demo) &&
    (!options.from || entry.localDate >= options.from) &&
    (!options.to || entry.localDate <= options.to);
  const records = state.records.filter(eligible);
  const purchases = state.purchases.filter(eligible);
  const when = (record: JournalRecord) => {
    if (record.precision === "exact" && record.at) return timeOf(record.at, options.tz);
    if (record.precision === "part_of_day" && record.partOfDay)
      return tr(`pod.${record.partOfDay}`);
    return tr("f.timeUnknown");
  };
  const details = (record: JournalRecord): string[] => {
    switch (record.type) {
      case "weight":
        return [number(record.value) + " kg"];
      case "condition":
        return [
          record.label.trim() || unknown,
          ...(record.note ? [field("f.note", record.note)] : []),
        ];
      case "water":
        return [tr(record.answer === "yes" ? "water.yes" : "water.notYet")];
      case "memory":
        return [record.note || unknown, ...(record.photo ? [tr("sum.photo")] : [])];
      case "injection": {
        const zone = SITE_ZONES.find((item) => item.id === record.site);
        const site = zone ? tr(`site.${zone.key}.${zone.side}`) : record.site;
        return [
          field("f.medication", record.medication),
          field("f.dose", number(record.doseValue)),
          field("ux.doseUnit", record.doseUnit),
          field("f.site", site),
        ];
      }
      case "measure": {
        const values = (["waist", "hip", "chest", "thigh"] as const)
          .filter((key) => record[key] !== null)
          .map((key) => field(`f.${key}`, number(record[key])));
        return values.length ? values : [unknown];
      }
      case "meal":
        return [
          record.meal.title,
          ...record.meal.items
            .filter((item) => item.included)
            .map(
              (item) =>
                "• " + item.name + (item.portionDescription ? " — " + item.portionDescription : ""),
            ),
          field(
            "evidence.eaten",
            record.meal.consumedFraction === null
              ? unknown
              : percent.format(record.meal.consumedFraction),
          ),
          ...(record.meal.consumptionNote ? [record.meal.consumptionNote] : []),
          ...(record.meal.note ? [field("f.note", record.meal.note)] : []),
          ...(record.meal.photoRefs.length ? [tr("sum.photo")] : []),
        ];
    }
  };
  const purchaseDetails = (purchase: Purchase) => {
    const money = purchaseMoneyFacts(purchase);
    const amount = money.amount === null ? tr("money.unknown") : number(money.amount);
    return [
      purchase.product || purchase.medication || unknown,
      field("f.amount", amount),
      field("evidence.currency", money.currency),
      ...(purchase.merchant ? [field("f.merchant", purchase.merchant)] : []),
    ];
  };
  const rows = [
    ...records.map((record) => ({
      date: record.localDate,
      id: record.id,
      demo: !!record.demo,
      time: record.precision === "exact" && record.at ? timeOf(record.at, options.tz) : null,
      text:
        record.localDate +
        " · " +
        when(record) +
        " · " +
        tr(`type.${record.type}`) +
        "\n" +
        details(record).join("\n"),
    })),
    ...purchases.map((purchase) => ({
      date: purchase.localDate,
      id: purchase.id,
      demo: !!purchase.demo,
      time: null,
      text:
        purchase.localDate +
        " · " +
        tr(purchase.addsStock === false ? "type.expense" : "type.purchase") +
        "\n" +
        purchaseDetails(purchase).join("\n"),
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.time === null) - Number(b.time === null) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.id.localeCompare(b.id),
  );
  const hasDemo = rows.some((row) => row.demo);
  const period = options.from && options.to ? options.from + " — " + options.to : tr("sum.all");
  const text = [
    "my dear step — " + tr("sum.title"),
    period,
    tr("set.tz") + ": " + options.tz,
    tr("sum.help"),
    tr("sum.count", { n: rows.length }),
    ...(hasDemo ? [tr("sum.demoWarning")] : []),
    ...rows.map((row) => (row.demo ? "[" + tr("demo.badge") + "] " : "") + row.text),
  ].join("\n\n");
  return { text, count: rows.length, hasDemo };
}
