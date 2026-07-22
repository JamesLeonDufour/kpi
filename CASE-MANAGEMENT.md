# Case Management for KoboToolbox (MVP)

This fork adds **basic case management** to KoboToolbox: real relational
case tables stored in Postgres, a new **Case Data** section in the UI
(below Projects and Library), live linking of case tables to projects, and
submission-driven updates of case records.

## What it does

- **Case tables** — user-owned datasets with a dynamic schema (columns) and
  a key column (e.g. `case_id`). Create them in the new *Case Data* section,
  upload a CSV (header row becomes the schema, rows are upserted by key),
  edit cells inline, add rows/columns.
- **Live form data** — link a table to a project and it appears to the form
  as an attached CSV media file (e.g. `cases.csv`), except the content is
  **rendered live from the database on every download**. `pulldata()` and
  `select_one_from_file` therefore always see the current data — unlike
  Dynamic Data Attachments there is nothing to re-upload.
- **Write-back** — when a submission comes in, the answer to the configured
  *case id question* selects the case record, and each configured field
  mapping (`question → column`) is written onto the record, like an UPDATE
  in a relational database. New case ids can auto-create records.
- **Joined columns in the data table** — the project's Data → Table view
  shows the linked case table's columns (tinted purple) joined live by
  case id, next to the submission columns.
- **Case Management project settings tab** — under project Settings a
  dedicated tab manages the project's case links with dropdowns fed by the
  form's own questions (case id question, write-back mappings question →
  column), instead of typing names by hand.
- **Organization sharing** — a case table owner can share it with their
  organization: org members then see it in Case Data, can edit records,
  link it to their own projects, and get the joined columns in their data
  tables.
- **Case history** — every change is logged: manual edits (who, which cell,
  old → new), CSV imports (stats), and submission write-backs (which
  project, which submission id, what changed). Viewable per record (⏱ on
  each row) or for the whole table (History button), and via
  `GET /api/v2/case-tables/{uid}/events/?record_key=…`.

## Architecture

| Piece | Where | Notes |
|---|---|---|
| Django app | `kobo/apps/kobo_cases/` | Models `CaseTable`, `CaseRecord`, `CaseLink` + API |
| REST API | `/api/v2/case-tables/…`, `/api/v2/assets/{uid}/case-links/…` | DRF viewsets |
| Live CSV endpoint | `/api/v2/assets/{uid}/case-links/{link}/external.csv` | Same auth model as paired-data (`XMLExternalDataPermission`) |
| Media sync | `CaseLink` implements the same interfaces as `PairedData` | Hash = case table data version → Enketo/Collect refetch on change |
| Write-back | `kobo_cases.tasks.sync_case_records` (Celery) | Triggered after each new submission commits (`parsed_instance.py`) |
| UI | `jsapp/js/components/caseData/` + Drawer/router/table patches | New `case-management` icon in `jsapp/svg-icons/` |

Existing kpi files touched (all changes are additive and small):

- `kobo/settings/base.py` — app registered in `INSTALLED_APPS`
- `kpi/urls/router_api_v2.py` — routes
- `kpi/deployment_backends/base_backend.py` — case links join the paired-data media sync
- `kpi/views/v2/asset_snapshot.py` — case links included in Enketo preview manifest
- `kobo/apps/openrosa/apps/viewer/models/parsed_instance.py` — write-back trigger
- `jsapp/js/router/routerConstants.ts`, `jsapp/js/router/router.tsx`,
  `jsapp/js/components/Drawer.tsx`, `jsapp/js/components/submissions/table.tsx`,
  `jsapp/js/components/submissions/table.scss`,
  `jsapp/js/components/formSubScreens.js`, `jsapp/js/components/formViewSideTabs.js`

## Deploying on an existing kobo-install server

`kobo-install` already supports building kpi from local sources ("developer
mode"), so no installer changes are needed.

1. **Push this fork** to your own git hosting (GitHub etc.):

   ```bash
   cd kpi
   git checkout -b case-management-mvp
   # Add only the real changes (on Windows, `git status` may list hundreds of
   # phantom modifications caused by core.autocrlf — do not `git add -A`):
   git add CASE-MANAGEMENT.md \
       kobo/apps/kobo_cases \
       jsapp/js/components/caseData \
       jsapp/svg-icons/case-management.svg \
       kobo/settings/base.py \
       kpi/urls/router_api_v2.py \
       kpi/deployment_backends/base_backend.py \
       kpi/views/v2/asset_snapshot.py \
       kobo/apps/openrosa/apps/viewer/models/parsed_instance.py \
       jsapp/js/router/routerConstants.ts \
       jsapp/js/router/router.tsx \
       jsapp/js/components/Drawer.tsx \
       jsapp/js/components/submissions/table.tsx \
       jsapp/js/components/submissions/table.scss \
       jsapp/js/components/formSubScreens.js \
       jsapp/js/components/formViewSideTabs.js
   git commit -m "Add case management MVP (kobo_cases app + Case Data UI)"
   git remote add fork git@github.com:<you>/kpi.git
   git push fork case-management-mvp
   ```

2. **On the server**, clone the fork next to kobo-install:

   ```bash
   cd /path/to/kobo-deployments   # wherever kobo-install lives
   git clone -b case-management-mvp git@github.com:<you>/kpi.git kpi
   ```

3. **Enable dev mode** in kobo-install so the kpi image is built from your
   checkout:

   ```bash
   cd kobo-install
   python3 run.py --setup
   # → advanced options: yes
   # → "Use developer mode?" : yes
   # → KPI path: /path/to/kobo-deployments/kpi
   ```

   (Alternatively, build the image yourself — `docker build -t kobotoolbox/kpi:case-mgmt kpi/`
   — and set that tag in `kobo-docker/docker-compose.frontend.override.yml`.)

4. **Run the migration** once containers are up:

   ```bash
   python3 run.py -cf exec kpi bash -c "python manage.py migrate kobo_cases"
   ```

5. Rebuild happens automatically in dev mode (`npm install` inside the image
   build regenerates the icon font, which picks up the new *case-management*
   icon).

## Using it

1. Open the new **Case Data** icon (left sidebar, under Library).
2. Create a table, e.g. *Beneficiaries* with key column `case_id`.
3. Upload a CSV such as:

   ```csv
   case_id,full_name,status,last_visit
   C-001,Amina Diallo,open,2026-06-02
   C-002,Jean Kouassi,follow-up,2026-06-15
   ```

4. Open the table → **Link a project**, choose your survey, keep filename
   `cases.csv`, set the case id question name (e.g. `case_id`) and, for
   write-back, mappings like:

   ```
   new_status=status
   visit_date=last_visit
   ```

5. In the **XLSForm**, use the file like an attached CSV:

   | type | name | label | calculation | parameters |
   |---|---|---|---|---|
   | select_one_from_file cases.csv | case_id | Case | | value=case_id, label=full_name |
   | calculate | current_status | | pulldata('cases', 'status', 'case_id', ${case_id}) | |
   | note | info | Status: ${current_status} | | |
   | select_one s_opts | new_status | New status | | |
   | date | visit_date | Visit date | | |

   (`pulldata('cases', …)` = filename without `.csv`.) Redeploy the form.

6. Collect data: each form load pulls the **current** case data. Each
   submission updates the case record via the mappings. The project's
   Data → Table view shows the case columns tinted purple, always reflecting
   the current table content.

## MVP limitations

- Case tables are visible to their **owner and (when shared) their
  organization members** — users outside the org see the live CSV inside
  forms (any allowed data collector) but not the joined columns or editor.
- Write-back runs on **new submissions** (not on submission edits) and takes
  the *first* matching value when question names are ambiguous across groups.
- Enketo refreshes case data when the **form is (re)loaded**, not live inside
  an open form (that is an Enketo/ODK engine property, same as DDA).
- One case link per project is shown in the data table join (the API supports
  several).
- Concurrency: last write wins at column granularity per record.
