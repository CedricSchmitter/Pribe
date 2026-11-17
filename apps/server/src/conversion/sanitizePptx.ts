import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

const CLEARED: Record<string, string[]> = {
  'docProps/core.xml': ['dc:creator', 'cp:lastModifiedBy'],
  'docProps/app.xml': ['Company', 'Manager'],
};

function clearElements(xml: string, tags: string[]): string {
  let out = xml;
  for (const tag of tags) {
    const t = tag.replace(':', '\\:');
    // (?<!/) keeps a self-closing (already empty) element from pairing with a later closing tag.
    out = out.replace(new RegExp(`<${t}(\\s[^>]*)?(?<!/)>[\\s\\S]*?</${t}>`, 'g'), `<${tag}$1></${tag}>`);
  }
  return out;
}

/**
 * Empties author, last-modified-by, company and manager in the PPTX properties (R31, D15).
 * Slides and media stay byte-identical; throws if the file is not a readable ZIP.
 */
export function sanitizePptx(input: Uint8Array): Uint8Array {
  const entries = unzipSync(input);
  if (!entries['[Content_Types].xml']) throw new Error('not an OOXML package');
  const out: Zippable = {};
  for (const [name, data] of Object.entries(entries)) {
    const tags = CLEARED[name];
    const content = tags ? strToU8(clearElements(strFromU8(data), tags)) : data;
    // Media is already compressed; deflating it again only costs time on the Pi.
    out[name] = [content, { level: /\.(xml|rels)$/i.test(name) ? 6 : 0 }];
  }
  return zipSync(out);
}
