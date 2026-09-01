/**
 * API layer for the Case Data (case management) feature.
 */

import { fetchDelete, fetchGet, fetchPatch, fetchPost } from '#/api'
import { ROOT_URL } from '#/constants'

export interface CaseTableColumn {
  name: string
  label: string
}

export interface CaseTable {
  uid: string
  url: string
  name: string
  owner_username: string
  key_column: string
  columns: CaseTableColumn[]
  data_version: string
  share_with_org: boolean
  records_count: number
  date_created: string
  date_modified: string
}

export interface CaseRecord {
  id: number
  key: string
  data: { [column: string]: string }
  date_created: string
  date_modified: string
}

export interface CaseLink {
  uid: string
  asset: string
  asset_name: string
  case_table: string
  case_table_detail: CaseTable
  filename: string
  case_id_xpath: string
  field_mappings: { [submissionField: string]: string }
  write_back: boolean
  create_missing: boolean
  date_created: string
  date_modified: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface CsvUploadStats {
  created: number
  updated: number
  deleted: number
  skipped: number
  columns: string[]
}

const API_ROOT = '/api/v2'

export async function getCaseTables() {
  return fetchGet<PaginatedResponse<CaseTable>>(`${API_ROOT}/case-tables/?limit=500`)
}

export async function getCaseTable(uid: string) {
  return fetchGet<CaseTable>(`${API_ROOT}/case-tables/${uid}/`)
}

export async function createCaseTable(data: { name: string; key_column?: string }) {
  return fetchPost<CaseTable>(`${API_ROOT}/case-tables/`, data)
}

export async function updateCaseTable(
  uid: string,
  data: Partial<Pick<CaseTable, 'name' | 'key_column' | 'columns' | 'share_with_org'>>,
) {
  return fetchPatch<CaseTable>(`${API_ROOT}/case-tables/${uid}/`, data as any)
}

export async function deleteCaseTable(uid: string) {
  return fetchDelete(`${API_ROOT}/case-tables/${uid}/`)
}

export async function getCaseRecords(
  tableUid: string,
  options: { limit?: number; offset?: number; search?: string } = {},
) {
  const { limit = 50, offset = 0, search = '' } = options
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (search.trim()) {
    params.set('search', search.trim())
  }
  return fetchGet<PaginatedResponse<CaseRecord>>(`${API_ROOT}/case-tables/${tableUid}/records/?${params.toString()}`)
}

export async function createCaseRecord(tableUid: string, data: { key: string; data: { [k: string]: string } }) {
  return fetchPost<CaseRecord>(`${API_ROOT}/case-tables/${tableUid}/records/`, data)
}

export async function updateCaseRecord(tableUid: string, recordId: number, data: { data: { [k: string]: string } }) {
  return fetchPatch<CaseRecord>(`${API_ROOT}/case-tables/${tableUid}/records/${recordId}/`, data)
}

export async function deleteCaseRecord(tableUid: string, recordId: number) {
  return fetchDelete(`${API_ROOT}/case-tables/${tableUid}/records/${recordId}/`)
}

export async function getCaseTableLinks(tableUid: string) {
  return fetchGet<CaseLink[]>(`${API_ROOT}/case-tables/${tableUid}/links/`)
}

export async function getAssetCaseLinks(assetUid: string) {
  return fetchGet<PaginatedResponse<CaseLink> | CaseLink[]>(`${API_ROOT}/assets/${assetUid}/case-links/`)
}

export async function createAssetCaseLink(
  assetUid: string,
  data: {
    case_table: string
    filename: string
    case_id_xpath: string
    field_mappings: { [k: string]: string }
    write_back: boolean
    create_missing?: boolean
  },
) {
  return fetchPost<CaseLink>(`${API_ROOT}/assets/${assetUid}/case-links/`, data)
}

export async function updateAssetCaseLink(
  assetUid: string,
  linkUid: string,
  data: Partial<{
    filename: string
    case_id_xpath: string
    field_mappings: { [k: string]: string }
    write_back: boolean
    create_missing: boolean
  }>,
) {
  return fetchPatch<CaseLink>(`${API_ROOT}/assets/${assetUid}/case-links/${linkUid}/`, data as any)
}

export async function deleteAssetCaseLink(assetUid: string, linkUid: string) {
  return fetchDelete(`${API_ROOT}/assets/${assetUid}/case-links/${linkUid}/`)
}

export interface CaseEvent {
  id: number
  record_key: string
  source: 'manual' | 'upload' | 'submission' | 'api'
  action: string
  changes: { [column: string]: [string, string] } | { [stat: string]: number | string[] }
  username: string
  asset_uid: string
  asset_name: string
  submission_id: number | null
  date_created: string
}

export async function getCaseEvents(tableUid: string, recordKey?: string, limit = 100) {
  const recordParam = recordKey ? `&record_key=${encodeURIComponent(recordKey)}` : ''
  return fetchGet<PaginatedResponse<CaseEvent>>(`${API_ROOT}/case-tables/${tableUid}/events/?limit=${limit}${recordParam}`)
}

/** CSV upload needs multipart, which the json fetch helpers don't do. */
export async function uploadCaseTableCsv(tableUid: string, file: File, replace: boolean): Promise<CsvUploadStats> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('replace', String(replace))
  const csrfCookie = document.cookie.match(/csrftoken=(\w{32,64})/)
  const headers: { [key: string]: string } = {}
  if (csrfCookie) {
    headers['X-CSRFToken'] = csrfCookie[1]
  }
  const response = await fetch(`${ROOT_URL}${API_ROOT}/case-tables/${tableUid}/upload/`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.detail || `Upload failed (HTTP ${response.status})`)
  }
  return json as CsvUploadStats
}

/**
 * Normalizes the two possible list response shapes (paginated or plain
 * array) into an array.
 */
export function asResults<T>(response: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(response)) {
    return response
  }
  return response.results
}
