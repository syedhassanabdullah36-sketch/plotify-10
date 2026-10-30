# Plotify — Operational Incident Runbook & Severity Matrix

**Status:** Pre-Release Operational Procedure  
**Application:** Plotify — AI-Powered Architectural Intelligence  
**Scope:** Client errors, calculation discrepancies, data loss risks, deployment anomalies  

---

## 1. Incident Severity Matrix

| Severity Level | Definition | Impact Examples | Response SLA | Action Required |
| :--- | :--- | :--- | :---: | :--- |
| **P1 — Critical Blocker** | Catastrophic failure causing project data loss, silent corruption, or false-negative life-safety violation | • Unsaved floor plans lost without recovery<br>• Code violation falsely reported compliant<br>• Infinite loop / unrecoverable page freeze | **< 2 Hours** | Immediate pilot/release pause; hotfix branch; roll back deployment if live |
| **P2 — Major Defect** | Core functional impairment without data loss; workaround may be complex | • 2D-to-3D geometry sync failure<br>• Structural span calculation mismatch<br>• Clash detection fails to evaluate | **< 8 Hours** | Triage defect; assign lead engineer; patch in next release candidate |
| **P3 — Moderate Issue** | Non-critical feature degradation; clear workaround available | • 3D camera stutter on complex models<br>• Filter dropdown visual glitch<br>• Exported CSV header quoting discrepancy | **< 24 Hours** | Log in triage register; schedule in standard development cycle |
| **P4 — Minor / Cosmetic** | Trivial visual bug, typo, or minor enhancement suggestion | • Misaligned badge in drawer<br>• Copy clarification in documentation | **Backlog** | Address during scheduled UI polish pass |

---

## 2. Escalation & Response Workflow

```
[Issue Reported via Support / Pilot Register]
              │
              ▼
   [Sanitize & Triage Issue]
   • Assign Severity (P1 - P4)
   • Reproduce with clean project fixture
              │
    ┌─────────┴─────────┐
    ▼                   ▼
[P1 Critical]       [P2 - P4]
• Trigger Pause     • Log in Triage Register
• Isolate Cause     • Assign discipline owner
• Deploy Hotfix     • Schedule patch release
```

---

## 3. Diagnostic Bundle Extraction (Privacy-Conscious)

When investigating an incident, operators must collect the **Plotify Sanitized Diagnostic Bundle**:
- Application Version (`v1.0.0-rc1`)
- Active Project ID & Geometry Fingerprint (e.g. `GF-8A3F...`)
- Total Room Count & Unit System (`feet` vs `metres`)
- Browser User-Agent, Operating System, Screen Resolution, WebGL support flag
- Quota metrics (Used bytes vs 5MB ceiling)
- Error stack trace (with stripped file paths and zero user credentials)

**Prohibited Diagnostic Data:**
- Homeowner client personal names or contact details.
- Proprietary financial contracts or bank details.
- Raw raster design sketches or non-anonymized floor plans.
