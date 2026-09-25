#!/usr/bin/env node
/**
 * H2A demonstration recorder.
 *
 * Launches the real Electron product once per demonstration scene, drives the
 * scene through the product's own controls and control-plane API, records the
 * window to video, and writes an honest manifest of what each recording shows.
 *
 * Usage:
 *   node tools/demo-recorder/record-demo.mjs                  # all scenes
 *   node tools/demo-recorder/record-demo.mjs --only 06,07      # selected scenes
 *   node tools/demo-recorder/record-demo.mjs --data-root <dir> # reuse a session
 *   node tools/demo-recorder/record-demo.mjs --no-mp4          # keep webm only
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { collectVideo, installOverlay, launchApp } from './harness.mjs';
import { scenes } from './scenes.mjs';

const run = promisify(execFile);
const projectRoot = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name) => args.includes(name);

const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/gu, '').slice(0, 14);
const videosRoot = resolve(flag('--out') ?? join(projectRoot, 'videos'));
const sessionRoot = resolve(flag('--data-root') ?? join(projectRoot, 'data', 'demo-recordings', stamp));
const dataRoot = join(sessionRoot, 'session');
const storefrontRoot = join(sessionRoot, 'storefront');
const workRoot = join(sessionRoot, 'video-work');
const wantMp4 = !has('--no-mp4');

const only = (flag('--only') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const selected = only.length > 0 ? scenes.filter((scene, index) => only.includes(scene.id) || only.includes(String(index + 1).padStart(2, '0')) || only.includes(String(index + 1))) : scenes;

console.log(`H2A demonstration recorder`);
console.log(`  project root : ${projectRoot}`);
console.log(`  data root    : ${dataRoot}`);
console.log(`  storefront   : ${storefrontRoot}`);
console.log(`  videos       : ${videosRoot}`);
console.log(`  scenes       : ${selected.length} of ${scenes.length}`);

await mkdir(videosRoot, { recursive: true });
await mkdir(workRoot, { recursive: true });

/* ---------------------------------------------------------------- *
 * Session and disposable project preparation
 * ---------------------------------------------------------------- */

if (!existsSync(dataRoot)) {
  await mkdir(sessionRoot, { recursive: true });
  execFileSync(process.execPath, [join(projectRoot, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: projectRoot, stdio: 'pipe' });
  console.log('  created a clean demonstration session data root');
}

if (!existsSync(join(storefrontRoot, '.git'))) {
  await mkdir(join(storefrontRoot, 'src'), { recursive: true });
  await mkdir(join(storefrontRoot, 'content'), { recursive: true });
  await mkdir(join(storefrontRoot, 'tests'), { recursive: true });
  await writeFile(
    join(storefrontRoot, 'src', 'index.html'),
    '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Storefront</title></head>\n<body><main><h1>Clothing storefront</h1></main></body>\n</html>\n'
  );
  await writeFile(join(storefrontRoot, 'content', 'products.md'), '# Products\n\nPlaceholder catalogue content.\n');
  await writeFile(join(storefrontRoot, 'tests', 'smoke.test.mjs'), "process.exit(0);\n");
  await writeFile(
    join(storefrontRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'hp-governed-clothing-storefront',
        private: true,
        version: '0.0.0',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          typecheck: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"'
        }
      },
      null,
      2
    )}\n`
  );
  const git = (gitArgs) => execFileSync('git', gitArgs, { cwd: storefrontRoot, stdio: 'pipe' });
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'h2a-demo@example.invalid']);
  git(['config', 'user.name', 'H2A Demonstration Recorder']);
  git(['add', '.']);
  git(['commit', '-m', 'base revision for the governed clothing storefront']);
  console.log('  created the disposable storefront git repository');
}

/* ---------------------------------------------------------------- *
 * Scene loop - one Electron launch and one video per scene
 * ---------------------------------------------------------------- */

const shared = {};
const results = [];

for (const [index, scene] of selected.entries()) {
  const ordinal = String(scenes.indexOf(scene) + 1).padStart(2, '0');
  const base = `${ordinal}-${scene.id}`;
  const videoDir = join(workRoot, base);
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });

  const notes = [];
  const note = (text) => {
    notes.push(text);
    console.log(`      · ${text}`);
  };

  console.log(`\n[${index + 1}/${selected.length}] ${base} - ${scene.title}`);
  const startedAt = new Date();
  let outcome = 'recorded';
  let failure = null;
  let application;
  let page;

  try {
    ({ application, page } = await launchApp({ projectRoot, dataRoot, videoDir }));
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await installOverlay(page, scene);
    page.on('load', () => void installOverlay(page, scene).catch(() => undefined));

    await scene.run({ page, application, note, state: shared, projectRoot, dataRoot, storefrontRoot });

    if (pageErrors.length > 0) {
      outcome = 'recorded-with-renderer-errors';
      note(`Renderer errors during this scene: ${pageErrors.slice(0, 5).join(' | ')}`);
    }
  } catch (error) {
    outcome = 'failed';
    failure = error instanceof Error ? `${error.message}` : String(error);
    console.log(`      ! scene error: ${failure}`);
  } finally {
    await application?.close().catch(() => undefined);
  }

  const webm = await collectVideo(videoDir, join(videosRoot, `${base}.webm`));
  let mp4 = null;
  if (webm && wantMp4) {
    mp4 = join(videosRoot, `${base}.mp4`);
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { maxBuffer: 1 << 26 });
    } catch (error) {
      mp4 = null;
      note(`mp4 conversion unavailable: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }

  results.push({
    order: ordinal,
    id: scene.id,
    title: scene.title,
    subtitle: scene.subtitle ?? '',
    outcome,
    failure,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    duration_seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    video_webm: webm ? `${base}.webm` : null,
    video_mp4: mp4 ? `${base}.mp4` : null,
    observations: notes
  });
  await rm(videoDir, { recursive: true, force: true }).catch(() => undefined);
  console.log(`      -> ${outcome}${webm ? ` · ${base}.webm` : ' · no video captured'}`);
}

/* ---------------------------------------------------------------- *
 * Manifest and honest README
 * ---------------------------------------------------------------- */

const manifest = {
  generated_at: new Date().toISOString(),
  product: 'H2A MVP (local, non-commercial demonstration)',
  runbook: 'HP_CTO_CISO_BUTTON_BY_BUTTON_DEMONSTRATION_RUNBOOK.md',
  trust_ceiling: 'connected-observed',
  liveness_mode: 'demo-bypass',
  data_path: dataRoot,
  storefront_repository: storefrontRoot,
  automation: {
    driver: 'Playwright _electron against the built Electron app (out/main)',
    human_proof: 'Deterministic capture vectors submitted through window.h2a.enrollHumanV2 / verifyHumanV2 - the real BCH fuzzy extractor performs the match; no camera and no live human is present',
    federation: 'Single local root only - no second H2A root was paired, so no remote provider execution is claimed',
    providers: 'Local provider CLIs are invoked for real; each recorded node status and reason code is whatever the product persisted'
  },
  scenes: results
};
await writeFile(join(videosRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const readme = [
  '# H2A demonstration recordings',
  '',
  `Generated ${manifest.generated_at} from the local H2A MVP.`,
  '',
  '## What these recordings are',
  '',
  'Each file is one scene of `HP_CTO_CISO_BUTTON_BY_BUTTON_DEMONSTRATION_RUNBOOK.md`, recorded while an',
  'automated operator drove the real Electron product. Every record shown on screen (identity, authority,',
  'Passport, runtime attestation, mandate, assignment, Context Grant, approval, output hash, evidence event)',
  'was produced by the product itself, through the same controls and the same control-plane API a live',
  'operator uses.',
  '',
  '## What these recordings are not',
  '',
  '- **Not a liveness-backed identity ceremony.** Human Proof is enrolled and verified with deterministic',
  '  capture vectors through the real BCH fuzzy extractor. No camera and no physically present human is in',
  '  the loop, and the product stays in `demo-bypass` liveness mode. Do not describe any proof here as high',
  '  assurance.',
  '- **Not a two-root federation demonstration.** Only one local H2A root ran, so no remote provider',
  '  execution is claimed anywhere in these videos.',
  '- **Not Phase 51 final operator acceptance.** That ceremony requires required-liveness verification for',
  '  two physically present enrolled people and is out of scope for an automated recording.',
  '- **Not a trust promotion.** Every scene stays at the `connected-observed` ceiling.',
  '',
  '## Scenes',
  '',
  '| # | Video | Scene | Outcome | Duration |',
  '|---|---|---|---|---|',
  ...results.map((scene) => `| ${scene.order} | \`${scene.video_mp4 ?? scene.video_webm ?? 'none'}\` | ${scene.title} — ${scene.subtitle} | ${scene.outcome} | ${scene.duration_seconds}s |`),
  '',
  '## Recorded observations',
  '',
  'These are read back from persisted product state during the recording, not narrated from a script.',
  '',
  ...results.flatMap((scene) => [`### ${scene.order} · ${scene.title}`, '', ...(scene.failure ? [`- **scene error:** ${scene.failure}`] : []), ...scene.observations.map((observation) => `- ${observation}`), '']),
  '## Reproducing',
  '',
  '```',
  'node tools/demo-recorder/record-demo.mjs',
  '```',
  '',
  `Canonical data root for this run: \`${dataRoot}\``,
  ''
].join('\n');
await writeFile(join(videosRoot, 'README.md'), `${readme}\n`, 'utf8');

const failed = results.filter((scene) => scene.outcome === 'failed');
console.log(`\nRecorded ${results.filter((scene) => scene.video_webm).length}/${results.length} scenes into ${videosRoot}`);
if (failed.length > 0) console.log(`Scenes with errors: ${failed.map((scene) => scene.id).join(', ')}`);
console.log(`Manifest: ${join(videosRoot, 'MANIFEST.json')}`);
