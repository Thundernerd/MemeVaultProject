import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../helpers/db';
import {
  createApiKey,
  listApiKeys,
  getApiKeyByValue,
  deleteApiKey,
  touchApiKeyLastUsed,
} from '@/lib/db';

beforeEach(resetDb);

describe('createApiKey / listApiKeys', () => {
  it('creates a read key', () => {
    const key = createApiKey('My Read Key', 'read');
    expect(key.permission).toBe('read');
    expect(key.name).toBe('My Read Key');
    expect(key.key).toBeDefined();
    expect(key.last_used_at).toBeNull();
  });

  it('creates a read_write key', () => {
    const key = createApiKey('RW Key', 'read_write');
    expect(key.permission).toBe('read_write');
  });

  it('appears in listApiKeys', () => {
    const key = createApiKey('Listed', 'read');
    const list = listApiKeys();
    expect(list.map((k) => k.id)).toContain(key.id);
  });

  it('listApiKeys does NOT expose the raw key value', () => {
    createApiKey('Hidden', 'read');
    const list = listApiKeys();
    expect(list[0]).not.toHaveProperty('key');
  });

  it('each key has a unique generated value', () => {
    const a = createApiKey('A', 'read');
    const b = createApiKey('B', 'read');
    expect(a.key).not.toBe(b.key);
  });
});

describe('getApiKeyByValue', () => {
  it('returns the full record for a matching key', () => {
    const key = createApiKey('Lookup', 'read_write');
    const found = getApiKeyByValue(key.key);
    expect(found).toBeDefined();
    expect(found!.id).toBe(key.id);
    expect(found!.permission).toBe('read_write');
  });

  it('returns undefined for an unknown key value', () => {
    expect(getApiKeyByValue('not-a-real-key')).toBeUndefined();
  });
});

describe('deleteApiKey', () => {
  it('removes the key from the list', () => {
    const key = createApiKey('To Delete', 'read');
    deleteApiKey(key.id);
    expect(listApiKeys().map((k) => k.id)).not.toContain(key.id);
  });

  it('returns undefined when looking up deleted key by value', () => {
    const key = createApiKey('Gone', 'read');
    const value = key.key;
    deleteApiKey(key.id);
    expect(getApiKeyByValue(value)).toBeUndefined();
  });
});

describe('touchApiKeyLastUsed', () => {
  it('sets last_used_at to a non-null value', () => {
    const key = createApiKey('Touch Me', 'read');
    expect(key.last_used_at).toBeNull();
    touchApiKeyLastUsed(key.id);
    const found = getApiKeyByValue(key.key);
    expect(found!.last_used_at).not.toBeNull();
  });
});
