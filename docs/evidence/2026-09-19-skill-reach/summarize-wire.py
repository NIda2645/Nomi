"""Derive request/response observations; never treat output text as a tool call."""
import json, pathlib, hashlib, re, gzip
root=pathlib.Path(__file__).resolve().parent
rows=[]
for p in sorted((root/'wire').glob('*-sent.json')):
 body=json.loads(p.read_text()); prefix=p.name[:-10]
 system='\n'.join(m['content'] for m in body.get('messages',[]) if m['role']=='system' and isinstance(m.get('content'),str))
 section=re.search(r'<available_skills>[\s\S]*?</available_skills>',system)
 index=section.group() if section else ''
 row={'id':prefix,'model':body.get('model'),'messageCount':len(body.get('messages',[])),'indexNames':re.findall(r'<name>(.*?)</name>',index),'systemSha256':hashlib.sha256(system.encode()).hexdigest(),'calls':[],'text':'','usage':None}
 rp=root/'wire'/(prefix+'-response.txt'); calls={}
 if rp.exists():
  for line in rp.read_text().splitlines():
   if not line.startswith('data:') or '[DONE]' in line: continue
   try:chunk=json.loads(line[5:])
   except json.JSONDecodeError:continue
   if chunk.get('usage'):row['usage']=chunk['usage']
   for choice in chunk.get('choices',[]):
    delta=choice.get('delta',{})
    row['text']+=delta.get('content') or ''
    for call in delta.get('tool_calls',[]):
     out=calls.setdefault(call['index'],{'name':'','arguments':''}); f=call.get('function',{})
     out['name']+=f.get('name','');out['arguments']+=f.get('arguments','')
  for call in calls.values():
   try:call['arguments']=json.loads(call['arguments'])
   except json.JSONDecodeError:pass
   row['calls'].append(call)
 rows.append(row)
(root/'wire-summary.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'requests':len(rows),'withUsage':sum(r['usage'] is not None for r in rows),'promptTokens':sum((r['usage']or{}).get('prompt_tokens',0)for r in rows),'completionTokens':sum((r['usage']or{}).get('completion_tokens',0)for r in rows)},ensure_ascii=False))
