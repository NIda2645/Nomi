// Measurement only. Attach to the owned isolated Electron process before opening any project.
// Real appFetch delegates to the real provider unchanged, except the explicitly labelled Q3 index ablation.
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
export function attach({ root, outputDir }) {
 const require=createRequire(import.meta.url), transport=require(path.join(root,'dist-electron/appFetch.js'));
 const original=transport.appFetch;
 let label='unlabelled', omit=null, serial=0;
 const pending=new Set(), ledger=[];
 fs.mkdirSync(path.join(outputDir,'wire'),{recursive:true});
 const save=()=>fs.writeFileSync(path.join(outputDir,'wire-ledger.json'),JSON.stringify(ledger,null,2)+'\n');
 transport.appFetch=async(input,init)=>{
  let body;try{body=JSON.parse(init?.body)}catch{return original(input,init)}
  if(!body?.messages&&!body?.system)return original(input,init);
  const id=String(++serial).padStart(3,'0')+'-'+label;
  const row={id,label,model:body.model,startedAt:new Date().toISOString(),omittedSkill:omit};ledger.push(row);
  fs.writeFileSync(path.join(outputDir,'wire',id+'-original.json'),JSON.stringify(body,null,2));
  if(omit){
   let removed=0;
   const strip=text=>typeof text!=='string'?text:text.replace(/<available_skills>[\s\S]*?<\/available_skills>/g, section=>section.replace(/<skill>[\s\S]*?<\/skill>/g,entry=>{if(entry.includes('<name>'+omit+'</name>')){removed++;return ''}return entry}));
   for(const m of body.messages??[])if(m.role==='system')m.content=strip(m.content);
   if(typeof body.system==='string')body.system=strip(body.system);
   else if(Array.isArray(body.system))for(const s of body.system)if(s.text)s.text=strip(s.text);
   row.removedEntries=removed;
   if(!removed)throw Error('ABLATION_DID_NOT_REMOVE_TARGET');
  }
  fs.writeFileSync(path.join(outputDir,'wire',id+'-sent.json'),JSON.stringify(body,null,2));save();
  try{
   const response=await original(input,{...init,body:JSON.stringify(body)});row.status=response.status;save();
   const drain=response.clone().text().then(text=>{fs.writeFileSync(path.join(outputDir,'wire',id+'-response.txt'),text);row.finishedAt=new Date().toISOString();row.responseBytes=Buffer.byteLength(text);save()}).catch(e=>{row.readError=String(e);save()}).finally(()=>pending.delete(drain));pending.add(drain);
   return response;
  }catch(e){row.error=String(e);save();throw e}
 };
 return {label(name,skill=null){label=name;omit=skill},async flush(){await Promise.all([...pending]);save();return ledger},snapshot(){return ledger}};
}
