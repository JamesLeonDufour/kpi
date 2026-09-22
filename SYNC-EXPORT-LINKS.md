# Synchronous export links in the Downloads UI

Adds **Copy CSV / Copy XLSX sync link** buttons to each row of *Project →
Data → Downloads → Exports*, exposing the synchronous export endpoints that
already exist in the API.

Documented separately from `CASE-MANAGEMENT.md` — the two features are
unrelated, they just live on the same branch.

## Problem

KoboToolbox can serve an export **synchronously**: a URL that regenerates the
export from current data on every request, instead of handing back a file
frozen at the moment the export ran. That is exactly what you want as a live
data source for Excel, Power BI or Google Sheets.

Those URLs (`data_url_csv`, `data_url_xlsx`) were only reachable by calling the
API and reading the JSON response, which puts them out of reach for anyone who
isn't comfortable doing that. See the
[support article](https://support.kobotoolbox.org/synchronous_exports.html).

## What this adds

Each export row in the Exports table gets two text buttons before **Download**:

| Button | Copies |
|---|---|
| **CSV** | `…/api/v2/assets/{asset}/export-settings/{setting}/data.csv` |
| **XLSX** | `…/api/v2/assets/{asset}/export-settings/{setting}/data.xlsx` |

They copy the absolute URL to the clipboard and confirm with a notification.
Both formats are offered on every matched row, because the endpoint honours the
requested format regardless of the type the setting was created for — so an
export you created as XLS can still be consumed as CSV.

## The part worth understanding: the link belongs to a *setting*

A sync URL is a property of a **saved export setting**
(`AssetExportSettings`), not of a finished export task. The Exports table lists
export *tasks*. So the two have to be matched up.

In practice they usually do match, because exporting from the UI saves a
setting first and then runs the export from it (see `ProjectExportsCreator` —
it calls `assetsExportSettingsCreate`/`PartialUpdate` before creating the
export, for users with `manage_asset`). That's why it feels like "every export
has a sync link".

Matching is done on the export's *parameters*, not on a stored reference,
because the API does not record which setting produced which task. The two
representations differ in annoying ways, which is why
`exportSettingsMatchUtils.ts` exists and is unit-tested:

- **`query` gains a `_userform_id` key on the export task.** The saved setting
  holds the user's own filter (usually `{}`); the back end injects
  `_userform_id` to scope the export to its form. This one matters most: left
  in the comparison, *no export ever matches its own setting* and the buttons
  never appear anywhere. It is stripped from both sides, while any filter the
  user actually set is still compared.
- booleans can come back as real booleans or as the strings `'true'` / `'false'`
- `lang` may be `null`, `false`, `'xml'`, or a language code
- `fields` / `tag_cols_for_header` arrive in arbitrary order
- `submission_ids` may be numbers or numeric strings
- optional keys are simply absent and must fall back to `DEFAULT_EXPORT_SETTINGS`

Both sides are normalised into a canonical shape and compared with `isEqual`.
The tests use shapes taken verbatim from a live server, because this is exactly
the kind of thing that typechecks perfectly and still matches nothing.

### When the buttons don't appear

This is expected, not a bug:

- **The export has no matching setting.** Older exports (predating this flow),
  exports created by a user without `manage_asset`, or exports created from a
  setting that has since been edited to different parameters.
- **The setting was deleted.** The export file remains downloadable; the sync
  URL is gone with the setting.

Deliberate consequence of matching on parameters: if a setting is edited after
an export ran, that export stops showing a link — correctly, since the URL
would no longer return equivalent data.

## Using the link

The endpoint requires authentication, so a bare URL in a browser that isn't
logged in will not work. In a spreadsheet or BI tool, supply credentials
(the account's username/password over HTTPS, or an API token).

The view already has explicit handling for these clients — it serves the
content directly instead of redirecting for LibreOffice, Microsoft Excel and
Power BI, because those drop the `Authorization` header across a 302. So the
copied URL can be pasted straight into *Get Data → Web*.

Every refresh re-runs the export against current submissions.

## Implementation

| File | Change |
|---|---|
| `jsapp/js/components/projectDownloads/exportSettingsMatchUtils.ts` | New. Normalisation + matching |
| `jsapp/js/components/projectDownloads/exportSettingsMatchUtils.tests.ts` | New. Unit tests for the normalisation quirks above |
| `jsapp/js/components/projectDownloads/ProjectExportsList.tsx` | Fetches export settings, matches per row, renders the two buttons |
| `jsapp/js/dataInterface.ts` | `ExportDataResponse.data` gains `query`, `submission_ids`, `tag_cols_for_header` — returned by the API and read when matching |

No backend changes: the endpoints, permissions and serializer fields already
existed. This is purely surfacing them.

Clipboard handling uses `useClipboard` from `@mantine/hooks`, matching the
Mantine components already used in this table.

## Limitations

- Matching is parameter-based, so it is only as good as the normalisation. A
  new export option added upstream and not accounted for in
  `normalizeExportSettingsForMatching` would cause rows to stop matching
  (failing closed — no button — rather than offering a wrong link).
- No UI yet for copying a sync link directly from a *saved export setting*,
  which would sidestep matching entirely. That would be the natural next step
  if matching proves fragile.
