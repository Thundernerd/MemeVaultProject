import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSetting, setSetting, getAllSettings, getEnvOverriddenKeys, ENV_OVERRIDES } from '@/lib/db';

// settings table is NOT cleared between tests (it's seeded at DB init and we
// don't want to lose the defaults). Tests that write settings restore them.

describe('getSetting / setSetting round-trip', () => {
  it('returns undefined for an unknown key', () => {
    expect(getSetting('__nonexistent_key__')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    setSetting('_test_key', 'hello');
    expect(getSetting('_test_key')).toBe('hello');
  });

  it('overwrites an existing value', () => {
    setSetting('_test_key', 'first');
    setSetting('_test_key', 'second');
    expect(getSetting('_test_key')).toBe('second');
  });
});

describe('default settings are seeded', () => {
  it('has a random_mode setting', () => {
    expect(getSetting('random_mode')).toBeDefined();
  });

  it('has a download_path setting', () => {
    expect(getSetting('download_path')).toBeDefined();
  });
});

describe('environment variable overrides', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(ENV_OVERRIDES)) {
      const envVar = ENV_OVERRIDES[key];
      delete process.env[envVar];
    }
    Object.assign(process.env, originalEnv);
  });

  it('env var takes precedence over DB value', () => {
    setSetting('download_path', '/db/path');
    process.env.MEMEVAULTPROJECT_DOWNLOAD_PATH = '/env/path';
    expect(getSetting('download_path')).toBe('/env/path');
  });

  it('falls back to DB value when env var is absent', () => {
    setSetting('download_path', '/db/only');
    delete process.env.MEMEVAULTPROJECT_DOWNLOAD_PATH;
    expect(getSetting('download_path')).toBe('/db/only');
  });
});

describe('getAllSettings', () => {
  it('returns an object with multiple keys', () => {
    const all = getAllSettings();
    expect(typeof all).toBe('object');
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  it('includes env override values', () => {
    process.env.MEMEVAULTPROJECT_SHARE_BASE_URL = 'https://test.example.com';
    const all = getAllSettings();
    expect(all['share_base_url']).toBe('https://test.example.com');
    delete process.env.MEMEVAULTPROJECT_SHARE_BASE_URL;
  });
});

describe('getEnvOverriddenKeys', () => {
  afterEach(() => {
    delete process.env.MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS;
  });

  it('returns empty array when no env vars are set', () => {
    // Ensure none of the known env vars are set
    for (const envVar of Object.values(ENV_OVERRIDES)) {
      delete process.env[envVar];
    }
    const keys = getEnvOverriddenKeys();
    expect(keys).toEqual([]);
  });

  it('includes keys whose env vars are set', () => {
    process.env.MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS = '--some-flag';
    const keys = getEnvOverriddenKeys();
    expect(keys).toContain('ytdlp_extra_args');
  });
});
