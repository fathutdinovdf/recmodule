# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue — resolved statuses always carry their resolution date

---

## 2026-08-14

### Observation 1: Production build invalidated a live Next.js dev cache

**Status:** OPEN
**Date:** 2026-08-14
**Session context:** Adding and verifying a reusable UI component in a Next.js application while its dev server was running.
**Skill:** New skill candidate: safe Next.js live-workspace verification
**Type:** open-source
**Phase/Area:** Verification and local development process management

**Issue:** A production build reused `.next` while the dev server was serving from it. The build was interrupted, leaving the live runtime without a vendor chunk and breaking the user's open development session.

**Suggested improvement:** Before running `next build`, detect a dev server rooted in the same application. Either stop and restart it around the build, configure a separate build directory, or use non-mutating checks such as `tsc --noEmit` when a full build is not required.

**Principle:** Verification must not mutate cache artifacts that a live development process is actively consuming.

### Observation 2: Verification prerequisites checked only after the code was written

**Status:** OPEN
**Date:** 2026-08-14
**Session context:** Implementing a database-backed feature in a project whose mandatory verification step is rendering the live application.
**Skill:** New skill candidate: safe Next.js live-workspace verification
**Type:** open-source
**Phase/Area:** Verification, environment readiness

**Issue:** The project's rules require verifying a change by rendering the running application, and the application needs a containerized database. Whether that runtime was available was only discovered after the whole feature was written, and it turned out the container engine was down and needed a human at its GUI. The work ended up committed with static type checks only.

**Suggested improvement:** At task start — before writing code — probe every runtime the verification step depends on (database, container engine, dev server, remote stand) and report unavailable ones immediately, so the user can start them in parallel with the work instead of at the end.

**Principle:** Check the preconditions of the verification step at the beginning of a task, not when the verification is due — a dependency that needs a human takes wall-clock time that only overlaps with the work if it is discovered early.
