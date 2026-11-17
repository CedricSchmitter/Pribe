import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, type SubmissionStatusDto, type SubmitStatusDto } from '@pribe/shared';
import type { ConversionQueue } from '../conversion';
import { BROKEN_FILE } from '../conversion/pptxQueue';
import { HTML, PPTX, setup } from './submit.testkit';

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

const files = () => readdirSync(t.ctx.config.filesDir).sort();

async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('upload validation', () => {
  it('accepts .html, .htm and .pptx (case-insensitive)', async () => {
    const a = await t.addPerson('Anna');
    const b = await t.addPerson('Ben');
    const c = await t.addPerson('Cleo');
    expect((await t.upload(a.id, 'deck.HTML', HTML)).statusCode).toBe(201);
    expect((await t.upload(b.id, 'deck.htm', HTML)).statusCode).toBe(201);
    expect((await t.upload(c.id, 'Deck.PPTX', PPTX)).statusCode).toBe(201);
  });

  it('rejects other extensions and content that does not match the extension', async () => {
    const a = await t.addPerson('Anna');
    for (const [name, content] of [
      ['deck.pdf', HTML],
      ['deck.ppt', PPTX],
      ['deck', HTML],
      ['deck.html', 'nur Text ohne Tags'],
      ['deck.html', PPTX],
      ['deck.pptx', HTML],
    ] as const) {
      const res = await t.upload(a.id, name, content);
      expect(res.statusCode, name).toBe(415);
      expect(res.json()).toMatchObject({ error: 'UNSUPPORTED_FILE_TYPE' });
    }
    expect(files()).toEqual([]);
    expect(t.ctx.repos.submissions.list()).toEqual([]);
  });

  it('requires the person login', async () => {
    const res = await t.upload(null, 'deck.html', HTML);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'NOT_IDENTIFIED' });
    expect(files()).toEqual([]);
  });

  it('enforces MAX_UPLOAD_MB and leaves no temp file behind', async () => {
    await t.app.close();
    t = await setup({ MAX_UPLOAD_MB: '0.001' });
    const a = await t.addPerson('Anna');
    const big = `<!doctype html><html><body>${'x'.repeat(4096)}</body></html>`;
    const res = await t.upload(a.id, 'deck.html', big);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'FILE_TOO_LARGE' });
    expect(files()).toEqual([]);
  });
});

describe('storage and anonymity', () => {
  it('stores only the owner hash and a random file name, never the original name', async () => {
    const a = await t.addPerson('Anna');
    const res = await t.upload(a.id, 'Annas geheime Folien.html', HTML);
    const dto = res.json() as SubmissionStatusDto;
    expect(dto).toEqual({ submissionId: dto.submissionId, kind: 'html', status: 'ready', error: null });
    expect(res.body).not.toContain(a.id);
    expect(res.body).not.toContain('Anna');

    const [rec] = t.ctx.repos.submissions.list();
    expect(rec!.ownerHash).toBe(t.ctx.ownerHash(a.id));
    expect(rec!.ownerHash).not.toContain(a.id);
    expect(rec!.filePath).toBe(`${dto.submissionId}.html`);
    expect(files()).toEqual([`${dto.submissionId}.html`]);
    expect(readFileSync(path.join(t.ctx.config.filesDir, rec!.filePath!), 'utf8')).toBe(HTML);

    const dump = JSON.stringify(t.ctx.db.prepare('SELECT * FROM submissions').all());
    expect(dump).not.toContain('geheime');
    expect(dump).not.toContain(a.id);
    expect(dump).not.toContain('Anna');
  });

  it('the status endpoints answer without owner data', async () => {
    const a = await t.addPerson('Anna');
    const { submissionId } = (await t.upload(a.id, 'x.html', HTML)).json() as SubmissionStatusDto;
    const res = await t.app.inject({ url: API_PATHS.submit.submission(submissionId) });
    expect(res.json()).toEqual({ submissionId, kind: 'html', status: 'ready', error: null });
    expect((await t.app.inject({ url: API_PATHS.submit.submission('nope') })).statusCode).toBe(404);

    expect((await t.asPerson(a.id, 'GET', API_PATHS.submit.mine)).json()).toEqual(res.json());
    const b = await t.addPerson('Ben');
    expect((await t.asPerson(b.id, 'GET', API_PATHS.submit.mine)).statusCode).toBe(404);
    expect((await t.app.inject({ url: API_PATHS.submit.mine })).statusCode).toBe(401);
  });
});

describe('replace', () => {
  it('a second upload replaces the first and deletes the old file', async () => {
    const a = await t.addPerson('Anna');
    const first = (await t.upload(a.id, 'v1.html', HTML)).json() as SubmissionStatusDto;
    const second = (await t.upload(a.id, 'v2.pptx', PPTX)).json() as SubmissionStatusDto;
    expect(second.submissionId).not.toBe(first.submissionId);
    expect(second).toMatchObject({ kind: 'pptx', status: 'converting' });

    expect(t.ctx.repos.submissions.list().map((s) => s.id)).toEqual([second.submissionId]);
    expect(existsSync(path.join(t.ctx.config.filesDir, `${first.submissionId}.html`))).toBe(false);

    await waitFor(() => t.ctx.repos.submissions.get(second.submissionId)?.status === 'ready');
    expect(files()).toEqual([`${second.submissionId}.pptx`]);
  });

  it('cleans up a PPTX the queue rewrites after its submission was replaced', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const done: Promise<unknown>[] = [];
    const slowQueue: ConversionQueue = {
      enqueue(job) {
        const p = gate.then(async () => {
          await writeFile(job.inputPath, PPTX);
          return { status: 'ready', filePath: path.basename(job.inputPath) } as const;
        });
        done.push(p);
        return p;
      },
      onStatusChange: () => () => {},
      size: 0,
      close: async () => {},
    };
    t.ctx.conversion = slowQueue;
    const a = await t.addPerson('Anna');
    const first = (await t.upload(a.id, 'v1.pptx', PPTX)).json() as SubmissionStatusDto;
    const second = (await t.upload(a.id, 'v2.html', HTML)).json() as SubmissionStatusDto;
    release();
    await Promise.all(done);
    await waitFor(() => files().length === 1);
    expect(files()).toEqual([`${second.submissionId}.html`]);
    expect(t.ctx.repos.submissions.get(first.submissionId)).toBeNull();
  });

  it('a failed PPTX is reported so the person can upload again', async () => {
    const a = await t.addPerson('Anna');
    const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 1)]);
    const { submissionId } = (await t.upload(a.id, 'x.pptx', broken)).json() as SubmissionStatusDto;
    await waitFor(() => t.ctx.repos.submissions.get(submissionId)?.status === 'failed');
    const res = await t.app.inject({ url: API_PATHS.submit.submission(submissionId) });
    expect(res.json()).toMatchObject({ status: 'failed', error: BROKEN_FILE });
    expect((await t.upload(a.id, 'y.html', HTML)).statusCode).toBe(201);
  });
});

describe('lock', () => {
  const status = async () => (await t.app.inject({ url: API_PATHS.submit.status })).json() as SubmitStatusDto;

  it('counts the pool and reports open uploads without a deadline', async () => {
    const a = await t.addPerson('Anna');
    const b = await t.addPerson('Ben');
    expect(await status()).toMatchObject({ uploadsOpen: true, submissionCount: 0, deadline: null, maxUploadMb: 100 });
    await t.upload(a.id, 'x.html', HTML);
    await t.upload(b.id, 'x.html', HTML);
    await t.upload(b.id, 'y.html', HTML);
    expect((await status()).submissionCount).toBe(2);
  });

  it('closes uploads after the deadline', async () => {
    const a = await t.addPerson('Anna');
    await t.admin('PUT', API_PATHS.admin.settings, { submissionDeadline: Date.now() - 1000 });
    expect(await status()).toMatchObject({ uploadsOpen: false });
    const res = await t.upload(a.id, 'x.html', HTML);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'UPLOADS_CLOSED' });
    expect(files()).toEqual([]);

    await t.admin('PUT', API_PATHS.admin.settings, { submissionDeadline: Date.now() + 60_000 });
    expect((await t.upload(a.id, 'x.html', HTML)).statusCode).toBe(201);
  });

  it('closes uploads once the game has started, even before the deadline', async () => {
    const a = await t.addPerson('Anna');
    await t.admin('PUT', API_PATHS.admin.settings, { submissionDeadline: Date.now() + 60_000 });
    t.ctx.repos.game.save('choosePresenter');
    expect(await status()).toMatchObject({ uploadsOpen: false });
    expect((await t.upload(a.id, 'x.html', HTML)).statusCode).toBe(403);
  });
});

describe('persons list', () => {
  it('is open and lists name, emoji and color', async () => {
    await t.addPerson('Anna');
    const res = await t.app.inject({ url: API_PATHS.persons });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([expect.objectContaining({ name: 'Anna', emoji: '🦊', color: '#ff3366' })]);
    expect(res.body).not.toContain('scrypt');
  });
});
