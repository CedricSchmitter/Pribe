import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { strFromU8, unzipSync } from 'fflate';
import { API_PATHS, apiError, type SubmissionId, type SubmissionPreviewDto } from '@pribe/shared';
import type { PersonSessions } from '../auth/person';
import type { AppContext } from '../context';
import type { SubmissionRecord } from '../db';
import { requirePerson } from './submitPerson';

const SLIDE_RE = /^ppt\/slides\/slide\d+\.xml$/;
const PRESENTATION = 'ppt/presentation.xml';
const PRESENTATION_RELS = 'ppt/_rels/presentation.xml.rels';

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const named: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
    if (named[e.toLowerCase()]) return named[e.toLowerCase()]!;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(code);
  });

function shapeText(shapeXml: string): string {
  const paragraphs = shapeXml.split(/<\/a:p>/).map((p) =>
    [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]!)).join(''),
  );
  return paragraphs.map((p) => p.trim()).filter(Boolean).join(' ');
}

/** Title placeholder text of a slide, else its first text shape (generated decks often have no placeholder). */
function slideTitle(slideXml: string): string | null {
  const shapes = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  const title = shapes.find((s) => /<p:ph\b[^>]*type="(title|ctrTitle)"/.test(s));
  for (const s of title ? [title] : shapes) {
    const text = shapeText(s);
    if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  }
  return null;
}

/** First slide in presentation order (`sldIdLst`), which need not be `slide1.xml`. */
function firstSlideName(entries: Record<string, Uint8Array>): string | null {
  const pres = entries[PRESENTATION] && strFromU8(entries[PRESENTATION]);
  const rels = entries[PRESENTATION_RELS] && strFromU8(entries[PRESENTATION_RELS]);
  const rId = pres?.match(/<p:sldId\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (!rId || !rels) return null;
  const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${rId}"[^>]*>`))?.[0];
  const target = rel?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) return null;
  return path.posix.normalize(target.startsWith('/') ? target.slice(1) : `ppt/${target}`);
}

/** Slide count and first-slide title of a (sanitised) PPTX. */
export function pptxInfo(data: Uint8Array): { slideCount: number; firstSlideTitle: string | null } {
  const names: string[] = [];
  const entries = unzipSync(data, {
    filter: (f) => {
      if (SLIDE_RE.test(f.name)) names.push(f.name);
      return f.name === PRESENTATION || f.name === PRESENTATION_RELS || SLIDE_RE.test(f.name);
    },
  });
  const first = firstSlideName(entries) ?? (names.includes('ppt/slides/slide1.xml') ? 'ppt/slides/slide1.xml' : null);
  const slide = first ? entries[first] : undefined;
  return { slideCount: names.length, firstSlideTitle: slide ? slideTitle(strFromU8(slide)) : null };
}

/**
 * The logged-in person's own submission (R81): cookie → owner HMAC → submission, so nobody
 * else's file is reachable here. URLs carry no ids and responses no names (R22).
 */
export async function submitPreviewRoutes(app: FastifyInstance, ctx: AppContext, sessions: PersonSessions) {
  // Unzipping a 100 MB deck on every revisit is too much for the Pi; the info never changes per id.
  const infoCache = new Map<SubmissionId, SubmissionPreviewDto>();

  const ownReadyFile = async (req: FastifyRequest, reply: FastifyReply) => {
    const me = requirePerson(sessions, req, reply);
    if (!me) return null;
    const sub = ctx.repos.submissions.findByOwnerHash(ctx.ownerHash(me.id));
    const file = sub ? await readyFile(ctx, sub) : null;
    if (!sub || !file) {
      void reply.code(404).send(apiError('NOT_FOUND'));
      return null;
    }
    return { sub, ...file };
  };

  app.get(API_PATHS.submit.minePreview, async (req, reply) => {
    const own = await ownReadyFile(req, reply);
    if (!own) return reply;
    reply.header('Cache-Control', 'no-store');
    if (own.sub.kind === 'html') return { kind: 'html' } satisfies SubmissionPreviewDto;
    let dto = infoCache.get(own.sub.id);
    if (!dto) {
      dto = { kind: 'pptx', ...pptxInfo(await readFile(own.file)) };
      infoCache.set(own.sub.id, dto);
    }
    return dto;
  });

  app.get(API_PATHS.submit.mineFile, async (req, reply) => {
    const own = await ownReadyFile(req, reply);
    if (!own) return reply;
    if (own.sub.kind !== 'html') return reply.code(404).send(apiError('NOT_FOUND'));
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', 'sandbox allow-scripts')
      .header('Content-Length', own.size)
      .type('text/html; charset=utf-8')
      .send(createReadStream(own.file));
  });
}

async function readyFile(ctx: AppContext, sub: SubmissionRecord): Promise<{ file: string; size: number } | null> {
  if (sub.status !== 'ready' || !sub.filePath) return null;
  const root = path.resolve(ctx.config.filesDir);
  const file = path.resolve(root, sub.filePath);
  if (!file.startsWith(root + path.sep)) return null;
  const info = await stat(file).catch(() => null);
  return info?.isFile() ? { file, size: info.size } : null;
}
