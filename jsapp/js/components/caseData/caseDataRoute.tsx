import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { handleApiFail } from '#/api'
import type { FailResponse } from '#/dataInterface'
import { ROUTES } from '#/router/routerConstants'
import { notify } from '#/utils'
import LoadingSpinner from '#/components/common/loadingSpinner'
import styles from './caseData.module.scss'
import { type CaseTable, createCaseTable, deleteCaseTable, getCaseTables } from './caseDataApi'

/**
 * Case Data landing page: lists the user's case tables and creates new ones.
 */
export default function CaseDataRoute() {
  const [tables, setTables] = useState<CaseTable[] | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [isCreating, setIsCreating] = useState(searchParams.get('new') === '1')
  const [newName, setNewName] = useState('')
  const [newKeyColumn, setNewKeyColumn] = useState('case_id')
  const [isBusy, setIsBusy] = useState(false)
  const navigate = useNavigate()

  const loadTables = useCallback(() => {
    getCaseTables()
      .then((response) => setTables(response.results))
      .catch((error) => handleApiFail(error as FailResponse))
  }, [])

  useEffect(() => {
    loadTables()
  }, [loadTables])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsCreating(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  function onCreate() {
    if (!newName.trim()) {
      notify.error(t('Please give the table a name'))
      return
    }
    setIsBusy(true)
    createCaseTable({ name: newName.trim(), key_column: newKeyColumn.trim() || 'case_id' })
      .then((table) => {
        navigate(ROUTES.CASE_TABLE.replace(':uid', table.uid))
      })
      .catch((error) => {
        handleApiFail(error as FailResponse)
        setIsBusy(false)
      })
  }

  function onDelete(table: CaseTable) {
    if (!window.confirm(t('Delete table "##name##" and all its records? This cannot be undone.').replace('##name##', table.name))) {
      return
    }
    deleteCaseTable(table.uid)
      .then(() => loadTables())
      .catch((error) => handleApiFail(error as FailResponse))
  }

  if (tables === null) {
    return <LoadingSpinner />
  }

  return (
    <div className={styles.caseDataRoot}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>{t('Case Data')}</h1>
        <div className={styles.headerActions}>
          <button type='button' className={styles.actionButton} onClick={() => setIsCreating(!isCreating)}>
            {t('New table')}
          </button>
        </div>
      </div>

      {isCreating && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('New case table')}</h2>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Table name')}</label>
            <input
              type='text'
              className={styles.textInput}
              value={newName}
              onChange={(evt) => setNewName(evt.target.value)}
              placeholder={t('e.g. Beneficiaries')}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t('Key column (case id)')}</label>
            <input
              type='text'
              className={styles.textInput}
              value={newKeyColumn}
              onChange={(evt) => setNewKeyColumn(evt.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <button type='button' className={styles.actionButton} disabled={isBusy} onClick={onCreate}>
              {t('Create')}
            </button>
            <button type='button' className={styles.secondaryButton} onClick={() => setIsCreating(false)}>
              {t('Cancel')}
            </button>
          </div>
          <p className={styles.hint}>
            {t('You can also create columns by uploading a CSV — its header row becomes the schema.')}
          </p>
        </section>
      )}

      {tables.length === 0 && !isCreating && (
        <div className={styles.emptyMessage}>
          {t('No case tables yet. Create one and upload a CSV to get started.')}
        </div>
      )}

      {tables.length > 0 && (
        <section className={styles.panel}>
          <table className={styles.tablesList}>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Key column')}</th>
                <th>{t('Columns')}</th>
                <th>{t('Records')}</th>
                <th>{t('Last modified')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table.uid}>
                  <td>
                    <Link className={styles.tableName} to={ROUTES.CASE_TABLE.replace(':uid', table.uid)}>
                      {table.name}
                    </Link>
                  </td>
                  <td>{table.key_column}</td>
                  <td>{table.columns.length}</td>
                  <td>{table.records_count}</td>
                  <td>{new Date(table.date_modified).toLocaleString()}</td>
                  <td>
                    <button type='button' className={styles.dangerButton} onClick={() => onDelete(table)}>
                      {t('Delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
