"""
Generates the Case Management demo:

  case_management_example_form.xlsx  — XLSForm to deploy in KoboToolbox
  case_management_example_cases.csv  — case table CSV to upload as a Case Table

The form demonstrates both directions of the feature:

  READ  (pulldata)  — on entering a Case ID, the form pulls that case's
                      name / status / last visit out of the linked case
                      table and shows them, so the enumerator sees the
                      current state of the case before touching it.
  WRITE (write-back) — the answers are written back onto the case record.
                      If the Case ID doesn't exist yet, the case is created
                      and the name entered on the form is stored with it.

The "is this case already known?" test is done with `case_found`, which is
`yes` when pulldata returned anything for that id. The Name question is only
relevant for a *new* case: for a known case the name is already on file (and
because a non-relevant question is absent from the submission entirely, the
write-back leaves the stored name untouched rather than blanking it).

Link configuration this form expects (project Settings → Case Management):

    Attached file name      cases.csv
    Case id question name   case_id
    Write-back mappings     name=name
                            status=status
                            visit_date=last_visit
    Write submissions back to cases        checked
    Create unknown cases automatically     checked
"""
import csv
import os

import openpyxl

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

wb = openpyxl.Workbook()

# --- survey sheet ---
survey = wb.active
survey.title = 'survey'
survey.append(['type', 'name', 'label', 'calculation', 'relevant', 'required', 'appearance'])

survey.append(['text', 'case_id', 'Case ID', '', '', 'yes', ''])

# Pull every column of the linked case table for this case id.
survey.append([
    'calculate', 'known_name', '',
    "pulldata('cases', 'name', 'case_id', ${case_id})", '', '', '',
])
survey.append([
    'calculate', 'known_status', '',
    "pulldata('cases', 'status', 'case_id', ${case_id})", '', '', '',
])
survey.append([
    'calculate', 'known_last_visit', '',
    "pulldata('cases', 'last_visit', 'case_id', ${case_id})", '', '', '',
])

# A case counts as "known" if pulldata returned anything at all for it.
survey.append([
    'calculate', 'case_found', '',
    "if(string-length(${known_name}) > 0 or string-length(${known_status}) > 0 "
    "or string-length(${known_last_visit}) > 0, 'yes', 'no')",
    '', '', '',
])

# Known case: show everything currently on file.
survey.append([
    'note', 'existing_case',
    '**Case on file**\n'
    '- Name: ${known_name}\n'
    '- Status: ${known_status}\n'
    '- Last visit: ${known_last_visit}',
    '', "${case_found} = 'yes'", '', '',
])

# New case: say so, and collect the details needed to create it.
survey.append([
    'note', 'new_case',
    'No case found for **${case_id}**. Fill in the details below and it will '
    'be created automatically when you submit.',
    '', "${case_found} = 'no'", '', '',
])
survey.append([
    'text', 'name', 'Name', '', "${case_found} = 'no'", '', '',
])

# Written back for both new and existing cases.
survey.append(['select_one status_list', 'status', 'Status', '', '', 'yes', ''])
survey.append(['date', 'visit_date', 'Visit date', '', '', 'yes', ''])
survey.append(['text', 'notes', 'Notes (not written back)', '', '', '', ''])

# --- choices sheet ---
choices = wb.create_sheet('choices')
choices.append(['list_name', 'name', 'label'])
choices.append(['status_list', 'open', 'Open'])
choices.append(['status_list', 'in_progress', 'In progress'])
choices.append(['status_list', 'closed', 'Closed'])

# --- settings sheet ---
settings = wb.create_sheet('settings')
settings.append(['form_title', 'form_id'])
settings.append(['Case Management Example', 'case_management_example'])

wb.save(f'{OUT_DIR}/case_management_example_form.xlsx')

# --- case table CSV ---
with open(f'{OUT_DIR}/case_management_example_cases.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['case_id', 'name', 'status', 'last_visit'])
    writer.writerow(['CASE001', 'Amina Diallo', 'open', '2026-08-01'])
    writer.writerow(['CASE002', 'Jean Kouassi', 'in_progress', '2026-08-10'])
    writer.writerow(['CASE003', 'Fatou Sow', 'closed', '2026-07-15'])
    # Any id not listed here (e.g. CASE900) exercises "create unknown cases
    # automatically": the form asks for the name, and submitting creates the
    # record.

print('done')
