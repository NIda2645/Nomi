import fs from 'node:fs';
import process from 'node:process';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
const [output, ...args] = process.argv.slice(2);
const child = spawn(path.join(os.homedir(), '.local/bin/agy'), args, { stdio: ['pipe', 'pipe', 'pipe'] });
process.stdin.pipe(child.stdin);
child.stdin.on('error', () => {});
const record = fs.createWriteStream(output, { mode: 0o600 });
let buffer = ''; let cwd;
child.stdout.on('data', (chunk) => {
  record.write(chunk); buffer += String(chunk);
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1);
    try {
      const event = JSON.parse(line);
      if (event.event === 'init') cwd = event.init.cwd;
      if (cwd && event.step_update?.tool_info?.error) {
        const file = path.join(cwd,'task-gate/denied.json');
        if (fs.existsSync(file)) fs.copyFileSync(file,output+'.denied.json');
        fs.writeFileSync(output+'.gate-state.json',JSON.stringify({ initialized:fs.existsSync(path.join(cwd,'task-gate/initialized.json')),
          ready:fs.existsSync(path.join(cwd,'task-gate/ready.json')),authorized:fs.existsSync(path.join(cwd,'task-gate/authorized-0.json')) }));
      }
    } catch { /* Incomplete diagnostic line; primary runtime validates the stream. */ }
  }
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('close', (code) => { record.end(); process.exitCode = code ?? 1; });
