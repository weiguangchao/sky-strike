import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { NEW_ARCHIVE } from '../game/historical-archive.ts';
import { refreshRevisions } from './model-audit.ts';

await writeFile(new URL('../assets/blender/century-archive.json', import.meta.url), JSON.stringify({ version: 1, entries: NEW_ARCHIVE }, null, 2) + '\n');
const executable = process.env.BLENDER_PATH || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const script = fileURLToPath(new URL('./blender/build_archive.py', import.meta.url));
const exitCode = await new Promise<number>((resolve, reject) => {
  const child = spawn(executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script], { stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
if (exitCode !== 0) process.exitCode = exitCode;
else await refreshRevisions();
