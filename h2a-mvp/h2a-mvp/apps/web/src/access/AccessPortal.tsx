import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bot, Brain, Building2, Eye, EyeOff, Fingerprint, Hospital, Info, LockKeyhole, LockKeyholeOpen, LogOut, Network, Stethoscope, UserRound, Users } from 'lucide-react';
import './access-portal.css';
import { BrandMark } from '../BrandMark';

// Public presentation credentials. This screen is not a server authentication boundary.
const PRESENTATION_ID = 'varun';
const PRESENTATION_PASSWORD = 'ByoSync@123';
const STORAGE_KEY = 'byosync.presentation-access.v1';
type PortalSession = { signedIn:boolean; tenant:'joon'|null };
type Tenant = { id:'joon'|'sarvodaya'|'deplomact'; name:string; category:string; status:string; ready:boolean; description:string; logo?:string };
const tenants:Tenant[] = [
  {id:'joon',name:'Joon’s Hospital',category:'Hospital workspace',status:'Ready',ready:true,description:'Explore the AI estate, accountable teams, collaboration rooms and reviewed hospital knowledge.'},
  {id:'sarvodaya',name:'Sarvodaya Hospital',category:'Hospital workspace',status:'In progress',ready:false,description:'Workspace setup is in progress. Access will be available when preparation is complete.'},
  {id:'deplomact',name:'Deplomact Dental Clinic',category:'Clinic workspace',status:'Work in progress',ready:false,description:'This clinic workspace is being prepared. Its dashboard is not available yet.'},
];

function readSession():PortalSession {
  try {
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.signedIn===true)return {signedIn:true,tenant:saved.tenant==='joon'?'joon':null};
  } catch { /* An unavailable or invalid browser session returns to presentation sign-in. */ }
  return {signedIn:false,tenant:null};
}

/** Presentation entry only: no passwords, API tokens or real user identity are persisted. */
export function AccessPortal({children}:{children:ReactNode}) {
  const [session,setSession]=useState<PortalSession>(readSession);
  const [storageNotice,setStorageNotice]=useState('');
  const [loginId,setLoginId]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [errors,setErrors]=useState<{id?:string;password?:string;form?:string}>({});
  const loginRef=useRef<HTMLInputElement>(null);
  const passwordRef=useRef<HTMLInputElement>(null);
  const welcomeRef=useRef<HTMLHeadingElement>(null);
  const instanceId=useId().replace(/:/g,'');
  const inputId=`${instanceId}-login`;
  const passwordId=`${instanceId}-password`;

  useEffect(()=>{
    try {
      if(session.signedIn)sessionStorage.setItem(STORAGE_KEY,JSON.stringify({signedIn:true,tenant:session.tenant}));
      else sessionStorage.removeItem(STORAGE_KEY);
      setStorageNotice('');
    } catch {
      setStorageNotice('Browser session storage is unavailable. You can continue, but refreshing will return to sign-in.');
    }
  },[session]);

  useEffect(()=>{
    if(session.signedIn&&!session.tenant)welcomeRef.current?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  },[session.signedIn,session.tenant]);

  const signIn=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const next:{id?:string;password?:string;form?:string}={};
    if(!loginId.trim())next.id='Enter the presentation login ID.';
    if(!password)next.password='Enter the sample password shown below.';
    if(next.id||next.password){setErrors(next);if(next.id)loginRef.current?.focus();else passwordRef.current?.focus();return;}
    if(loginId.trim().toLowerCase()!==PRESENTATION_ID||password!==PRESENTATION_PASSWORD){
      setErrors({form:'Those details do not match the presentation account. Use the sample credentials below.'});
      passwordRef.current?.focus();return;
    }
    setErrors({});setPassword('');setLoginId('');setShowPassword(false);setSession({signedIn:true,tenant:null});
  };
  const signOut=()=>{setPassword('');setLoginId('');setErrors({});setShowPassword(false);setSession({signedIn:false,tenant:null});};

  if(session.signedIn&&session.tenant==='joon')return <div className="access-workspace" data-testid="portal-workspace">
    <header className="access-workspace-bar"><button type="button" onClick={()=>setSession({signedIn:true,tenant:null})}><ArrowLeft/>Back to hospitals</button><span className="access-workspace-tenant"><Hospital/>Joon’s Hospital</span><div><span className="access-user"><span className="access-avatar">V</span>Varun</span><button type="button" onClick={signOut}><LogOut/>Sign out</button></div></header>
    {storageNotice&&<p className="access-workspace-notice" role="status">{storageNotice}</p>}
    <div className="access-child">{children}</div>
  </div>;

  if(session.signedIn)return <div className="access-portal access-selector" data-testid="hospital-selector">
    <header className="access-portal-header"><Brand/><div><span className="access-user"><span className="access-avatar">V</span><span>Varun<small>Presentation account</small></span></span><button className="access-secondary" type="button" onClick={signOut}><LogOut/>Sign out</button></div></header>
    <main className="access-selector-main"><div className="access-welcome"><span className="access-eyebrow">YOUR WORKSPACES</span><h1 ref={welcomeRef} tabIndex={-1}>Welcome to the dashboard, Varun.</h1><p>Choose a hospital to open its AI oversight workspace.</p></div>
      {storageNotice&&<p className="access-storage-notice" role="status"><Info/>{storageNotice}</p>}
      <div className="access-selector-caption"><span><Building2/>3 organisations</span><span><i/>1 workspace available</span></div>
<div className="access-tenant-grid">{tenants.map(tenant=><button type="button" key={tenant.id} data-testid={`tenant-${tenant.id}`} className={`access-tenant-card ${tenant.ready?'access-tenant-ready':'access-tenant-locked'}`} disabled={!tenant.ready} aria-describedby={`${instanceId}-${tenant.id}-description`} onClick={()=>{if(tenant.ready)setSession({signedIn:true,tenant:'joon'});}}><div className="access-tenant-top"><HospitalMark tenant={tenant}/><span className={`access-tenant-status ${tenant.ready?'access-ready-status':''}`}>{tenant.ready?<LockKeyholeOpen/>:<LockKeyhole/>}{tenant.status}</span></div><span className="access-tenant-category">{tenant.category}</span><h2>{tenant.name}</h2><p id={`${instanceId}-${tenant.id}-description`}>{tenant.description}</p>{tenant.ready?<div className="access-tenant-capabilities"><span><Bot/>AI estate</span><span><Users/>Teams & rooms</span><span><Brain/>Company brain</span></div>:<div className="access-tenant-progress"><span><LockKeyhole/>Dashboard locked</span><small>Workspace preparation</small></div>}<span className="access-tenant-footer">{tenant.ready?'Open hospital dashboard':'Not yet available'}{tenant.ready?<ArrowRight/>:<LockKeyhole/>}</span></button>)}</div>
      <div className="access-selector-note"><Info/><p>This presentation account opens the available hospital scenario. Locked workspaces contain no accessible company records.</p></div>
    </main><footer className="access-portal-footer"><span>ByoSync · Human accountability for agentic work</span><span>Presentation environment</span></footer>
  </div>;

  return <div className="access-portal access-login" data-testid="access-login">
    <section className="access-login-story"><Brand/><div className="access-story-copy"><span className="access-eyebrow">HUMANS. AGENTS. ACCOUNTABILITY.</span><h1>One company.<br/>Every agent.<br/><span>A clear line of trust.</span></h1><p>See who is accountable, what an agent can do, and how work becomes reviewed company knowledge.</p><div className="access-story-path" aria-label="People bind agents; agents operate within authority; reviewed outcomes become knowledge"><span><Users/><strong>People</strong><small>Accountable owners</small></span><ArrowRight/><span><Bot/><strong>Agents</strong><small>Bounded authority</small></span><ArrowRight/><span><Brain/><strong>Knowledge</strong><small>Reviewed outcomes</small></span></div></div><div className="access-story-footer"><BrandMark brand="h2a"/><span><strong>H2A · Human-to-agent identity</strong>Human identity stays connected to every agent’s work.</span></div></section>
    <main className="access-login-main"><div className="access-login-mobile-brand"><Brand/></div><div className="access-login-form-wrap"><span className="access-form-symbol"><UserRound/></span><span className="access-eyebrow">WELCOME TO BYOSYNC</span><h2>Sign in to your workspace</h2><p className="access-login-subtitle">Start with the hospital you want to explore.</p>
      <form onSubmit={signIn} noValidate data-testid="login-form"><div className="access-field"><label htmlFor={inputId}>Login ID</label><input ref={loginRef} id={inputId} name="presentation-login-id" autoComplete="off" autoCapitalize="none" spellCheck={false} value={loginId} onChange={event=>{setLoginId(event.target.value);setErrors(current=>({...current,id:undefined,form:undefined}));}} placeholder="Enter your login ID" aria-invalid={Boolean(errors.id||errors.form)} aria-describedby={errors.id?`${inputId}-error`:undefined}/>{errors.id&&<p id={`${inputId}-error`} className="access-field-error">{errors.id}</p>}</div><div className="access-field"><label htmlFor={passwordId}>Password</label><div className="access-password-field"><input ref={passwordRef} id={passwordId} name="presentation-password" type={showPassword?'text':'password'} autoComplete="off" value={password} onChange={event=>{setPassword(event.target.value);setErrors(current=>({...current,password:undefined,form:undefined}));}} placeholder="Enter sample password" aria-invalid={Boolean(errors.password||errors.form)} aria-describedby={errors.password?`${passwordId}-error`:`${instanceId}-credential-notice`}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff/>:<Eye/>}</button></div>{errors.password&&<p id={`${passwordId}-error`} className="access-field-error">{errors.password}</p>}</div>{errors.form&&<div className="access-form-error" role="alert"><Info/><span>{errors.form}</span></div>}<button className="access-submit" type="submit">Sign in<ArrowRight/></button></form>
      <div className="access-h2a-signature"><BrandMark brand="h2a"/><span><strong>H2A identity</strong>People, agents and accountable authority.</span></div><div className="access-sample-credentials"><p id={`${instanceId}-credential-notice`}><Info/><span>Presentation access · use sample credentials, not your real password.</span></p><div><span>Login ID<strong>{PRESENTATION_ID}</strong></span><span>Password<strong>{PRESENTATION_PASSWORD}</strong></span></div><small>This presentation gate is not enterprise authentication.</small></div>{storageNotice&&<p className="access-storage-notice" role="status">{storageNotice}</p>}
    </div><footer className="access-login-footer">A connected view of people, agents and authority.</footer></main>
  </div>;
}

function Brand(){return <div className="access-brand" aria-label="ByoSync"><BrandMark/><span>ByoSync</span></div>;}
function HospitalMark({tenant}:{tenant:Tenant}){
  const [failed,setFailed]=useState(false);
  const Icon=tenant.id==='deplomact'?Stethoscope:tenant.id==='sarvodaya'?Building2:Hospital;
  return <span className={`access-hospital-mark access-hospital-${tenant.id}`}>{tenant.logo&&!failed?<img src={tenant.logo} alt={`${tenant.name} logo`} onError={()=>setFailed(true)}/>:<Icon aria-hidden="true"/>}</span>;
}
