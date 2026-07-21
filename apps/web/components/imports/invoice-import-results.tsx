import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { formatBusinessDate, formatRupiah } from '@/lib/formatters';
import type {
  InvoiceImportJob,
  InvoiceImportRow,
  InvoiceImportRowResult,
  InvoiceImportRowsResponse,
} from '@/lib/imports/contracts';

import styles from './invoice-import-preview.module.css';
import type { ImportResultFilter, ImportUiError } from './types';

interface InvoiceImportResultsProps {
  job: InvoiceImportJob;
  rows: InvoiceImportRowsResponse | null;
  resultFilter: ImportResultFilter;
  rowsLoading: boolean;
  rowsError: ImportUiError | null;
  onFilterChange: (filter: ImportResultFilter) => void;
  onPageChange: (page: number) => void;
  onRetryRows: () => void;
}

export function InvoiceImportResults(props: InvoiceImportResultsProps) {
  if (props.job.status === 'FAILED') {
    return <FailedPreview job={props.job} />;
  }

  return (
    <section className={styles.results} aria-labelledby="preview-title">
      <header className={styles.resultsHeader}>
        <div className={styles.resultsIdentity}>
          <span className={styles.readyIcon} aria-hidden="true">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <h2 id="preview-title">Preview ready</h2>
            <p>
              {props.job.filename} · SHA-256{' '}
              <span title={props.job.fileHash}>
                {props.job.fileHash.slice(0, 12)}…
              </span>
            </p>
          </div>
        </div>
        <p className={styles.zeroWriteNotice}>
          <ShieldCheck size={15} aria-hidden="true" />
          Zero receivable records changed
        </p>
      </header>

      <PreviewSummary job={props.job} />
      <FileWarnings warnings={props.job.fileWarnings} />

      <div className={styles.rowToolbar}>
        <div>
          <h3>Row evidence</h3>
          <p>Inspect normalized values and the exact reason for every issue.</p>
        </div>
        <ResultFilters
          job={props.job}
          value={props.resultFilter}
          disabled={props.rowsLoading}
          onChange={props.onFilterChange}
        />
      </div>

      <RowsTable
        response={props.rows}
        loading={props.rowsLoading}
        error={props.rowsError}
        filter={props.resultFilter}
        onRetry={props.onRetryRows}
      />

      {props.rows && !props.rowsError && (
        <RowsPagination
          response={props.rows}
          disabled={props.rowsLoading}
          onPageChange={props.onPageChange}
        />
      )}
    </section>
  );
}

function FailedPreview({ job }: { job: InvoiceImportJob }) {
  return (
    <section className={styles.failedPreview} aria-labelledby="preview-title">
      <span aria-hidden="true">
        <AlertCircle size={20} />
      </span>
      <div>
        <h2 id="preview-title">Preview stopped before row validation</h2>
        <p>
          {job.failure?.message ?? 'The CSV could not be parsed safely.'} Fix
          the file-level issue, then choose the corrected CSV above.
        </p>
        {job.failure && <small>Error code: {job.failure.code}</small>}
      </div>
    </section>
  );
}

function PreviewSummary({ job }: { job: InvoiceImportJob }) {
  const metrics = [
    { label: 'All rows', value: job.counts.total, tone: 'neutral' },
    { label: 'Valid', value: job.counts.valid, tone: 'valid' },
    { label: 'Invalid', value: job.counts.invalid, tone: 'invalid' },
    { label: 'Duplicate', value: job.counts.duplicate, tone: 'duplicate' },
    { label: 'With warnings', value: job.counts.warning, tone: 'warning' },
  ] as const;

  return (
    <dl className={styles.summary} aria-label="Preview summary">
      {metrics.map((metric) => (
        <div className={styles[metric.tone]} key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value.toLocaleString('id-ID')}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileWarnings({
  warnings,
}: {
  warnings: InvoiceImportJob['fileWarnings'];
}) {
  if (warnings.length === 0) return null;

  return (
    <div className={styles.fileWarnings} role="status">
      <AlertTriangle size={17} aria-hidden="true" />
      <div>
        <strong>
          {warnings.length === 1
            ? '1 file-level warning'
            : `${warnings.length} file-level warnings`}
        </strong>
        {warnings.map((warning, index) => (
          <p key={`${warning.code}-${warning.field ?? 'file'}-${index}`}>
            {warning.message} <code>{warning.code}</code>
          </p>
        ))}
      </div>
    </div>
  );
}

function ResultFilters({
  job,
  value,
  disabled,
  onChange,
}: {
  job: InvoiceImportJob;
  value: ImportResultFilter;
  disabled: boolean;
  onChange: (value: ImportResultFilter) => void;
}) {
  const filters = [
    { value: 'ALL', label: 'All', count: job.counts.total },
    { value: 'VALID', label: 'Valid', count: job.counts.valid },
    { value: 'INVALID', label: 'Invalid', count: job.counts.invalid },
    { value: 'DUPLICATE', label: 'Duplicate', count: job.counts.duplicate },
  ] as const;

  return (
    <div className={styles.filters} aria-label="Filter preview rows">
      {filters.map((filter) => (
        <button
          type="button"
          key={filter.value}
          aria-pressed={filter.value === value}
          aria-label={`Show ${filter.label.toLocaleLowerCase('en-US')} rows, ${filter.count}`}
          disabled={disabled}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
          <span>{filter.count.toLocaleString('id-ID')}</span>
        </button>
      ))}
    </div>
  );
}

function RowsTable({
  response,
  loading,
  error,
  filter,
  onRetry,
}: {
  response: InvoiceImportRowsResponse | null;
  loading: boolean;
  error: ImportUiError | null;
  filter: ImportResultFilter;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className={styles.rowsState} role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong>We could not load the preview rows.</strong>
          <p>{error.message}</p>
          {error.requestId && <small>Request ID: {error.requestId}</small>}
        </div>
        <button className="control-button" type="button" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Retry rows
        </button>
      </div>
    );
  }

  if (!response || (loading && response.data.length === 0)) {
    return (
      <div
        className={styles.tableWrap}
        role="status"
        aria-label="Loading preview rows"
      >
        <PreviewRowsTable>
          {Array.from({ length: 5 }, (_, row) => (
            <tr className={styles.skeletonRow} key={row}>
              {Array.from({ length: 8 }, (_, column) => (
                <td key={column}>
                  <span />
                </td>
              ))}
            </tr>
          ))}
        </PreviewRowsTable>
      </div>
    );
  }

  if (response.data.length === 0) {
    return (
      <div className={styles.rowsState} role="status">
        <FileCheck2 size={18} aria-hidden="true" />
        <div>
          <strong>No {filter.toLocaleLowerCase('en-US')} rows</strong>
          <p>
            Choose another result filter to continue reviewing this preview.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap} aria-busy={loading}>
      <PreviewRowsTable>
        {response.data.map((row) => (
          <PreviewRow key={row.id} row={row} />
        ))}
      </PreviewRowsTable>
      {loading && (
        <span className={styles.refreshing} role="status">
          <LoaderCircle
            className={styles.spinner}
            size={14}
            aria-hidden="true"
          />
          Refreshing rows…
        </span>
      )}
    </div>
  );
}

function PreviewRowsTable({ children }: { children: ReactNode }) {
  return (
    <table className={styles.rowsTable}>
      <caption className="visually-hidden">
        Invoice import preview rows and validation evidence
      </caption>
      <colgroup>
        <col className={styles.rowColumn} />
        <col className={styles.resultColumn} />
        <col className={styles.invoiceColumn} />
        <col className={styles.debtorColumn} />
        <col className={styles.dateColumn} />
        <col className={styles.dateColumn} />
        <col className={styles.moneyColumn} />
        <col className={styles.diagnosticColumn} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Row</th>
          <th scope="col">Result</th>
          <th scope="col">Invoice</th>
          <th scope="col">Debtor</th>
          <th scope="col">Invoice date</th>
          <th scope="col">Due date</th>
          <th scope="col" className={styles.moneyCell}>
            Original
          </th>
          <th scope="col">Evidence</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function PreviewRow({ row }: { row: InvoiceImportRow }) {
  const diagnostics = [...row.errors, ...row.warnings];

  return (
    <tr>
      <td className={styles.rowNumber}>{row.rowNumber}</td>
      <td>
        <ResultLabel result={row.result} />
      </td>
      <td>
        <strong className={styles.primaryCell}>
          {row.payload.invoiceNumber ?? 'Missing invoice number'}
        </strong>
      </td>
      <td>
        <span className={styles.entityCell}>
          <strong>{row.payload.customerName ?? 'Missing debtor name'}</strong>
          <small>
            {debtorActionLabel(row)}
            {row.payload.customerCode ? ` · ${row.payload.customerCode}` : ''}
          </small>
        </span>
      </td>
      <td>{formatNullableDate(row.payload.invoiceDate)}</td>
      <td>{formatNullableDate(row.payload.dueDate)}</td>
      <td className={styles.moneyCell}>
        {formatNullableMoney(row.payload.originalAmount)}
      </td>
      <td>
        {diagnostics.length > 0 ? (
          <ul className={styles.diagnostics}>
            {diagnostics.map((diagnostic, index) => (
              <li
                data-tone={
                  row.errors.includes(diagnostic) ? 'error' : 'warning'
                }
                key={`${diagnostic.code}-${diagnostic.field ?? 'row'}-${index}`}
              >
                <span>{diagnostic.message}</span>
                <code>{diagnostic.code}</code>
              </li>
            ))}
          </ul>
        ) : (
          <span className={styles.clearEvidence}>
            <CheckCircle2 size={13} aria-hidden="true" /> Ready for commit
            review
          </span>
        )}
      </td>
    </tr>
  );
}

function ResultLabel({ result }: { result: InvoiceImportRowResult }) {
  const config = {
    VALID: { icon: CheckCircle2, label: 'Valid' },
    INVALID: { icon: AlertCircle, label: 'Invalid' },
    DUPLICATE: { icon: Copy, label: 'Duplicate' },
    COMMITTED: { icon: CheckCircle2, label: 'Committed' },
  }[result];
  const Icon = config.icon;

  return (
    <span className={styles.resultLabel} data-result={result}>
      <Icon size={13} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function RowsPagination({
  response,
  disabled,
  onPageChange,
}: {
  response: InvoiceImportRowsResponse;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  const { page, total, totalPages } = response.pagination;

  return (
    <nav className={styles.pagination} aria-label="Preview row pagination">
      <span>
        {totalPages > 0 ? `Page ${page} of ${totalPages} · ` : ''}
        {total.toLocaleString('id-ID')} {total === 1 ? 'row' : 'rows'}
      </span>
      {totalPages > 1 && (
        <div>
          <button
            type="button"
            aria-label="Previous preview page"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next preview page"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}

function formatNullableMoney(value: string | null): string {
  return value ? formatRupiah(value) : '—';
}

function formatNullableDate(value: string | null): string {
  return value ? formatBusinessDate(value) : '—';
}

function debtorActionLabel(row: InvoiceImportRow): string {
  if (row.debtor.action === 'MATCH_EXISTING') return 'Matches existing debtor';
  if (row.debtor.action === 'WILL_CREATE') return 'Will create debtor';
  return 'Debtor match unresolved';
}
