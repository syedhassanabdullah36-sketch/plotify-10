# Plotify — Privacy & Data-Handling Standard

**Document Status:** Pre-Release Privacy & Data Handling Specification  
**Classification:** Public / User Facing  
**Governing Principle:** Client-Side Data Residency & Zero-Telemetry Privacy  

---

## 1. Data Processing Architecture & Storage Model

Plotify operates on a **client-side local data residency model**:
- **Where Data Lives:** 100% of architectural drawings, room dimensions, structural column grids, MEP runs, cost budgets, version snapshots, and pilot feedback records reside **locally** in the user's browser `localStorage` and memory.
- **External Transmission:** Plotify does **not** transmit floor plan geometry, client names, project locations, or financial estimates to any remote analytics server, advertising network, or tracking service.
- **Zero Third-Party Trackers:** No Google Analytics, Mixpanel, Meta Pixels, or telemetry beacons are embedded in the application bundle.

---

## 2. Categories of Processed Data

| Category | Specific Attributes | Storage Location | Retention Period |
| :--- | :--- | :--- | :--- |
| **Project Geometry** | Plot dimensions, room boundaries, coordinates, apertures | Browser `localStorage` (`plotify_projects_v1`) | Retained until user deletes project or clears browser data |
| **Space & Brief** | Room types, target counts, zoning parameters, orientations | Browser `localStorage` | Same as project |
| **Engineering Models** | Column coordinates, beam lengths, MEP duct/pipe segments | Browser `localStorage` | Same as project |
| **Financial Estimates** | Currency, budget, unit cost rates, calculated sums | Browser `localStorage` | Same as project |
| **Version Snapshots** | Named revision snapshots, trade diffs, restore points | Browser `localStorage` (`plotify_snapshots_v1`) | Same as project |
| **Professional Reviews** | Reviewer roles, findings, resolution notes | Browser `localStorage` | Same as project |
| **Pilot Feedback** | Anonymous tokens (`PILOT-ARC-101`), observations, repro steps | Browser `localStorage` (`plotify_pilot_feedback_v1`) | User-purgeable via one-click button |
| **User Settings** | Default unit (`feet` / `metres`), currency, role | Browser `localStorage` (`plotify_settings_v1`) | Persists across browser sessions |

---

## 3. User Data Rights & Data Sovereignty

Plotify respects international data protection principles (GDPR, CCPA/CPRA, PIPEDA):
1. **Right to Access / Portability:** Users can export all project data at any time via:
   - Standalone JSON Archive (`.json`).
   - Area Schedule & Cost Estimate CSV (`.csv`).
   - Executive Specification Dossier (`.md`).
2. **Right to Erasure (Right to be Forgotten):**
   - Individual projects can be deleted from the Project Overview or Dashboard.
   - All projects can be wiped via **System & Security $\rightarrow$ Storage Quota $\rightarrow$ Clear All Data**.
   - Pilot feedback can be purged via **Pilot System $\rightarrow$ Purge Local Pilot Data**.
3. **No Account Creation Required:** Because data is stored in the browser session, users are not forced to provide emails, phone numbers, or passwords.

---

## 4. Known Privacy Risks & User Responsibilities

- **Shared / Public Workstations:** Because data resides in the browser's `localStorage`, anyone with physical or administrative access to the user's browser profile can inspect stored projects. Users on shared computers should export their JSON archive and clear local data after each session.
- **Browser Cache Eviction:** If the user executes "Clear All History and Cookies" in browser settings without exporting their project JSON, stored projects will be permanently deleted.
- **Statutory Notice:** This privacy specification documents implemented client-side controls. Prior to commercial multi-tenant cloud release with centralized user accounts, a formal jurisdiction-specific legal review is mandatory.
