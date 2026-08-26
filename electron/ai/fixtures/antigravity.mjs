// Test-only subprocess: models the documented NDJSON contract, no network.
import fs from 'node:fs';
import process from 'node:process';
import { setInterval, setTimeout } from 'node:timers';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
const [mode, output, ...args] = process.argv.slice(2);
if (mode === 'discovery') {
  process.stdin.resume();
  process.stdin.on('end', () => process.stdout.write(args.includes('--version')
    ? 'agy 1.1.21\n' : 'gemini-3.7-flash-high\tGemini 3.7 Flash (High)\n'));
} else {
  const agent = args[args.indexOf('--agent') + 1];
  const log = args.includes('--log-file') ? args[args.indexOf('--log-file') + 1] : undefined;
  if (log && mode !== 'missing-log') fs.writeFileSync(log, mode === 'agent-fallback'
    ? `Agent "${agent}" not found, falling back to default\n`
    : mode === 'oversize-log' ? 'x'.repeat(2 * 1024 * 1024 + 1) : 'CLI initialized\n');
  if (log && ['fifo-log', 'symlink-log'].includes(mode)) {
    fs.unlinkSync(log);
    if (mode === 'fifo-log') execFileSync('mkfifo', [log]);
    else {
      fs.writeFileSync(path.join(output, 'symlink-target'), 'CLI initialized\n');
      fs.symlinkSync(path.join(output, 'symlink-target'), log);
    }
  }
  const profile = path.join(process.cwd(), '.agents', 'agents', agent, 'agent.md');
  if (fs.existsSync(profile)) fs.copyFileSync(profile, path.join(output, 'profile'));
  if (args.includes('--add-dir')) fs.writeFileSync(path.join(output, 'mounted-cwd'), args[args.indexOf('--add-dir') + 1]);
  fs.writeFileSync(path.join(output, 'cwd'), process.cwd());
  const send = (event) => process.stdout.write(JSON.stringify(event) + '\n');
  if (mode === 'hang') setInterval(() => {}, 100);
  else if (mode === 'auth') { process.stderr.write('Please sign in to view available models.'); process.exit(1); }
  else {
    const init = JSON.stringify({ event: 'init', conversation_id: 'one', init: {
      agent, cwd: process.cwd(), tools: ['run_command', 'generate_image', 'view_file'], permission_mode: 'request-review',
    } }) + '\n';
    process.stdout.write(init.slice(0, 11));
    setTimeout(() => process.stdout.write(init.slice(11)), 5);
    let input = ''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; fs.writeFileSync(path.join(output, 'input'), input); });
    process.stdin.on('end', async () => {
      if (mode === 'tool-call') {
        send({ event: 'step_update', step_update: { step_type: 'tool', tool_name: 'run_command' } });
        return;
      }
      if (mode === 'silent-descendant-success' || mode === 'silent-descendant-cancel') {
        const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); process.send('ready'); setInterval(()=>{},100)"],
          { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        await new Promise((resolve) => child.once('message', resolve));
        fs.writeFileSync(path.join(output, 'child-pid'), String(child.pid));
        child.disconnect(); child.unref();
        if (mode === 'silent-descendant-cancel') { setInterval(() => {}, 100); return; }
      }
      if (mode === 'descendant') {
        const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},100)'], { stdio: ['ignore', 'inherit', 'inherit'] });
        fs.writeFileSync(path.join(output, 'child-pid'), String(child.pid));
        child.unref();
        process.exit(0);
      }
      if (mode === 'stuck') { process.on('SIGTERM', () => {}); setInterval(() => {}, 100); return; }
      if (mode === 'malformed-tail') { process.stdout.write('bad JSON'); return; }
      if (mode === 'malformed') { process.stdout.write('bad JSON\n'); return; }
      if (mode === 'missing') return;
      send({ event: 'step_update', step_update: { conversation_id: 'one', step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: '你' } });
      const result = { event: 'result', result: { status: 'SUCCESS', conversation_id: 'one', response: '你好',
        duration_seconds: 0.1, num_turns: 1, usage: { input_tokens: 2, output_tokens: 2, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 4 } } };
      send(result); if (mode === 'duplicate') send(result);
      if (mode === 'trailing-garbage') process.stdout.write('bad JSON');
      if (mode === 'nonzero') process.exitCode = 1;
    });
  }
}
