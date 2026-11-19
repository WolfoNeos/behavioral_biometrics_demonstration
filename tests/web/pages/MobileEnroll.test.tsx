import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fp = { userAgent: 'UA', platform: 'P', language: 'fr', screen: '1x1x24', timezone: 'Z', canvasHash: 'h' };
const requestOrientation = vi.fn();
const collectOrientation = vi.fn();
vi.mock('../../../src/web/capture/fingerprint', () => ({
  collectFingerprint: () => Promise.resolve(fp),
}));
vi.mock('../../../src/web/capture/orientation', () => ({
  requestOrientation: () => requestOrientation(),
  collectOrientation: (ms: number) => collectOrientation(ms),
}));

import { MobileEnroll } from '../../../src/web/pages/MobileEnroll';

const post = vi.fn();

beforeEach(() => {
  requestOrientation.mockReset();
  collectOrientation.mockReset();
  post.mockReset();
  post.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => post(url, JSON.parse(init.body as string)));
});

const reading = (beta: number) => ({ alpha: 0, beta, gamma: 0 });

describe('MobileEnroll', () => {
  it('envoie empreinte et beta moyen', async () => {
    const user = userEvent.setup();
    requestOrientation.mockResolvedValue('granted');
    collectOrientation.mockResolvedValue([reading(40), reading(44)]);
    render(<MobileEnroll />);
    await user.click(screen.getByRole('button', { name: 'Allow the sensor' }));
    act(() => {
      const e = new Event('deviceorientation');
      Object.assign(e, { beta: 41.4 });
      window.dispatchEvent(e);
    });
    expect(await screen.findByLabelText('angle beta')).toHaveTextContent('41°');
    await user.click(screen.getByRole('button', { name: 'Save this tilt' }));
    expect(collectOrientation).toHaveBeenCalledWith(2000);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/enroll/phone', { fingerprint: fp, beta: 42 }));
    expect(await screen.findByText('A’s phone enrolled ✓')).toBeInTheDocument();
    expect(screen.getByText(/42°/)).toBeInTheDocument();
    expect(screen.getByText(/UA/)).toBeInTheDocument();
  });

  it('affiche un message francais si la permission est refusee', async () => {
    const user = userEvent.setup();
    requestOrientation.mockResolvedValue('denied');
    render(<MobileEnroll />);
    await user.click(screen.getByRole('button', { name: 'Allow the sensor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Orientation sensor unavailable/);
  });

  it('n envoie rien sans mesure', async () => {
    const user = userEvent.setup();
    requestOrientation.mockResolvedValue('granted');
    collectOrientation.mockResolvedValue([]);
    render(<MobileEnroll />);
    await user.click(screen.getByRole('button', { name: 'Allow the sensor' }));
    await user.click(await screen.findByRole('button', { name: 'Save this tilt' }));
    expect(await screen.findByText('No measurement received')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('affiche une erreur si le serveur refuse', async () => {
    const user = userEvent.setup();
    requestOrientation.mockResolvedValue('granted');
    collectOrientation.mockResolvedValue([reading(40)]);
    post.mockResolvedValue({ ok: false, json: async () => ({ error: 'fingerprint and beta required' }) });
    render(<MobileEnroll />);
    await user.click(screen.getByRole('button', { name: 'Allow the sensor' }));
    await user.click(await screen.findByRole('button', { name: 'Save this tilt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/fingerprint and beta required/);
  });
});
