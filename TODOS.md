# TODOS

## Infrastructure

### Weekly CHZZK API shape canary

**What:** Add `npm run check:chzzk` that calls the two public CHZZK endpoints for one stable channel and fails if `openLive` is not a boolean or fields are missing, plus a weekly GitHub Actions workflow that runs it.

**Why:** The extension depends on unofficial endpoints. Users see an "unknown" dot when the API drifts (R3), but the maintainer should learn about drift before users report it.

**Context:** Public endpoints `GET api.chzzk.naver.com/service/v1/channels/{id}` and `/polling/v2/channels/{id}/live-status` returned 200 without auth on 2026-10-07. Reuse the response shape check from `lib/chzzk-api.ts` once Stage 1 exists. Cons: a deleted channel id causes a false alarm; DOM drift is not covered because the sidebar needs a login. See `docs/designs/chzzk-sidebar-favorites.md` (R7).

**Effort:** S
**Priority:** P3
**Depends on:** `lib/chzzk-api.ts` (Stage 1) and the CI setup from the test-framework decision (R5)
