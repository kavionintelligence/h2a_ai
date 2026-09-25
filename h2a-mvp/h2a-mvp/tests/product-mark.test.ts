import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { detectedProduct } from '../apps/web/src/ProductMark';

describe('detected product identity', () => {
  it.each([
    ['claude-code', 'claude'], ['codex-cli', 'codex'], ['gemini-cli', 'gemini'],
    ['google-antigravity', 'antigravity'], ['chatgpt', 'chatgpt'],
  ])('uses explicit collector identity %s', (tool, expected) => {
    expect(detectedProduct({ name: 'Endpoint observation', fingerprint: { tool_id: tool } })).toBe(expected);
  });
  it('preserves discovery identity after registration or renaming', () => {
    expect(detectedProduct({ name: 'Engineering assistant', discovery_snapshot: { fingerprint: { tool_id: 'codex-cli' } } })).toBe('codex');
  });
  it('does not brand custom agents from their model provider or partial name', () => {
    expect(detectedProduct({ name: 'Finance Gemini helper', fingerprint: { provider: 'google', model: 'gemini' } })).toBe('custom');
    expect(detectedProduct({ name: 'Custom analyst', framework: 'openai' })).toBe('custom');
    expect(detectedProduct()).toBe('custom');
  });
  it('recognizes exact product names with host suffixes', () => {
    expect(detectedProduct({ name: 'Claude Code · laptop' })).toBe('claude');
    expect(detectedProduct({ name: 'Google Antigravity' })).toBe('antigravity');
  });
  it('bundles the original attributed assets with matching hashes', () => {
    const directory = fileURLToPath(new URL('../public/product-marks/', import.meta.url));
    const entries = JSON.parse(readFileSync(resolve(directory, 'sources.json'), 'utf8'));
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      const contents = readFileSync(resolve(directory, entry.file));
      expect(createHash('sha256').update(contents).digest('hex')).toBe(entry.sha256);
      expect(entry.referenced_by).toMatch(/^https:\/\//);
    }
  });
});
