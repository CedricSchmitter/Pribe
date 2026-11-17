import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createRepositories, openDatabase } from '../db';
import { testConfig } from '../testing';
import { createConversionQueue, type ConversionStatusEvent } from '.';
import { BROKEN_FILE, createPptxQueue } from './pptxQueue';

const SLIDE = '<p:sld><p:cSld><p:spTree><a:t>Max Mustermann erklärt die Welt</a:t></p:spTree></p:cSld></p:sld>';
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

function samplePptx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'docProps/core.xml': strToU8(
      '<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:title>Weltreise</dc:title>' +
        '<dc:creator>Max Mustermann</dc:creator><cp:lastModifiedBy>Erika Musterfrau</cp:lastModifiedBy></cp:coreProperties>',
    ),
    'docProps/app.xml': strToU8(
      '<Properties><Slides>1</Slides><Company>Muster GmbH</Company><Manager>Chefin Muster</Manager></Properties>',
    ),
    'ppt/slides/slide1.xml': strToU8(SLIDE),
    'ppt/media/image1.png': IMAGE,
  });
}

function setup(filesDir = mkdtempSync(path.join(tmpdir(), 'pribe-files-'))) {
  const repos = createRepositories(openDatabase(':memory:'));
  const queue = createPptxQueue({ filesDir, submissions: repos.submissions });
  const events: ConversionStatusEvent[] = [];
  queue.onStatusChange((e) => events.push(e));
  let n = 0;
  const add = (content: Uint8Array | string) => {
    const hash = `owner-${n++}`;
    const filePath = `${hash}.pptx`;
    const { submission } = repos.submissions.replaceForOwner({ ownerHash: hash, kind: 'pptx', status: 'converting', filePath });
    const inputPath = path.join(filesDir, filePath);
    writeFileSync(inputPath, content);
    return { submission, inputPath, filePath, job: { submissionId: submission.id, inputPath } };
  };
  return { filesDir, repos, queue, events, add };
}

describe('PPTX cleanup queue', () => {
  it('empties author, last modified by, company and manager and leaves slides untouched', async () => {
    const { repos, queue, events, add } = setup();
    const { submission, inputPath, filePath, job } = add(samplePptx());

    expect(await queue.enqueue(job)).toEqual({ status: 'ready', filePath });
    expect(repos.submissions.get(submission.id)).toMatchObject({ status: 'ready', filePath, error: null });
    expect(repos.submissions.listPool().map((s) => s.id)).toEqual([submission.id]);
    expect(events).toEqual([{ submissionId: submission.id, status: 'ready', error: null }]);

    const entries = unzipSync(readFileSync(inputPath));
    const core = strFromU8(entries['docProps/core.xml']!);
    const app = strFromU8(entries['docProps/app.xml']!);
    expect(core).toContain('<dc:creator></dc:creator>');
    expect(core).toContain('<cp:lastModifiedBy></cp:lastModifiedBy>');
    expect(core).toContain('<dc:title>Weltreise</dc:title>');
    expect(app).toContain('<Company></Company>');
    expect(app).toContain('<Manager></Manager>');
    expect(app).toContain('<Slides>1</Slides>');
    expect(`${core}${app}`).not.toMatch(/Mustermann|Musterfrau|Muster GmbH|Chefin/);
    expect(strFromU8(entries['ppt/slides/slide1.xml']!)).toBe(SLIDE);
    expect(entries['ppt/media/image1.png']).toEqual(IMAGE);
    expect(Object.keys(entries)).toEqual(Object.keys(unzipSync(samplePptx())));
  });

  it('marks a broken file as failed, deletes it and keeps it out of the pool', async () => {
    const { repos, queue, events, add } = setup();
    const notZip = add('das ist keine pptx');
    const zipWithoutOoxml = add(zipSync({ 'a.txt': strToU8('x') }));

    expect(await queue.enqueue(notZip.job)).toEqual({ status: 'failed', error: BROKEN_FILE });
    expect(await queue.enqueue(zipWithoutOoxml.job)).toEqual({ status: 'failed', error: BROKEN_FILE });
    expect(repos.submissions.get(notZip.submission.id)).toMatchObject({ status: 'failed', filePath: null, error: BROKEN_FILE });
    expect(existsSync(notZip.inputPath)).toBe(false);
    expect(repos.submissions.listPool()).toEqual([]);
    expect(events.map((e) => e.status)).toEqual(['failed', 'failed']);
  });

  it('works through jobs one after another', async () => {
    const { repos, queue, add } = setup();
    const jobs = [add(samplePptx()), add(samplePptx()), add(samplePptx())];
    const pending = jobs.map((j) => queue.enqueue(j.job));
    expect(queue.size).toBe(3);
    const order: number[] = [];
    pending.forEach((p, i) => void p.then(() => order.push(i)));
    await Promise.all(pending);
    expect(order).toEqual([0, 1, 2]);
    expect(queue.size).toBe(0);
    expect(repos.submissions.listPool()).toHaveLength(3);
  });

  it('skips a submission that was replaced while waiting', async () => {
    const { repos, queue, events, add } = setup();
    const { submission, job } = add(samplePptx());
    repos.submissions.remove(submission.id);
    expect(await queue.enqueue(job)).toMatchObject({ status: 'failed' });
    expect(events).toEqual([]);
  });
});

describe('createConversionQueue', () => {
  it('resumes submissions still converting after a restart', async () => {
    const config = testConfig();
    const dbFile = path.join(config.dataDir, 'pribe.sqlite');
    mkdirSync(config.filesDir, { recursive: true });

    const before = createRepositories(openDatabase(dbFile));
    const pending = before.submissions.replaceForOwner({ ownerHash: 'a', kind: 'pptx', status: 'converting', filePath: 'a.pptx' });
    writeFileSync(path.join(config.filesDir, 'a.pptx'), samplePptx());
    const html = before.submissions.replaceForOwner({ ownerHash: 'b', kind: 'html', status: 'ready', filePath: 'b.html' });

    const repos = createRepositories(openDatabase(dbFile));
    const queue = createConversionQueue(config, repos, () => {});
    expect(queue.size).toBe(1);
    await queue.close();

    expect(repos.submissions.get(pending.submission.id)).toMatchObject({ status: 'ready', filePath: 'a.pptx' });
    const core = strFromU8(unzipSync(readFileSync(path.join(config.filesDir, 'a.pptx')))['docProps/core.xml']!);
    expect(core).not.toContain('Mustermann');
    expect(repos.submissions.get(html.submission.id)).toMatchObject({ status: 'ready', filePath: 'b.html' });
  });
});
