import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Each Vitest worker gets its own isolated SQLite data directory.
// This must run before any test file imports lib/db.ts so that
// the module-level DB_PATH const is computed from this value.
process.env.MEMEVAULTPROJECT_DATA_DIR = mkdtempSync(join(tmpdir(), 'mvp-test-'));
