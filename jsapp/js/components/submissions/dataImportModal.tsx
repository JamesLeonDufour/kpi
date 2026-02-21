import React, { useRef, useState } from 'react'

import Button from '#/components/common/button'
import KoboModal from '#/components/modals/koboModal'
import KoboModalContent from '#/components/modals/koboModalContent'
import KoboModalFooter from '#/components/modals/koboModalFooter'
import KoboModalHeader from '#/components/modals/koboModalHeader'
import dataInterface from '#/dataInterface'

type ImportStatus = 'idle' | 'uploading' | 'success' | 'error'

interface DataImportModalProps {
  assetUid: string
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

/**
 * Modal that lets users upload an XLS/XLSX file and import its rows as
 * submissions into the current project.
 */
export default function DataImportModal(props: DataImportModalProps) {
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [resultMessage, setResultMessage] = useState('')
  const [errorMessages, setErrorMessages] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(evt: React.ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0] ?? null
    setSelectedFile(file)
    setImportStatus('idle')
    setResultMessage('')
    setErrorMessages([])
  }

  function handleUpload() {
    if (!selectedFile) {
      return
    }
    setImportStatus('uploading')
    setUploadProgress(0)

    dataInterface
      .importSubmissionsData(props.assetUid, selectedFile, (pct) => {
        setUploadProgress(pct)
      })
      .then((result) => {
        setImportStatus('success')
        const msg = t('Import completed: ##IMPORTED## imported, ##FAILED## failed.')
          .replace('##IMPORTED##', String(result.imported))
          .replace('##FAILED##', String(result.failed))
        setResultMessage(msg)
        setErrorMessages(result.errors)
        props.onImportComplete()
      })
      .catch((err: { detail?: string } | null) => {
        setImportStatus('error')
        setResultMessage(err?.detail ?? t('An error occurred during import.'))
      })
  }

  function handleClose() {
    setImportStatus('idle')
    setSelectedFile(null)
    setUploadProgress(0)
    setResultMessage('')
    setErrorMessages([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    props.onClose()
  }

  const isUploading = importStatus === 'uploading'

  return (
    <KoboModal isOpen={props.isOpen} onRequestClose={handleClose} isDismissableByDefaultMeans>
      <KoboModalHeader onRequestCloseByX={handleClose}>
        {t('Import data from Excel')}
      </KoboModalHeader>

      <KoboModalContent>
        {/* Warning banner */}
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fff3cd',
            borderRadius: '4px',
            border: '1px solid #ffc107',
          }}
        >
          <strong>{t('Warning:')}</strong>{' '}
          {t(
            'No validation is performed against the form structure. Data inconsistencies may occur.',
          )}
        </div>

        {/* File picker */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            ref={fileInputRef}
            type='file'
            accept='.xls,.xlsx'
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={isUploading}
          />
          <Button
            type='secondary'
            size='m'
            startIcon='upload'
            label={t('Choose file')}
            onClick={() => fileInputRef.current?.click()}
            isDisabled={isUploading}
          />
          {selectedFile && <span>{selectedFile.name}</span>}
        </div>

        {/* Upload progress */}
        {isUploading && (
          <div style={{ marginBottom: '16px' }}>
            <progress value={uploadProgress} max={100} style={{ width: '100%' }} />
            <span style={{ marginLeft: '8px' }}>{uploadProgress}%</span>
          </div>
        )}

        {/* Success message */}
        {importStatus === 'success' && (
          <div style={{ color: 'green', marginBottom: '8px' }}>{resultMessage}</div>
        )}

        {/* Error message */}
        {importStatus === 'error' && (
          <div style={{ color: 'red', marginBottom: '8px' }}>{resultMessage}</div>
        )}

        {/* Per-row error list (shown on both success with partial failures and error) */}
        {errorMessages.length > 0 && (
          <ul style={{ color: 'red', margin: '8px 0 0 0', paddingLeft: '20px' }}>
            {errorMessages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}
      </KoboModalContent>

      <KoboModalFooter>
        <Button type='secondary' size='m' label={t('Cancel')} onClick={handleClose} />
        <Button
          type='primary'
          size='m'
          label={t('Upload')}
          onClick={handleUpload}
          isDisabled={!selectedFile || isUploading}
        />
      </KoboModalFooter>
    </KoboModal>
  )
}
