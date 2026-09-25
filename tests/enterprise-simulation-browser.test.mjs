import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildDemo } from '../scripts/build-demo.mjs';
import { root, h2a } from '../scripts/demo-runtime.mjs';

async function revealField(scope,label){
  const field=scope.locator(`[data-private-field="${label}"]`).first();
  assert.equal(await field.getAttribute('data-revealed'),'false',`${label} begins masked`);
  assert.equal(await field.locator('.privacy-mask').innerText(),'********');
  await field.getByRole('button',{name:`Show ${label}`,exact:true}).click();
  await field.locator('.privacy-value').waitFor();
  assert.equal(await field.getAttribute('data-revealed'),'true');
  return field.locator('.privacy-value').innerText();
}

async function revealBlock(scope,label){
  const block=scope.locator(`[data-private-block="${label}"]`).first();
  assert.equal(await block.getAttribute('data-revealed'),'false',`${label} begins masked`);
  await block.getByRole('button',{name:`Show ${label}`,exact:true}).click();
  await block.getByRole('button',{name:`Hide ${label}`,exact:true}).waitFor();
  assert.equal(await block.getAttribute('data-revealed'),'true');
  return block;
}

function assertRedactedTree(value,path='data'){
  if(typeof value==='string')assert.equal(value,'********',`${path} withholds source strings`);
  else if(Array.isArray(value))value.forEach((item,index)=>assertRedactedTree(item,`${path}[${index}]`));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>assertRedactedTree(item,`${path}.${key}`));
}

async function readRedactedDownload(download){
  const value=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(value.privacy,'REDACTED — string fields withheld');
  assert.ok(value.data&&typeof value.data==='object');
  assertRedactedTree(value.data);
  return value.data;
}

test('enterprise scenario is populated, interactive, pausable, persistent and isolated', {timeout:180000}, async t=>{
  await buildDemo();
  const web=resolve(h2a,'apps/web/dist');const apiRequests=[];
  const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/'))apiRequests.push(path);const filename=resolve(web,path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,''));if(!filename.startsWith(web+sep)){res.writeHead(403).end();return;}try{const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(filename)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const require=createRequire(join(h2a,'package.json'));const {chromium}=require('playwright');
  const executablePath=[chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  const browser=await chromium.launch({executablePath,headless:true});
  const context=await browser.newContext({viewport:{width:1600,height:1050},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const artifacts=join(root,'.test-artifacts',`enterprise-${randomUUID()}`);await mkdir(artifacts,{recursive:true});
  t.after(async()=>{await page.screenshot({path:join(artifacts,'final.png'),fullPage:true}).catch(()=>{});await browser.close();await new Promise(r=>server.close(r));});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByLabel('Login ID',{exact:true}).fill('varun');
  await page.getByLabel('Password',{exact:true}).fill('ByoSync@123');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByTestId('tenant-joon').click();
  await page.getByRole('heading',{name:'Your hospital. Connected and accountable.'}).waitFor();
  assert.match(await page.locator('.sim-disclosure').innerText(),/Simulation environment/);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('byosync.enterprise-simulation.v2')));
  assert.equal((await read()).queue.length,20);
  for(const name of ['Overview','Security posture','Organization','AI estate','Discovery','Task pipeline','Rooms','Company brain','Decisions','Evidence']){
    await page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name,exact:true}).click();
    await page.screenshot({path:join(artifacts,`${name.toLowerCase().replaceAll(' ','-')}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: desktop width`);
  }
  await page.getByRole('button',{name:'AI estate',exact:true}).click();
  const estate=page.getByTestId('agent-estate-explorer');
  await estate.getByRole('heading',{name:'48 accountable agent identities'}).waitFor();
  assert.match(await estate.locator('.ae-chart-key').innerText(),/30[\s\S]*18/);
  assert.match(await estate.locator('.ae-status-segments').innerText(),/1[\s\S]*Approved[\s\S]*1[\s\S]*Waiting for approval[\s\S]*2[\s\S]*Blocked[\s\S]*2[\s\S]*Unverified/);
  await estate.locator('[data-agent-id="AG-0-0"]').getByRole('button',{name:'Inspect agent',exact:true}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Agent details',exact:true}).waitFor();
  const agentDetails=page.getByTestId('agent-security-details');
  assert.doesNotMatch(await agentDetails.innerText(),/Maya Rao/);
  assert.equal(await revealField(agentDetails,'Legal hardware owner'),'Joon’s Hospital');
  assert.equal(await revealField(agentDetails,'Device custodian'),'Maya Rao');
  assert.match(await agentDetails.innerText(),/Legal owner[\s\S]*Joon’s Hospital[\s\S]*Assigned to \/ custodian[\s\S]*Maya Rao/);
  assert.match(await agentDetails.innerText(),/Receiving-team human approvals:[\s\S]*0[\s\S]*recorded/);
  await agentDetails.getByRole('button',{name:/Mandate checks/}).click();
  assert.match(await agentDetails.locator('.ed-proof-events').innerText(),/Authority evaluated/);
  await agentDetails.getByRole('button',{name:/Human approvals/}).click();
  assert.match(await agentDetails.locator('.ed-proof-events').innerText(),/Human approved exact action/);
  await page.screenshot({path:join(artifacts,'agent-device-authority.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await estate.getByRole('tab',{name:/Devices/}).click();await page.getByLabel('Device ownership',{exact:true}).selectOption('BYOD');
  assert.equal(await estate.locator('[data-device-id]').count(),6);
  await estate.locator('[data-device-id="DEVICE-H-0-5"]').getByRole('button',{name:'Inspect device',exact:true}).click();
  assert.equal(await revealField(page.getByTestId('estate-device-detail'),'Legal hardware owner'),'Om Prakash');
  assert.match(await page.getByTestId('estate-device-detail').innerText(),/Legal hardware owner[\s\S]*Om Prakash[\s\S]*Work profile|Work profile[\s\S]*Legal hardware owner[\s\S]*Om Prakash/i);
  await page.getByTestId('estate-device-detail').locator('.ae-detail-person').click();
  await page.getByRole('dialog').getByRole('heading',{name:'Person details',exact:true}).waitFor();
  assert.equal(await revealField(page.getByTestId('person-device-details'),'Device name'),'Om’s personal laptop');
  assert.match(await page.getByTestId('person-device-details').innerText(),/Om’s personal laptop[\s\S]*BYOD/);
  await page.getByTestId('person-device-details').getByText('Visibility and device-control limits',{exact:true}).click();
  assert.match(await page.getByTestId('person-device-details').innerText(),/private apps and files are not inventoried/);
  await page.screenshot({path:join(artifacts,'person-byod-footprint.png'),fullPage:true});await page.keyboard.press('Escape');
  await estate.getByRole('tab',{name:/People/}).click();
  await page.getByLabel('Department filter').selectOption('Technology');assert.equal(await estate.locator('[data-person-id]').count(),7);
  await page.getByLabel('Department filter').selectOption('All');
  await estate.getByRole('tab',{name:/Discovered software/}).click();
  await page.getByLabel('Software authorization').selectOption('Blocked');assert.equal(await estate.locator('[data-observation-id]').count(),2);
  await estate.locator('[data-observation-id="DISC-03"]').getByRole('button',{name:'Inspect evidence'}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Discovery details',exact:true}).waitFor();
  assert.equal(await revealField(page.getByTestId('discovery-device-details'),'Device name'),'Madhav’s personal laptop');
  assert.match(await page.getByTestId('discovery-device-details').innerText(),/Blocked[\s\S]*Madhav’s personal laptop[\s\S]*BYOD/);await page.keyboard.press('Escape');
  await estate.getByRole('tab',{name:/Tool access/}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ae-tool-card .estate-tool-mark img')].length===6&&[...document.querySelectorAll('.ae-tool-card .estate-tool-mark img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:join(artifacts,'estate-tool-access.png'),fullPage:true});
  await estate.getByRole('button',{name:'Compare mandate with observed use'}).first().click();
  await page.getByTestId('estate-tool-detail').waitFor();
  assert.match(await page.getByTestId('estate-tool-detail').innerText(),/repository.read[\s\S]*OBSERVED/);
  await page.getByTestId('estate-tool-detail').getByRole('button',{name:'Open latest task'}).first().click();
  await page.getByRole('dialog').getByRole('heading',{name:'Task details',exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('heading',{name:'Identity travels with the work',exact:true}).waitFor();
  assert.match(await revealField(page.getByRole('dialog'),'Record ID'),/^(HIST|LIVE)-/);
  await page.keyboard.press('Escape');
  // The default landing page is the hospital simulator; every team has a usable nested map.
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  assert.match(await page.locator('.hospital-kpis').innerText(),/42[\s\S]*48[\s\S]*18/);
  assert.doesNotMatch(await page.locator('body').innerText(),/6,000|6000|Meridian/);
  const map=page.getByTestId('collaboration-explorer');
  for(const team of ['Technology','Cybersecurity','Design','Sales','Marketing','Management']){
    await map.locator(`[data-team="${team}"]:visible`).first().click();
    assert.equal(await map.getAttribute('data-level'),'team');
    assert.match(await map.locator('.collab-metric-grid').innerText(),/7[\s\S]*8/);
    if(team==='Technology')await page.screenshot({path:join(artifacts,'hospital-team-map.png'),fullPage:true});
    await map.locator('[data-room]:visible').first().click();
    assert.equal(await map.getAttribute('data-level'),'room');
    await map.getByLabel('Trace task in room').waitFor();
    const edge=map.locator('[data-edge-id="a2a"]');
    await edge.focus();await map.locator('.collab-tooltip').waitFor();
    await edge.press('Enter');
    assert.match(await map.getByTestId('connection-detail').innerText(),/Permitted scope[\s\S]*Mandate[\s\S]*Passport[\s\S]*Accountable human[\s\S]*Exact task[\s\S]*Data boundary/i);
    if(team==='Technology'){
      assert.match(await revealField(map.getByTestId('connection-detail'),'mandate identifier'),/^SIM-MND-/);
      const narrative=await revealBlock(map.getByTestId('connection-detail'),'Connection narrative');
      assert.ok((await narrative.innerText()).length>80,'Connection narrative is available through an explicit reveal');
    }
    if(team==='Technology')await page.screenshot({path:join(artifacts,'hospital-room-trace.png'),fullPage:true});
    await map.getByRole('button',{name:'Back in collaboration map'}).click();
    assert.equal(await map.getAttribute('data-level'),'team');
    await map.getByRole('button',{name:'Back in collaboration map'}).click();
    assert.equal(await map.getAttribute('data-level'),'company');
  }
  await page.locator('.hospital-deliverables button').first().click();
  await page.getByRole('dialog').getByRole('heading',{name:'Task details',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Completed task deliverable',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').locator('.hospital-output').count(),0,'Completed output is not rendered before reveal');
  await revealBlock(page.getByRole('dialog'),'Completed deliverable');
  assert.ok(await page.getByRole('dialog').locator('.hospital-output table').count()>0,'Deliverable accountability renders as a readable table');
  assert.match(await page.getByRole('dialog').locator('.hospital-output').innerText(),/synthetic operational example/,'Revealed deliverable retains its provenance');
  const taskOutput=page.waitForEvent('download');await page.getByRole('button',{name:'Download redacted deliverable',exact:true}).click();
  const taskDownload=await taskOutput;assert.equal(taskDownload.suggestedFilename(),'ByoSync-redacted-deliverable.json');
  const taskExport=await readRedactedDownload(taskDownload);
  assert.ok(taskExport.output.sections.length>0,'Redaction retains the structured deliverable shape');
  assert.equal(taskExport.task.baseline,8,'Redaction preserves numeric measurements');
  await page.screenshot({path:join(artifacts,'hospital-completed-output.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Company brain',exact:true}).click();
  const brain=page.getByTestId('company-brain-explorer');
  assert.equal(await brain.evaluate(el=>getComputedStyle(el).colorScheme),'light');
  await brain.getByTestId('brain-governance-flow').waitFor();
  for(const team of ['Technology','Cybersecurity','Design','Sales','Marketing','Management']){
    const teamNode=brain.locator(`[data-team="${team}"]:visible`).first();await teamNode.hover();
    assert.match(await brain.getByTestId('brain-hover-card').innerText(),/7 people and 8 agents/);
    await teamNode.click();assert.equal(await brain.getAttribute('data-level'),'team');
    await brain.getByLabel('Knowledge review status').selectOption('Published');
    const record=brain.locator('[data-memory-id]:visible').first();await record.hover();
    assert.match(await brain.getByTestId('brain-hover-card').innerText(),/Reviewer:[\s\S]*Scope:/);
    await record.click();
    assert.match(await brain.getByTestId('brain-knowledge-details').innerText(),/Reviewed by[\s\S]*Download deliverable/i);
    if(team==='Technology'){
      const knowledge=brain.getByTestId('brain-knowledge-details');
      assert.match(await revealField(knowledge,'knowledge identifier'),/^MEM-/);
      const reviewedContext=await revealBlock(knowledge,'Reviewed context');
      assert.match(await reviewedContext.innerText(),/Reuse only within/);
      const brainOutput=page.waitForEvent('download');await brain.getByRole('button',{name:'Download deliverable',exact:true}).click();
      const brainDownload=await brainOutput;assert.equal(brainDownload.suggestedFilename(),'redacted-deliverable.md');
      const brainText=await readFile(await brainDownload.path(),'utf8');
      assert.match(brainText,/Title: \*{8}[\s\S]*Task identifier: \*{8}[\s\S]*Accountable human: \*{8}[\s\S]*Agent: \*{8}[\s\S]*Task content: \*{8}/);
      assert.doesNotMatch(brainText,/HIST-\d+|LIVE-\d+|MEM-|SIM-PASS|SIM-MND|Maya Rao|Priya Desai/);
      await brain.getByRole('button',{name:'View complete deliverable',exact:true}).click();
      await page.getByRole('dialog').getByRole('heading',{name:'Completed task deliverable',exact:true}).waitFor();
      assert.equal(await page.getByRole('dialog').locator('.hospital-output').count(),0,'Navigation remasks the completed output');
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
      await page.screenshot({path:join(artifacts,'hospital-brain-record.png'),fullPage:true});
    }
    await brain.getByRole('button',{name:'Back in company brain'}).click();
    await brain.getByRole('button',{name:'Back in company brain'}).click();
    assert.equal(await brain.getAttribute('data-level'),'company');
  }
  await page.getByRole('button',{name:'Security posture',exact:true}).click();
  await page.getByRole('heading',{name:'Know the exposure. Know the limits. Decide.',exact:true}).waitFor();
  const selectConcern=async title=>{
    const concerns=page.locator('.sp-concerns > button');
    for(let index=0;index<await concerns.count();index++){
      await concerns.nth(index).click();
      const revealed=await revealField(page.locator('.sp-detail'),'Concern title');
      if(title.test(revealed))return;
    }
    assert.fail(`No concern matched ${title} after explicitly revealing each title`);
  };
  await page.locator('.sp-filters').getByRole('button',{name:'Unknown',exact:true}).click();
  await selectConcern(/Modeled inventory is not measured device coverage/);
  assert.match(await page.locator('.sp-detail').innerText(),/not measured device coverage/);
  await page.getByText('Data protection',{exact:true}).click();
  assert.match(await page.locator('.sp-gate[open]').innerText(),/encryption\/key ownership/);
  const securityExport=page.waitForEvent('download');await page.getByRole('button',{name:'Export redacted brief',exact:true}).click();
  const securityDownload=await securityExport;assert.match(securityDownload.suggestedFilename(),/SYNTHETIC-security-brief/);
  const securityData=JSON.parse(await readFile(await securityDownload.path(),'utf8'));
  assertRedactedTree(securityData.posture,'posture');
  assert.equal(securityData.posture.registered,48);
  assert.equal(securityData.classification,'Synthetic scenario');
  await page.locator('.sp-filters').getByRole('button',{name:'Attention',exact:true}).click();
  await selectConcern(/Use blocked · Gemini/);
  await page.getByRole('button',{name:'Review restriction and enforcement evidence',exact:true}).click();
  await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Fictional discovery fixture/);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Task pipeline',exact:true}).click();
  await page.locator('.sim-task-card').first().click();
  await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Identity travels with the work/);
  await page.screenshot({path:join(artifacts,'identity-inspector.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByLabel('Scripted human decisions',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Decisions',exact:true}).click();
  await page.getByRole('button',{name:'Review exact request',exact:true}).first().click();
  const dialog=page.getByRole('dialog');const approve=dialog.getByRole('button',{name:/Approve exact action|Publish reviewed memory/});
  assert.equal(await approve.isDisabled(),true);
  await revealBlock(dialog,'Exact request scope');
  assert.ok((await revealField(dialog,'Request reviewer')).length>0,'Reviewer can inspect scope and accountable identity before deciding');
  await dialog.getByLabel('I reviewed this scenario request, scope and accountable owner.',{exact:true}).check();
  await approve.click();assert.ok((await read()).events.some(e=>e.origin==='Presenter decision'));
  await page.keyboard.press('Escape');
  await page.getByLabel('Scripted human decisions',{exact:true}).check();
  await page.getByLabel('Playback speed').selectOption('400');
  await page.getByRole('button',{name:'Play activity',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('byosync.enterprise-simulation.v2')).tick>=4);
  await page.getByRole('button',{name:'Pause activity',exact:true}).click();
  const paused=(await read()).tick;await page.waitForTimeout(900);assert.equal((await read()).tick,paused);
  await page.reload();assert.equal((await read()).tick,paused);await page.getByRole('button',{name:'Play activity',exact:true}).waitFor();
  const savedDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Redacted export',exact:true}).click();
  const sessionDownload=await savedDownload;assert.match(sessionDownload.suggestedFilename(),/SYNTHETIC/);
  const sessionData=await readRedactedDownload(sessionDownload);
  assert.equal(sessionData.company_population,42);
  assert.equal(sessionData.scenario.people.length,42);
  assert.equal(sessionData.scenario.agents.length,48);
  assert.equal(sessionData.playback.tick,paused);
  await page.getByRole('button',{name:'AI estate',exact:true}).click();await page.getByLabel('Department filter').selectOption('Sales');
  assert.equal(await page.locator('[data-agent-id]').count(),8);await page.getByLabel('Agent type').selectOption('Personal');assert.equal(await page.locator('[data-agent-id]').count(),3);
  await page.getByLabel('Department filter').selectOption('All');
  await page.getByRole('button',{name:'Discovery',exact:true}).click();
  await page.locator('.ed-discovery-cards .ed-observation').first().click();
  await page.getByRole('button',{name:'Authorize in scenario',exact:true}).click();
  assert.equal((await read()).discovery['DISC-01'],'Authorized');
  assert.ok((await read()).events.some(e=>e.task==='DISC-01'));
  await page.keyboard.press('Escape');
  for(const width of [768,390]){await page.setViewportSize({width,height:900});for(const name of ['Overview','Security posture','Organization','AI estate','Discovery','Task pipeline','Rooms','Company brain','Decisions','Evidence']){if(width<761)await page.getByRole('button',{name:'Open simulation navigation',exact:true}).click();await page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name,exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}: ${width}px overflow`);}await page.screenshot({path:join(artifacts,`responsive-${width}.png`),fullPage:false});}
  await page.getByRole('button',{name:'Open simulation navigation',exact:true}).click();
  await page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name:'AI estate',exact:true}).click();
  for(const tab of ['Agents','Devices','People','Discovered software','Tool access']){
    await estate.locator(`[data-estate-tab="${tab}"]`).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${tab}: mobile estate width`);
  }
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(artifacts,'estate-mobile.png'),fullPage:false});
  await estate.locator('[data-estate-tab="Agents"]').click();
  await estate.locator('[data-agent-id="AG-0-0"]').getByRole('button',{name:'Inspect agent',exact:true}).click();
  await page.getByTestId('agent-security-details').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Agent device inspector: mobile width');
  await page.getByRole('button',{name:'Close simulation inspector',exact:true}).click();
  await page.getByRole('button',{name:'Open simulation navigation',exact:true}).click();
  await page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name:'Rooms',exact:true}).click();
  await map.locator('[data-team="Technology"]:visible').first().click();
  assert.equal(await map.getAttribute('data-level'),'team');
  await map.locator('[data-room]:visible').first().click();
  assert.equal(await map.getAttribute('data-level'),'room');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Room drill-down: mobile width');
  await map.getByRole('button',{name:'Back in collaboration map'}).click();
  await map.getByRole('button',{name:'Back in collaboration map'}).click();
  await page.getByRole('button',{name:'Open simulation navigation',exact:true}).click();
  await page.getByRole('navigation',{name:'Simulation navigation'}).getByRole('button',{name:'Company brain',exact:true}).click();
  await brain.locator('[data-team="Technology"]:visible').first().click();
  await brain.getByLabel('Knowledge review status').selectOption('Published');
  await brain.locator('[data-memory-id]:visible').first().click();
  await brain.getByRole('button',{name:'Download deliverable',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Brain record: mobile width');
  await page.screenshot({path:join(artifacts,'hospital-brain-mobile.png'),fullPage:true});
  assert.deepEqual(apiRequests,[],'Scenario must not call live backend APIs');assert.deepEqual(errors,[]);
  console.log(`Simulation screenshots: ${artifacts}`);
});
