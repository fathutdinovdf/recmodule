# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue

---

## 2026-08-12

### Observation 1: Design critiques of data-management screens need a logic pass

**Status:** OPEN
**Date:** 2026-08-12
**Session context:** Critical review of a reference-data administration screen backed by local HTML, CSS, and JavaScript.
**Skill:** design-critique
**Type:** open-source
**Phase/Area:** Critique Framework / Usability and consistency

**Issue:** The visual framework alone would have missed high-impact contradictions visible only in implementation: an editable data class had no reachable history, header-level values had no edit path, and validation rules contradicted seeded values.

**Suggested improvement:** For operational and administrative interfaces, add a short domain-logic pass: map each advertised action to a reachable control, compare validation with existing data, verify audit/history access, and exercise at least one high-risk edit flow before scoring the visual design.

**Principle:** A data-management interface is not coherent unless its labels, permissions, validation, audit trail, and interaction paths describe the same operating model.

### Observation 2: Prefer native disclosure for repeated static navigation

**Status:** OPEN
**Date:** 2026-08-12
**Session context:** Moving a secondary navigation column into a shared sidebar repeated across static HTML pages.
**Skill:** impeccable layout
**Type:** open-source
**Phase/Area:** Layout / Navigation architecture

**Issue:** A custom button-and-script disclosure repeated across many static pages would require duplicating state logic and accessibility behavior, even though the interaction is a standard expandable navigation group.

**Suggested improvement:** In static multi-page interfaces, recommend native `details`/`summary` first for sidebar disclosure when its semantics fit. Add only small shared enhancements such as Escape handling, active-child state, and focus return; reserve custom disclosure code for behavior the native control cannot express.

**Principle:** When a navigation behavior is standard and repeated across static shells, native semantics reduce both accessibility risk and cross-page drift.
