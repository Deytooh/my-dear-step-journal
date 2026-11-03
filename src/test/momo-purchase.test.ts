import { it, expect } from "vitest";
import { sanitizeCandidates } from "@/lib/momo-schema";
import { candidateToDraft, draftToEntry } from "@/lib/momo-drafts";
it("a stated Momo purchase adds confirmed stock", () => {
  const txt="마운자로 하나 샀어 ! 재고에 추가해";
  const [c] = sanitizeCandidates([{type:"purchase",medication:"마운자로",quantity:1,date:"2026-11-04",quote:"마운자로 하나 샀어"}], txt);
  const e = draftToEntry(candidateToDraft(c!,"k","2026-11-04"),"p","Asia/Seoul","2026-11-04");
  expect(e).toMatchObject({purchase:{doses:1,addsStock:true,medication:"마운자로"}});
});
