'use client';

import {
  AlertCircle,
  FileCheck2,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  ApiClientError,
  ApiContractError,
  ApiTimeoutError,
} from '@/lib/api-client/errors';
import {
  commitInvoiceImportJob,
  listInvoiceImportRows,
  previewInvoiceCsv,
} from '@/lib/imports/client';
import type {
  InvoiceImportCommit,
  InvoiceImportJob,
  InvoiceImportRowsResponse,
} from '@/lib/imports/contracts';

import { InvoiceImportCommitPanel } from './invoice-import-commit';
import { InvoiceImportResults } from './invoice-import-results';
import styles from './invoice-import-preview.module.css';
import type { ImportResultFilter, ImportUiError } from './types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ROWS_PER_PAGE = 25;

export function InvoiceImportPreview({
  organizationName,
}: {
  organizationName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<InvoiceImportJob | null>(null);
  const [rows, setRows] = useState<InvoiceImportRowsResponse | null>(null);
  const [resultFilter, setResultFilter] = useState<ImportResultFilter>('ALL');
  const [uploading, setUploading] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [reviewingCommit, setReviewingCommit] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<InvoiceImportCommit | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<ImportUiError | null>(null);
  const [rowsError, setRowsError] = useState<ImportUiError | null>(null);
  const [commitError, setCommitError] = useState<ImportUiError | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const rowsAbort = useRef<AbortController | null>(null);
  const commitAbort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      uploadAbort.current?.abort();
      rowsAbort.current?.abort();
      commitAbort.current?.abort();
    },
    [],
  );

  function selectFile(nextFile: File | undefined): void {
    uploadAbort.current?.abort();
    rowsAbort.current?.abort();
    commitAbort.current?.abort();
    setDragging(false);
    setJob(null);
    setRows(null);
    setResultFilter('ALL');
    setRowsError(null);
    setReviewingCommit(false);
    setCommitResult(null);
    setCommitError(null);

    const validationError = nextFile ? validateFile(nextFile) : null;
    setFile(validationError ? null : (nextFile ?? null));
    setUploadError(validationError ? { message: validationError } : null);
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;

    uploadAbort.current?.abort();
    rowsAbort.current?.abort();
    commitAbort.current?.abort();
    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploading(true);
    setUploadError(null);
    setRowsError(null);
    setJob(null);
    setRows(null);
    setResultFilter('ALL');
    setReviewingCommit(false);
    setCommitResult(null);
    setCommitError(null);

    try {
      const nextJob = await previewInvoiceCsv(file, controller.signal);
      if (controller.signal.aborted) return;
      setJob(nextJob);
      if (nextJob.status === 'READY') await loadRows(nextJob.id, 'ALL', 1);
    } catch (error) {
      if (!isAbortError(error)) setUploadError(toUiError(error));
    } finally {
      if (uploadAbort.current === controller) {
        uploadAbort.current = null;
        setUploading(false);
      }
    }
  }

  async function loadRows(
    importJobId: string,
    filter: ImportResultFilter,
    page: number,
  ): Promise<void> {
    rowsAbort.current?.abort();
    const controller = new AbortController();
    rowsAbort.current = controller;
    setRowsLoading(true);
    setRowsError(null);

    try {
      const response = await listInvoiceImportRows(importJobId, {
        ...(filter === 'ALL' ? {} : { result: filter }),
        page,
        limit: ROWS_PER_PAGE,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setRows(response);
    } catch (error) {
      if (!isAbortError(error)) setRowsError(toUiError(error));
    } finally {
      if (rowsAbort.current === controller) {
        rowsAbort.current = null;
        setRowsLoading(false);
      }
    }
  }

  function changeFilter(filter: ImportResultFilter): void {
    if (!isInspectableJob(job) || filter === resultFilter) return;
    setResultFilter(filter);
    setRows(null);
    void loadRows(job.id, filter, 1);
  }

  function changePage(page: number): void {
    if (!isInspectableJob(job)) return;
    setRows(null);
    void loadRows(job.id, resultFilter, page);
  }

  function retryRows(): void {
    if (!isInspectableJob(job)) return;
    void loadRows(job.id, resultFilter, rows?.pagination.page ?? 1);
  }

  async function commitPreview(): Promise<void> {
    if (!job || job.status !== 'READY' || committing) return;

    commitAbort.current?.abort();
    const controller = new AbortController();
    commitAbort.current = controller;
    setCommitting(true);
    setCommitError(null);

    try {
      const result = await commitInvoiceImportJob(job.id, controller.signal);
      if (controller.signal.aborted) return;
      setCommitResult(result);
      setJob(result.job);
      setReviewingCommit(false);
      setResultFilter('COMMITTED');
      setRows(null);
      await loadRows(result.job.id, 'COMMITTED', 1);
    } catch (error) {
      if (!isAbortError(error)) setCommitError(toCommitUiError(error));
    } finally {
      if (commitAbort.current === controller) {
        commitAbort.current = null;
        setCommitting(false);
      }
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.uploadGrid} aria-labelledby="upload-title">
        <form
          className={job ? styles.compactUpload : styles.uploadSurface}
          onSubmit={submitPreview}
          onDragEnter={(event) => handleDrag(event, setDragging, true)}
          onDragOver={(event) => handleDrag(event, setDragging, true)}
          onDragLeave={(event) => handleDrag(event, setDragging, false)}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files.length !== 1) {
              selectFile(undefined);
              setUploadError({
                message: 'Drop exactly one CSV file at a time.',
              });
              return;
            }
            selectFile(event.dataTransfer.files.item(0) ?? undefined);
          }}
          data-dragging={dragging || undefined}
          aria-busy={uploading}
        >
          <input
            className={styles.fileInput}
            id="invoice-csv-file"
            type="file"
            accept=".csv,text/csv,application/csv,application/vnd.ms-excel"
            aria-label="Invoice CSV file"
            aria-describedby="invoice-csv-help invoice-csv-error"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              selectFile(event.currentTarget.files?.item(0) ?? undefined);
              event.currentTarget.value = '';
            }}
            disabled={uploading}
          />

          {job ? (
            <CompactFileSelection
              file={file}
              uploading={uploading}
              onClear={() => selectFile(undefined)}
            />
          ) : (
            <EmptyFileSelection file={file} uploading={uploading} />
          )}

          {file && (
            <button
              className={`primary-button ${styles.previewButton}`}
              type="submit"
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle
                  className={styles.spinner}
                  size={15}
                  aria-hidden="true"
                />
              ) : (
                <FileCheck2 size={15} aria-hidden="true" />
              )}
              {uploading ? 'Checking CSV…' : 'Generate preview'}
            </button>
          )}
        </form>

        {!job && <PreviewGuide />}
      </section>

      <p className="visually-hidden" id="invoice-csv-help">
        Choose one canonical CSV file no larger than 5 megabytes.
      </p>
      <UploadError error={uploadError} />
      <p
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {job?.status === 'READY'
          ? `Preview ready. ${job.counts.valid} valid, ${job.counts.invalid} invalid, and ${job.counts.duplicate} duplicate rows. No receivable records changed.`
          : job?.status === 'FAILED'
            ? `Preview stopped. ${job.failure?.message ?? 'The CSV could not be parsed safely.'}`
            : job?.status === 'COMMITTED'
              ? `Import committed. ${job.counts.valid} invoices posted once and ${job.counts.invalid + job.counts.duplicate} rows skipped.`
              : ''}
      </p>

      {job && (
        <InvoiceImportResults
          job={job}
          rows={rows}
          resultFilter={resultFilter}
          rowsLoading={rowsLoading}
          rowsError={rowsError}
          onFilterChange={changeFilter}
          onPageChange={changePage}
          onRetryRows={retryRows}
          commitPanel={
            <InvoiceImportCommitPanel
              job={job}
              organizationName={organizationName}
              reviewing={reviewingCommit}
              committing={committing}
              result={commitResult}
              error={commitError}
              onReview={() => {
                setCommitError(null);
                setReviewingCommit(true);
              }}
              onCancelReview={() => {
                setCommitError(null);
                setReviewingCommit(false);
              }}
              onCommit={() => void commitPreview()}
            />
          }
        />
      )}
    </div>
  );
}

function EmptyFileSelection({
  file,
  uploading,
}: {
  file: File | null;
  uploading: boolean;
}) {
  return (
    <div className={styles.emptySelection}>
      <span className={styles.uploadIcon} aria-hidden="true">
        <UploadCloud size={24} />
      </span>
      <div>
        <h2 id="upload-title">
          {file ? 'CSV ready for preview' : 'Drop an invoice CSV here'}
        </h2>
        <p>
          {file
            ? `${file.name} · ${formatFileSize(file.size)}`
            : 'One canonical .csv file · maximum 5 MB'}
        </p>
      </div>
      <label
        className={`control-button ${styles.filePicker}`}
        htmlFor="invoice-csv-file"
        aria-disabled={uploading}
      >
        <FileSpreadsheet size={15} aria-hidden="true" />
        {file ? 'Choose another CSV' : 'Choose CSV file'}
      </label>
    </div>
  );
}

function CompactFileSelection({
  file,
  uploading,
  onClear,
}: {
  file: File | null;
  uploading: boolean;
  onClear: () => void;
}) {
  return (
    <div className={styles.compactFile}>
      <FileSpreadsheet size={18} aria-hidden="true" />
      <div>
        <h2 id="upload-title">{file?.name ?? 'Choose a corrected CSV'}</h2>
        <p>
          {file
            ? `${formatFileSize(file.size)} · ready to check`
            : 'Preview another file without changing ledger data.'}
        </p>
      </div>
      <label
        className={`control-button ${styles.filePicker}`}
        htmlFor="invoice-csv-file"
        aria-disabled={uploading}
      >
        <RefreshCw size={14} aria-hidden="true" /> Choose CSV
      </label>
      {file && (
        <button
          className={styles.clearFile}
          type="button"
          onClick={onClear}
          aria-label={`Clear selected file ${file.name}`}
          disabled={uploading}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function PreviewGuide() {
  const steps = [
    [
      'Use the canonical template',
      'UTF-8 CSV, comma-delimited, up to 10,000 rows.',
    ],
    [
      'Check row outcomes',
      'Review valid, invalid, duplicate, and warning evidence.',
    ],
    [
      'Correct and preview again',
      'Post valid rows only after reviewing the controlled commit summary.',
    ],
  ] as const;

  return (
    <aside className={styles.guide} aria-labelledby="upload-guide-title">
      <div>
        <ShieldCheck size={20} aria-hidden="true" />
        <h2 id="upload-guide-title">Preview is read-only</h2>
        <p>
          This step records validation evidence only. It does not create
          debtors, invoices, payments, or allocations.
        </p>
      </div>
      <ol className={styles.checkList}>
        {steps.map(([title, description], index) => (
          <li key={title}>
            <span>{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function UploadError({ error }: { error: ImportUiError | null }) {
  return (
    <div
      className={error ? styles.uploadError : 'visually-hidden'}
      id="invoice-csv-error"
      role={error ? 'alert' : undefined}
    >
      {error && (
        <>
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>We could not create the preview.</strong>
            <p>{error.message}</p>
            {error.requestId && <small>Request ID: {error.requestId}</small>}
          </div>
        </>
      )}
    </div>
  );
}

function handleDrag(
  event: DragEvent<HTMLFormElement>,
  setDragging: (value: boolean) => void,
  value: boolean,
): void {
  event.preventDefault();
  if (event.dataTransfer.types.includes('Files')) setDragging(value);
}

function validateFile(file: File): string | null {
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
    return 'Choose a file with a .csv extension. XLSX files are not supported in this import stage.';
  }
  if (file.name.length > 255) {
    return 'The CSV filename must be 255 characters or fewer. Rename the file and try again.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'The CSV is larger than 5 MB. Split it into smaller files and preview each file separately.';
  }
  return null;
}

function toUiError(error: unknown): ImportUiError {
  if (error instanceof ApiClientError) {
    const requestId = error.body?.error.requestId;
    if (error.status === 401) {
      return {
        message:
          'Your session has expired. Sign in again before previewing this CSV.',
        requestId,
      };
    }
    if (error.status === 413) {
      return {
        message:
          'The CSV is larger than 5 MB. Split it into smaller files and try again.',
        requestId,
      };
    }
    if (error.status === 415) {
      return {
        message:
          'The selected upload is not a supported CSV. Use the canonical .csv template and try again.',
        requestId,
      };
    }
    return { message: error.message, requestId };
  }
  if (error instanceof ApiTimeoutError) {
    return {
      message:
        'The preview took longer than 30 seconds. Check your connection, then try the same file again.',
    };
  }
  if (error instanceof ApiContractError) {
    return {
      message:
        'The server returned an unexpected preview format. No ledger records were changed; retry after the service is checked.',
    };
  }
  return {
    message:
      'We could not reach the import service. Check that the API is running, then try again.',
  };
}

function toCommitUiError(error: unknown): ImportUiError {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      requestId: error.body?.error.requestId,
    };
  }
  if (error instanceof ApiTimeoutError) {
    return {
      message:
        'The posting result was not confirmed within 60 seconds. Retry this same import safely; the server will return the original result if it already committed.',
    };
  }
  if (error instanceof ApiContractError) {
    return {
      message:
        'The server returned an unexpected reconciliation result. Refresh the import status before taking another action.',
    };
  }
  return {
    message:
      'We could not reach the posting service. Retry this same import safely when the API is available.',
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isInspectableJob(
  job: InvoiceImportJob | null,
): job is InvoiceImportJob {
  return job?.status === 'READY' || job?.status === 'COMMITTED';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}
