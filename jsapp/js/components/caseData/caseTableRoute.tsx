import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchGet, handleApiFail } from '#/api'
import LoadingSpinner from '#/components/common/loadingSpinner'
import type { FailResponse } from '#/dataInterface'
import { ROUTES } from '#/router/routerConstants'
import { notify } from '#/utils'
import styles from './caseData.module.scss'
import sessionStore from '#/stores/session'
import {
  type CaseEvent,
  type CaseLink,
  type CaseRecord,
  type CaseTable,
  createAssetCaseLink,
  createCaseRecord,
  deleteAssetCaseLink,
  deleteCaseRecord,
  getCaseEvents,
  getCaseRecords,
  getCaseTable,
  getCaseTableLinks,
  updateCaseRecord,
  updateCaseTable,
  uploadCaseTableCsv,
} from './caseDataApi'

interface SurveyAssetOption {
  uid: string
  name: string
}

interface EditedCell {
  recordId: number
  column: string
}

/**
 * Detail view of one case table: editable data grid, CSV upload and
 * project links management.
 */
export default function CaseTableRoute() {
  const params = useParams()
  const tableUid = params.uid as string

  const [table, setTable] = useState<CaseTable | null>(null)
  const [records, setRecords] = useState<CaseRecord[] | null>(null)
  const [links, setLinks] = useState<CaseLink[]>([])
  const [surveys, setSurveys] = useState<SurveyAssetOption[]>([])
  const [editedCell, setEditedCell] = useState<EditedCell | null>(null)
  const [editedValue, setEditedValue] = useState('')
  const [newRowKey, setNewRowKey] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isLinkFormOpen, setIsLinkFormOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceModeRef = useRef(false)

  // New link form state
  const [linkAsset, setLinkAsset] = useState('')
  const [linkFilename, setLinkFilename] = useState('cases.csv')
  const [linkCaseIdXPath, setLinkCaseIdXPath] = useState('case_id')
  const [linkMappings, setLinkMappings] = useState('')
  const [linkWriteBack, setLinkWriteBack] = useState(true)

  // History panel state: null = closed, '' = whole table, else one record key
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [events, setEvents] = useState<CaseEvent[] | null>(null)

  const loadEverything = useCallback(() => {
    getCaseTable(tableUid)
      .then(setTable)
      .catch((error) => handleApiFail(error as FailResponse))
    getCaseRecords(tableUid)
      .then((response) => setRecords(response.results))
      .catch((error) => handleApiFail(error as FailResponse))
    getCaseTableLinks(tableUid)
      .then(setLinks)
      .catch(() => setLinks([]))
  }, [tableUid])

  useEffect(() => {
    loadEverything()
    fetchGet<{ results: Array<{ uid: string; name: string }> }>(
      '/api/v2/assets/?q=asset_type:survey&limit=200&fields=["uid","name"]',
    )
      .then((response) => setSurveys(response.results.map((a) => ({ uid: a.uid, name: a.name }))))
      .catch(() => setSurveys([]))
  }, [loadEverything])

  function startCellEdit(record: CaseRecord, column: string) {
    setEditedCell({ recordId: record.id, column })
    setEditedValue(record.data[column] ?? '')
  }

  function commitCellEdit() {
    if (!editedCell || records === null) {
      return
    }
    const record = records.find((r) => r.id === editedCell.recordId)
    if (!record) {
      setEditedCell(null)
      return
    }
    const previous = record.data[editedCell.column] ?? ''
    if (previous === editedValue) {
      setEditedCell(null)
      return
    }
    const newData = { ...record.data, [editedCell.column]: editedValue }
    // optimistic update
    setRecords(records.map((r) => (r.id === record.id ? { ...r, data: newData } : r)))
    setEditedCell(null)
    updateCaseRecord(tableUid, record.id, { data: newData }).catch((error) => {
      handleApiFail(error as FailResponse)
      loadEverything()
    })
  }

  function onAddRow() {
    if (!newRowKey.trim()) {
      notify.error(t('Please provide a value for the key column'))
      return
    }
    setIsBusy(true)
    createCaseRecord(tableUid, { key: newRowKey.trim(), data: {} })
      .then(() => {
        setNewRowKey('')
        loadEverything()
      })
      .catch((error) => handleApiFail(error as FailResponse))
      .finally(() => setIsBusy(false))
  }

  function onDeleteRow(record: CaseRecord) {
    if (!window.confirm(t('Delete case "##key##"?').replace('##key##', record.key))) {
      return
    }
    deleteCaseRecord(tableUid, record.id)
      .then(() => loadEverything())
      .catch((error) => handleApiFail(error as FailResponse))
  }

  function onAddColumn() {
    if (!table) {
      return
    }
    const name = window.prompt(t('New column name (letters, numbers and underscores work best):'))
    if (!name || !name.trim()) {
      return
    }
    const cleaned = name.trim()
    if (table.columns.some((c) => c.name === cleaned) || cleaned === table.key_column) {
      notify.error(t('This column already exists'))
      return
    }
    updateCaseTable(tableUid, { columns: [...table.columns, { name: cleaned, label: cleaned }] })
      .then(() => loadEverything())
      .catch((error) => handleApiFail(error as FailResponse))
  }

  function onUploadClick(replace: boolean) {
    replaceModeRef.current = replace
    fileInputRef.current?.click()
  }

  function onFileSelected(evt: React.ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0]
    evt.target.value = ''
    if (!file) {
      return
    }
    setIsBusy(true)
    uploadCaseTableCsv(tableUid, file, replaceModeRef.current)
      .then((stats) => {
        notify(
          t('Import finished: ##created## created, ##updated## updated, ##deleted## deleted, ##skipped## skipped')
            .replace('##created##', String(stats.created))
            .replace('##updated##', String(stats.updated))
            .replace('##deleted##', String(stats.deleted))
            .replace('##skipped##', String(stats.skipped)),
        )
        loadEverything()
      })
      .catch((error) => notify.error(String(error)))
      .finally(() => setIsBusy(false))
  }

  function parseMappings(raw: string): { [k: string]: string } {
    const result: { [k: string]: string } = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }
      const question = trimmed.slice(0, separatorIndex).trim()
      const column = trimmed.slice(separatorIndex + 1).trim()
      if (question && column) {
        result[question] = column
      }
    }
    return result
  }

  function onCreateLink() {
    if (!linkAsset) {
      notify.error(t('Please choose a project'))
      return
    }
    setIsBusy(true)
    createAssetCaseLink(linkAsset, {
      case_table: tableUid,
      filename: linkFilename.trim() || 'cases.csv',
      case_id_xpath: linkCaseIdXPath.trim() || 'case_id',
      field_mappings: parseMappings(linkMappings),
      write_back: linkWriteBack,
    })
      .then(() => {
        setIsLinkFormOpen(false)
        notify(t('Project linked. Redeploy the project if it is already deployed, so the form picks up the new media file.'))
        loadEverything()
      })
      .catch((error) => handleApiFail(error as FailResponse))
      .finally(() => setIsBusy(false))
  }

  function openHistory(recordKey: string) {
    setHistoryKey(recordKey)
    setEvents(null)
    getCaseEvents(tableUid, recordKey || undefined)
      .then((response) => setEvents(response.results))
      .catch((error) => {
        handleApiFail(error as FailResponse)
        setHistoryKey(null)
      })
  }

  function describeEventChanges(event: CaseEvent): string {
    if (event.action === 'imported') {
      const stats = event.changes as { [stat: string]: any }
      return t('##created## created, ##updated## updated, ##deleted## deleted')
        .replace('##created##', String(stats.created ?? 0))
        .replace('##updated##', String(stats.updated ?? 0))
        .replace('##deleted##', String(stats.deleted ?? 0))
    }
    const parts: string[] = []
    for (const [column, values] of Object.entries(event.changes || {})) {
      if (Array.isArray(values) && values.length === 2) {
        parts.push(`${column}: "${values[0]}" → "${values[1]}"`)
      }
    }
    return parts.join(', ')
  }

  function describeEventSource(event: CaseEvent): string {
    if (event.source === 'submission') {
      const submissionPart = event.submission_id ? ` #${event.submission_id}` : ''
      return `${t('submission')}${submissionPart} (${event.asset_name || event.asset_uid})`
    }
    if (event.username) {
      return `${event.source} (${event.username})`
    }
    return event.source
  }

  function onToggleShareWithOrg() {
    if (!table) {
      return
    }
    updateCaseTable(tableUid, { share_with_org: !table.share_with_org })
      .then((updated) => setTable(updated))
      .catch((error) => handleApiFail(error as FailResponse))
  }

  function onDeleteLink(link: CaseLink) {
    if (!window.confirm(t('Unlink project "##name##"?').replace('##name##', link.asset_name || link.asset))) {
      return
    }
    deleteAssetCaseLink(link.asset, link.uid)
      .then(() => loadEverything())
      .catch((error) => handleApiFail(error as FailResponse))
  }

  if (table === null || records === null) {
    return <LoadingSpinner />
  }

  const columnNames = table.columns.map((c) => c.name)
  const currentUsername = 'username' in sessionStore.currentAccount ? sessionStore.currentAccount.username : ''
  const isOwner = !table.owner_username || table.owner_username === currentUsername

  return (
    <div className={styles.caseDataRoot}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>
          <Link className={styles.tableName} to={ROUTES.CASE_DATA}>
            {t('Case Data')}
          </Link>
          {' / '}
          {table.name}
          <span className={styles.badge}>
            {t('##count## records').replace('##count##', String(records.length))}
          </span>
        </h1>
        <div className={styles.headerActions}>
          <button type='button' className={styles.secondaryButton} onClick={() => openHistory('')}>
            {t('History')}
          </button>
          <button type='button' className={styles.secondaryButton} onClick={onAddColumn}>
            {t('Add column')}
          </button>
          <button type='button' className={styles.secondaryButton} disabled={isBusy} onClick={() => onUploadClick(false)}>
            {t('Upload CSV (upsert)')}
          </button>
          <button type='button' className={styles.secondaryButton} disabled={isBusy} onClick={() => onUploadClick(true)}>
            {t('Upload CSV (replace)')}
          </button>
          <input ref={fileInputRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }} onChange={onFileSelected} />
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.formRow}>
          <input
            type='text'
            className={styles.textInput}
            placeholder={t('New ##key##…').replace('##key##', table.key_column)}
            value={newRowKey}
            onChange={(evt) => setNewRowKey(evt.target.value)}
            onKeyDown={(evt) => {
              if (evt.key === 'Enter') {
                onAddRow()
              }
            }}
          />
          <button type='button' className={styles.actionButton} disabled={isBusy} onClick={onAddRow}>
            {t('Add case')}
          </button>
        </div>

        <div className={styles.grid}>
          <table className={styles.gridTable}>
            <thead>
              <tr>
                <th className={styles.keyColumn}>{table.key_column}</th>
                {table.columns.map((column) => (
                  <th key={column.name}>{column.label || column.name}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td className={styles.keyColumn}>{record.key}</td>
                  {columnNames.map((column) => (
                    <td key={column}>
                      {editedCell?.recordId === record.id && editedCell?.column === column ? (
                        <input
                          type='text'
                          className={styles.cellInput}
                          value={editedValue}
                          autoFocus
                          onChange={(evt) => setEditedValue(evt.target.value)}
                          onBlur={commitCellEdit}
                          onKeyDown={(evt) => {
                            if (evt.key === 'Enter') {
                              commitCellEdit()
                            }
                            if (evt.key === 'Escape') {
                              setEditedCell(null)
                            }
                          }}
                        />
                      ) : (
                        <span
                          className={styles.cellDisplay}
                          onClick={() => startCellEdit(record, column)}
                          title={t('Click to edit')}
                        >
                          {record.data[column] ?? ''}
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      type='button'
                      className={styles.secondaryButton}
                      title={t('Case history')}
                      onClick={() => openHistory(record.key)}
                    >
                      ⏱
                    </button>{' '}
                    <button type='button' className={styles.dangerButton} onClick={() => onDeleteRow(record)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <div className={styles.emptyMessage}>{t('No records yet — add a case above or upload a CSV.')}</div>
          )}
        </div>
      </section>

      {historyKey !== null && (
        <section className={styles.panel}>
          <div className={styles.header}>
            <h2 className={styles.panelTitle}>
              {historyKey === ''
                ? t('History — whole table')
                : t('History — case "##key##"').replace('##key##', historyKey)}
            </h2>
            <button type='button' className={styles.secondaryButton} onClick={() => setHistoryKey(null)}>
              {t('Close')}
            </button>
          </div>
          {events === null && <LoadingSpinner />}
          {events !== null && events.length === 0 && <p className={styles.hint}>{t('No history yet.')}</p>}
          {events !== null && events.length > 0 && (
            <ul className={styles.linksList}>
              {events.map((event) => (
                <li key={event.id}>
                  <span>
                    <span className={styles.badge}>{event.action}</span>
                    {historyKey === '' && event.record_key && <strong> {event.record_key} </strong>}{' '}
                    {describeEventChanges(event)}
                    {' — '}
                    <em>{describeEventSource(event)}</em>
                  </span>
                  <span>{new Date(event.date_created).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isOwner && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('Sharing')}</h2>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Share with my organization')}</label>
            <input type='checkbox' checked={table.share_with_org} onChange={onToggleShareWithOrg} />
            <span className={styles.hint}>
              {t('Members of your organization can view and edit this table and link it to their projects.')}
            </span>
          </div>
        </section>
      )}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('Linked projects')}</h2>

        {links.length === 0 && <p className={styles.hint}>{t('No projects are using this table yet.')}</p>}

        {links.length > 0 && (
          <ul className={styles.linksList}>
            {links.map((link) => (
              <li key={link.uid}>
                <span>
                  <strong>{link.asset_name || link.asset}</strong>
                  <span className={styles.badge}>{link.filename}</span>
                  {link.write_back && <span className={styles.badge}>{t('write-back')}</span>}
                  {' — '}
                  {t('case id from')} <code>{link.case_id_xpath}</code>
                </span>
                <button type='button' className={styles.dangerButton} onClick={() => onDeleteLink(link)}>
                  {t('Unlink')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isLinkFormOpen && (
          <div className={styles.formRow}>
            <button type='button' className={styles.actionButton} onClick={() => setIsLinkFormOpen(true)}>
              {t('Link a project')}
            </button>
          </div>
        )}

        {isLinkFormOpen && (
          <div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('Project')}</label>
              <select className={styles.textInput} value={linkAsset} onChange={(evt) => setLinkAsset(evt.target.value)}>
                <option value=''>{t('Choose…')}</option>
                {surveys.map((survey) => (
                  <option key={survey.uid} value={survey.uid}>
                    {survey.name || t('Untitled')} ({survey.uid})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('Attached file name')}</label>
              <input
                type='text'
                className={styles.textInput}
                value={linkFilename}
                onChange={(evt) => setLinkFilename(evt.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('Case id question name')}</label>
              <input
                type='text'
                className={styles.textInput}
                value={linkCaseIdXPath}
                onChange={(evt) => setLinkCaseIdXPath(evt.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('Write-back mappings')}</label>
              <textarea
                className={styles.textInput}
                rows={4}
                placeholder={'question_name=case_column\nstatus=status\nvisit_date=last_visit'}
                value={linkMappings}
                onChange={(evt) => setLinkMappings(evt.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('Write submissions back to cases')}</label>
              <input type='checkbox' checked={linkWriteBack} onChange={(evt) => setLinkWriteBack(evt.target.checked)} />
            </div>
            <div className={styles.formRow}>
              <button type='button' className={styles.actionButton} disabled={isBusy} onClick={onCreateLink}>
                {t('Create link')}
              </button>
              <button type='button' className={styles.secondaryButton} onClick={() => setIsLinkFormOpen(false)}>
                {t('Cancel')}
              </button>
            </div>
            <p className={styles.hint}>
              {t(
                'In the form, reference the file like a media file: pulldata(\'cases\', \'status\', \'case_id\', ${case_id}) for cases.csv — or use a select_one_from_file question. The data served is always the current table content.',
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
