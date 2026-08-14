/**
 * Evidence inventory reconciles database metadata with the private storage bucket.
 * It emits no signed URLs, tokens, filenames, or image bytes to standard output.
 * Organization-scoped object keys are checked individually through the service API.
 * Missing objects fail the command because a database-only restore is incomplete.
 * The JSON summary is safe release evidence when stored in a restricted CI log.
 */

import { loadEnvironment } from '../apps/api/src/config/env.js';
import { createDatabaseClient } from '../apps/api/src/lib/database.js';

const environment = loadEnvironment();
const database = createDatabaseClient(environment);

try {
  const rows = await database.mediaAsset.findMany({
    where: { objectKey: { not: null } },
    select: { organizationId: true, objectKey: true, processingState: true },
    orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
  });
  let missing: number | null = null;
  if (environment.EVIDENCE_STORAGE_MODE === 'supabase') {
    missing = 0;
    for (const row of rows) {
      if (!row.objectKey) continue;
      const response = await fetch(
        `${environment.SUPABASE_URL}/storage/v1/object/info/${encodePath(environment.WHATSAPP_EVIDENCE_BUCKET)}/${encodePath(row.objectKey)}`,
        { headers: authorization(environment.SUPABASE_SERVICE_ROLE_KEY!) },
      );
      if (!response.ok) missing += 1;
    }
  }
  const summary = {
    storageMode: environment.EVIDENCE_STORAGE_MODE,
    objectPresenceChecked: missing !== null,
    referencedObjects: rows.length,
    readyReferences: rows.filter((row) => row.processingState === 'READY')
      .length,
    missingObjects: missing,
  };
  console.info(JSON.stringify(summary));
  if (missing !== null && missing > 0) process.exitCode = 1;
} finally {
  await database.$disconnect();
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function authorization(secret: string): Record<string, string> {
  return { apikey: secret, Authorization: `Bearer ${secret}` };
}
