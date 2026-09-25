import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDataRoot = join(projectRoot, 'data', 'demo-sessions', 'phase23-guided-20260821175015');
const defaultOutputRoot = join(projectRoot, 'docs', 'plan4', 'evidence', 'phase33');
const sharedTrace = 'phase22_234eca22-ff97-4764-891b-763af7e2d82b';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function readEvents(dataRoot) {
  const content = await readFile(join(dataRoot, 'traces', 'tr_platform.jsonl'), 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function recursiveFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? recursiveFiles(join(directory, entry.name))
    : [join(directory, entry.name)]))).flat();
}

function hasEvent(events, eventType, reasonCode) {
  return events.some((event) => event.event_type === eventType
    && event.trace_id === sharedTrace
    && (!reasonCode || event.payload?.reason_code === reasonCode));
}

function evidenceFor(events, eventType, reasonCode) {
  return events.filter((event) => event.event_type === eventType
    && event.trace_id === sharedTrace
    && (!reasonCode || event.payload?.reason_code === reasonCode))
    .map((event) => event.event_id);
}

function phase(number, status, checks, unfinished = []) {
  return { phase: number, status, checks, unfinished };
}

export async function reconcilePlan3({ dataRoot = defaultDataRoot } = {}) {
  const events = await readEvents(dataRoot);
  const ceremony = (await readJson(join(dataRoot, 'ceremony', 'phase24-state-v1.json'))).data;
  const bootstrap = (await readJson(join(dataRoot, 'bootstrap', 'phase25-state-v1.json'))).data;
  const phase26 = (await readJson(join(dataRoot, 'collaboration', 'phase26-state-v1.json'))).data;
  const phase27 = (await readJson(join(dataRoot, 'contexts', 'phase27-state-v1.json'))).data;
  const phase28 = (await readJson(join(dataRoot, 'authority', 'phase28-state-v1.json'))).data;
  const controlRegistry = await readJson(join(projectRoot, 'docs', 'plan3', 'CONTROL_REGISTRY.json'));
  const screenshots = (await recursiveFiles(join(projectRoot, 'docs', 'plan3', 'evidence', 'phase31')))
    .filter((path) => path.endsWith('.png'));
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id);
  const ceremonySteps = Object.fromEntries(activeCeremony.steps.map((step) => [step.step_id, step]));

  const replayRefs = evidenceFor(events, 'FEDERATION_ENVELOPE_REJECTED', 'FEDERATION_SEQUENCE_REPLAY');
  const acceptedFederation = ['task', 'ack', 'heartbeat'].map((payloadType) => ({
    payload_type: payloadType,
    present: events.some((event) => event.event_type === 'FEDERATION_ENVELOPE_ACCEPTED'
      && event.trace_id === sharedTrace
      && event.payload?.payload_type === payloadType),
  }));
  const crossPersonAttemptIds = [
    'hpa2_b5bb0f99-f115-4e2b-a884-f195ef990d99',
    'hpa2_05ed45da-ad1e-432d-962c-ffc531d783eb',
  ];
  const crossPersonRefs = events.filter((event) => crossPersonAttemptIds.includes(event.subject?.id)
    && event.event_type === 'HUMAN_PROOF_ATTEMPTED_V2'
    && event.payload?.reason_code === 'BIOMETRIC_MISMATCH'
    && event.payload?.matched_record_count === 0).map((event) => event.event_id);
  const phase30Predicates = [
    ['replay', (event) => event.payload?.reason_code === 'REPLAY_DETECTED'],
    ['forged-approval', (event) => event.payload?.reason_code === 'APPROVAL_SIGNATURE_INVALID'],
    ['over-broad-delegation', (event) => event.payload?.reason_code === 'CHILD_EXPANDS_PARENT_AUTHORITY'],
    ['context-leakage', (event) => event.payload?.reason_code === 'NO_FIELDS_AUTHORIZED'],
    ['federation-tamper', (event) => event.payload?.reason_code === 'FEDERATION_PAYLOAD_HASH_INVALID'],
    ['provider-failure', (event) => event.payload?.termination_reason === 'PROVIDER_EXIT_NONZERO'],
  ];
  const phase30AttackChecks = phase30Predicates.map(([attack, predicate]) => {
    const match = events.find((event) => event.trace_id === sharedTrace && predicate(event));
    return { attack, present: Boolean(match), evidence_ref: match?.event_id ?? null };
  });
  const containmentPredicates = [
    ['operator-cancel', (event) => event.payload?.termination_reason?.startsWith('OPERATOR_CANCELLED')],
    ['authority-revocation', (event) => event.payload?.termination_reason === 'PHASE30_AUTHORITY_REVOKED'],
    ['restart-recovery', (event) => event.payload?.termination_reason === 'HOST_PROCESS_RESTARTED'],
  ];
  const containmentChecks = containmentPredicates.map(([control, predicate]) => {
    const match = events.find((event) => event.trace_id === sharedTrace && predicate(event));
    return { control, present: Boolean(match), evidence_ref: match?.event_id ?? null };
  });

  const phases = [
    phase(23, controlRegistry.routes.length === 10 && controlRegistry.controls.length >= 108 && screenshots.length === 40 ? 'complete' : 'in-progress', {
      routes: controlRegistry.routes.length,
      controls: controlRegistry.controls.length,
      screenshots: screenshots.length,
    }),
    phase(24, activeCeremony?.trace_id === sharedTrace ? 'complete' : 'in-progress', {
      ceremony_id: activeCeremony?.ceremony_id ?? null,
      trace_id: activeCeremony?.trace_id ?? null,
      persisted_status: activeCeremony?.status ?? null,
    }),
    phase(25, bootstrap.steps.every((step) => step.status === 'passed') ? 'complete' : 'in-progress', {
      step_statuses: bootstrap.steps.map((step) => ({ step_id: step.step_id, status: step.status, evidence_refs: step.evidence_refs })),
    }),
    phase(26, phase26.lanes?.every((lane) => lane.status === 'succeeded') ? 'complete' : 'in-progress', {
      lane_statuses: phase26.lanes?.map((lane) => ({ lane: lane.lane, status: lane.status, output_hash: lane.output_hash })) ?? [],
    }),
    phase(27, phase27.lanes?.every((lane) => lane.status === 'acknowledged') && hasEvent(events, 'CONTEXT_DISCLOSURE_DENIED', 'CONTEXT_GRANT_REVOKED') ? 'complete' : 'in-progress', {
      lane_statuses: phase27.lanes?.map((lane) => ({ lane: lane.lane, status: lane.status, receipt_hash: lane.receipt_hash })) ?? [],
      revocation_evidence_refs: evidenceFor(events, 'CONTEXT_DISCLOSURE_DENIED', 'CONTEXT_GRANT_REVOKED'),
    }),
    phase(28, phase28.status?.startsWith('completed') ? 'complete' : 'in-progress', {
      persisted_status: phase28.status,
      successful_effect_hash: phase28.successful_effect_hash ?? null,
      rejection_request_id: phase28.rejection_request_id ?? null,
    }),
    phase(29, replayRefs.length > 0 && acceptedFederation.every((check) => check.present) ? 'complete' : 'in-progress', {
      accepted_envelopes: acceptedFederation,
      replay_reason: replayRefs.length > 0 ? 'FEDERATION_SEQUENCE_REPLAY' : null,
      replay_evidence_refs: replayRefs,
      later_expiry_attempt_does_not_replace_replay_evidence: hasEvent(events, 'FEDERATION_ENVELOPE_REJECTED', 'FEDERATION_ENVELOPE_EXPIRED'),
    }, replayRefs.length > 0 ? [] : [{ owner: 'operator', action: 'Run a fresh two-node replay proof before envelope expiry.' }]),
    phase(30, phase30AttackChecks.every((check) => check.present) && containmentChecks.every((check) => check.present) ? 'complete' : 'in-progress', {
      attacks: phase30AttackChecks,
      containment: containmentChecks,
    }),
    phase(31, 'in-progress', {
      control_registry_complete: controlRegistry.routes.length === 10 && controlRegistry.controls.length >= 108,
      responsive_screenshots_complete: screenshots.length === 40,
      cross_person_mismatch_evidence_refs: crossPersonRefs,
      liveness_mode: 'demo-bypass',
      approval_withdrawal_evidence_present: events.some((event) => event.event_type === 'APPROVAL_INVALIDATED_V2' && event.payload?.status === 'withdrawn'),
    }, [
      { owner: 'Plan 4 Phase 44 operator acceptance', action: 'Restore required liveness and complete current same-person camera acceptance for both enrolled humans against the finished UI.' },
      { owner: 'Plan 4 Phase 44 operator acceptance', action: 'Complete the disposable approval-withdrawal workflow and inspect its durable withdrawn event against the finished UI.' },
    ]),
    phase(32, 'in-progress', {
      ceremony_status: activeCeremony?.status ?? null,
      gate_statuses: Object.values(ceremonySteps).map((step) => ({ step_id: step.step_id, status: step.status })),
      final_package_present: false,
    }, [
      { owner: 'Plan 4 Phase 44', action: 'Run the clean-session final ceremony and independently verify the minimized package against the frozen Phase 43 release candidate.' },
      { owner: 'external prerequisite', action: 'Production biometric accuracy remains unmeasured and cannot be claimed.' },
    ]),
  ];

  return {
    schema_version: 1,
    kind: 'h2a.plan4.phase33-reconciliation',
    generated_at: new Date().toISOString(),
    source: { data_root: relative(projectRoot, dataRoot).replaceAll('\\', '/'), trace_id: sharedTrace },
    summary: {
      complete: phases.filter((item) => item.status === 'complete').length,
      in_progress: phases.filter((item) => item.status !== 'complete').length,
      plan3_complete: phases.every((item) => item.status === 'complete'),
    },
    phases,
  };
}

async function buildControlBaseline(outputRoot) {
  const sources = [
    join(projectRoot, 'docs', 'plan3', 'CONTROL_REGISTRY.json'),
    ...(await recursiveFiles(join(projectRoot, 'docs', 'plan3', 'evidence', 'phase31'))).filter((path) => path.endsWith('.png')),
  ].sort();
  const snapshotRoot = join(outputRoot, 'control-view');
  await mkdir(snapshotRoot, { recursive: true });
  const files = await Promise.all(sources.map(async (sourcePath) => {
    const snapshotPath = join(snapshotRoot, basename(sourcePath));
    await copyFile(sourcePath, snapshotPath);
    const bytes = await readFile(snapshotPath);
    return {
      path: relative(projectRoot, snapshotPath).replaceAll('\\', '/'),
      source_path: relative(projectRoot, sourcePath).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }));
  const payload = {
    schema_version: 1,
    kind: 'h2a.control-view-regression-baseline',
    generated_at: new Date().toISOString(),
    trust_claim: 'integrity-snapshot-only',
    files,
  };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  return {
    payload,
    payload_hash: sha256(payloadBytes),
    signature_algorithm: 'Ed25519',
    signer: 'phase33-local-build-process',
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    signature: `ed25519:${sign(null, payloadBytes, privateKey).toString('base64')}`,
  };
}

function buildPlan4Traceability() {
  const rows = [
    [33, 'Baseline reconciliation', 'scripts/phase33-baseline.mjs', 'test:phase33'],
    [34, 'Shared canonical renderer state and command facade', 'implementation-pending', 'projection, IPC, restart, cursor, stale-client tests'],
    [35, 'Persistent Office / Control presentation switch', 'implementation-pending', 'accessibility, persistence, parity, 100-switch test'],
    [36, 'Original licensed pixel office engine', 'implementation-pending', 'canvas, viewport, recovery, provenance tests'],
    [37, 'Truthful office projection from canonical state', 'implementation-pending', 'status matrix and Control-view parity tests'],
    [38, 'Resumable guided next-action workflows', 'implementation-pending', 'prerequisite, denial, restart, no-loop tests'],
    [39, 'Structured, framework, and attached PTY runtimes', 'implementation-pending', 'official CLI, PTY, lease, cancellation, restart tests'],
    [40, 'Governed multi-agent project delivery', 'implementation-pending', 'worktree, research, validation, merge, approval tests'],
    [41, 'Office collaboration, federation, and reattachment', 'implementation-pending', 'Phase 27-29 and event-recovery regression'],
    [42, 'Dual-surface product, performance, and accessibility acceptance', 'implementation-pending', 'Electron, pixel, DOM, a11y, load, reconnect tests'],
    [43, 'Final product integration and acceptance readiness', 'implementation-pending', 'final automated regression, release freeze, fail-closed acceptance-tooling tests'],
    [44, 'Final operator acceptance and HP CTO/CISO package', 'implementation-pending', 'required-liveness, withdrawal, clean-session 11/11 ceremony, project delivery, and independent verifier'],
  ];
  return {
    schema_version: 1,
    kind: 'h2a.plan4.requirements-traceability',
    rows: rows.map(([phaseNumber, requirement, implementation, verification]) => ({
      phase: phaseNumber,
      requirement,
      implementation,
      verification,
      status: phaseNumber === 33 ? 'complete-with-operator-acceptance-deferred-to-phase44' : 'planned',
    })),
  };
}

function buildNonClaims() {
  return {
    schema_version: 1,
    kind: 'h2a.plan4.non-claim-register',
    claims: [
      { id: 'NC-001', claim_not_made: 'Host provider execution is governed or isolated.', current_truth: 'Claude, Codex, and Antigravity remain connected-observed host processes.', closure: 'Digest-pinned isolation and credential-brokering gateway evidence.' },
      { id: 'NC-002', claim_not_made: 'Biometric accuracy is production-calibrated or liveness-backed.', current_truth: 'Identity matching is real; liveness is in owner-approved demo-bypass and FAR/FRR is unmeasured.', closure: 'Restore required liveness and run licensed genuine/impostor calibration.' },
      { id: 'NC-003', claim_not_made: 'Plan 3 final acceptance has passed.', current_truth: 'Phase 31 required-liveness and withdrawal evidence plus the Phase 32 clean-session 11/11 ceremony and independent package verification are incomplete.', closure: 'Plan 4 Phase 44.' },
      { id: 'NC-004', claim_not_made: 'The Phase 33 baseline is an organizational or human signature.', current_truth: 'It is an Ed25519 integrity signature created by the local build process.', closure: 'Operator or enterprise signing ceremony if required.' },
      { id: 'NC-005', claim_not_made: 'Munder or Mosaic source/assets are shipped in H2A.', current_truth: 'Both are architecture references only; Mosaic is GPL-3.0-or-later and no code or assets are copied.', closure: 'Maintain the Plan 4 adaptation and asset provenance registers.' },
      { id: 'NC-006', claim_not_made: 'Cursor, official Gemini API, AWS Bedrock, or public internet federation is integrated.', current_truth: 'Those surfaces remain explicit future prerequisites.', closure: 'Credentialed adapter phases and approved deployment boundary.' },
    ],
  };
}

export async function writeBaseline({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
  await mkdir(outputRoot, { recursive: true });
  const status = await reconcilePlan3({ dataRoot });
  const baseline = await buildControlBaseline(outputRoot);
  await writeFile(join(outputRoot, 'plan3-status.json'), `${JSON.stringify(status, null, 2)}\n`);
  await writeFile(join(outputRoot, 'control-view-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`);
  await writeFile(join(outputRoot, 'requirements-traceability.json'), `${JSON.stringify(buildPlan4Traceability(), null, 2)}\n`);
  await writeFile(join(outputRoot, 'non-claim-register.json'), `${JSON.stringify(buildNonClaims(), null, 2)}\n`);
  return { status, baseline };
}

export async function verifyBaseline({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
  const recordedStatus = await readJson(join(outputRoot, 'plan3-status.json'));
  const baseline = await readJson(join(outputRoot, 'control-view-baseline.json'));
  const payloadBytes = Buffer.from(JSON.stringify(baseline.payload));
  if (sha256(payloadBytes) !== baseline.payload_hash) throw new Error('Control baseline payload hash mismatch.');
  const validSignature = verify(null, payloadBytes, baseline.public_key_pem, Buffer.from(baseline.signature.replace(/^ed25519:/u, ''), 'base64'));
  if (!validSignature) throw new Error('Control baseline Ed25519 signature is invalid.');
  for (const file of baseline.payload.files) {
    const bytes = await readFile(join(projectRoot, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Control baseline drift: ${file.path}`);
  }
  const currentStatus = await reconcilePlan3({ dataRoot });
  assertPlan3BaselineMonotonic(recordedStatus, currentStatus);
  return { files: baseline.payload.files.length, phases: currentStatus.phases.length, payload_hash: baseline.payload_hash };
}

function assertPlan3BaselineMonotonic(recorded, current) {
  const currentByPhase = new Map(current.phases.map((item) => [item.phase, item]));
  for (const prior of recorded.phases) {
    const next = currentByPhase.get(prior.phase);
    if (!next) throw new Error(`Persisted Plan 3 phase ${prior.phase} is missing from canonical evidence.`);
    if (prior.status === 'complete' && next.status !== 'complete') throw new Error(`Persisted Plan 3 phase ${prior.phase} regressed from complete.`);
    for (const [name, value] of Object.entries(prior.checks ?? {})) {
      if (typeof value === 'number' && typeof next.checks?.[name] === 'number' && next.checks[name] < value) throw new Error(`Persisted Plan 3 phase ${prior.phase} check ${name} regressed.`);
    }
  }
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const mode = process.argv.includes('--verify') ? 'verify' : 'write';
  const dataArg = process.argv.find((arg) => arg.startsWith('--data-root='));
  const dataRoot = dataArg ? resolve(dataArg.slice('--data-root='.length)) : resolve(process.env.H2A_DATA_PATH || defaultDataRoot);
  if (mode === 'write') {
    const result = await writeBaseline({ dataRoot });
    process.stdout.write(`H2A_PHASE33_BASELINE_WRITTEN ${result.status.summary.complete}/10 complete\n`);
  } else {
    const result = await verifyBaseline({ dataRoot });
    process.stdout.write(`H2A_PHASE33_BASELINE_VERIFIED ${result.files} files ${result.phases} phases ${result.payload_hash}\n`);
  }
}
