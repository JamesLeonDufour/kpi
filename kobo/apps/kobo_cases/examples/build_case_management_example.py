"""
Generates the Case Management demo:

  case_management_example_form.xlsx  — XLSForm to deploy in KoboToolbox
  case_management_example_cases.csv  — case table CSV to upload as a Case Table

The form exercises both directions of the feature, and both ways of reading
the linked case table:

  select_one_from_file  — the case picker is fed straight from `cases.csv`,
                          so enumerators choose from the cases that exist
                          *right now* (label = the case's name).
  pulldata()            — once a case is chosen, its name / status / last
                          visit are pulled in and shown, so the current
                          state is visible before anything is changed.
  write-back            — answers are written onto the case record. An id
                          that isn't in the table yet is created, with the
                          name entered on the form.

Why `name` is a calculate with a `relevant`
-------------------------------------------
Write-back maps *questions* to columns, and a question that is relevant but
left blank submits an empty string, which would overwrite the stored name
with nothing. A question that is **not relevant** is absent from the
submission entirely and is skipped by the write-back. So `name` is computed
from whichever branch applies and is only relevant when there is genuinely a
name to write:

  * new case                    → the name just entered
  * existing case, correction   → the corrected name
  * existing case, no change    → not relevant, stored name left alone

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
survey.append([
    'type', 'name', 'label', 'calculation', 'relevant', 'required',
    'parameters', 'appearance',
])

survey.append([
    'select_one mode_list', 'mode', 'Is this an existing case?', '', '', 'yes',
    '', 'minimal',
])

# Existing case: the picker reads cases.csv itself, so it always offers the
# cases that are in the table at the moment the form is loaded.
survey.append([
    'select_one_from_file cases.csv', 'case_pick', 'Select the case', '',
    "${mode} = 'existing'", 'yes', 'value=case_id,label=name', 'minimal',
])

# New case: free-text id.
survey.append([
    'text', 'case_id_new', 'New case ID', '', "${mode} = 'new'", 'yes', '', '',
])

# The single id the write-back keys on, whichever branch was used.
survey.append([
    'calculate', 'case_id', '',
    "if(${mode} = 'existing', ${case_pick}, ${case_id_new})", '', '', '', '',
])

# Everything currently on file for that case.
survey.append([
    'calculate', 'known_name', '',
    "pulldata('cases', 'name', 'case_id', ${case_id})", '', '', '', '',
])
survey.append([
    'calculate', 'known_status', '',
    "pulldata('cases', 'status', 'case_id', ${case_id})", '', '', '', '',
])
survey.append([
    'calculate', 'known_last_visit', '',
    "pulldata('cases', 'last_visit', 'case_id', ${case_id})", '', '', '', '',
])

survey.append([
    'note', 'existing_case',
    '**Case on file — ${case_id}**\n'
    '- Name: ${known_name}\n'
    '- Status: ${known_status}\n'
    '- Last visit: ${known_last_visit}',
    '', "${mode} = 'existing'", '', '', '',
])
survey.append([
    'note', 'new_case',
    '**${case_id_new}** is not in the case table yet — it will be created '
    'when you submit.',
    '', "${mode} = 'new'", '', '', '',
])

# Name: required for a new case, optional correction for an existing one.
survey.append([
    'text', 'name_new', 'Name', '', "${mode} = 'new'", 'yes', '', '',
])
survey.append([
    'text', 'name_fix', 'Correct the name (optional)', '',
    "${mode} = 'existing'", '', '', '',
])
survey.append([
    'calculate', 'name', '',
    "if(${mode} = 'new', ${name_new}, ${name_fix})",
    "${mode} = 'new' or string-length(${name_fix}) > 0", '', '', '',
])

# Written back for both new and existing cases.
survey.append([
    'select_one status_list', 'status', 'Status', '', '', 'yes', '', '',
])
survey.append(['date', 'visit_date', 'Visit date', '', '', 'yes', '', ''])
survey.append([
    'text', 'notes', 'Notes (not written back)', '', '', '', '', '',
])

# --- choices sheet ---
choices = wb.create_sheet('choices')
choices.append(['list_name', 'name', 'label'])
choices.append(['mode_list', 'existing', 'Existing case'])
choices.append(['mode_list', 'new', 'New case'])
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
    # Any id not listed here exercises "create unknown cases automatically":
    # pick "New case", give it an id and a name, and submitting creates the
    # record with the name filled in.

print('done')
