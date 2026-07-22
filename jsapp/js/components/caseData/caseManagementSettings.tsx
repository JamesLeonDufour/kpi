import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { handleApiFail } from '#/api'
import { getSurveyFlatPaths } from '#/assetUtils'
import LoadingSpinner from '#/components/common/loadingSpinner'
import type { FailResponse } from '#/dataInterface'
import { notify } from '#/utils'
import styles from './caseData.module.scss'
import {
  type CaseLink,
  type CaseTable,
  asResults,
  createAssetCaseLink,
  deleteAssetCaseLink,
  getAssetCaseLinks,
  getCaseTables,
  updateAssetCaseLink,
} from './caseDataApi'

interface MappingRow {
  question: string
  column: string
}

interface CaseManagementSettingsProps {
  /** The loaded asset (dmix state object) — includes uid and content.survey */
  asset: {
    uid: string
    name?: string
    content?: { survey?: Array<{ [key: string]: any }> }
  }
}

/**
 * "Case Management" project settings screen: link this project to a case
 * table, choose the case id question from the form, and configure which
 * answers are written back onto the case record.
 */
export default function CaseManagementSettings(props: CaseManagementSettingsProps) {
  const assetUid = props.asset.uid

  const [links, setLinks] = useState<CaseLink[] | null>(null)
  const [tables, setTables] = useState<CaseTable[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editedLinkUid, setEditedLinkUid] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  // Form state
  const [formTable, setFormTable] = useState('')
  const [formFilename, setFormFilename] = useState('cases.csv')
  const [formCaseIdXPath, setFormCaseIdXPath] = useState('')
  const [formMappings, setFormMappings] = useState<MappingRow[]>([])
  const [formWriteBack, setFormWriteBack] = useState(true)
  const [formCreateMissing, setFormCreateMissing] = useState(true)

  /** All question paths of the form, for the dropdowns. */
  const questionPaths = useMemo(() => {
    const survey = props.asset.content?.survey
    if (!survey) {
      return []
    }
    const flatPaths = getSurveyFlatPaths(survey as any)
    return Object.values(flatPaths)
  }, [props.asset.content?.survey])

  const loadEverything = useCallback(() => {
    getAssetCaseLinks(assetUid)
      .then((response) => setLinks(asResults(response)))
      .catch((error) => {
        handleApiFail(error as FailResponse)
        setLinks([])
      })
    getCaseTables()
      .then((response) => setTables(response.results))
      .catch(() => setTables([]))
  }, [assetUid])

  useEffect(() => {
    loadEverything()
  }, [loadEverything])

  const selectedTable = tables.find((table) => table.uid === formTable)

  function openCreateForm() {
    setEditedLinkUid(null)
    setFormTable('')
    setFormFilename('cases.csv')
    setFormCaseIdXPath(questionPaths.find((path) => path.split('/').pop() === 'case_id') || '')
    setFormMappings([])
    setFormWriteBack(true)
    setFormCreateMissing(true)
    setIsFormOpen(true)
  }

  function openEditForm(link: CaseLink) {
    setEditedLinkUid(link.uid)
    setFormTable(link.case_table)
    setFormFilename(link.filename)
    setFormCaseIdXPath(link.case_id_xpath)
    setFormMappings(Object.entries(link.field_mappings || {}).map(([question, column]) => ({ question, column })))
    setFormWriteBack(link.write_back)
    setFormCreateMissing(link.create_missing)
    setIsFormOpen(true)
  }

  function setMapping(index: number, patch: Partial<MappingRow>) {
    setFormMappings(formMappings.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function buildMappingsObject(): { [k: string]: string } {
    const result: { [k: string]: string } = {}
    for (const row of formMappings) {
      if (row.question && row.column) {
        result[row.question] = row.column
      }
    }
    return result
  }

  function onSave() {
    if (!formTable) {
      notify.error(t('Please choose a case table'))
      return
    }
    if (!formCaseIdXPath) {
      notify.error(t('Please choose the question that holds the case id'))
      return
    }
    setIsBusy(true)
    const payload = {
      filename: formFilename.trim() || 'cases.csv',
      case_id_xpath: formCaseIdXPath,
      field_mappings: buildMappingsObject(),
      write_back: formWriteBack,
      create_missing: formCreateMissing,
    }
    const request = editedLinkUid
      ? updateAssetCaseLink(assetUid, editedLinkUid, payload)
      : createAssetCaseLink(assetUid, { case_table: formTable, ...payload })
    request
      .then(() => {
        setIsFormOpen(false)
        notify(t('Saved. If the project is deployed, form clients will pick up the change on their next form load.'))
        loadEverything()
      })
      .catch((error) => handleApiFail(error as FailResponse))
      .finally(() => setIsBusy(false))
  }

  function onDelete(link: CaseLink) {
    if (!window.confirm(t('Remove the link to "##name##"?').replace('##name##', link.case_table_detail?.name || link.case_table))) {
      return
    }
    deleteAssetCaseLink(assetUid, link.uid)
      .then(() => loadEverything())
      .catch((error) => handleApiFail(error as FailResponse))
  }

  if (links === null) {
    return <LoadingSpinner />
  }

  return (
    <div className={styles.caseDataRoot}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>{t('Case Management')}</h1>
        {!isFormOpen && (
          <div className={styles.headerActions}>
            <button type='button' className={styles.actionButton} onClick={openCreateForm}>
              {t('Link a case table')}
            </button>
          </div>
        )}
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('Linked case tables')}</h2>
        {links.length === 0 && (
          <p className={styles.hint}>
            {t(
              'Nothing linked yet. Link a case table to make its data available in this form (always current, via pulldata or select_one_from_file) and to update cases from incoming submissions.',
            )}
          </p>
        )}
        {links.length > 0 && (
          <ul className={styles.linksList}>
            {links.map((link) => (
              <li key={link.uid}>
                <span>
                  <strong>{link.case_table_detail?.name || link.case_table}</strong>
                  <span className={styles.badge}>{link.filename}</span>
                  {link.write_back && <span className={styles.badge}>{t('write-back')}</span>}
                  {' — '}
                  {t('case id from')} <code>{link.case_id_xpath}</code>
                  {Object.keys(link.field_mappings || {}).length > 0 && (
                    <>
                      {', '}
                      {t('##count## mapped fields').replace(
                        '##count##',
                        String(Object.keys(link.field_mappings).length),
                      )}
                    </>
                  )}
                </span>
                <span>
                  <button type='button' className={styles.secondaryButton} onClick={() => openEditForm(link)}>
                    {t('Edit')}
                  </button>{' '}
                  <button type='button' className={styles.dangerButton} onClick={() => onDelete(link)}>
                    {t('Remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isFormOpen && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{editedLinkUid ? t('Edit link') : t('New link')}</h2>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Case table')}</label>
            <select
              className={styles.textInput}
              value={formTable}
              disabled={editedLinkUid !== null}
              onChange={(evt) => setFormTable(evt.target.value)}
            >
              <option value=''>{t('Choose…')}</option>
              {tables.map((table) => (
                <option key={table.uid} value={table.uid}>
                  {table.name} ({table.records_count} {t('records')})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Attached file name')}</label>
            <input
              type='text'
              className={styles.textInput}
              value={formFilename}
              onChange={(evt) => setFormFilename(evt.target.value)}
            />
            <span className={styles.hint}>
              {t("pulldata('##name##', …)").replace('##name##', formFilename.replace(/\.csv$/i, ''))}
            </span>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Case id question')}</label>
            <select
              className={styles.textInput}
              value={formCaseIdXPath}
              onChange={(evt) => setFormCaseIdXPath(evt.target.value)}
            >
              <option value=''>{t('Choose…')}</option>
              {questionPaths.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Write-back mappings')}</label>
            <div>
              {formMappings.map((row, index) => (
                <div className={styles.formRow} key={index}>
                  <select
                    className={styles.textInput}
                    value={row.question}
                    onChange={(evt) => setMapping(index, { question: evt.target.value })}
                  >
                    <option value=''>{t('Question…')}</option>
                    {questionPaths.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                  {'→'}
                  <select
                    className={styles.textInput}
                    value={row.column}
                    onChange={(evt) => setMapping(index, { column: evt.target.value })}
                  >
                    <option value=''>{t('Case column…')}</option>
                    {(selectedTable?.columns || []).map((column) => (
                      <option key={column.name} value={column.name}>
                        {column.label || column.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type='button'
                    className={styles.dangerButton}
                    onClick={() => setFormMappings(formMappings.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type='button'
                className={styles.secondaryButton}
                onClick={() => setFormMappings([...formMappings, { question: '', column: '' }])}
              >
                {t('Add mapping')}
              </button>
            </div>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Write submissions back to cases')}</label>
            <input type='checkbox' checked={formWriteBack} onChange={(evt) => setFormWriteBack(evt.target.checked)} />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Create unknown cases automatically')}</label>
            <input
              type='checkbox'
              checked={formCreateMissing}
              onChange={(evt) => setFormCreateMissing(evt.target.checked)}
            />
          </div>

          <div className={styles.formRow}>
            <button type='button' className={styles.actionButton} disabled={isBusy} onClick={onSave}>
              {t('Save')}
            </button>
            <button type='button' className={styles.secondaryButton} onClick={() => setIsFormOpen(false)}>
              {t('Cancel')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
