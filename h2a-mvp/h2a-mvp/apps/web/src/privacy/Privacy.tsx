import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import './privacy.css';

export const MASK = '********';
const masked = (_value: string) => MASK;
const PrivacyContext = createContext({ epoch: 0, hideAll: () => {}, masked });
export const usePrivacy = () => useContext(PrivacyContext);

/** Presentation privacy only. Source data still exists in this client-side simulator. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const hideAll = useCallback(() => setEpoch(n => n + 1), []);
  useEffect(() => {
    const hide = () => { if (document.hidden) hideAll(); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [hideAll]);
  const value = useMemo(() => ({ epoch, hideAll, masked }), [epoch, hideAll]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

function useReveal(identity: string) {
  const { epoch } = usePrivacy();
  const [reveal, setReveal] = useState<{ epoch: number; identity: string } | null>(null);
  const shown = reveal?.epoch === epoch && reveal.identity === identity;
  useEffect(() => { setReveal(null); }, [identity, epoch]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setReveal(null), 60_000);
    return () => window.clearTimeout(timer);
  }, [shown, reveal]);
  return { shown, toggle: () => setReveal(shown ? null : { epoch, identity }) };
}

export function PrivateField({ value, label = 'private field' }: { value: string; label?: string }) {
  const { shown, toggle } = useReveal(value);
  const id = useId();
  return <span className="privacy-field" data-private-field={label} data-revealed={shown}>
    <span id={id} className={shown ? 'privacy-value' : 'privacy-mask'}>{shown ? value : MASK}</span>
    <button type="button" className="privacy-toggle" aria-label={`${shown ? 'Hide' : 'Show'} ${label}`} aria-expanded={shown} aria-controls={id} onClick={event => { event.stopPropagation(); toggle(); }}>
      {shown ? <EyeOff size={13}/> : <Eye size={13}/>}<span>{shown ? 'Hide' : 'Show'}</span>
    </button>
  </span>;
}

/** Non-interactive placeholder for a parent button. Reveal controls live in its inspector. */
export function PrivateText({ value: _value }: { value: string }) {
  return <span className="privacy-mask">{MASK}</span>;
}

export function PrivateBlock({ label, children }: { label: string; children: ReactNode }) {
  const { shown, toggle } = useReveal(label);
  const id = useId();
  return <section className="privacy-block" data-private-block={label} data-revealed={shown}>
    <div className="privacy-block-heading"><span>{label}</span><button type="button" className="privacy-toggle" aria-label={`${shown ? 'Hide' : 'Show'} ${label}`} aria-expanded={shown} aria-controls={id} onClick={toggle}>{shown ? <EyeOff size={14}/> : <Eye size={14}/>} {shown ? 'Hide' : 'Show'}</button></div>
    <div id={id}>{shown ? children : <p className="privacy-block-placeholder"><span className="privacy-mask">{MASK}</span><small>Private content · reveal for 60 seconds</small></p>}</div>
  </section>;
}

export function PrivacyBar() {
  const { hideAll } = usePrivacy();
  return <div className="privacy-bar" role="region" aria-label="Privacy controls"><ShieldCheck size={17}/><span><strong>Personal details masked by default</strong><small>Show one field for 60 seconds. Navigation hides it again.</small></span><details><summary>Privacy scope</summary><p>Presentation masking protects details from casual viewing. This simulator keeps its source data in the browser; it is not server-side access control, encryption or a record of authorized access. Exports are redacted.</p></details><button type="button" onClick={hideAll}><EyeOff size={15}/>Hide all</button></div>;
}

/** Deliberately conservative: no source string may leave a redacted export. */
export function redactExport(value: unknown): unknown {
  if (typeof value === 'string') return MASK;
  if (Array.isArray(value)) return value.map(redactExport);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item], index) => [EXPORT_KEYS.has(key) ? key : `redacted_key_${index + 1}`, redactExport(item)]));
  return value;
}

// Only structural field names are retained; dynamic identity/map keys are private too.
const EXPORT_KEYS = new Set(('classification company_population detailed_members scenario playback metrics anchor version people agents tasks events memories population id name role department manager level owner kind runtime passport mandate allowed denied title peer agent collaborator room stage created updated risk baseline calls reused memoryIds result cycle historical timestamp task actor operation target outcome authority detail origin allowedTeams reviewer status content tick queue completed discovery pending active published blocked total registered bound records output sections heading body markdown filename mode scope observed observedLabel owned waiting memory proposed integrity scan concerns sources evaluated impact action boundary label summary').split(' '));
