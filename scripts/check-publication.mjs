// A conservative staged-source check, not a substitute for a full secret audit.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entries=execFileSync('git',['ls-files','--stage','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(entry=>{
  const [metadata,file]=entry.split('\t');return {file,hash:metadata.split(' ')[1]};
});
const objects=execFileSync('git',['cat-file','--batch'],{cwd:root,input:entries.map(e=>e.hash).join('\n')+'\n',maxBuffer:64*1024*1024});
const issues=[];
const forbidden=/(^|\/)(integration-data|demo-data|demo-archives|node_modules|\.test-artifacts|\.ui-review|\.vercel|hosted-dist|dist|\.governance-dist|\.venv[^/]*|__pycache__)\/|(^|\/)\.env(?!\.example$)(\.|$)|\.(db|sqlite3?|onnx|pfx|p12)$/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{80,}/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{35,}\b/,/\bsk-(?:proj-|ant-)[A-Za-z0-9_-]{35,}\b/,/\bAKIA[A-Z0-9]{16}\b/];
let bytes=0,offset=0;
for(const {file,hash} of entries){
  if(forbidden.test(file))issues.push(`${file}: operational/generated path must not be committed`);
  const headerEnd=objects.indexOf(10,offset);const [objectHash,type,size]=objects.subarray(offset,headerEnd).toString('utf8').split(' ');
  if(objectHash!==hash||type!=='blob')throw new Error(`Invalid staged blob: ${file}`);
  const staged=objects.subarray(headerEnd+1,headerEnd+1+Number(size));offset=headerEnd+2+Number(size);bytes+=staged.length;
  if(staged.length>5*1024*1024)issues.push(`${file}: review large file`);
  if(!staged.includes(0)){
    const text=staged.toString('utf8');
    for(const [index,pattern] of patterns.entries())if(pattern.test(text)&&!(index===0&&file==='h2a-mvp/h2a-mvp/tests/fixtures/federation-loopback-key.pem'))issues.push(`${file}: credential pattern ${index+1} requires review (value withheld)`);
  }
}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`Staged-source checks passed: ${entries.length} files, ${(bytes/1024/1024).toFixed(2)} MiB. Only the documented loopback test TLS key is allowed. This is not a comprehensive credential audit.`);
