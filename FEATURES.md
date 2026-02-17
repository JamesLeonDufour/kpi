# Bareit Custom KoboToolbox -- Features & Documentation

This branch (`custom-branding`) contains all Bareit-specific customizations
applied to the KPI source code.

---

## Table of Contents

1. [Branding](#branding)
2. [Enforce SSO](#enforce-sso-hide-usernamepassword-login)
3. [Bulk User Import](#bulk-user-import)
4. [CI/CD & Deployment](#cicd-github-actions-builds-the-docker-image-automatically)
5. [Local Build](#how-to-build-locally-optional)
6. [Docker Compose Override](#docker-compose-override-file)
7. [Changing the Branding Color](#how-to-change-the-branding-color)
8. [Upgrading KoboToolbox](#upgrading-kobotoolbox)
9. [Verification](#verify)

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

## CI/CD: GitHub Actions builds the Docker image automatically

A GitHub Actions workflow (`.github/workflows/build-branding.yml`) builds and
pushes the Docker image to **GitHub Container Registry** on every push to the
`custom-branding` branch.

Image: `ghcr.io/jamesleondufour/kpi:custom-branding`

You do **not** need to build the image locally anymore.

### Workflow

```
Edit source files -> git push -> GitHub Actions builds image -> deploy.sh -> browser refresh
```

---

## How to deploy (one command)

After GitHub Actions finishes building, run on your server:

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

3. **Push** to trigger a new build:
   ```bash
   git push origin custom-branding
   ```

4. Wait for GitHub Actions to finish, then **deploy**:
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
- Login page buttons, links, and focus states should all be teal
- Login page should show "Hosted by Bareit" inside the form box at the bottom
- If ENFORCE_SSO is enabled, only SSO buttons should be visible on login
- `/admin/kobo_auth/user/` should show an **Import** button for bulk user creation
