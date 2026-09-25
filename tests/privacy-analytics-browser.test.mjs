import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, h2a } from '../scripts/demo-runtime.mjs';

// Build hosted-dist first. Verify rendered masking, not browser-side confidentiality.
test('private-by-default simulator and three dedicated analytics pages', {timeout:180000}, async t => {
  const require=createRequire(join(h2a,'package.json'));
  const {chromium}=require('playwright');
  const esbuild=require('esbuild');
  const built=await esbuild.build({entryPoints:[join(h2a,'apps/web/src/enterprise-simulation/model.ts')],bundle:true,write:false,format:'esm',platform:'node'});
  const model=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  const scenario=model.makeScenario();
  const secrets=[...new Set(['Neha Sharma','Varun',...scenario.people.map(p=>p.name),...scenario.agents.flatMap(a=>[a.name,a.passport,a.mandate]),...scenario.tasks.flatMap(task=>[task.title,task.id]),...scenario.memories.flatMap(memory=>[memory.title,memory.content])])].filter(value=>value.length>5);
  const web=resolve(root,'hosted-dist');
  const config=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const headers=Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value]));
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    const filename=resolve(web,path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,''));
    if(!filename.startsWith(web+sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{...headers,'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(filename)]||'application/octet-stream'}).end(await readFile(filename));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:[chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const artifacts=join(root,'.test-artifacts',`privacy-${randomUUID()}`);await mkdir(artifacts,{recursive:true});
  t.after(async()=>{await page.screenshot({path:join(artifacts,'final.png'),fullPage:true}).catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}/`;
  const privateDOM=async label=>{
    const exposed=await page.evaluate(()=>document.body.textContent+'\n'+[...document.querySelectorAll('[title],[aria-label],[alt]')].flatMap(node=>['title','aria-label','alt'].map(name=>node.getAttribute(name)||'')).join('\n'));
    const found=secrets.filter(value=>exposed.includes(value));
    assert.deepEqual(found,[],`${label}: private text should not be rendered until revealed`);
    assert.equal(await page.locator('button button').count(),0,`${label}: no nested buttons`);
  };
  const nav=async name=>page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name,exact:true}).click();
  await page.goto(url);
  assert.equal(await page.locator('[data-private-field="Sample password"]').innerText(),'********\nShow');
  await page.getByLabel('Login ID',{exact:true}).fill('varun');
  await page.getByLabel('Password',{exact:true}).fill('ByoSync@123');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByTestId('tenant-joon').click();
  await page.getByRole('heading',{name:'Your hospital. Connected and accountable.'}).waitFor();
  await privateDOM('Overview');
  const ciso=page.locator('[data-private-field="CISO name"]');
  await ciso.getByRole('button',{name:'Show CISO name',exact:true}).click();
  assert.match(await ciso.innerText(),/Neha Sharma/);
  assert.doesNotMatch(await page.locator('[data-private-field="Account name"]').innerText(),/Varun/);
  await ciso.getByRole('button',{name:'Hide CISO name',exact:true}).click();
  await privateDOM('Field hide');
  await ciso.getByRole('button',{name:'Show CISO name',exact:true}).click();
  await page.getByRole('button',{name:'Hide all',exact:true}).click();
  await privateDOM('Hide all');
  await page.clock.install();
  await ciso.getByRole('button',{name:'Show CISO name',exact:true}).click();
  await page.clock.fastForward(60001);
  await privateDOM('60-second timeout');
  await page.clock.resume();
  for(const name of ['Overview','Organization','AI estate','Discovery','Task pipeline','Rooms','Company brain','Decisions','Evidence','Security posture']){
    await nav(name);await privateDOM(name);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: fits desktop`);
  }
  await nav('Overview');
  for(const [kind,title] of [['memory','Reviewed memory growth'],['calls','Tool calls per completed task'],['volume','Daily work volume']]){
    await page.locator(`[data-analysis="${kind}"]`).click();
    const detail=page.getByTestId('analytics-detail');
    assert.equal(await detail.getAttribute('data-kind'),kind);
    await detail.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.match(page.url(),new RegExp(`analysis=${kind}`));
    await privateDOM(`${kind} analysis`);
    assert.equal(await detail.locator('.analytics-records tbody tr').count(),10);
    await detail.locator('.analytics-team-list button').filter({hasText:'Technology'}).click();
    const rows=detail.locator('.analytics-records tbody tr');
    for(const row of await rows.all())assert.match(await row.locator('td').nth(1).innerText(),/Technology/);
    const firstField=rows.first().locator('[data-private-field]').first();
    await firstField.getByRole('button').click();
    assert.equal(await firstField.getAttribute('data-revealed'),'true');
    await detail.getByLabel('Record order').selectOption('oldest');
    await privateDOM(`${kind} filtering resets fields`);
    await rows.first().locator('.analytics-record-actions button, td:last-child>button').first().click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await privateDOM(`${kind} inspector opens masked`);
    await dialog.getByRole('button',{name:'Show Record name',exact:true}).click();
    assert.equal(await dialog.locator('[data-private-field="Record name"]').getAttribute('data-revealed'),'true');
    await page.keyboard.press('Escape');await privateDOM(`${kind} inspector close`);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:join(artifacts,`${kind}-desktop.png`),fullPage:true});
    await page.screenshot({path:join(artifacts,`${kind}-viewport.png`)});
    for(const width of [390,768]){
      await page.setViewportSize({width,height:960});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${kind}: fits ${width}px`);
      await page.screenshot({path:join(artifacts,`${kind}-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:960});
    await detail.getByRole('button',{name:'Back to overview',exact:true}).click();
    assert.equal(await page.getByTestId('analytics-detail').count(),0);
  }
  await page.locator('[data-analysis="memory"]').click();await page.reload();
  assert.equal(await page.getByTestId('analytics-detail').getAttribute('data-kind'),'memory');
  await page.getByTestId('analytics-detail').getByRole('button',{name:'Back to overview',exact:true}).click();
  await page.goBack();assert.equal(await page.getByTestId('analytics-detail').getAttribute('data-kind'),'memory');
  const downloadWait=page.waitForEvent('download');
  await page.getByRole('button',{name:'Redacted export',exact:true}).click();
  const download=await downloadWait;
  const exported=await readFile(await download.path(),'utf8');
  const payload=JSON.parse(exported);
  assert.match(payload.privacy,/REDACTED/);
  assert.doesNotMatch(exported,/DISC-0[1-6]/,'Dynamic map keys must also be redacted');
  const strings=[];const walk=value=>{if(typeof value==='string')strings.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(walk);};walk(payload.data);
  assert.ok(strings.length>100);assert.ok(strings.every(value=>value==='********'));
  await privateDOM('Export does not reveal');
  assert.deepEqual(errors,[]);
  console.log(`Privacy and analytics screenshots: ${artifacts}`);
});
