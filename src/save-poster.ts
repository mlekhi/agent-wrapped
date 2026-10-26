import { link, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** write complete bytes to an adjacent temp dir, then atomically link into place. */
export async function savePoster(png: Buffer, destination: string): Promise<void> {
  const directory = await mkdtemp(join(dirname(destination), '.agent-wrapped-'))
    .catch(() => { throw new Error('cannot write poster'); });
  try {
    const temp = join(directory, 'poster.png');
    await writeFile(temp, png);
    await link(temp, destination);
  } catch {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw new Error('cannot write poster');
  }
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}
