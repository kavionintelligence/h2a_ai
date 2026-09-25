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
  assert.equal(config.rewrites.some(({source})=>new RegExp(`^${source}$`).test('/brand-marks/does-not-exist.png')),false,'Missing brand assets must not fall back to HTML');
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
  const assertBrand=async brand=>{
    const selector=`img[data-brand="${brand}"]`;
    await page.locator(selector).first().waitFor({state:'attached'});
    await page.waitForFunction(selector=>{
      const images=[...document.querySelectorAll(selector)];
      return images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0&&image.naturalHeight>0);
    },selector);
    for(const image of await page.locator(selector).all()){
      assert.equal(await image.getAttribute('src'),`/brand-marks/${brand}.png`);
      assert.ok((await image.getAttribute('alt'))?.trim(),'Brand images need accessible alternative text');
    }
  };
  for(const brand of ['byosync','h2a']){
    const response=await page.request.get(`${url}brand-marks/${brand}.png`);
    assert.equal(response.status(),200,`${brand} brand asset is served`);
    assert.match(response.headers()['content-type']||'',/^image\/png/);
    assert.deepEqual(await response.body(),await readFile(join(h2a,'public','brand-marks',`${brand}.png`)),`${brand} asset is published without modifying the original copied PNG`);
  }
  const missingBrand=await page.request.get(`${url}brand-marks/does-not-exist.png`);
  assert.equal(missingBrand.status(),404);
  assert.doesNotMatch(missingBrand.headers()['content-type']||'',/text\/html/);
  await page.goto(url);await page.getByTestId('access-login').waitFor();
  await assertBrand('byosync');await assertBrand('h2a');
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
  await page.getByRole('heading',{name:'Welcome to the dashboard.',exact:true}).waitFor();
  const welcomeName=page.locator('[data-private-field="Welcome name"]');
  assert.equal(await welcomeName.getAttribute('data-revealed'),'false');
  assert.equal(await welcomeName.locator('.privacy-mask').innerText(),'********');
  assert.doesNotMatch(await page.locator('.access-welcome').innerText(),/Varun/);
  await welcomeName.getByRole('button',{name:'Show Welcome name',exact:true}).click();
  await welcomeName.locator('.privacy-value').waitFor();
  assert.equal(await welcomeName.locator('.privacy-value').innerText(),'Varun');
  await welcomeName.getByRole('button',{name:'Hide Welcome name',exact:true}).click();
  assert.equal(await welcomeName.getAttribute('data-revealed'),'false');
  await assertBrand('byosync');
  assert.equal(await page.getByTestId('tenant-sarvodaya').isDisabled(),true);
  assert.equal(await page.getByTestId('tenant-deplomact').isDisabled(),true);
  assert.equal(await page.getByTestId('tenant-joon').isEnabled(),true);
  await page.screenshot({path:join(artifacts,'hospitals-desktop.png'),fullPage:true});
  await page.getByTestId('tenant-joon').click();
  await page.getByRole('heading',{name:'Your hospital. Connected and accountable.'}).waitFor();
  await assertBrand('byosync');
  assert.equal(await page.locator('[data-private-field="Account name"]').getAttribute('data-revealed'),'false','Account identity remains private after opening the hospital');
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
    await assertBrand('byosync');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Selector width');
    await page.screenshot({path:join(artifacts,`hospitals-${viewport.width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByTestId('access-login').waitFor();
    await assertBrand('byosync');await assertBrand('h2a');
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
