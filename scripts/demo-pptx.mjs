// Regenerates the demo PowerPoint files in demo/pptx/ (committed; `npm run demo:pptx`).
// Author, last-modified-by and company are set on purpose: the upload must clear them (D23).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PptxGenJS from 'pptxgenjs';

const outDir = fileURLToPath(new URL('../demo/pptx/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const DECKS = [
  {
    file: 'buero-pflanzen.pptx',
    author: 'Bartholomä Demo-Autor',
    bg: '1B4332',
    accent: 'FFD000',
    title: 'Die geheime Hierarchie der Büropflanzen',
    slides: [
      ['Ausgangslage', ['17 Pflanzen, 1 Gießkanne', 'Niemand fühlt sich zuständig', 'Der Ficus hat es bemerkt']],
      ['Die Rangordnung', ['👑 Ficus Benjamin – Geschäftsführung', '🌵 Kaktus – Compliance', '🌿 Efeu – Netzwerken auf allen Ebenen']],
      ['Beweisfoto', ['(Hier wäre ein Foto, aber der Ficus hat es verboten)']],
      ['Handlungsempfehlung', ['Gießplan im Wiki', 'Quartals-Review mit dem Ficus', 'Kaktus nicht umarmen']],
    ],
  },
  {
    file: 'kaffeemaschine.pptx',
    author: 'Dragomir Demo-Autor',
    bg: '3D2314',
    accent: 'F89939',
    title: 'Die Kaffeemaschine: eine Liebesgeschichte in 5 Akten',
    slides: [
      ['Akt 1: Das Kennenlernen', ['Montag, 7:42 Uhr', 'Blinkende rote Lampe', 'Liebe auf den ersten Entkalkungshinweis']],
      ['Akt 2: Die Krise', ['„Bitte Wasser nachfüllen“', '„Bitte Satzbehälter leeren“', '„Bitte einfach gehen“']],
      ['Akt 3: Kennzahlen', ['☕ 4,2 Tassen pro Person und Tag', '📈 +300 % Produktivität bis 10 Uhr', '📉 −100 % ab 15 Uhr']],
      ['Akt 4: Versöhnung', ['Wir haben sie entkalkt', 'Sie hat uns verziehen', 'Teilweise']],
      ['Akt 5: Ausblick', ['Zweite Maschine beantragt', 'Antrag liegt beim Ficus']],
    ],
  },
];

for (const deck of DECKS) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = deck.author;
  pptx.company = `${deck.author} GmbH`;
  pptx.title = deck.title;

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: deck.bg };
  titleSlide.addText(deck.title, { x: 0.6, y: 2.2, w: 12, h: 1.6, fontSize: 44, bold: true, color: 'FFFFFF' });
  titleSlide.addText('Eine anonyme Einreichung', { x: 0.6, y: 4.0, w: 12, h: 0.6, fontSize: 22, color: deck.accent });

  for (const [heading, bullets] of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: deck.bg };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: deck.accent } });
    slide.addText(heading, { x: 0.6, y: 0.4, w: 12, h: 1, fontSize: 36, bold: true, color: deck.accent });
    slide.addText(
      bullets.map((b) => ({ text: b, options: { bullet: true } })),
      { x: 0.8, y: 1.7, w: 11.5, h: 5, fontSize: 28, color: 'FFFFFF', valign: 'top', paraSpaceAfter: 12 },
    );
  }

  await pptx.writeFile({ fileName: `${outDir}${deck.file}` });
  console.log(`demo/pptx/${deck.file}`);
}
