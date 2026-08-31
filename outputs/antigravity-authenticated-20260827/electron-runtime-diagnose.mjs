/* global AbortController */
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const {runAntigravityProcess,buildAntigravityEnv}=await import(path.join(root,'dist-electron/ai/antigravityProcess.js'));
const {verifyAntigravityCapability}=await import(path.join(root,'dist-electron/ai/antigravityVerification.js'));
const out=path.join(root,'outputs/antigravity-authenticated-20260827/electron-edit-diagnostic.jsonl');
const start=Date.now();
verifyAntigravityCapability({capability:'edit',modelId:'auto'},'1.1.21',new AbortController().signal,
  input=>runAntigravityProcess(input,{initTimeoutMs:30000,env:{...buildAntigravityEnv(),ELECTRON_RUN_AS_NODE:'1',HTTP_PROXY:'http://127.0.0.1:7897',HTTPS_PROXY:'http://127.0.0.1:7897',NO_PROXY:'localhost,127.0.0.1,::1'},
    invocation:{command:process.execPath,args:[path.join(root,'outputs/antigravity-authenticated-20260827/observe-cli.mjs'),out]}}))
.then(result=>{fs.writeFileSync(out+'.result.json',JSON.stringify({passed:true,usage:result.usage,artifacts:result.artifacts?.map(a=>({mimeType:a.mimeType,bytes:a.bytes.length})),elapsed:Date.now()-start}));process.stdout.write('PASS\n')})
.catch(error=>{fs.writeFileSync(out+'.result.json',JSON.stringify({passed:false,code:error.message,elapsed:Date.now()-start}));process.stdout.write(error.message+'\n');process.exitCode=1});
