import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { REPO_ROOT } from './paths';

const base = { ADMIN_PASSWORD: 'pw', PRIBE_SECRET: '0123456789abcdef', PUBLIC_URL: 'https://pribe.example.org/' };

describe('parseConfig', () => {
  it('applies defaults', () => {
    const c = parseConfig(base);
    expect(c.port).toBe(3000);
    expect(c.maxUploadMb).toBe(100);
    expect(c.dataDir).toBe(path.join(REPO_ROOT, 'data'));
    expect(c.filesDir).toBe(path.join(REPO_ROOT, 'data', 'files'));
    expect(c.publicUrl).toBe('https://pribe.example.org');
    expect(c.secureCookies).toBe(true);
    expect(c.trustProxy).toBe(false);
  });

  it('reads TRUST_PROXY as a boolean', () => {
    expect(parseConfig({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(parseConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(() => parseConfig({ ...base, TRUST_PROXY: 'vielleicht' })).toThrow(/TRUST_PROXY/);
  });

  it('keeps absolute DATA_DIR and coerces numbers', () => {
    const c = parseConfig({ ...base, DATA_DIR: path.resolve('/data'), PORT: '4101', MAX_UPLOAD_MB: '50' });
    expect(c.dataDir).toBe(path.resolve('/data'));
    expect(c.port).toBe(4101);
    expect(c.maxUploadMb).toBe(50);
  });

  it('rejects missing or weak values', () => {
    expect(() => parseConfig({})).toThrow(/ADMIN_PASSWORD/);
    expect(() => parseConfig({ ...base, PRIBE_SECRET: 'short' })).toThrow(/PRIBE_SECRET/);
    expect(() => parseConfig({ ...base, PUBLIC_URL: 'nope' })).toThrow(/PUBLIC_URL/);
  });
});
