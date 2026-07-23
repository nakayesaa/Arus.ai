'use client';

import { Printer } from 'lucide-react';
import { useEffect } from 'react';

import styles from './report.module.css';

export function PrintReportButton() {
  useEffect(() => {
    document.body.classList.add('report-print-active');
    return () => document.body.classList.remove('report-print-active');
  }, []);

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
