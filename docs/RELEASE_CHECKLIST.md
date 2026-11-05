# Owner release checklist

**Publication update, 5 November 2026:** the repository is public and the implementation has been pushed to `main`. Project code is now covered by the owner-approved [MIT License](../LICENSE). Inherited asset rights, live provider/privacy checks, hosted-build verification and video/portal status remain separate. The 4 November test evidence below is a historical snapshot; see the [later mobile report](MOBILE_PERFORMANCE_2026-11-05.md) for the 990-test gate and its lint limitations.

The [official rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), checked on 4 November, require an open-source repository and a three-minute video. **Deadline: 5 November 2026, 11:00 KST / 02:00 UTC.** See [SUBMISSION_STATUS](SUBMISSION_STATUS.md) for dated evidence, not a release certification.

## Before recording

- [x] Local integrated gate at **22:40 UTC**: 981 tests across 72 files, TypeScript and production build passed. Cumulative changed-source lint had zero errors and 11 existing Fast Refresh warnings. Local QA fixtures were removed from the public asset tree before building and are absent from production output. Repeat this gate after any later code edit and before publication.
- [ ] In the existing backend, verify owner RLS, review/apply `drizzle/migrations/0001_momo_quota_and_questions.sql` through the authorized workflow, and separately verify/provision the private `photos` bucket if absent (no bucket-provisioning migration is included). Never reset the database.
- [ ] Configure server-only `BASETEN_API_KEY` and an account-supported `MUSE_MODEL`. Complete one fictional text and one owned-photo request. Record UTC time, requested model, outcome and any separately verified provider identity. Do not mistake the UI label for provider confirmation.
- [ ] With two dedicated test accounts, verify direct record/photo denial, sign-out, upload/reload, offline/retry and renewed source access. These live checks remain pending without credentials/accounts.
- [ ] Rehearse [DEMO_SCRIPT](DEMO_SCRIPT.md): capture, compact review, one correction, count-specific save once, reload, original source and correction. Check missing fields and unclear photo attribution.
- [ ] Check the intended hosted build and actual phone keyboard/large text, plus 360/390/430 px layouts. Verify purchase/expense visibility, selected Calendar date, Progress filter recovery and sync/recovery actions outside the recording.

## Publication and licensing

- [x] Owner made the repository public; public visibility verified on 5 November. Preserve Lovable history; do not force-push or rewrite published commits.
- [x] Add the owner-approved MIT license for project source code.
- [ ] Confirm inherited Momo/Lovable/font asset rights. Preserve dependency notices; the project MIT license does not grant third-party rights.
- [ ] Recheck tracked files and the final client bundle for privileged secrets/private exports. Earlier `.env` classification covered public/publishable configuration only; keep provider secrets server-side.
- [ ] Match [HACKATHON_CONTRIBUTIONS](HACKATHON_CONTRIBUTIONS.md) to the original Git history and official event window. Confirm actual team membership and the applicable team limit.

## Before submission

- [ ] Verify the signed-in portal's required fields, eligibility and any additional runtime-evidence requirements. Public rules do not verify a completed portal form.
- [ ] Record and upload the actual three-minute video; test its sharing in a logged-out window.
- [ ] Verify the authorized public open-source repo and intended app are accessible to judges. Include test-access instructions if needed, never credentials in the repository.
- [ ] Review `SUBMISSION_COPY.md` against current facts; fill actual team, video and app links. Remove unverified claims.
- [ ] Obtain the owner's separate approval to submit. Submit only the approved entry and retain its actual confirmation.

## Release boundaries

No live Meta inference or authenticated Supabase security check has been established in this pass. Cloud writes are independent retryable operations, not a cross-table transaction. Conflicts need an explicit version choice after backup. Structured exports contain photo references, not a portable media archive. Blob cleanup and account deletion remain administrative backend operations.
