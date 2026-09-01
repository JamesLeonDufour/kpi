import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '#/components/common/ButtonNew'
import Icon from '#/components/common/icon'
import Tooltip from '#/components/common/tooltip'
import { ROUTES } from '#/router/routerConstants'
import styles from './caseData.module.scss'

/**
 * Contextual sidebar shown while browsing the Case Data section.
 */
export default function CaseDataSidebar() {
  const navigate = useNavigate()

  return (
    <>
      <div>
        <Button size='lg' fullWidth onClick={() => navigate(`${ROUTES.CASE_DATA}?new=1`)}>
          {t('new table').toUpperCase()}
        </Button>
      </div>

      <div className={styles.sidebarInfo}>
        <Tooltip
          text={t(
            'Case tables are live datasets for case management. Link a table to a project to use its data inside forms — with pulldata() or select_one_from_file — and to write submitted answers back to the case record.',
          )}
          ariaLabel={t('About case tables')}
        >
          <span className={styles.sidebarInfoTrigger}>
            <Icon name='information' size='s' color='blue' />
            {t('About case tables')}
          </span>
        </Tooltip>
      </div>
    </>
  )
}
