# Bareit Custom Branding for KoboToolbox

This branch (`custom-branding`) contains Bareit-specific branding changes
applied directly to the KPI source code. No overlay images or CSS hacks needed.

---

## What's customized

| Item | Change | File(s) |
|------|--------|---------|
| Header background | `#1e7ae5` (bright blue) | `jsapp/scss/colors.scss`, `jsapp/scss/libs/_mdl.scss` |
| Browser tab title | "KoboToolbox -- Bareit" | `kpi/templates/base_simple.html` |
| Login button color | `#1e7ae5` | `jsapp/scss/components/_kobo.button.scss` |
| Login input focus | `#1e7ae5` | `jsapp/scss/stylesheets/partials/_registration.scss` |
| Login footer | "Hosted by Bareit" | `kobo/apps/accounts/templates/account/base.html` |
| Link colors | `#1e7ae5` | `kpi/static/css/kpi_simple.css` |
| PWA manifest | Name + theme color | `static/site.webmanifest` |
| Safari mask icon | `#1e7ae5` | `kpi/templates/base_simple.html` |

All changes use a single SCSS variable `$bareit-blue` defined in `jsapp/scss/colors.scss`.

---

## How to build the Docker image

### Prerequisites

- Docker with BuildKit support (Docker 18.09+)
- At least 6 GB RAM (webpack build is memory-intensive)
- ~10 GB free disk space

### Build

```bash
cd /root/kpi-bareit
git checkout custom-branding
docker build --no-cache -t bareit/kpi:custom-branding .
```

The build has 4 stages:
1. `npm-install` -- installs Node dependencies
2. `webpack-build-prod` -- compiles SCSS and JavaScript (this is where branding CSS gets compiled)
3. `pip-dependencies` -- installs Python packages
4. `kpi-app` -- assembles the final production image

Build time: ~15-30 minutes depending on hardware.

### Verify the image

```bash
docker images bareit/kpi
```

---

## How to use with kobo-install

### 1. Create or edit the Docker Compose override file

```bash
# Path depends on your kobo-docker location
vim /root/kobo-docker/docker-compose.frontend.override.yml
```

Add (or update) the `kpi` service image:

```yaml
services:
  kpi:
    image: bareit/kpi:custom-branding
```

**Do not** edit `docker-compose.frontend.yml` directly -- only use the override file.

### 2. Recreate the frontend containers

```bash
cd /root/kobo-install
./run.py --compose-frontend down
./run.py --compose-frontend up -d
```

This is safe: volumes and data are preserved.

### 3. Verify

```bash
# Check the running image
docker inspect kobofe-kpi-1 | grep Image

# Should show: bareit/kpi:custom-branding
```

Open your browser and check:
- Header should be bright blue (`#1e7ae5`)
- Tab title should say "KoboToolbox -- Bareit"
- Login page should show "Hosted by Bareit" at the bottom

---

## How to change the branding color

1. Edit `jsapp/scss/colors.scss` -- change the `$bareit-blue` value
2. Edit `kpi/static/css/kpi_simple.css` -- update the hex values
3. Edit `static/site.webmanifest` -- update `theme_color`
4. Edit `kpi/templates/base_simple.html` -- update the `mask-icon` color
5. Rebuild the Docker image:
   ```bash
   cd /root/kpi-bareit
   docker build --no-cache -t bareit/kpi:custom-branding .
   ```
6. Recreate containers:
   ```bash
   cd /root/kobo-install
   ./run.py --compose-frontend down
   ./run.py --compose-frontend up -d
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

3. **Rebuild** the Docker image:
   ```bash
   docker build --no-cache -t bareit/kpi:custom-branding .
   ```

4. **Recreate** frontend containers:
   ```bash
   cd /root/kobo-install
   ./run.py --compose-frontend down
   ./run.py --compose-frontend up -d
   ```

Branding survives upgrades because it lives in your branch, not in overlay files.

---

## Mental model

```
Edit source files -> git push -> docker build -> recreate containers -> browser refresh
```

If something didn't change, one of these steps was skipped.
