import isEqual from 'lodash.isequal'
import type { ExportDataResponse, ExportSetting, ExportSettingSettings } from '#/dataInterface'
import { DEFAULT_EXPORT_SETTINGS, ExportTypeName } from '#/components/projectDownloads/exportsConstants'

interface ExportSettingsMatchInput {
  fields?: unknown
  fields_from_all_versions?: unknown
  flatten?: unknown
  group_sep?: unknown
  hierarchy_in_labels?: unknown
  include_media_url?: unknown
  lang?: unknown
  multiple_select?: ExportSettingSettings['multiple_select']
  query?: unknown
  submission_ids?: unknown
  tag_cols_for_header?: unknown
  type?: unknown
  xls_types_as_text?: unknown
}

interface NormalizedExportSettingsForMatching {
  fields: string[]
  fields_from_all_versions: boolean
  flatten: boolean
  group_sep: string
  hierarchy_in_labels: boolean
  include_media_url: boolean
  lang: ExportDataResponse['data']['lang'] | '_default' | '_xml'
  multiple_select: NonNullable<ExportSettingSettings['multiple_select']>
  query: ExportSettingSettings['query']
  submission_ids: number[]
  tag_cols_for_header: string[]
  type: ExportTypeName | 'xlsx'
  xls_types_as_text: boolean
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase()

    if (normalizedValue === 'true') {
      return true
    }

    if (normalizedValue === 'false') {
      return false
    }
  }

  return fallback
}

function normalizeExportType(value: unknown): NormalizedExportSettingsForMatching['type'] {
  if (value === 'xlsx') {
    return 'xlsx'
  }

  return value as ExportTypeName
}

function normalizeExportLanguage(value: unknown): NormalizedExportSettingsForMatching['lang'] {
  if (value === false || value === 'xml') {
    return '_xml'
  }

  if (value === null || typeof value === 'undefined') {
    return '_default'
  }

  return value as NormalizedExportSettingsForMatching['lang']
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...value]
    .filter((item): item is string => typeof item === 'string')
    .sort((left, right) => left.localeCompare(right))
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...value]
    .map((item) => {
      if (typeof item === 'number') {
        return item
      }

      if (typeof item === 'string' && item.trim() !== '' && !Number.isNaN(Number(item))) {
        return Number(item)
      }

      return item
    })
    .filter((item): item is number => typeof item === 'number')
    .sort((left, right) => left - right)
}

export function normalizeExportSettingsForMatching(
  data: ExportSettingsMatchInput,
): NormalizedExportSettingsForMatching {
  return {
    fields: normalizeStringArray(data.fields),
    fields_from_all_versions: normalizeBoolean(
      data.fields_from_all_versions,
      DEFAULT_EXPORT_SETTINGS.INCLUDE_ALL_VERSIONS,
    ),
    flatten: normalizeBoolean(data.flatten, DEFAULT_EXPORT_SETTINGS.FLATTEN_GEO_JSON),
    group_sep: typeof data.group_sep === 'string' ? data.group_sep : DEFAULT_EXPORT_SETTINGS.GROUP_SEPARATOR,
    hierarchy_in_labels: normalizeBoolean(data.hierarchy_in_labels, DEFAULT_EXPORT_SETTINGS.INCLUDE_GROUPS),
    include_media_url: normalizeBoolean(data.include_media_url, DEFAULT_EXPORT_SETTINGS.INCLUDE_MEDIA_URL),
    lang: normalizeExportLanguage(data.lang),
    multiple_select: data.multiple_select ?? DEFAULT_EXPORT_SETTINGS.EXPORT_MULTIPLE.value,
    query: typeof data.query === 'object' && data.query !== null ? data.query : {},
    submission_ids: normalizeNumberArray(data.submission_ids),
    tag_cols_for_header: normalizeStringArray(data.tag_cols_for_header ?? ['hxl']),
    type: normalizeExportType(data.type),
    xls_types_as_text: normalizeBoolean(data.xls_types_as_text, DEFAULT_EXPORT_SETTINGS.XLS_TYPES_AS_TEXT),
  }
}

export function findMatchingExportSettingForExport(
  exportData: ExportDataResponse,
  exportSettings: ExportSetting[],
) {
  const normalizedExportData = normalizeExportSettingsForMatching(exportData.data)

  return exportSettings.find((exportSetting) => {
    const normalizedExportSetting = normalizeExportSettingsForMatching(exportSetting.export_settings)

    return isEqual(normalizedExportSetting, normalizedExportData)
  })
}
