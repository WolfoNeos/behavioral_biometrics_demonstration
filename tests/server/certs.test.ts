import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCerts } from '../../src/server/certs';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'certs-'));
  mkdirSync(join(root, 'certs'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('loadCerts', () => {
  it('aucun fichier : null, sans avertissement', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadCerts(root)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
  it('les deux fichiers : cert et cle', () => {
    writeFileSync(join(root, 'certs', 'dev.pem'), 'C');
    writeFileSync(join(root, 'certs', 'dev-key.pem'), 'K');
    const c = loadCerts(root);
    expect(c?.cert.toString()).toBe('C');
    expect(c?.key.toString()).toBe('K');
  });
  it('un seul fichier : null avec avertissement', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(join(root, 'certs', 'dev.pem'), 'C');
    expect(loadCerts(root)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
