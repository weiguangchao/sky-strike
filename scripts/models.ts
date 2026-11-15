import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { HISTORICAL_SHIPS, historicalModel, navalShape } from '../game/naval-history.ts';

await writeFile(new URL('../assets/blender/historical-fleet.json',import.meta.url),JSON.stringify({
  version:1,
  ships:HISTORICAL_SHIPS.map(ship=>({...ship,modelId:historicalModel(ship.id),shape:navalShape(ship)})),
},null,2)+'\n');

const executable = process.env.BLENDER_PATH || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const script = fileURLToPath(new URL('./blender/build_models.py', import.meta.url));
const processHandle = spawn(executable, ['--background', '--factory-startup', '--python', script], { stdio: 'inherit' });
processHandle.on('error', error => { console.error(`无法启动 Blender：${error.message}。可使用 BLENDER_PATH 指定可执行文件。`); process.exitCode = 1; });
processHandle.on('exit', code => { process.exitCode = code ?? 1; });
