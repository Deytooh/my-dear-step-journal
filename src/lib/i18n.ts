// Translation infrastructure. Korean is complete; en/fr fall back to Korean until translated.
export type Locale = "ko" | "en" | "fr";

const ko = {
  "nav.today": "오늘", "nav.calendar": "캘린더", "nav.add": "기록추가", "nav.injections": "주사", "nav.progress": "변화",
  "today.title": "오늘도, 한 걸음씩.", "today.records": "오늘의 기록", "today.seeAll": "전체 보기",
  "today.addOther": "다른 기록 추가", "today.empty": "아직 오늘 남긴 기록이 없어요.",
  "journey": "나의 작은 여정",
  "reminder.next": "다음 주사 알림", "reminder.nextShort": "다음 알림", "reminder.userSet": "직접 설정한 일정",
  "reminder.none": "설정한 알림이 없어요", "reminder.set": "알림 설정",
  "inv.left": "남은 재고", "inv.unit": "회분", "inv.edit": "재고 수정", "inj.manage": "주사 관리",
  "voice.title": "모모에게 말로 남기기", "voice.sub": "한 번 말하고, 확인해서 저장해요",
  "voice.all": "모모에게 한 번에 말하기", "voice.allSub": "말 · 사진 · 글로 남기고 확인해요.",
  "voice.unavailable": "모모 기능은 아직 연결되지 않았어요. 직접 기록은 지금 바로 할 수 있어요.",
  "type.weight": "체중", "type.injection": "주사", "type.condition": "컨디션", "type.memory": "사진 · 순간", "type.purchase": "구매 · 재고",
  "qa.title": "무엇을 남길까요?", "qa.sub": "편한 방식으로 가볍게 남겨요.",
  "qa.weight": "숫자만 빠르게", "qa.injection": "날짜 · 용량 · 부위", "qa.condition": "오늘의 느낌과 메모",
  "qa.memory": "기억하고 싶은 하루", "qa.purchase": "구매 내역과 남은 수량",
  "cal.title": "나의 캘린더", "cal.sub": "기록과 알림을 한눈에", "cal.recorded": "남긴 기록", "cal.planned": "예정 알림",
  "cal.empty": "이 날에는 기록이 없어요.",
  "inj.title": "주사 관리", "inj.sub": "일정부터 재고와 지출까지 한눈에",
  "inj.monthSpend": "이번 달 지출", "inj.lastPurchase": "최근 구매", "inj.basis": "직접 입력한 구매 내역 기준",
  "inj.tabRecords": "주사 기록", "inj.tabStock": "구매 · 재고", "inj.recent": "최근 기록", "inj.add": "주사 기록",
  "inj.editNote": "저장한 내용은 언제든 수정할 수 있어요.", "inj.addPurchase": "구매 추가", "inj.noPurchases": "구매 내역이 없어요.",
  "inj.noRecords": "아직 주사 기록이 없어요.",
  "prog.title": "나의 변화", "prog.sub": "숫자와 순간을 함께 돌아봐요.", "prog.latest": "최근 체중", "prog.mine": "내 기록",
  "prog.journey": "내 사진과 작은 여정", "prog.journeySub": "내가 남긴 순간 돌아보기",
  "prog.tWeight": "체중", "prog.tMeasure": "치수", "prog.tPhoto": "사진",
  "prog.1m": "1개월", "prog.3m": "3개월", "prog.all": "전체",
  "prog.legendW": "체중 기록", "prog.legendI": "주사 기록", "prog.recent": "최근 기록", "prog.manual": "직접 입력",
  "prog.export": "기록 내보내기", "prog.noData": "기간 안에 체중 기록이 없어요.", "prog.comingSoon": "곧 추가될 기능이에요.",
  "f.save": "저장", "f.cancel": "취소", "f.delete": "삭제", "f.date": "날짜", "f.time": "시간", "f.timeUnknown": "시간 모름",
  "f.value": "체중 (kg)", "f.medication": "약 이름", "f.dose": "용량", "f.site": "부위", "f.optional": "선택",
  "f.feeling": "느낌", "f.note": "메모", "f.amount": "금액 (원)", "f.doses": "구매 수량 (회분)", "f.photo": "사진",
  "f.reminderAt": "알림 날짜와 시간", "f.useStock": "재고에서 1회분 차감", "f.stockCount": "남은 수량 (회분)",
  "toast.saved": "저장했어요", "toast.deleted": "삭제했어요", "toast.undo": "되돌리기", "toast.exported": "내보냈어요",
  "demo.badge": "예시", "demo.banner": "예시 기록이 표시되고 있어요.", "demo.clear": "예시 지우기",
  "set.momo": "모모 그림 표시", "set.settings": "설정",
  "feel.good": "편안해요", "feel.ok": "괜찮아요", "feel.tired": "피곤해요", "feel.nausea": "속이 불편해요", "feel.low": "기운 없어요",
  "today": "오늘", "dDay": "D-{n}",
  "type.measure": "치수", "qa.measure": "허리 · 엉덩이 · 가슴 · 허벅지", "f.waist": "허리 (cm)", "f.hip": "엉덩이 (cm)", "f.chest": "가슴 (cm)", "f.thigh": "허벅지 (cm)",
  "hist.title": "모든 기록", "hist.sub": "남긴 기록을 날짜별로 모아봤어요.", "hist.all": "전체", "hist.empty": "아직 기록이 없어요.", "hist.open": "전체 기록 보기",
  "journey.title": "내 사진과 작은 여정", "journey.sub": "내가 남긴 순간과 변화를 시간순으로 돌아봐요.", "journey.start": "시작", "journey.change": "시작 대비 {v} kg", "journey.empty": "아직 남긴 순간이 없어요.",
  "toast.demoCleared": "예시를 지웠어요", "meas.empty": "아직 치수 기록이 없어요.", "meas.add": "치수 남기기",
};
export type Key = keyof typeof ko;
const dicts: Record<Locale, Partial<Record<Key, string>>> = { ko, en: {}, fr: {} };

let current: Locale = "ko";
export const setLocale = (l: Locale) => { current = l; };
export const intlLocale = () => ({ ko: "ko-KR", en: "en-US", fr: "fr-FR" })[current];

export function t(key: Key, vars?: Record<string, string | number>) {
  let s = dicts[current][key] ?? ko[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const fmtNumber = (n: number, digits = 1) =>
  new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits }).format(n);
export const fmtMoney = (n: number, currency = "KRW") =>
  currency === "KRW" ? `${new Intl.NumberFormat("ko-KR").format(n)}원` : new Intl.NumberFormat(intlLocale(), { style: "currency", currency }).format(n);
