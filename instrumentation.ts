import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    const { getDb } = await import('./lib/db');
    const { startQueueProcessor } = await import('./lib/queue');
    const { ensureBinaries } = await import('./lib/binaries');
    const { logger } = await import('./lib/logger');
    getDb();
    startQueueProcessor();
    // Run in background — never block server startup
    ensureBinaries().catch((err) =>
      logger.error('ensureBinaries error:', err)
    );
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Automatically captures all unhandled server-side request errors
export const onRequestError = Sentry.captureRequestError;
