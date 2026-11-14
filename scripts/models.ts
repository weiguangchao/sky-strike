import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const executable = process.env.BLENDER_PATH || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const script = fileURLToPath(new URL('./blender/build_models.py', import.meta.url));
const processHandle = spawn(executable, ['--background', '--factory-startup', '--python', script], { stdio: 'inherit' });
processHandle.on('error', error => { console.error(`无法启动 Blender：${error.message}。可使用 BLENDER_PATH 指定可执行文件。`); process.exitCode = 1; });
processHandle.on('exit', code => { process.exitCode = code ?? 1; });
