import { createHash } from 'node:crypto';

import createBusboy from 'busboy';
import type { Request } from 'express';

export const MAX_INVOICE_CSV_BYTES = 5 * 1024 * 1024;

const acceptedMimeTypes = new Set([
  'application/csv',
  'application/vnd.ms-excel',
  'text/csv',
]);

export interface InvoiceCsvUpload {
  filename: string;
  fileHash: string;
  mimeType: string;
  buffer: Buffer;
}

export class InvoiceCsvUploadError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    readonly code:
      | 'CSV_FILE_TOO_LARGE'
      | 'INVALID_CSV_FILENAME'
      | 'INVALID_MULTIPART_BODY'
      | 'MISSING_CSV_FILE'
      | 'UNEXPECTED_MULTIPART_FIELD'
      | 'UNSUPPORTED_CSV_MEDIA_TYPE',
    message: string,
  ) {
    super(message);
    this.name = 'InvoiceCsvUploadError';
  }
}

export function readInvoiceCsvUpload(
  request: Request,
): Promise<InvoiceCsvUpload> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof createBusboy>;
    try {
      parser = createBusboy({
        headers: request.headers,
        limits: {
          fieldNameSize: 100,
          fields: 0,
          fileSize: MAX_INVOICE_CSV_BYTES,
          files: 1,
          headerPairs: 100,
        },
      });
    } catch {
      reject(
        new InvoiceCsvUploadError(
          415,
          'UNSUPPORTED_CSV_MEDIA_TYPE',
          'Content-Type must be multipart/form-data with a boundary',
        ),
      );
      return;
    }

    let fileSeen = false;
    let filename = '';
    let mimeType = '';
    let fileHash = '';
    let buffer: Buffer | null = null;
    let failure: InvoiceCsvUploadError | null = null;
    let settled = false;

    const fail = (error: InvoiceCsvUploadError): void => {
      failure ??= error;
    };
    const rejectUnexpected = (message: string): void => {
      fail(
        new InvoiceCsvUploadError(400, 'UNEXPECTED_MULTIPART_FIELD', message),
      );
    };

    parser.on('file', (fieldName, stream, info) => {
      fileSeen = true;
      filename = safeFilename(info.filename);
      mimeType = info.mimeType.toLowerCase();

      if (fieldName !== 'file') {
        rejectUnexpected('CSV upload must use the multipart field named file');
      }
      if (
        !filename ||
        filename.length > 255 ||
        !filename.toLowerCase().endsWith('.csv')
      ) {
        fail(
          new InvoiceCsvUploadError(
            415,
            'INVALID_CSV_FILENAME',
            'Uploaded file must have a valid .csv filename',
          ),
        );
      }
      if (!acceptedMimeTypes.has(mimeType)) {
        fail(
          new InvoiceCsvUploadError(
            415,
            'UNSUPPORTED_CSV_MEDIA_TYPE',
            'Uploaded file must use a CSV content type',
          ),
        );
      }

      const chunks: Buffer[] = [];
      const hash = createHash('sha256');
      stream.on('limit', () => {
        fail(
          new InvoiceCsvUploadError(
            413,
            'CSV_FILE_TOO_LARGE',
            `CSV file must not exceed ${MAX_INVOICE_CSV_BYTES} bytes`,
          ),
        );
      });
      stream.on('data', (chunk: Buffer) => {
        if (failure) return;
        chunks.push(chunk);
        hash.update(chunk);
      });
      stream.on('error', () => {
        fail(
          new InvoiceCsvUploadError(
            400,
            'INVALID_MULTIPART_BODY',
            'CSV upload stream could not be read',
          ),
        );
      });
      stream.on('close', () => {
        if (stream.truncated || failure) return;
        buffer = Buffer.concat(chunks);
        fileHash = hash.digest('hex');
      });
    });
    parser.on('field', () => {
      rejectUnexpected('CSV upload does not accept multipart text fields');
    });
    parser.on('filesLimit', () => {
      rejectUnexpected('CSV upload accepts exactly one file');
    });
    parser.on('fieldsLimit', () => {
      rejectUnexpected('CSV upload does not accept multipart text fields');
    });
    parser.on('error', () => {
      fail(
        new InvoiceCsvUploadError(
          400,
          'INVALID_MULTIPART_BODY',
          'Multipart upload is malformed',
        ),
      );
    });
    request.on('aborted', () => {
      if (settled) return;
      settled = true;
      reject(
        new InvoiceCsvUploadError(
          400,
          'INVALID_MULTIPART_BODY',
          'CSV upload was interrupted',
        ),
      );
    });
    parser.on('close', () => {
      if (settled) return;
      settled = true;
      if (failure) {
        reject(failure);
        return;
      }
      if (!fileSeen || !buffer || !fileHash) {
        reject(
          new InvoiceCsvUploadError(
            400,
            'MISSING_CSV_FILE',
            'CSV upload must include exactly one file',
          ),
        );
        return;
      }
      resolve({ filename, fileHash, mimeType, buffer });
    });

    request.pipe(parser);
  });
}

function safeFilename(value: string): string {
  const baseName = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
  return Array.from(baseName)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join('')
    .trim();
}
