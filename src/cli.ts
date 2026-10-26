#!/usr/bin/env node
import { collectUsage } from './index.js';
import { defaultSavePath, helpText, parseArgs } from './cli-args.js';
import { savePoster } from './save-poster.js';

async function run(): Promise<number> {
  const parsed = parseArgs(process.argv);
  if (parsed.help) { process.stdout.write(`${helpText}\n`); return 0; }
  const { renderPoster } = await import('./poster.js');
  const png = await renderPoster(await collectUsage(parsed.options));
  await savePoster(png, parsed.options.save ?? defaultSavePath);
  return 0;
}

run().then(
  () => { process.exitCode = 0; },
  error => { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; },
);
