import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderAsync } from '@resvg/resvg-js';
import { renderPosterSvg } from './poster-svg.js';
import type { UsageSummary } from './types.js';

const fontFiles = ['SpaceGrotesk-Regular.ttf', 'SpaceGrotesk-Bold.ttf'].map(name =>
  fileURLToPath(new URL(`../assets/fonts/${name}`, import.meta.url)));

/** render aggregate counts to png bytes; never reads logs or writes an output file. */
export async function renderPoster(summary: UsageSummary): Promise<Buffer> {
  const svg = renderPosterSvg(summary);
  try { await Promise.all(fontFiles.map(path => access(path))); }
  catch { throw new Error('could not load bundled poster fonts'); }
  try {
    const image = await renderAsync(svg, {
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
      logLevel: 'off',
    });
    return image.asPng();
  } catch { throw new Error('could not render poster'); }
}
