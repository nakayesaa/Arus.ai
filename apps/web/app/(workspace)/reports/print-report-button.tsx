'use client';

import { Printer } from 'lucide-react';

import styles from './report.module.css';

export function PrintReportButton() {
  return (
    <button
      className={styles.printButton}
      type="button"
      onClick={() => window.print()}
    >
      <Printer size={14} aria-hidden="true" />
      <span>Print / Save PDF</span>
    </button>
  );
}
