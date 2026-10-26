import { cp, mkdir } from 'node:fs/promises';

const destination = new URL('../dist/assets/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../assets/fonts/', import.meta.url), new URL('fonts/', destination), { recursive: true });
