# Owner release checklist

Prepared code/materials are distinct from publication and submission. Normal GitHub pushes are authorized; repository visibility changes, a hosted release and portal submission have not been performed here.

## Before recording
- [ ] Apply prepared 0001 quota migration in the existing backend; provision/verify the private photos bucket (0002 if absent). Verify existing owner RLS policies.
- [ ] Set server-only BASETEN_API_KEY and verify the account-supported MUSE_MODEL. Complete one fictional text and one owned meal-photo request; record actual success/model/time.
- [ ] Use two dedicated test accounts to verify direct record/photo denial, sign-out, offline/retry, reload and source access. Never use real health records for the demo.
- [ ] Open the latest hosted build. Check 360/390/430 layouts and an actual phone keyboard/large-text setting; browser-sized checks do not establish physical-device behavior.

## Before publishing the repository
- [ ] Current visibility was private on 30 October 2026. Owner decides when to make it public. Do not rewrite Lovable history.
- [ ] Confirm rights/provenance for inherited Momo/Lovable/font assets and choose a license for your own source. Preserve dependency licenses.
- [ ] Recheck tracked files and client build for privileged secrets/private exports. Current tracked .env was classified as public/publishable configuration only; future provider secrets belong in the host or ignored local env.
- [ ] Confirm official event window and at most four actual team members; review HACKATHON_CONTRIBUTIONS against git history.

## Portal submission
- [ ] Verify logged-in portal fields, video-length limit, eligibility of the supporting meal feature and required Meta-runtime evidence. Three minutes in DEMO_SCRIPT is only a recording target.
- [ ] Record the coherent demo using the prepared script. Make the video shareable and test in a logged-out window.
- [ ] Confirm the public repo and hosted app URLs work for judges, including sign-in/test access instructions if needed.
- [ ] Paste finished SUBMISSION_COPY, add actual video/team fields, and submit through the official participant portal.
- [ ] Save the actual submission confirmation; do not call the entry submitted until it exists.

## Known operating limits
Cloud writes are retryable independent operations, not a cross-table transaction. Snapshot conflicts require an explicit choice after backup. Structured exports include photo references, not a portable media archive. Blob garbage collection and account deletion are administrative backend operations in this release; no fake deletion button is shown.
