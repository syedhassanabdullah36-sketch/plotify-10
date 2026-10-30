/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { getAppPool, sanitizeDatabaseErrorMessage } from '../db/pool';
import {
  validateArchivePayload,
  ingestProjectArchive,
  ProjectArchivePayload,
} from '../services/archiveIngestionService';

export const archivesRouter = Router();

/**
 * POST /api/archives/ingest
 * Ingests an architectural project archive in a single atomic transaction.
 */
archivesRouter.post('/ingest', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const payload = req.body as ProjectArchivePayload;

  // 1. Strict In-Memory Schema & Boundary Validation
  const validation = validateArchivePayload(payload, tenantId);
  if (!validation.valid) {
    res.status(400).json({
      error: 'Archive validation rejected.',
      details: validation.errors,
      code: 'ERR_ARCHIVE_VALIDATION',
    });
    return;
  }

  const pool = getAppPool();

  try {
    // 2. Transactional Database Ingestion
    const result = await ingestProjectArchive(pool, tenantId, payload);
    res.status(201).json({ result });
  } catch (err: any) {
    console.error('[Archives API] Ingestion failed:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Archive ingestion failed and all changes were rolled back.',
      code: 'ERR_ARCHIVE_INGESTION_FAILED',
    });
  }
});
