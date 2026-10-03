# 2.2.013 TEST backend

`temporal.js` / `temporal.gs` are additive helpers. `scripts/build-test-backend.py`
patches exported Worker and Apps Script sources with checked anchors; it stops on
any source mismatch. Full existing prompts and private source IDs are not stored here.

```sh
python3 scripts/build-test-backend.py worker-original.txt gas-original.txt /tmp/motchi-2.2.013
node scripts/test-temporal.mjs /tmp/motchi-2.2.013
node scripts/test-gas.mjs /tmp/motchi-2.2.013
```

Deploy generated `Code.gs` as a new version of the existing Apps Script deployment,
then generated `worker.mjs` to the existing Worker. Keep endpoints and permissions.
TEST conditions enable the new retrieval; production paths retain previous behavior.

QA_LOG migration runs on the first TEST answer: append missing diagnostic headers
and `test_mode`; write only a new row with `TEST_` session ID. No historical backfill.
Large answers recover from the persisted QA_LOG rather than exceeding the Script
Properties per-value limit. TEST never calls production `prepareAsk`/usage mutations.

Defaults: 最近=7 calendar days inclusive, ここ数日=3 days, 先週=previous Mon–Sun,
先月=previous calendar month, 最新/最後=one latest dated conversation after AI filter.
Undated conversations are excluded from temporal candidates. Topic searches first
read every candidate's MESSAGES, then restrict vector search by conversation ID.
Zero hits retain originals. Very large evidence is shortened with round-robin
conversation coverage and records `evidence_truncated`; answers must not infer
absence from this partial evidence. Natural-language date parsing covers the
specified patterns; arbitrary expressions may need follow-up expansion.

2026-10-03 deployment: Apps Script version 18; Worker 02cdb7a6.
