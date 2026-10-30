# Plotify — Backup & Disaster Recovery Plan

**Purpose:** Protect user architectural designs against data loss, device corruption, browser storage eviction, and accidental modification.  
**Architecture:** Client-Local Storage with Manual JSON Vaulting and In-App Snapshot Ledger.  

---

## 1. Data Loss Threat Model & Risk Analysis

| Threat Scenario | Impact | Likelihood | Mitigation Implemented |
| :--- | :--- | :--- | :--- |
| **Accidental Room Deletion** | Loss of room geometry in active draft | Moderate | Local Draft Discard / Undo button; Version Snapshot rollback |
| **Unintended Trade Modification** | Structural or MEP layout broken by new 2D room spans | High | Trade Diff view alerts user to trade conflicts before committing |
| **Browser Cache Eviction** | All local projects wiped by browser disk cleaner | Low–Moderate | Storage Quota Monitor + Periodic Standalone JSON Vaulting |
| **LocalStorage Quota Exceeded** | Browser rejects save operations (> 5MB) | Low | Quota Warning Banner in System & Security; Snapshot pruning tool |
| **Corrupted Project JSON** | Project fails schema validation on page load | Low | Safe parsing guards in `storage.ts` fall back to baseline templates |

---

## 2. Backup Strategy & Procedures

### Tier 1: In-App Version Snapshots (Intra-Session Protection)
- Every project maintains a timestamped snapshot history.
- Users can click **"Revisions & Diff $\rightarrow$ Create Snapshot"** before making major layout changes.
- Safe rollback allows one-click restoration to any previous revision.

### Tier 2: Standalone JSON Vaulting (Inter-Device & Cold Storage)
- **Procedure:** Open Project Overview $\rightarrow$ Executive Docs $\rightarrow$ **Export Project Archive (`.json`)**.
- **Recommended Frequency:**
  - After completing Schematic Design milestone.
  - Prior to clearing browser history or cache.
  - Prior to sharing designs with external collaborators.
- **Storage Recommendation:** Save exported `.json` files to user's encrypted cloud drive (Google Drive, iCloud, OneDrive) or corporate network share.

---

## 3. Disaster Recovery Procedures

### Scenario A: Roll Back a Broken Project to a Previous Snapshot
1. Open the project in Plotify.
2. Click **"Revisions & Diff"** in the top navigation bar.
3. Review the timeline of previous snapshots.
4. Select the desired stable snapshot and inspect the visual trade diff.
5. Click **"Restore this Snapshot"**. Plotify restores room geometry, structural grids, and MEP configurations safely.

### Scenario B: Recover Projects after Browser Cache Was Cleared
1. Launch Plotify in a fresh browser session.
2. Navigate to **"Projects"** view.
3. Click **"Import Project Vault / Restore JSON"**.
4. Select your previously backed-up `.json` file from your local disk.
5. Plotify validates schema integrity and re-seeds the project into local storage with its full revision history intact.

### Scenario C: Storage Quota Exceeded (Browser 5MB Limit Reached)
1. Open **"System & Security $\rightarrow$ Storage Quota & Disaster Recovery"**.
2. Inspect the quota breakdown (projects, snapshots, pilot feedback).
3. Export all active projects to JSON archives.
4. Click **"Prune Historical Snapshots"** or delete obsolete draft projects.
5. Storage capacity is instantly reclaimed.

---

## 4. Disaster Recovery Checklist

- [ ] Project JSON backup downloaded to external drive.
- [ ] At least one named version snapshot created before structural changes.
- [ ] Storage quota verified under 75% capacity (< 3.75MB).
- [ ] Sample restore tested successfully using exported JSON file.
- [ ] Quota alert thresholds configured in System Health.
