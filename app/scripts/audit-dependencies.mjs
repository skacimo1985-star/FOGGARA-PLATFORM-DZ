import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Temporary build-only exception, reviewed 2026-10-03. See docs/DEPENDENCY-SECURITY.md.
const advisory='https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const deadline=Date.parse('2026-10-17T00:00:00Z');
const allowed=new Set(['braces','chokidar','fast-glob','micromatch','tailwindcss','tailwindcss-animate']);
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const runtime=spawnSync('npm',['audit','--omit=dev','--audit-level=high'],{stdio:'inherit'});
if(runtime.status!==0) process.exit(runtime.status??1);
const audit=spawnSync('npm',['audit','--json'],{encoding:'utf8',maxBuffer:10*1024*1024});
let report;
try { report=JSON.parse(audit.stdout); } catch { console.error('Audit did not return valid JSON');process.exit(1); }
if(report.error||!report.vulnerabilities){console.error(report.error??'Missing vulnerability report');process.exit(1);}
const findings=Object.entries(report.vulnerabilities).filter(([,v])=>['high','critical'].includes(v.severity));
for(const [name,v] of findings){
  const legitimate=name==='braces'
    ? v.via.every(item=>typeof item==='object'&&item.url===advisory)
    : v.via.every(item=>typeof item==='string'&&allowed.has(item));
  const isolated=v.nodes.length>0&&v.nodes.every(node=>lock.packages[node]?.dev===true);
  // npm audit fix --package-lock-only left this lock unchanged on GitHub.
  // npm reports fast-glob's propagated finding as fixAvailable:true despite the unpatched braces root.
  const propagatedFlag=name==='fast-glob'&&v.fixAvailable===true&&v.via.length===1&&v.via[0]==='micromatch'&&v.nodes.every(node=>lock.packages[node]?.version==='3.3.3');
  if(Date.now()>=deadline||v.severity!=='high'||!allowed.has(name)||!legitimate||!isolated||(v.fixAvailable&&!propagatedFlag)){
    console.error('Unaccepted dependency finding:',name,JSON.stringify(v));process.exit(1);
  }
}
if(findings.length){
  if(!report.vulnerabilities.braces){console.error('Exception requires the reviewed upstream advisory');process.exit(1);}
  console.warn('TEMPORARY BUILD-ONLY EXCEPTION: '+advisory+'; expires 2026-10-17; '+findings.length+' affected development dependency paths.');
} else console.log('No high or critical dependency vulnerabilities.');
