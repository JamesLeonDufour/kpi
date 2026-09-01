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

5. In the **XLSForm**, use the file like an attached CSV. `pulldata('cases', …)`
   uses the filename **without** `.csv`. To show the whole case on file, pull
   each column; to let enumerators create a case that doesn't exist yet, gate
   the extra questions on whether `pulldata` found anything:

   | type | name | label | calculation | relevant | parameters |
   |---|---|---|---|---|---|
   | select_one mode_list | mode | Is this an existing case? | | | |
   | select_one_from_file cases.csv | case_pick | Select the case | | ${mode} = 'existing' | value=case_id,label=name |
   | text | case_id_new | New case ID | | ${mode} = 'new' | |
   | calculate | case_id | | if(${mode} = 'existing', ${case_pick}, ${case_id_new}) | | |
   | calculate | known_name | | pulldata('cases', 'name', 'case_id', ${case_id}) | | |
   | calculate | known_status | | pulldata('cases', 'status', 'case_id', ${case_id}) | | |
   | calculate | known_last_visit | | pulldata('cases', 'last_visit', 'case_id', ${case_id}) | | |
   | note | existing_case | Name: ${known_name} / Status: ${known_status} / Last visit: ${known_last_visit} | | ${mode} = 'existing' | |
   | note | new_case | ${case_id_new} will be created on submit. | | ${mode} = 'new' | |
   | text | name_new | Name | | ${mode} = 'new' | |
   | text | name_fix | Correct the name (optional) | | ${mode} = 'existing' | |
   | calculate | name | | if(${mode} = 'new', ${name_new}, ${name_fix}) | ${mode} = 'new' or string-length(${name_fix}) > 0 | |
   | select_one s_opts | status | Status | | | |
   | date | visit_date | Visit date | | | |

   Two things are worth copying from this shape.

   **The picker feeds itself from the case table.** `select_one_from_file
   cases.csv` with `value=case_id,label=name` builds the choice list out of
   the live CSV, so enumerators pick from the cases that exist at the moment
   the form is loaded — no choice list to maintain. Keeping a "New case"
   branch alongside it means unknown ids can still be created; a picker on
   its own can only ever offer cases that already exist. The `case_id`
   calculate collapses the two branches into the single value the link's
   *case id question* points at.

   **`name` is a calculate with a `relevant`, not a plain question.**
   Write-back maps questions to columns, and a question that is relevant but
   left blank submits an empty string, which *overwrites* the stored name
   with nothing. A question that is **not relevant** is absent from the
   submission and is skipped. So `name` is only relevant when there is
   actually a name to write — a new case, or a correction that was typed —
   and an ordinary visit to an existing case leaves the stored name alone.
   Apply the same pattern to any optional write-back field.

   Redeploy the form after changing it.

6. Collect data: each form load pulls the **current** case data. Each
   submission updates the case record via the mappings. The project's
   Data → Table view shows the case columns tinted purple, always reflecting
   the current table content.

## A ready-made demo

`case_management_example_form.xlsx` + `case_management_example_cases.csv`
(generated by `build_case_management_example.py`) exercise both directions
end to end:

1. Case Data → **NEW TABLE**, upload the CSV (key column `case_id`; the
   sample has `CASE001`–`CASE003` with `name`, `status`, `last_visit`).
2. Deploy the XLSForm as a project.
3. Project **Settings → Case Management → Create link**:
   `cases.csv` / case id question `case_id` / mappings
   `name=name`, `status=status`, `visit_date=last_visit`, both checkboxes on.
4. Try all three paths:
   - **Existing case** → the picker lists `Amina Diallo` / `Jean Kouassi` /
     `Fatou Sow` (labels come from the table's `name` column). Choose one and
     its name, status and last visit on file are shown. Submit: status and
     visit date are updated, the name is left as it was.
   - **Existing case + correction** → type into *Correct the name*; that name
     replaces the stored one.
   - **New case** → give an id that isn't in the table (e.g. `CASE900`) and a
     name; submitting creates the record with the name, status and visit date
     filled in, and it appears in the picker on the next form load.

## Troubleshooting

**`pulldata()` returns nothing / the case file looks empty in the form.**
Check that the live CSV is actually reachable — this is the single most
common failure, because form clients fetch it anonymously:

```bash
curl -i "https://<kf-domain>/api/v2/assets/<asset-uid>/case-links/<link-uid>/external.csv"
```

A `200` with CSV means the read side is fine. A `404` means the request never
reached the endpoint (see the two bugs under *Fixes*, both of which produced
exactly this). Also confirm the media file is registered on the KoboCAT side
and advertised under the name the form expects:

```python
MetaData.objects.filter(xform__kpi_asset_uid='<asset-uid>').values(
    'data_type', 'data_value', 'data_filename', 'file_hash'
)
# data_type must be 'paired_data' and data_filename the name used in
# pulldata(), e.g. 'cases.csv'
```

Remember that Enketo/Collect re-read the media file when the form is
**loaded**, so reload the form (or re-open it in Enketo) after changing case
data — the hash changes with the table's `data_version`, which is what tells
clients to refetch.

**Write-back doesn't update or create records.** Write-back runs as a Celery
task, so failures never surface in the UI — check the worker log:

```bash
grep sync_case_records log/kpi/celery_kpi_worker_low_priority.log
```

The task runs on `kpi_low_priority_queue` (the `worker_low_priority`
container). To test one submission synchronously, with the traceback in
front of you:

```python
from kobo.apps.kobo_cases.tasks import sync_case_records
sync_case_records.apply(args=['<asset-uid>', <submission-id>], throw=True)
```

Also verify the link itself: `write_back` must be on, `create_missing` must
be on for unknown ids to be created, and `case_id_xpath` must match the
question name actually submitted.

## Fixes applied after the MVP

Four defects in the original MVP, all found in production use and all fixed:

| Symptom | Cause | Fix |
|---|---|---|
| `{"error": "Server Error (500)"}` when creating any case link | `CaseLink.filename` was a plain model field with the same name as the abstract `filename` property required by `OpenRosaManifestInterface`/`SyncBackendMediaInterface`. Django's `ModelBase` adds field attributes *after* `ABCMeta` has frozen `__abstractmethods__`, so the field never satisfied the abstract method and the model stayed abstract — every instantiation raised `TypeError: Can't instantiate abstract class` | Field renamed `_filename` (same `db_column`, so the migration is a schema no-op); `filename` reimplemented as a real `@property` + setter, matching every other interface method on the model. Serializer declares `filename` explicitly since it is no longer an introspectable model field |
| 500 when linking a project to a case table it is already linked to | No validation before the DB's `unique_together`, so an `IntegrityError` escaped as a 500 | `CaseLinkSerializer.validate()` returns a clean 400 |
| Write-back and "create unknown cases automatically" never did anything | `sync_case_records` did `get_submissions(...)[0]`, but that method can return a **generator** (documented to return "an empty generator" when there is no match). A generator is always truthy, so the `if not submissions` guard never fired, and indexing a generator raised `TypeError: 'generator' object is not subscriptable` on *every* submission | Materialize with `list(...)` before checking/indexing |
| `pulldata()` always empty — the live CSV 404s | Two independent bugs: (1) the `external` action had no renderer for the `csv` format, and DRF's content negotiation raises `Http404` when no renderer matches the URL's format suffix; (2) KoboCAT's `get_media_file_response` hardcoded `OpenRosaDynamicDataAttachmentViewset` for *every* `paired_data` metadata row, so case-link URLs were dispatched to the paired-data viewset, which takes a different lookup kwarg and 404s | (1) `renderer_classes=[SubmissionCSVRenderer]` on the action; (2) `tools.py` now picks the viewset the URL actually resolved to, with `OpenRosaCaseLinkViewset` enforcing permission/renderer classes at class level (KoboCAT calls `as_view()` directly, which does not carry `@action` initkwargs — the same reason `OpenRosaDynamicDataAttachmentViewset` exists) |

Note the shared failure mode: **write-back is a Celery task and media fetches
happen inside Enketo/Collect**, so none of these surfaced as a visible error.
Both paths need to be checked in the logs rather than the browser.

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
- A mapped question that is **relevant but answered blank** submits an empty
  string and overwrites the stored value. Only questions that are *not
  relevant* are skipped. Gate optional write-back questions on `relevant`
  rather than leaving them empty.
- The app has **no automated tests**. Everything above was verified manually
  against a running server; the fixes in the table are the kind of thing a
  test suite would have caught, and it is the first thing worth adding.
