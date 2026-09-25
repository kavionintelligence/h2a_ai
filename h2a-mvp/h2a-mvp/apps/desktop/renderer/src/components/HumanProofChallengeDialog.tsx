import { useEffect, useRef, useState } from 'react';
import type { HumanProofChallenge, SystemStatus } from '@h2a/contracts';
import { Clock3, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { HumanProofView } from '../features/system/SystemViews';
import { remainingChallengeSeconds, type HumanProofSubject } from './humanProofChallenge';

interface Props {
  challenge: HumanProofChallenge;
  subject: HumanProofSubject;
  livenessMode: SystemStatus['livenessMode'];
  onVerified(proofId: string): void | Promise<void>;
  onContinue(): void | Promise<void>;
  onCancel(): void;
  error?: string;
}

export function HumanProofChallengeDialog({ challenge, subject, livenessMode, onVerified, onContinue, onCancel, error }: Props): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [remaining, setRemaining] = useState(() => remainingChallengeSeconds(challenge.expires_at));

  useEffect(() => {
    const update = (): void => setRemaining(remainingChallengeSeconds(challenge.expires_at));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [challenge.expires_at]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusable = dialog?.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]');
    focusable?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]')];
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (dialog.open) dialog.close();
    };
  }, [onCancel]);

  return <dialog
    ref={dialogRef}
    className="proof-challenge-scrim"
    aria-labelledby="proof-challenge-title"
    aria-describedby="proof-challenge-purpose"
    data-challenge-id={challenge.challenge_id}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
  >
    <section className="proof-challenge-dialog">
      <div className="proof-challenge-context">
        <div className="proof-challenge-identity">
          <span className="proof-subject-icon"><UserRoundCheck size={22} aria-hidden="true" /></span>
          <div><p className="section-kicker">PURPOSE-BOUND HUMAN PROOF</p><h2 id="proof-challenge-title">Verify protected command for {subject.displayName}</h2><p className="proof-camera-subject">Camera must show {subject.displayName}</p><p id="proof-challenge-purpose">Exact purpose: {challenge.purpose}</p></div>
          <span className={`proof-challenge-deadline ${remaining <= 30 ? 'proof-challenge-deadline-urgent' : ''}`}><Clock3 size={14} /> {remaining}s</span>
        </div>
        <dl className="proof-subject-facts">
          <div><dt>Employee ID</dt><dd>{subject.employeeId ?? 'Not assigned'}</dd></div>
          <div><dt>Organization</dt><dd>{subject.organizationName ?? 'Enrollment prerequisite'}</dd></div>
          <div><dt>Department</dt><dd>{subject.department ?? 'Not assigned'}</dd></div>
          <div><dt>Role</dt><dd>{subject.roleNames.join(', ') || 'Identity binding only'}</dd></div>
          <div><dt>Command</dt><dd>{challenge.command}</dd></div>
        </dl>
        {subject.enrollmentRequired && <div className="proof-prerequisite" role="alert">Enrollment required: create a protected token set for {challenge.human_id} before this command can continue.</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {challenge.status === 'verified' && <div className="proof-signed-confirmation" role="status"><ShieldCheck size={18} /><span><strong>Signed proof confirmed</strong><small>{challenge.proof_id} is bound to this employee, purpose, route, and command.</small></span>{challenge.sensitivity === 'sensitive-confirm' && <button className="primary-button" type="button" onClick={() => void onContinue()}>Confirm protected command</button>}</div>}
      </div>
      <HumanProofView presentation="challenge" verificationPurpose={challenge.purpose} targetHumanId={challenge.human_id} expectedDisplayName={subject.displayName} challengeStatus={challenge.status} livenessMode={livenessMode} onVerificationComplete={onVerified} onCancel={onCancel} />
    </section>
  </dialog>;
}
