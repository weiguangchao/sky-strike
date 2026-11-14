import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('game', 'dist', { recursive: true });
console.log('Built Sky Strike → dist/');
