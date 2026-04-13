# Bareit Custom KoboToolbox -- Features & Documentation

This branch (`custom-branding`) contains all Bareit-specific customizations
applied to the KPI source code.

---

## Table of Contents

1. [Branding](#branding)
2. [Login Page Redesign](#login-page-redesign)
3. [Enforce SSO](#enforce-sso-hide-usernamepassword-login)
4. [Bulk User Import](#bulk-user-import)
5. [Data Import from Excel](#data-import-from-excel)
6. [Synchronous Export Links](#synchronous-export-links)
7. [CI/CD & Deployment](#cicd-github-actions-builds-the-docker-image-automatically)
8. [Local Build](#how-to-build-locally-optional)
9. [Docker Compose Override](#docker-compose-override-file)
10. [Changing the Branding Color](#how-to-change-the-branding-color)
11. [Upgrading KoboToolbox](#upgrading-kobotoolbox)
12. [Verification](#verify)

---

## Branding

| Item | Change | File(s) |
|------|--------|---------|
| Header background | `#1e3a5f` (deep navy) | `jsapp/scss/colors.scss`, `jsapp/scss/libs/_mdl.scss` |
| Header height | `48px` (compact) | `jsapp/scss/libs/_mdl.scss` |
| Browser tab title | "KoboToolbox -- Bareit" | `kpi/templates/base_simple.html` |
| Login button color | `#0891B2` (teal accent) | `jsapp/scss/components/_kobo.button.scss` |
| Login input focus | `#0891B2` (teal accent) | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login links | Teal (matching branding) | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login SSO buttons | Teal background/text | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login select focus | `#0891B2` (teal accent) | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login footer | "Hosted by Bareit" (inside form box) | `kobo/apps/accounts/templates/account/login.html`, `jsapp/scss/stylesheets/partials/_registration.scss` |
| Link colors | `#0e7490` (WCAG AA compliant, 4.54:1) | `kpi/static/css/kpi_simple.css` |
| PWA manifest | Name + theme color `#1e3a5f` | `static/site.webmanifest` |
| Safari mask icon | `#1e3a5f` | `kpi/templates/base_simple.html` |

Two SCSS variables drive the brand colors, both defined in `jsapp/scss/colors.scss`:
- `$bareit-navy: #1e3a5f` — header background (deep navy, 10:1 contrast with white text)
- `$bareit-blue: #0891B2` — teal accent for buttons, focus rings, SSO buttons, login footer

---

## Login Page Redesign

**Files:** `jsapp/scss/stylesheets/partials/_registration.scss`, `kobo/apps/accounts/templates/account/login.html`

| Element | Change |
|---|---|
| Background | Radial vignette overlay (`::before`) darkens photo edges, pulls focus to card |
| Card | `backdrop-filter: blur(14px)`, deep dark glass (`rgba 12 18 32 / 0.91`), subtle border, `0 24px 64px` shadow, `14px` radius |
| Labels | `11px`, uppercase, `letter-spacing: 0.06em`, 52% white opacity — clear hierarchy |
| Inputs | Semi-transparent dark bg (`rgba white 0.10`) with white text, smooth transitions, teal focus underline |
| Submit button | `44px` min-height, `margin-top` reduced, strong `3px` teal `:focus-visible` ring |
| "Forgot password?" | Always right-aligned (`margin-left: auto`), smaller and muted |
| SSO divider | `<hr>` + `<h2>` replaced with a centered `─── or ───` divider |
| SSO copy | Shortened to "Sign in with your organization account." |
| SSO buttons | Outlined ghost style — teal border + subtle tint on dark card |
| Error messages | Red left-accent bar + pill background for inline field feedback |
| Password toggle | SVG eye icon injected via JS — toggles `type="password"/"text"`, `aria-label` updates, keyboard-accessible |

---

## Enforce SSO (hide username/password login)

A runtime toggle called **ENFORCE_SSO** is available in Django admin via
**Constance > Config** (under "General Options").

| Setting | Default | Effect |
|---------|---------|--------|
| `ENFORCE_SSO` | `False` | When `True`, hides the username/password fields, login button, "Create an account", and "Forgot password?" links. Only the SSO buttons remain on the login page. |

**Files:** `kobo/settings/base.py`, `kobo/apps/accounts/templates/account/login.html`

To enable it:

1. Go to **Django Admin > Constance > Config**
2. Check **ENFORCE_SSO**
3. Save

No rebuild or redeployment is needed -- the change takes effect immediately.

---

## Bulk User Import

Admins can bulk-create user accounts by uploading a CSV or Excel file through
the Django admin interface.

**Files:** `hub/admin/extend_user.py`

### How it works

- Uses `django-import-export` (already installed) to add an **Import** button
  to the User admin at `/admin/kobo_auth/user/`.
- A `UserImportResource` class handles password hashing and allauth
  `EmailAddress` creation automatically.
- Handles BOM-encoded CSV files (common when exporting from Excel).
- Dry run preview is safe -- it skips the actual database save to prevent
  orphan records in KoBoCAT (which uses a separate database not covered by
  the KPI transaction rollback).

### Expected CSV format

```
username,email,password
john,john@example.com,SecurePass123!
jane,jane@example.com,AnotherPass456!
```

### What happens on import

1. Each row creates (or updates) a User record.
2. The plaintext password is hashed via `set_password()`.
3. A verified, primary `EmailAddress` (allauth) is created for each user with
   an email.
4. Existing `post_save` signals automatically handle:
   - Auth token creation
   - Organization creation
   - Default model-level permissions
   - KoBoCAT user sync + UserProfile creation

### How to use

1. Log in to Django admin at `/admin/kobo_auth/user/`
2. Click the **Import** button
3. Upload a CSV with `username`, `email`, `password` columns
4. Preview the import (dry run)
5. Confirm the import
6. Verify users appear in the user list with correct emails
7. Check `/admin/account/emailaddress/` -- each imported user should have a
   verified, primary email

---

## Data Import from Excel

Users with the **Add submissions** permission can upload an XLS/XLSX file and
import its rows directly as submissions into any deployed project.

**Branch:** `feature/data-import-phase1`

**Files changed:**

| File | Change |
|------|--------|
| `kpi/views/v2/data.py` | New `import_data` action on `DataViewSet` |
| `jsapp/js/components/submissions/dataImportModal.tsx` | New upload modal component |
| `jsapp/js/components/submissions/table.tsx` | Upload button + modal wiring |
| `jsapp/js/dataInterface.ts` | New `importSubmissionsData` API helper |

### How it works

**Backend** — `POST /api/v2/assets/{uid}/data/import/`

1. Accepts a `multipart/form-data` request with a single `file` field (`.xls`
   or `.xlsx`).
2. Parses the workbook with `openpyxl`. Row 1 = question name headers; each
   subsequent non-blank row = one submission.
3. For every data row, builds a nested submission dict and injects a fresh
   `meta/instanceID` UUID.
4. Forwards the submission as JSON to the existing OpenRosa endpoint
   (`POST /submission`) using the calling user's API token — the same pipeline
   used by ODK Collect and Enketo.
5. Returns `{"imported": N, "failed": M, "errors": ["row 3: …"]}`.

**Frontend** — data table toolbar

- An **Upload** button (cloud-upload icon) appears next to the existing
  fullscreen/settings buttons, visible only to users with `add_submissions`.
- Clicking it opens the **Import data from Excel** modal.
- The modal shows a warning that no form-structure validation is performed,
  a file picker (`.xls`/`.xlsx` only), an upload progress bar, and a
  success/error summary including any per-row errors.
- On success the table refreshes automatically.

### Limitations (Phase 1 MVP)

- No media/attachment support.
- No repeat-group support.
- No validation against the form structure — column names must match question
  names exactly or the submission will fail at the OpenRosa layer.

### How to use

1. Navigate to **Data > Table** for any deployed project.
2. Click the **Upload** (cloud arrow) icon in the top-right toolbar.
3. In the modal, click **Choose file** and pick a `.xls` or `.xlsx` file.
   - Row 1 must contain exact question names (e.g. `first_name`, `age`).
   - Rows 2+ are data rows; blank rows are skipped.
4. Click **Upload**. A progress bar fills while the rows are submitted.
5. The result shows `N imported, M failed` and lists any row-level errors.
6. The table refreshes automatically to show the new submissions.

---

## Synchronous Export Links

Users can now copy the existing synchronous export URLs directly from the
**Data > Downloads** exports table without having to browse the API manually.

**Branch:** `feature/sync-export-links` (merged into `custom-branding`)

**Files changed:**

| File | Change |
|------|--------|
| `jsapp/js/components/projectDownloads/ProjectExportsList.tsx` | Adds **Copy CSV Sync Link** and **Copy XLSX Sync Link** buttons in the exports list |
| `jsapp/js/dataInterface.ts` | Extends export response typings so the UI can match export rows to saved export settings |

### How it works

- The Downloads page already creates normal asynchronous export rows in the
  **Exports** table.
- KoboToolbox exposes synchronous links through the export-settings API as
  `data_url_csv` and `data_url_xlsx`.
- The frontend now loads export settings alongside the export rows and matches
  a completed CSV/XLS export to its saved settings.
- When a match is found, the row shows two extra buttons:
  - **Copy CSV Sync Link**
  - **Copy XLSX Sync Link**
- Clicking either button copies the existing synchronous URL to the clipboard
  and shows a confirmation toast.

### Important behavior

- These buttons appear only for completed `CSV` and `XLS` exports.
- They depend on a matching saved export setting, which follows Kobo's
  documented synchronous export workflow for **named exports**.
- No new backend endpoint was added; the UI simply surfaces the existing
  `data_url_csv` / `data_url_xlsx` values already provided by the API.

### How to use

1. Navigate to **Data > Downloads** for a deployed project.
2. Create or reuse a named CSV or XLS export configuration.
3. Wait for the export row to finish processing.
4. In the **Exports** table, click **Copy CSV Sync Link** or
   **Copy XLSX Sync Link**.
5. Paste the copied URL into Excel, Power BI, Google Sheets, or another tool
   that supports the required authentication mode.

### Reference

- Support article: `https://support.kobotoolbox.org/synchronous_exports.html`

---

## CI/CD

Automatic GitHub Actions builds for the `custom-branding` branch are disabled.

Pushing new commits to this branch no longer triggers a Docker image build or
any other branch-specific GitHub Action.

If you want a fresh image after making changes, build and publish it manually.

---

## How to deploy (one command)

After a new image has been built and pushed manually, run on your server:

```bash
/root/kpi-bareit/deploy.sh
```

This script:
1. Pulls the latest `ghcr.io/jamesleondufour/kpi:custom-branding` image
2. Recreates all frontend containers
3. Verifies the running image

---

## How to build locally (optional)

If you prefer to build on the server instead of using GitHub Actions:

### Prerequisites

- Docker with BuildKit support (Docker 18.09+)
- At least 6 GB RAM or 4 GB + swap (webpack build is memory-intensive)
- ~10 GB free disk space

### Build

```bash
cd /root/kpi-bareit
git checkout custom-branding
docker build -t ghcr.io/jamesleondufour/kpi:custom-branding .
```

The build has 4 stages:
1. `npm-install` -- installs Node dependencies
2. `webpack-build-prod` -- compiles SCSS and JavaScript (this is where branding CSS gets compiled)
3. `pip-dependencies` -- installs Python packages
4. `kpi-app` -- assembles the final production image

Build time: ~15-30 minutes depending on hardware.

---

## Docker Compose override file

The override file is at `/root/kobo-docker/docker-compose.frontend.override.yml`.

All KPI-based services (`kpi`, `worker`, `worker_kobocat`, `worker_low_priority`,
`worker_long_running_tasks`, `beat`) use:

```yaml
image: ghcr.io/jamesleondufour/kpi:custom-branding
```

**Do not** edit `docker-compose.frontend.yml` directly -- only use the override file.

---

## How to change the branding color

Two variables control the palette:

| Variable | Default | Used for |
|---|---|---|
| `$bareit-navy` | `#1e3a5f` | Header background |
| `$bareit-blue` | `#0891B2` | Buttons, focus rings, links, SSO buttons |

To change colors:

1. Edit `jsapp/scss/colors.scss` -- change `$bareit-navy` and/or `$bareit-blue`
2. Edit `kpi/static/css/kpi_simple.css` -- update the link hex values to match `$bareit-blue`
3. Edit `static/site.webmanifest` -- update `theme_color` (should match `$bareit-navy`)
4. Edit `kpi/templates/base_simple.html` -- update the `mask-icon` color (should match `$bareit-navy`)
5. Push to `custom-branding` branch:
   ```bash
   git add -A && git commit -m "feat: update branding color" && git push
   ```
6. Wait for GitHub Actions to finish building (~15-30 min)
7. Deploy:
   ```bash
   /root/kpi-bareit/deploy.sh
   ```

---

## Upgrading KoboToolbox

When a new KPI version is released (e.g. `2.026.xx`):

1. **Merge upstream** into your branch:
   ```bash
   cd /root/kpi-bareit
   git fetch upstream
   git merge upstream/main
   ```
   (If you haven't set up the upstream remote yet:
   `git remote add upstream https://github.com/kobotoolbox/kpi.git`)

2. **Resolve conflicts** (unlikely -- branding touches few files)

3. **Push** your merged branch:
   ```bash
   git push origin custom-branding
   ```

4. Build and push a fresh Docker image manually.

5. Then **deploy**:
   ```bash
   /root/kpi-bareit/deploy.sh
   ```

Branding survives upgrades because it lives in your branch, not in overlay files.

---

## Verify

Open your browser and check:
- Header should be deep navy (`#1e3a5f`)
- Buttons, focus rings, and accents should be teal (`#0891B2`)
- Tab title should say "KoboToolbox -- Bareit"
- Login page:
  - Background photo has a visible vignette darkening the edges
  - Card is a dark frosted-glass panel (blurred background behind it)
  - Labels are small, uppercase, and muted
  - Inputs are dark semi-transparent with white text; teal underline on focus
  - "Login" button is full-width teal with a teal focus ring
  - "Forgot password?" is right-aligned and visually lighter than "Create an account"
  - Password field has a 👁 toggle button on the right (show/hide)
  - SSO section shows `─── or ───` divider and "Sign in with your organization account."
  - SSO buttons are outlined teal ghost buttons
  - Error messages appear inline below the field with a red left bar
  - "Hosted by Bareit" shown at the bottom of the card
- If ENFORCE_SSO is enabled, only SSO buttons should be visible on login
- `/admin/kobo_auth/user/` should show an **Import** button for bulk user creation
