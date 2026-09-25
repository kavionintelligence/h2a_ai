import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Camera, Check, Fingerprint, LockKeyhole, RefreshCw, ScanFace, ShieldCheck, TriangleAlert, UserPlus, Users, X } from 'lucide-react';
import type { BiometricTokenSetPolicy, CaptureAssessmentV2, EnrollHumanV2Request, HumanIdentityV2State, VerifyHumanV2Request } from '@h2a/contracts';
import { StatusBadge } from '@h2a/ui';
import { captureBiometric, inspectBiometricFrame, prepareBiometricModels, type CaptureProgress, type LiveCaptureTelemetry } from './biometricPipeline';

type Operation = 'enroll' | 'verify';
type RuntimeState = 'starting' | 'ready' | 'capturing' | 'success' | 'error';
const ORGANIZATION_ID = 'org_hp_demo';

interface HumanProofViewProps {
  identityApi?: { getState(): Promise<HumanIdentityV2State>; verify(request: VerifyHumanV2Request): Promise<HumanIdentityV2State>; enroll?(request: EnrollHumanV2Request): Promise<HumanIdentityV2State> };
  verificationPurpose?: string;
  targetHumanId?: string;
  expectedDisplayName?: string;
  challengeStatus?: 'pending' | 'verified' | 'cancelled' | 'expired' | 'invalidated';
  livenessMode?: 'required' | 'demo-bypass';
  presentation?: 'page' | 'challenge';
  onVerificationComplete?(proofId: string): void | Promise<void>;
  onCancel?(): void;
}

export function HumanProofView({ identityApi, verificationPurpose = 'authorize H2A command floor', targetHumanId, expectedDisplayName, challengeStatus = 'pending', livenessMode = 'required', presentation = 'page', onVerificationComplete, onCancel }: HumanProofViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const [state, setState] = useState<HumanIdentityV2State | null>(null);
  const [selectedHumanId, setSelectedHumanId] = useState('');
  const [humanId, setHumanId] = useState('human_employee_001');
  const [membershipId, setMembershipId] = useState('membership_employee_001');
  const [displayName, setDisplayName] = useState('Demo Employee');
  const [tokenSetSize, setTokenSetSize] = useState(20);
  const [runtime, setRuntime] = useState<RuntimeState>('starting');
  const [progress, setProgress] = useState<CaptureProgress>({ step: 'Loading local models', current: 0, total: 10 });
  const [message, setMessage] = useState('Preparing the local identity runtime.');
  const [telemetry, setTelemetry] = useState<LiveCaptureTelemetry>({ faceCount: 0 });
  const [completedProofId, setCompletedProofId] = useState<string>();
  const desktopAvailable = Boolean(window.h2a);
  const requireLiveness = livenessMode === 'required';
  const challengePresentation = presentation === 'challenge';

  const selectIdentity = useCallback((id: string, source: HumanIdentityV2State | null): void => {
    setSelectedHumanId(id);
    const identity = source?.identities.find((item) => item.human_id === id);
    if (!identity) return;
    setHumanId(identity.human_id);
    setMembershipId(identity.active_membership_id ?? '');
    setDisplayName(identity.display_name);
  }, []);

  const startRuntime = useCallback(async (): Promise<void> => {
    setRuntime('starting');
    setMessage('Preparing camera and local inference models.');
    try {
      const [nextState, stream] = await Promise.all([
        identityApi ? identityApi.getState() : window.h2a?.getHumanIdentityV2State() ?? Promise.resolve(null),
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false }),
        prepareBiometricModels(requireLiveness)
      ]);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState(nextState);
      const selectedHuman = nextState?.identities.find((identity) => identity.human_id === targetHumanId) ?? nextState?.identities[0];
      if (selectedHuman) selectIdentity(selectedHuman.human_id, nextState);
      setRuntime('ready');
      setMessage(selectedHuman ? `Camera must show ${selectedHuman.display_name}. Confirm the claimed identity before continuing.` : 'Enrollment is required before this protected command can continue.');
    } catch (error) {
      setRuntime('error');
      setMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera access was denied. Enable camera permission and retry.' : errorMessage(error));
    }
  }, [identityApi, requireLiveness, selectIdentity, targetHumanId]);

  useEffect(() => {
    void startRuntime();
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [startRuntime]);

  useEffect(() => {
    if (runtime === 'starting' || runtime === 'capturing' || !streamRef.current) return undefined;
    let cancelled = false;
    let timer = 0;
    const inspect = async (): Promise<void> => {
      try {
        const next = videoRef.current ? await inspectBiometricFrame(videoRef.current) : { faceCount: 0 };
        if (!cancelled) setTelemetry(next);
      } catch { if (!cancelled) setTelemetry({ faceCount: 0 }); }
      if (!cancelled) timer = window.setTimeout(() => void inspect(), 350);
    };
    void inspect();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [runtime]);

  const selectedIdentity = state?.identities.find((identity) => identity.human_id === selectedHumanId);
  const activeEnrollment = state?.enrollments.find((enrollment) => enrollment.enrollment_id === selectedIdentity?.current_enrollment_id && enrollment.status === 'active');
  const activeProof = state?.active_proofs.find((proof) => proof.human_id === selectedHumanId);
  const status = activeProof ? { label: 'Proof active', tone: 'verified' as const } : activeEnrollment ? { label: 'Verification required', tone: 'approval' as const } : { label: 'Enrollment required', tone: 'approval' as const };
  const validIdentity = humanId.trim().length > 1 && membershipId.trim().length > 1 && displayName.trim().length > 1;
  const capturePolicy = activeEnrollment?.policy ?? demoPolicy(tokenSetSize, requireLiveness);
  const position = capturePosition(telemetry, capturePolicy);

  function chooseIdentity(id: string): void {
    if (!id) { newIdentity(); return; }
    selectIdentity(id, state);
  }

  function newIdentity(): void {
    const suffix = String((state?.identities.length ?? 0) + 1).padStart(3, '0');
    setSelectedHumanId('');
    setHumanId(`human_employee_${suffix}`);
    setMembershipId(`membership_employee_${suffix}`);
    setDisplayName('');
    setMessage('Enter the employee identity references, then capture the protected token set.');
  }

  async function run(operation: Operation): Promise<void> {
    if (!window.h2a || !videoRef.current) return;
    setRuntime('capturing');
    setMessage(operation === 'enroll' ? `Capturing ${tokenSetSize} distinct face records for this employee.` : 'Comparing this live capture only with the selected employee token set.');
    try {
      const capture = await captureBiometric(videoRef.current, operation === 'enroll' ? tokenSetSize : 1, setProgress, requireLiveness);
      setTelemetry({ faceCount: capture.assessment.faceCount, distanceCm: capture.assessment.distanceCm, qualityScore: capture.assessment.qualityScore });
      const assessment = toV2Assessment(capture.assessment);
      const next = operation === 'enroll'
        ? await (identityApi?.enroll ?? window.h2a.enrollHumanV2)({
            organization_id: ORGANIZATION_ID,
            human_id: humanId.trim(),
            membership_id: membershipId.trim(),
            display_name: displayName.trim(),
            policy: demoPolicy(tokenSetSize, requireLiveness),
            captures: capture.samples.map((sample, index) => ({ sample, assessment: { ...assessment, captured_at: new Date(Date.now() + index).toISOString() } }))
          })
        : await (identityApi ? identityApi.verify : window.h2a.verifyHumanV2)({
            organization_id: selectedIdentity?.organization_id ?? ORGANIZATION_ID,
            human_id: selectedHumanId,
            membership_id: selectedIdentity?.active_membership_id ?? membershipId,
            purpose: verificationPurpose,
            nonce: crypto.randomUUID(),
            capture: { sample: capture.samples[0], assessment }
          });
      setState(next);
      if (operation === 'enroll') setSelectedHumanId(humanId.trim());
      const accepted = operation === 'enroll' || next.last_result?.decision === 'verified';
      setRuntime(accepted ? 'success' : 'error');
      setMessage(operation === 'enroll' ? 'Versioned token set sealed; protected records remain in trusted local storage.' : accepted ? 'Purpose-bound signed Human Proof issued and reconciled with canonical state.' : next.last_result?.reason_code === 'CAPTURE_POLICY_FAILED' ? captureFailureMessage(capture.assessment, capturePolicy, requireLiveness) : verificationFailureMessage(next.last_result?.reason_code, expectedDisplayName ?? selectedIdentity?.display_name ?? selectedHumanId));
      if (operation === 'verify' && accepted) {
        const proof = [...next.active_proofs].reverse().find((item) => item.human_id === selectedHumanId && item.purpose === verificationPurpose);
        if (!proof) throw new Error('Verified proof was not returned by the identity service.');
        await onVerificationComplete?.(proof.human_proof_id);
        setCompletedProofId(proof.human_proof_id);
      }
    } catch (error) {
      setRuntime('error');
      setMessage(errorMessage(error));
    }
  }

  async function revokeEnrollment(): Promise<void> {
    if (!window.h2a || !activeEnrollment) return;
    setState(await window.h2a.updateBiometricEnrollmentV2({ enrollment_id: activeEnrollment.enrollment_id, action: 'revoke' }));
    setRuntime('ready');
    setMessage('Enrollment revoked. Existing proof was removed and verification now fails closed.');
  }

  return (
    <div className={`human-proof-page ${challengePresentation ? 'human-proof-challenge' : ''}`} data-proof-presentation={presentation}>
      <header className="human-proof-heading">
        <div className="human-proof-title"><span className="system-icon"><Fingerprint size={24} aria-hidden="true" /></span><div><p className="section-kicker">HUMAN AUTHORITY ROOT</p><h2>Employee identities</h2></div></div>
        <div className="human-proof-heading-actions"><StatusBadge label={status.label} tone={status.tone} />{challengePresentation && <button data-control-id="human-proof.challenge.cancel" className="icon-button" type="button" title="Cancel verification" aria-label="Cancel verification" onClick={onCancel}><X size={18} /></button>}</div>
      </header>

      {challengePresentation && <section className="proof-ceremony-progress" aria-label="Human Proof ceremony progress" aria-live="polite">
        <ProofStage label="Capture" detail={runtime === 'capturing' ? `${progress.current}/${progress.total} frames` : position.label} state={runtime === 'success' ? 'complete' : runtime === 'capturing' ? 'active' : 'pending'} />
        <ProofStage label="Liveness" detail={requireLiveness ? (runtime === 'capturing' ? 'Model evaluating' : 'Required') : 'Demo bypass disclosed'} state={runtime === 'success' ? 'complete' : runtime === 'capturing' ? 'active' : 'pending'} />
        <ProofStage label="Face + BCH" detail={runtime === 'capturing' ? 'Matching protected token set' : runtime === 'success' ? 'Match confirmed' : 'Awaiting capture'} state={runtime === 'success' ? 'complete' : runtime === 'capturing' ? 'active' : 'pending'} />
        <ProofStage label="Signed proof" detail={completedProofId ?? (challengeStatus === 'verified' ? 'Canonical proof confirmed' : 'Not issued')} state={completedProofId || challengeStatus === 'verified' ? 'complete' : 'pending'} />
      </section>}

      <div className="identity-directory-bar">
        <label><span>Employee identity</span><select value={selectedHumanId} disabled={challengePresentation} onChange={(event) => chooseIdentity(event.target.value)}><option value="">New employee</option>{state?.identities.map((identity) => <option key={identity.human_id} value={identity.human_id}>{identity.display_name} - {identity.human_id}</option>)}</select></label>
        {!challengePresentation && !identityApi && <button data-control-id="human-proof.identity.new" className="secondary-button" type="button" onClick={newIdentity}><UserPlus size={16} /> New employee</button>}
        <span className="identity-count"><Users size={15} /> {state?.identities.length ?? 0} enrolled</span>
      </div>

      <div className="human-proof-layout">
        <section className="capture-panel" aria-labelledby="capture-heading">
          <div className="capture-toolbar"><div><p className="section-kicker">LOCAL FACE + BCH</p><h3 id="capture-heading">Identity ceremony</h3><small className="verification-purpose">Purpose: {verificationPurpose}</small><small className="verification-purpose">Liveness: {requireLiveness ? 'required' : 'temporarily bypassed for demo'}</small></div><span className={`camera-state camera-state-${runtime}`}><span />{runtime === 'capturing' ? 'Processing' : runtime === 'starting' ? 'Starting' : 'Camera ready'}</span></div>
          <div className="camera-stage">
            <video ref={videoRef} muted playsInline aria-label="Live biometric camera" />
            <div className="face-guide" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className={`capture-telemetry capture-telemetry-${position.tone}`} aria-live="polite">
              <strong>{position.label}</strong>
              <span>Estimated distance <b>{telemetry.distanceCm === undefined ? '--' : `${Math.round(telemetry.distanceCm)} cm`}</b></span>
              <span>Required range <b>{capturePolicy.minimum_distance_cm}–{capturePolicy.maximum_distance_cm} cm</b></span>
              <span>Image quality <b>{telemetry.qualityScore === undefined ? '--' : telemetry.qualityScore.toFixed(2)} / {capturePolicy.quality_threshold.toFixed(2)}</b></span>
              <span>Faces detected <b>{telemetry.faceCount}</b></span>
              <span>Liveness <b>{requireLiveness ? `capture sequence ≥ ${capturePolicy.liveness_threshold.toFixed(2)}` : 'not evaluated · demo bypass'}</b></span>
            </div>
            {runtime === 'starting' && <div className="camera-curtain"><RefreshCw size={24} className="spin" /><span>Loading local models</span></div>}
            {runtime === 'error' && !streamRef.current && <div className="camera-curtain camera-curtain-error"><TriangleAlert size={24} /><span>Camera unavailable</span></div>}
            <div className="privacy-marker"><LockKeyhole size={13} /> Frames stay in memory</div>
          </div>
          <div className="capture-status" aria-live="polite">
            <span className={`capture-status-icon capture-status-${runtime}`}>{runtime === 'success' ? <Check size={17} /> : runtime === 'error' ? <TriangleAlert size={17} /> : <ScanFace size={17} />}</span>
            <div><strong>{progress.step}</strong><span>{message}</span></div>
            {runtime === 'capturing' && <span className="capture-count mono">{progress.current}/{progress.total}</span>}
          </div>
          <div className="identity-form-grid">
            <label className="identity-field"><span>Human ID</span><input value={humanId} onChange={(event) => setHumanId(event.target.value)} disabled={Boolean(selectedHumanId)} /></label>
            <label className="identity-field"><span>Membership reference</span><input value={membershipId} onChange={(event) => setMembershipId(event.target.value)} disabled={Boolean(selectedHumanId)} /></label>
            <label className="identity-field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} /></label>
            <label className="identity-field"><span>Protected records</span><select value={tokenSetSize} onChange={(event) => setTokenSetSize(Number(event.target.value))} disabled={runtime === 'capturing'}><option value={20}>20 - demo baseline</option><option value={45}>45</option><option value={70}>70</option></select></label>
          </div>
          <div className="capture-actions">
            {!desktopAvailable && <span className="desktop-notice">Open the Electron desktop runtime to persist proof.</span>}
            <button data-control-id="human-proof.camera.retry" className="secondary-button" type="button" onClick={() => void startRuntime()} disabled={runtime === 'capturing'} title="Restart camera"><RefreshCw size={16} /> Retry camera</button>
            {activeEnrollment && !challengePresentation && !identityApi && <button data-control-id="human-proof.enrollment.revoke" className="danger-button" type="button" onClick={() => void revokeEnrollment()} disabled={runtime === 'capturing'}><Ban size={16} /> Revoke</button>}
            <button data-control-id="human-proof.enroll-or-verify" className="primary-button" type="button" onClick={() => void run(activeEnrollment ? 'verify' : 'enroll')} disabled={!desktopAvailable || challengeStatus === 'verified' || runtime === 'starting' || runtime === 'capturing' || (challengePresentation && !activeEnrollment) || (!challengePresentation && !activeEnrollment && !validIdentity)}>
              {activeEnrollment ? <ShieldCheck size={17} /> : <Camera size={17} />}{activeEnrollment ? 'Verify selected employee' : challengePresentation ? 'Enrollment required' : selectedIdentity ? 'Rotate enrollment' : 'Enroll employee'}
            </button>
          </div>
        </section>

        <aside className="assurance-panel" aria-label="Employee identity assurance details">
          <div className="assurance-section"><p className="section-kicker">ASSURANCE STATE</p><h3>{activeProof ? 'Authority enabled' : activeEnrollment ? 'Identity enrolled' : 'Awaiting enrollment'}</h3><p className="assurance-copy">{activeProof ? `${activeProof.assurance_level === 'high' ? 'High' : 'Substantial'} proof expires ${formatTime(activeProof.expires_at)}` : requireLiveness ? 'Proof is issued only after liveness and the claimed employee token set both verify.' : 'Demo bypass is active. Face, distance, and BCH matching remain required; liveness is not asserted.'}</p></div>
          <div className="assurance-metrics"><Metric label="Records" value={String(activeEnrollment?.policy.token_set_size ?? 0)} state={activeEnrollment ? 'good' : 'neutral'} /><Metric label="Required" value={String(activeEnrollment?.policy.required_matches ?? 0)} state={activeEnrollment ? 'good' : 'neutral'} /><Metric label="Version" value={String(activeEnrollment?.version ?? 0)} state={activeEnrollment ? 'good' : 'neutral'} /><Metric label="Employees" value={String(state?.identities.length ?? 0)} state={(state?.identities.length ?? 0) > 0 ? 'good' : 'neutral'} /></div>
          <div className="assurance-section assurance-details"><p className="section-kicker">BOUND IDENTITY</p><Definition label="Employee" value={selectedIdentity?.display_name ?? 'Not selected'} /><Definition label="Human ID" value={selectedIdentity?.human_id ?? humanId} /><Definition label="Organization" value={ORGANIZATION_ID} /><Definition label="Membership" value={selectedIdentity?.active_membership_id ?? membershipId} /><Definition label="Policy" value={activeEnrollment?.policy.policy_id ?? `demo-face-v2-${tokenSetSize}`} /></div>
          <div className="assurance-section"><p className="section-kicker">LATEST DECISION</p>{state?.last_result && state.last_result.human_id === selectedHumanId ? <div className="attempt-row"><span className={`decision-dot decision-${state.last_result.decision}`} /><div><strong>{state.last_result.decision === 'verified' ? 'Proof issued' : reasonLabel(state.last_result.reason_code)}</strong><span>{formatTime(state.last_result.attempted_at)} - {state.last_result.matched_record_count} matched</span></div></div> : <p className="empty-attempts">No verification recorded for this employee.</p>}</div>
        </aside>
      </div>
    </div>
  );
}

function demoPolicy(tokenSetSize: number, requireLiveness: boolean): BiometricTokenSetPolicy {
  return { policy_id: `demo-face-v2-${tokenSetSize}`, token_set_size: tokenSetSize, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: 0.65, liveness_threshold: requireLiveness ? 0.75 : 0, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' as const };
}
function toV2Assessment(value: { qualityScore: number; livenessScore: number; distanceCm: number; faceCount: number; capturedAt: string }): CaptureAssessmentV2 { return { quality_score: value.qualityScore, liveness_score: value.livenessScore, distance_cm: value.distanceCm, face_count: value.faceCount, captured_at: value.capturedAt }; }
function Metric({ label, value, state }: { label: string; value: string; state: 'good' | 'neutral' }): React.JSX.Element { return <div className={`assurance-metric metric-${state}`}><span>{label}</span><strong>{value}</strong></div>; }
function Definition({ label, value }: { label: string; value: string }): React.JSX.Element { return <div className="assurance-definition"><span>{label}</span><strong>{value}</strong></div>; }
function ProofStage({ label, detail, state }: { label: string; detail: string; state: 'pending' | 'active' | 'complete' }): React.JSX.Element { return <div className={`proof-stage proof-stage-${state}`}><span>{state === 'complete' ? <Check size={14} /> : <span className="proof-stage-dot" />}</span><strong>{label}</strong><small>{detail}</small></div>; }
function formatTime(value: string | undefined): string { return value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value)) : 'Not issued'; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Biometric processing failed.'; }
function reasonLabel(reason: string | undefined): string { return (reason ?? 'BIOMETRIC_MISMATCH').replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }
function verificationFailureMessage(reason: string | undefined, expectedName: string): string {
  if (reason === 'BIOMETRIC_MISMATCH') return `Identity mismatch. Camera must show ${expectedName}; no proof or continuation was issued.`;
  if (reason === 'MEMBERSHIP_MISMATCH') return `The enrollment is not bound to ${expectedName}'s active membership. Refresh the employee record before retrying.`;
  if (reason === 'NO_ACTIVE_ENROLLMENT' || reason === 'IDENTITY_UNAVAILABLE') return `${expectedName} needs an active enrollment before this command can continue.`;
  if (reason === 'NONCE_REPLAY') return 'This capture challenge was already used. Start a fresh verification.';
  if (reason === 'LOCKED_OUT') return `${expectedName}'s identity is locked after rejected attempts. An administrator must review it.`;
  return reasonLabel(reason);
}
function capturePosition(telemetry: LiveCaptureTelemetry, policy: ReturnType<typeof demoPolicy>): { label: string; tone: 'waiting' | 'adjust' | 'ready' } {
  if (telemetry.faceCount === 0) return { label: 'Center one face in the guide', tone: 'waiting' };
  if (telemetry.faceCount > 1) return { label: 'Only one face may be visible', tone: 'adjust' };
  if (telemetry.distanceCm === undefined) return { label: 'Measuring position', tone: 'waiting' };
  if (telemetry.distanceCm < policy.minimum_distance_cm) return { label: 'Move farther from the camera', tone: 'adjust' };
  if (telemetry.distanceCm > policy.maximum_distance_cm) return { label: 'Move closer to the camera', tone: 'adjust' };
  if ((telemetry.qualityScore ?? 0) < policy.quality_threshold) return { label: 'Improve lighting and hold still', tone: 'adjust' };
  return { label: 'Position meets capture policy', tone: 'ready' };
}
function captureFailureMessage(assessment: { qualityScore: number; livenessScore: number; distanceCm: number; faceCount: number }, policy: ReturnType<typeof demoPolicy>, requireLiveness: boolean): string {
  if (assessment.faceCount !== 1) return `Capture policy failed: ${assessment.faceCount} faces detected; exactly one is required.`;
  if (assessment.distanceCm < policy.minimum_distance_cm) return `Capture policy failed: estimated distance ${Math.round(assessment.distanceCm)} cm; move farther away into the ${policy.minimum_distance_cm}–${policy.maximum_distance_cm} cm range.`;
  if (assessment.distanceCm > policy.maximum_distance_cm) return `Capture policy failed: estimated distance ${Math.round(assessment.distanceCm)} cm; move closer into the ${policy.minimum_distance_cm}–${policy.maximum_distance_cm} cm range.`;
  if (assessment.qualityScore < policy.quality_threshold) return `Capture policy failed: image quality ${assessment.qualityScore.toFixed(2)}; at least ${policy.quality_threshold.toFixed(2)} is required. Improve lighting and hold still.`;
  if (requireLiveness && assessment.livenessScore < policy.liveness_threshold) return `Capture policy failed: liveness ${assessment.livenessScore.toFixed(2)}; at least ${policy.liveness_threshold.toFixed(2)} is required.`;
  return 'Capture policy failed. Keep one face centered, hold still, and remain inside the displayed distance range.';
}
