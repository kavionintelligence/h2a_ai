import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, h2a } from '../scripts/demo-runtime.mjs';

// Run npm run build:hosted first. Tests the artifact Vercel actually publishes.
test('hosted login, hospital selection, mobile, logout and local-workspace isolation', {timeout:90000}, async t=>{
  const web=resolve(root,'hosted-dist');
  assert.ok(existsSync(join(web,'index.html')),'Build hosted-dist first');
  const config=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const headers=Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value]));
  const requests=[];
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/'))requests.push(path);
    const filename=resolve(web,path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,''));
    if(!filename.startsWith(web+sep)){res.writeHead(403).end();return;}
    try{const bytes=await readFile(filename);res.writeHead(200,{...headers,'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'})[extname(filename)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const require=createRequire(join(h2a,'package.json'));const {chromium}=require('playwright');
  const executablePath=[chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  const browser=await chromium.launch({executablePath,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];const external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
  const artifacts=join(root,'.test-artifacts',`portal-${randomUUID()}`);await mkdir(artifacts,{recursive:true});
  t.after(async()=>{await page.screenshot({path:join(artifacts,'final.png'),fullPage:true}).catch(()=>{});await browser.close();await new Promise(r=>server.close(r));});
  const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);await page.getByTestId('access-login').waitFor();
  await page.screenshot({path:join(artifacts,'login-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Enter the presentation login ID.',{exact:true}).waitFor();
  await page.getByLabel('Login ID',{exact:true}).fill('varun');
  await page.getByLabel('Password',{exact:true}).fill('incorrect');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Password',{exact:true}).fill('ByoSync@123');
  await page.getByRole('button',{name:'Show password',exact:true}).click();
  assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
  await page.getByRole('button',{name:'Hide password',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Welcome to the dashboard, Varun.'}).waitFor();
  assert.equal(await page.getByTestId('tenant-sarvodaya').isDisabled(),true);
  assert.equal(await page.getByTestId('tenant-deplomact').isDisabled(),true);
  assert.equal(await page.getByTestId('tenant-joon').isEnabled(),true);
  await page.screenshot({path:join(artifacts,'hospitals-desktop.png'),fullPage:true});
  await page.getByTestId('tenant-joon').click();
  await page.getByRole('heading',{name:'Your hospital. Connected and accountable.'}).waitFor();
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('byosync.presentation-access.v1')));
  assert.deepEqual(stored,{signedIn:true,tenant:'joon'});
  assert.equal(await page.evaluate(()=>JSON.stringify({...sessionStorage}).includes('ByoSync@123')),false);
  await page.reload();await page.getByTestId('portal-workspace').waitFor();
  await page.getByRole('button',{name:'Play activity',exact:true}).click();
  await page.getByRole('button',{name:'Back to hospitals',exact:true}).click();
  const paused=await page.evaluate(()=>localStorage.getItem('byosync.enterprise-simulation.v2'));
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(()=>localStorage.getItem('byosync.enterprise-simulation.v2')),paused,'Leaving the hospital stops playback');
  await page.getByTestId('tenant-joon').click();
  await page.getByRole('button',{name:'Play activity',exact:true}).waitFor();
  await page.goto(`${url}?mode=workspace`);
  await page.getByRole('heading',{name:'Your hospital. Connected and accountable.'}).waitFor();
  assert.deepEqual(requests,[],'Hosted build never calls the local backend, even via mode=workspace');
  for(const viewport of [{width:390,height:844},{width:768,height:1024}]){
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Workspace width');
    await page.getByRole('button',{name:'Back to hospitals',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Selector width');
    await page.screenshot({path:join(artifacts,`hospitals-${viewport.width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByTestId('access-login').waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('byosync.presentation-access.v1')),null);
    assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),'');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Login width');
    await page.screenshot({path:join(artifacts,`login-${viewport.width}.png`),fullPage:true});
    await page.getByLabel('Login ID',{exact:true}).fill('varun');
    await page.getByLabel('Password',{exact:true}).fill('ByoSync@123');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByTestId('tenant-joon').click();
  }
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.reload();await page.getByTestId('access-login').waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(requests,[]);
  console.log(`Portal screenshots: ${artifacts}`);
});
