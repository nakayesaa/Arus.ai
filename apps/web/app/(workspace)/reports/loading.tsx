import styles from './report.module.css';

export default function ReportsLoading() {
  return (
    <div className={`${styles.page} report-print-page`} aria-busy="true">
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <div className={styles.pageTitleRow}>
            <h1>Weekly report</h1>
            <p className={styles.pageContext}>Loading report</p>
          </div>
          <p className={styles.pageDescription}>
            Reconciling exposure, collections, and workflow exceptions.
          </p>
        </div>
      </header>
      <div className={styles.content}>
        <div className={styles.controlsSkeleton} />
        <div className={styles.sheetSkeleton}>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
