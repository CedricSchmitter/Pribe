import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, type SubmissionStatusDto } from '@pribe/shared';
import { HTML, setup } from './submit.testkit';
import { pptxInfo } from './submitPreview';

const DEMO_PPTX = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../demo/pptx/kaffeemaschine.pptx'),
);

let t: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.app.close();
});

async function waitReady(id: string) {
  const start = Date.now();
  while (t.ctx.repos.submissions.get(id)?.status !== 'ready') {
    if (Date.now() - start > 5000) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('own submission preview (R81)', () => {
  it('serves the own HTML file with the sandbox CSP', async () => {
    const a = await t.addPerson('Anna');
    await t.upload(a.id, 'deck.html', HTML);

    const preview = await t.asPerson(a.id, 'GET', API_PATHS.submit.minePreview);
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ kind: 'html' });

    const file = await t.asPerson(a.id, 'GET', API_PATHS.submit.mineFile);
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe(HTML);
    expect(file.headers['content-security-policy']).toBe('sandbox allow-scripts');
    expect(file.headers['content-type']).toMatch(/^text\/html/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.body).not.toContain('Anna');
  });

  it('counts slides and reads the first title of the sanitised PPTX', async () => {
    const a = await t.addPerson('Anna');
    const { submissionId } = (await t.upload(a.id, 'deck.pptx', DEMO_PPTX)).json() as SubmissionStatusDto;
    await waitReady(submissionId);

    const res = await t.asPerson(a.id, 'GET', API_PATHS.submit.minePreview);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      kind: 'pptx',
      slideCount: 6,
      firstSlideTitle: 'Die Kaffeemaschine: eine Liebesgeschichte in 5 Akten',
    });
    expect((await t.asPerson(a.id, 'GET', API_PATHS.submit.mineFile)).statusCode).toBe(404);
  });

  it('rejects requests without a cookie (401)', async () => {
    const a = await t.addPerson('Anna');
    await t.upload(a.id, 'deck.html', HTML);
    for (const url of [API_PATHS.submit.minePreview, API_PATHS.submit.mineFile]) {
      expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('never hands out another person’s submission (404)', async () => {
    const a = await t.addPerson('Anna');
    const b = await t.addPerson('Ben');
    await t.upload(a.id, 'deck.html', HTML);
    for (const url of [API_PATHS.submit.minePreview, API_PATHS.submit.mineFile]) {
      expect((await t.asPerson(b.id, 'GET', url)).statusCode).toBe(404);
    }
  });

  it('returns 404 for a submission that is not ready', async () => {
    const a = await t.addPerson('Anna');
    const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('kaputt')]);
    const { submissionId } = (await t.upload(a.id, 'deck.pptx', broken)).json() as SubmissionStatusDto;
    const start = Date.now();
    while (t.ctx.repos.submissions.get(submissionId)?.status !== 'failed') {
      if (Date.now() - start > 5000) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 10));
    }
    expect((await t.asPerson(a.id, 'GET', API_PATHS.submit.minePreview)).statusCode).toBe(404);
  });
});

describe('pptxInfo', () => {
  it('follows the presentation order and prefers the title placeholder', () => {
    const slide = (title: string, body: string) =>
      strToU8(
        `<p:sld><p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>` +
          `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`,
      );
    const zip = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'ppt/presentation.xml': strToU8('<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId8"/></p:sldIdLst></p:presentation>'),
      'ppt/_rels/presentation.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId8" Target="slides/slide1.xml"/><Relationship Id="rId9" Target="slides/slide2.xml"/></Relationships>',
      ),
      'ppt/slides/slide1.xml': slide('Erste', 'x'),
      'ppt/slides/slide2.xml': slide('Kaffee &amp; Kuchen', 'Untertitel'),
      'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationships/>'),
    });
    expect(pptxInfo(zip)).toEqual({ slideCount: 2, firstSlideTitle: 'Kaffee & Kuchen' });
  });
});
