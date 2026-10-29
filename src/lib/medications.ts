import type { Locale } from "./i18n";

export type Medication = { id: string; en: string; ko: string; ingredient: string; ingredientKo: string; form: "injectable" | "oral" | "combination"; aliases: string[]; source: string };
const ema = (name: string) => `https://www.ema.europa.eu/en/medicines/human/EPAR/${name}`;
const med = (id: string, en: string, ko: string, ingredient: string, ingredientKo: string, form: Medication["form"], source: string, aliases: string[] = []): Medication => ({ id, en, ko, ingredient, ingredientKo, form, source, aliases });

// Approved in at least one jurisdiction; not a Korean availability/indication list.
// Reviewed 2026-10-29. No dose schedules, research peptides or compounded products.
export const MEDICATIONS: Medication[] = [
  med("mounjaro", "Mounjaro", "마운자로", "tirzepatide (GIP/GLP-1)", "티르제파타이드 (GIP/GLP-1)", "injectable", ema("mounjaro")),
  med("wegovy-injection", "Wegovy (injection)", "위고비", "semaglutide", "세마글루타이드", "injectable", ema("wegovy"), ["Wegovy"]),
  med("ozempic", "Ozempic", "오젬픽", "semaglutide", "세마글루타이드", "injectable", ema("ozempic")),
  med("saxenda", "Saxenda", "삭센다", "liraglutide", "리라글루타이드", "injectable", ema("saxenda")),
  med("zepbound", "Zepbound", "젭바운드", "tirzepatide (GIP/GLP-1)", "티르제파타이드 (GIP/GLP-1)", "injectable", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/217806s031lbl.pdf"),
  med("trulicity", "Trulicity", "트루리시티", "dulaglutide", "둘라글루타이드", "injectable", ema("trulicity")),
  med("victoza", "Victoza", "빅토자", "liraglutide", "리라글루타이드", "injectable", ema("victoza")),
  med("byetta", "Byetta", "바이에타", "exenatide", "엑세나타이드", "injectable", ema("byetta")),
  med("bydureon", "Bydureon", "바이듀리언", "exenatide extended-release", "엑세나타이드 서방형", "injectable", ema("bydureon")),
  med("bydureon-bcise", "Bydureon BCise", "바이듀리언 BCise", "exenatide extended-release", "엑세나타이드 서방형", "injectable", "https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=BYDUREON+BCISE"),
  med("lyxumia", "Lyxumia", "릭수미아", "lixisenatide", "릭시세나타이드", "injectable", ema("lyxumia")),
  med("adlyxin", "Adlyxin", "애들릭신", "lixisenatide", "릭시세나타이드", "injectable", "https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=ADLYXIN"),
  med("eppe", "Eppe", "에페", "efpeglenatide", "에페글레나타이드", "injectable", "https://www.hanmi.co.kr/about/news-media/press/detail-5083.hm", ["에페오토인젝터주"]),
  med("mazdutide", "Mazdutide", "마즈두타이드", "mazdutide (GCG/GLP-1)", "마즈두타이드 (GCG/GLP-1)", "injectable", "https://en.innoventbio.com/InvestorsAndMedia/PressReleaseDetail?key=604"),
  med("ecnoglutide", "Ecnoglutide", "에크노글루타이드", "ecnoglutide", "에크노글루타이드", "injectable", "https://doi.org/10.1007/s40265-026-02350-w", ["Xianyida", "Xianweiying", "先颐达", "先维盈"]),
  med("beinaglutide", "Beinaglutide", "베나글루타이드", "beinaglutide (benaglutide)", "베나글루타이드", "injectable", "https://www.benemae.com/product/introduce.html", ["benaglutide", "谊生泰", "菲塑美"]),
  med("rybelsus", "Rybelsus", "리벨서스", "semaglutide", "세마글루타이드", "oral", ema("rybelsus")),
  med("wegovy-tablet", "Wegovy (tablet)", "위고비 (정제)", "semaglutide", "세마글루타이드", "oral", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/218316Orig1s000lbl.pdf"),
  med("foundayo", "Foundayo", "Foundayo", "orforglipron", "오르포글리프론", "oral", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/220934s003lbl.pdf"),
  med("xultophy", "Xultophy", "줄토피", "insulin degludec + liraglutide", "인슐린 데글루덱 + 리라글루타이드", "combination", ema("xultophy")),
  med("soliqua", "Soliqua", "솔리쿠아", "insulin glargine + lixisenatide", "인슐린 글라진 + 릭시세나타이드", "combination", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/208673s011lbl.pdf"),
  med("suliqua", "Suliqua", "Suliqua", "insulin glargine + lixisenatide", "인슐린 글라진 + 릭시세나타이드", "combination", ema("suliqua")),
];

const normalize = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, " ");
/** Exact brand aliases only: never equate different brands or ingredients for inventory. */
export const findMedication = (value: string) => MEDICATIONS.find((m) => [m.ko, m.en, ...m.aliases].some((name) => normalize(name) === normalize(value)));
export const medicationLabel = (m: Medication, locale: Locale) => locale === "ko" ? m.ko : m.en;