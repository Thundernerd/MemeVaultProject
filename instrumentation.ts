export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
}
