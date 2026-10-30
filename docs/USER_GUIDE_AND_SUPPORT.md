# Plotify — User Operational Guide & Support Procedures

**Product:** Plotify — AI-Powered Architectural Intelligence  
**Audience:** Architects, Homeowners, Spatial Designers, Engineering Consultants, Pilot Users  

---

## 1. Quick Start Guide

### Step 1: Project Inception
- Click **"+ New Project"** from the Dashboard or navigation bar.
- Enter project name, project type (House, Apartment, or Other), plot width and length, unit of measurement (`feet` or `metres`), road-facing orientation, and budget.
- Configure the space program (bedrooms, bathrooms, kitchen, living room, custom rooms).
- Click **"Create Project"**.

### Step 2: 2D Floor Plan Layout
- Open **"Floor Plan"** to enter the interactive 2D canvas.
- Click and drag room blocks to arrange spaces.
- Real-time snap guides enforce orthogonal alignment.
- Boundary violation indicators alert you if any room crosses plot setback limits.
- The **Living Constraint Graph** automatically calculates area schedules, gross floor area (GFA), and plot coverage.

### Step 3: Synchronized 3D Spatial Inspection & Design Studio
- Switch to **"3D Viewer"** to inspect extruded 3D room volumes, exterior apertures, and heights.
- Navigate with mouse orbit (left-click drag), pan (right-click drag), and zoom (scroll wheel).
- Open **"Design Studio"** to preview exterior facade material palettes (e.g. Modern Minimalist, Alpine Timber, Brutalist Concrete) and interior ambiance presets.

### Step 4: Multi-Discipline Engineering Coordination
- **Site Context & Solar:** Inspect solar orientation, daylight exposure, and topography slopes.
- **Statutory Regulations:** Verify zoning setbacks, maximum building height, FAR (Floor Area Ratio), and open space ratio.
- **Structural Framing:** Inspect column grid axes, prescriptive joist span limits (< 20 ft / 6 m), and load paths.
- **MEP Coordination:** Review horizontal and vertical HVAC supply ducts, plumbing stacks, electrical panels, and automated clash detection.

### Step 5: Version History & Handoff
- Open **"Revisions & Diff"** to save named snapshots before major layout modifications.
- Review side-by-side trade diffs to compare area changes, cost deltas, and clash counts between revisions.
- Open **"Executive Docs"** to export project specifications as Markdown or CSV.

---

## 2. Responsible Use & Decision-Support Boundaries

> ⚠️ **STATUTORY & PROFESSIONAL NOTICE:**  
> Plotify is an early-stage spatial planning and decision-support system. It does **not** generate certified construction working drawings, stamp architectural plans, or replace the statutory oversight of licensed architects and professional engineers. Municipal building permit filings require professional review and local authority approval.

---

## 3. Support Procedures & Bug Reporting

If you encounter an issue, unexpected behavior, or calculation discrepancy, follow this reporting workflow:

### Non-Sensitive Support Issue Template

```markdown
### PLOTIFY ISSUE REPORT

**Date:** [YYYY-MM-DD]
**Application Version:** v1.0.0-rc1
**Workflow Affected:** [e.g. 2D Floor Plan / 3D Viewer / MEP Clash / Cost Takeoff]
**Browser & OS:** [e.g. Chrome 122 on macOS Sonoma 14.3]
**Project ID / Unit:** [e.g. proj-01 / feet]
**Geometry Fingerprint:** [From Project Overview or Verification Center]

#### 1. Summary of Issue:
[Short concise description of what happened]

#### 2. Expected Behavior:
[What you anticipated should occur]

#### 3. Actual Observed Behavior:
[What actually occurred, including any visible error message]

#### 4. Step-by-Step Reproduction:
1. Open Project Overview for "..."
2. Navigate to Floor Plan editor
3. Drag room partition by 5 feet
4. Click Save Draft

#### 5. Non-Sensitive Diagnostics:
- Total Rooms: [e.g. 6]
- Storage Quota: [e.g. 1.2MB / 5.0MB]
- Browser Console Errors (sanitized, zero credentials): [paste error message if available]
```

### Reporting Channels
- **Pilot Users:** Use the in-app **"Pilot System $\rightarrow$ Feedback Register $\rightarrow$ Record Pilot Feedback"** form.
- **General Inquiries:** Export the sanitized diagnostics report via **Operational Readiness $\rightarrow$ Support Runbook** and email to project coordinators.
- **Privacy Notice:** Never include confidential client contracts, personal homeowner names, or sensitive financial bank statements in issue reports.
