export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getDb } = await import('./lib/db');
    const { startQueueProcessor } = await import('./lib/queue');
    const { ensureBinaries } = await import('./lib/binaries');
    getDb();
    startQueueProcessor();
    // Run in background — never block server startup
    ensureBinaries().catch((err) =>
      console.error('[memevaultproject] ensureBinaries error:', err)
    );
  }
}
