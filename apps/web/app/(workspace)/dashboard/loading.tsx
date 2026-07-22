import { PageHeader } from '@/components/page-header';

import styles from './page.module.css';

export default function DashboardLoading() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Collections Inbox"
        eyebrow="Reconciling ledger"
        description="Calculating exact receivable balances and aging exposure."
      />
      <div className={styles.layout}>
        <main className={styles.main}>
          <div
            className={styles.summary}
            aria-label="Loading dashboard summary"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                className={styles.summaryPlaceholder}
                aria-hidden="true"
                key={index}
              >
                <span className={styles.skeleton} />
                <strong
                  className={`${styles.skeleton} ${styles.skeletonValue}`}
                />
                <small className={styles.skeleton} />
              </div>
            ))}
          </div>
          <div className={styles.workflowPulse} aria-hidden="true">
            <span className={`${styles.skeleton} ${styles.skeletonValue}`} />
            <div className={styles.workflowSignals}>
              {Array.from({ length: 2 }, (_, index) => (
                <div className={styles.skeletonRow} key={index} />
              ))}
            </div>
          </div>
          <section className={styles.exposure} aria-label="Loading exposures">
            <div className={styles.sectionHeader}>
              <span className={`${styles.skeleton} ${styles.skeletonValue}`} />
            </div>
            {Array.from({ length: 5 }, (_, index) => (
              <div className={styles.skeletonRow} key={index} />
            ))}
          </section>
        </main>
        <aside
          className={styles.context}
          aria-label="Loading aging distribution"
        >
          <span className={`${styles.skeleton} ${styles.skeletonValue}`} />
          <div className={styles.agingList}>
            {Array.from({ length: 6 }, (_, index) => (
              <div className={styles.agingRow} key={index}>
                <span className={styles.skeleton} />
                <span className={styles.skeleton} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
