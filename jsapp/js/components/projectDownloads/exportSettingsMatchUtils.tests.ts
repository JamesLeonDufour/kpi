import type { ExportDataResponse, ExportSetting } from '#/dataInterface'
import { ExportStatusName, ExportTypeName } from '#/components/projectDownloads/exportsConstants'
import { findMatchingExportSettingForExport, normalizeExportSettingsForMatching } from './exportSettingsMatchUtils'

const EXPORT_DATA_RESPONSE: ExportDataResponse = {
  url: '/api/v2/assets/asset123/exports/export123/',
  status: ExportStatusName.complete,
  messages: {},
  uid: 'export123',
  date_created: '2026-04-13T10:00:00Z',
  last_submission_time: null,
  result: '/exports/export123.xlsx',
  data: {
    lang: '_default',
    name: null,
    type: ExportTypeName.xls,
    fields: ['beta', 'alpha'],
    source: '/api/v2/assets/asset123/',
    group_sep: '/',
    multiple_select: 'both',
    include_media_url: true,
    xls_types_as_text: false,
    hierarchy_in_labels: false,
    processing_time_seconds: 1,
    fields_from_all_versions: true,
    query: {},
    submission_ids: [],
    tag_cols_for_header: ['hxl'],
  },
}

describe('exportSettingsMatchUtils', () => {
  describe('normalizeExportSettingsForMatching', () => {
    it('should normalize historical boolean and language values before matching', () => {
      const normalized = normalizeExportSettingsForMatching({
        lang: null,
        type: 'xls',
        fields: ['beta', 'alpha'],
        hierarchy_in_labels: 'false' as never,
        fields_from_all_versions: 'true' as never,
        include_media_url: 'true' as never,
        xls_types_as_text: 'false' as never,
        submission_ids: ['2', 1] as never,
      })

      chai.expect(normalized).to.deep.equal({
        fields: ['alpha', 'beta'],
        fields_from_all_versions: true,
        flatten: true,
        group_sep: '/',
        hierarchy_in_labels: false,
        include_media_url: true,
        lang: '_default',
        multiple_select: 'both',
        query: {},
        submission_ids: [1, 2],
        tag_cols_for_header: ['hxl'],
        type: 'xls',
        xls_types_as_text: false,
      })
    })
  })

  describe('findMatchingExportSettingForExport', () => {
    it('should match saved export settings when the API returns legacy string booleans', () => {
      const exportSettings: ExportSetting[] = [
        {
          uid: 'setting123',
          url: '/api/v2/assets/asset123/export-settings/setting123/',
          name: 'Saved XLS export',
          data_url_csv: '/api/v2/assets/asset123/export-settings/setting123/data.csv',
          data_url_xlsx: '/api/v2/assets/asset123/export-settings/setting123/data.xlsx',
          date_modified: '2026-04-13T09:00:00Z',
          export_settings: {
            lang: '_default',
            type: ExportTypeName.xls,
            fields: ['alpha', 'beta'],
            group_sep: '/',
            multiple_select: 'both',
            include_media_url: 'true' as never,
            xls_types_as_text: 'false' as never,
            hierarchy_in_labels: 'false' as never,
            fields_from_all_versions: 'true' as never,
            query: {},
            submission_ids: [],
            tag_cols_for_header: ['hxl'],
          },
        },
      ]

      const match = findMatchingExportSettingForExport(EXPORT_DATA_RESPONSE, exportSettings)

      chai.expect(match?.uid).to.equal('setting123')
    })

    // Shapes taken verbatim from a real server: the saved setting keeps the
    // user's own (empty) filter, while the export task's query has gained the
    // back end's `_userform_id` scoping key. Comparing that key would stop
    // every export matching its own setting, i.e. no sync links anywhere.
    it('should ignore the back-end injected `_userform_id` in the query', () => {
      const exportData = {
        ...EXPORT_DATA_RESPONSE,
        data: {
          ...EXPORT_DATA_RESPONSE.data,
          lang: '_default' as never,
          fields: [],
          query: { _userform_id: 'super_admin_azshShjpQRDDNF6TjMPn3J' } as never,
          submission_ids: undefined as never,
          tag_cols_for_header: undefined as never,
        },
      }

      const exportSettings: ExportSetting[] = [
        {
          uid: 'esspgMSLGQXDTAib7rzfu9b',
          url: '/api/v2/assets/asset123/export-settings/esspgMSLGQXDTAib7rzfu9b/',
          name: '',
          data_url_csv: '/api/v2/assets/asset123/export-settings/esspgMSLGQXDTAib7rzfu9b/data.csv',
          data_url_xlsx: '/api/v2/assets/asset123/export-settings/esspgMSLGQXDTAib7rzfu9b/data.xlsx',
          date_modified: '2026-09-22T09:00:00Z',
          export_settings: {
            lang: '_default',
            type: ExportTypeName.xls,
            query: {},
            fields: [],
            group_sep: '/',
            multiple_select: 'both',
            include_media_url: true,
            xls_types_as_text: false,
            hierarchy_in_labels: false,
            fields_from_all_versions: true,
          },
        },
      ]

      const match = findMatchingExportSettingForExport(exportData, exportSettings)

      chai.expect(match?.uid).to.equal('esspgMSLGQXDTAib7rzfu9b')
    })

    it('should still compare filters the user actually set', () => {
      const exportData = {
        ...EXPORT_DATA_RESPONSE,
        data: {
          ...EXPORT_DATA_RESPONSE.data,
          fields: [],
          query: { _userform_id: 'abc', _submitted_by: 'jane' } as never,
        },
      }

      const exportSettings: ExportSetting[] = [
        {
          uid: 'other-filter',
          url: '',
          name: '',
          data_url_csv: '',
          data_url_xlsx: '',
          date_modified: '',
          export_settings: {
            ...(EXPORT_DATA_RESPONSE.data as never as ExportSetting['export_settings']),
            fields: [],
            query: { _submitted_by: 'someone-else' },
          },
        },
      ]

      chai.expect(findMatchingExportSettingForExport(exportData, exportSettings)).to.equal(undefined)
    })
  })
})
