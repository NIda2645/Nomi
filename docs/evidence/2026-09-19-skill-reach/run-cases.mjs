// Browser actions drive the actual app. The only main-process calls label/flush the measurement observer.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
export function traces(projectsDir){
 const rows=[];
 function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else if(e.name==='trace.jsonl')for(const line of fs.readFileSync(p,'utf8').split('\n').filter(Boolean)){try{rows.push({...JSON.parse(line),source:p})}catch{}}}}
 visit(projectsDir);return rows;
}
export async function runCase({win,app,iso,evidence},item,{newConversation=true}={}){
 if(newConversation){await win.getByRole('button',{name:'历史会话',exact:true}).click();await win.getByRole('button',{name:'新对话',exact:true}).click();await win.locator('[data-v4-block="assistant"]').waitFor({state:'detached',timeout:10000});}
 if(item.skill){await win.getByRole('button',{name:'Skill',exact:true}).click();await win.getByRole('textbox',{name:'搜索技能，或输入 / 命令',exact:true}).fill(item.skill);await win.locator('[data-v4-command="skill:'+item.skill+'"]').click();}
 await app.evaluate((_,item)=>globalThis.skillReach.label(item.id,item.omit??null),item);
 const previous=new Set(traces(iso.projectsDir).map(t=>t.turnId));
 await win.getByRole('textbox',{name:'给 Nomi 的消息',exact:true}).fill(item.prompt);
 await win.screenshot({path:path.join(evidence,'shots',item.id+'-input.png')});
 await win.getByRole('button',{name:'发送',exact:true}).click();
 const deadline=Date.now()+180000;
 let trace;
 while(Date.now()<deadline){trace=traces(iso.projectsDir).find(t=>!previous.has(t.turnId)&&t.prompt===item.prompt&&['completed','failed','aborted','error','cancelled'].includes(t.status));if(trace)break;await pause(500);}
 let timedOut=false;
 if(!trace){
  timedOut=true;await win.screenshot({path:path.join(evidence,'shots',item.id+'-timeout.png')});
  const stop=win.getByRole('button',{name:'停止',exact:true});if(await stop.isVisible())await stop.click();
  const end=Date.now()+15000;
  while(Date.now()<end){trace=traces(iso.projectsDir).find(t=>!previous.has(t.turnId)&&t.prompt===item.prompt&&['completed','failed','aborted','error','cancelled'].includes(t.status));if(trace)break;await pause(250);}
  if(!trace)throw Error('No terminal trace after stopping '+item.id);
 }
 await win.getByRole('button',{name:'发送',exact:true}).waitFor({timeout:10000});
 await win.screenshot({path:path.join(evidence,'shots',item.id+'-output.png')});
 await app.evaluate(()=>globalThis.skillReach.flush());
 const result={...item,timedOut,trace,uiText:await win.locator('[data-agent-surface="generation"]').innerText()};
 fs.mkdirSync(path.join(evidence,'rounds'),{recursive:true});fs.writeFileSync(path.join(evidence,'rounds',item.id+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(item.id,trace.status,trace.tools?.length,trace.tokens);
 return result;
}
