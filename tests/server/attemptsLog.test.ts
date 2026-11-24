import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendAttempt, lastFailedAttempt } from '../../src/server/store';

const ev = (n: number) => [{ key: 'a', down: 0, up: n }];
let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'attempts-'));
  path = join(dir, 'attempts.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('journal des essais', () => {
  it('rien sans journal', () => {
    expect(lastFailedAttempt(path)).toBeNull();
  });

  it('renvoie le dernier essai refusé tapé par une personne', () => {
    appendAttempt({ at: 'a', score: 55, secret: true, granted: false, typed: true, events: ev(1) }, path);
    appendAttempt({ at: 'b', score: 95, secret: true, granted: true, typed: true, events: ev(2) }, path);
    appendAttempt({ at: 'c', score: 60, secret: true, granted: false, typed: true, events: ev(3) }, path);
    appendAttempt({ at: 'd', score: 97, secret: true, granted: true, typed: true, events: ev(4) }, path);
    expect(lastFailedAttempt(path)?.at).toBe('c');
  });

  it('ignore les anciennes entrées sans marqueur (simulations passées)', () => {
    appendAttempt({ at: 'x', score: 26, secret: true, events: ev(1) }, path);
    appendAttempt({ at: 'y', score: 26, secret: true, granted: false, events: ev(2) }, path);
    expect(lastFailedAttempt(path)).toBeNull();
  });
});
