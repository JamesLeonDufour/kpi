# Bareit Custom Branding for KoboToolbox

This branch (`custom-branding`) contains Bareit-specific branding changes
applied directly to the KPI source code. No overlay images or CSS hacks needed.

---

## What's customized

| Item | Change | File(s) |
|------|--------|---------|
| Header background | `#0891B2` (cyan/teal) | `jsapp/scss/colors.scss`, `jsapp/scss/libs/_mdl.scss` |
| Header height | `48px` (compact) | `jsapp/scss/libs/_mdl.scss` |
| Browser tab title | "KoboToolbox -- Bareit" | `kpi/templates/base_simple.html` |
| Login button color | `#0891B2` | `jsapp/scss/components/_kobo.button.scss` |
| Login input focus | `#0891B2` | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login links | Teal (matching branding) | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login SSO buttons | Teal background/text | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login select focus | `#0891B2` | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login footer | "Hosted by Bareit" (inside form box) | `kobo/apps/accounts/templates/account/login.html` |
| Link colors | `#0891B2` | `kpi/static/css/kpi_simple.css` |
| PWA manifest | Name + theme color | `static/site.webmanifest` |
| Safari mask icon | `#0891B2` | `kpi/templates/base_simple.html` |

All changes use a single SCSS variable `$bareit-blue` defined in `jsapp/scss/colors.scss`.

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

1. Edit `jsapp/scss/colors.scss` -- change the `$bareit-blue` value
2. Edit `kpi/static/css/kpi_simple.css` -- update the hex values
3. Edit `static/site.webmanifest` -- update `theme_color`
4. Edit `kpi/templates/base_simple.html` -- update the `mask-icon` color
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
- Header should be cyan/teal (`#0891B2`)
- Tab title should say "KoboToolbox -- Bareit"
- Login page buttons, links, and focus states should all be cyan/teal
- Login page should show "Hosted by Bareit" inside the form box at the bottom
