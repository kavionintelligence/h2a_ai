import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createCensusProvider, DemoError, GovernanceService } from './service';
import { PlatformService, sourceReportInputSchema, telemetryInputSchema } from './platform';
import { normalizeClawHunterReport, normalizeShadowAiGuardFindings } from './adapters';
import { ActorDirectory, actorContext, localActor } from './actors';
import { withEndpointDiscovery } from './endpoint';
import { RoomRuntime, engineSchema } from './room-runtime';
import { collectClawHunter } from './claw-collector';

const id = z.string().trim().min(1).max(160);
const empty = z.object({}).strict();
const action = z.enum(['inventory_report', 'verify_integrity', 'evidence_export', 'crm_write', 'purchase']);
const json = (response: ServerResponse, status: number, value: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); };

async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new DemoError('Commands require application/json.', 415);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 1_048_576) throw new DemoError('Request body is too large.', 413); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new DemoError('Request body must be valid JSON.'); }
}

function sameSecret(received: string | undefined, expected: string) {
  if (!received) return false;
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookie(request: IncomingMessage, name: string) {
  for (const item of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function bearer(request: IncomingMessage) {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function hostName(host: string) {
  try { return new URL(`http://${host}`).hostname.toLowerCase(); }
  catch { return ''; }
}

export function createGovernanceServer(service: GovernanceService, webRoot = resolve(process.cwd(), 'apps/web/dist'), platform?: PlatformService, runtime?: RoomRuntime) {
  const accessToken = process.env.BYOSYNC_ACCESS_TOKEN?.trim() ?? '';
  const bindHost = process.env.BYOSYNC_HOST?.trim() || '127.0.0.1';
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', bindHost.toLowerCase(), ...(process.env.BYOSYNC_ALLOWED_HOSTS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)]);
  return createServer(async (request, response) => {
    // Apply to errors, redirects, HTML and downloads as well as JSON responses.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const host = request.headers.host ?? '';
      if (!allowedHosts.has(hostName(host))) throw new DemoError('This host is not in BYOSYNC_ALLOWED_HOSTS.', 403);
      if (request.headers.origin && request.headers.origin !== (process.env.BYOSYNC_PUBLIC_ORIGIN || `http://${host}`)) throw new DemoError('Cross-origin access is not permitted.', 403);
      const url = new URL(request.url ?? '/', `http://${host}`);
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (request.method === 'GET' && url.pathname === '/api/health') { json(response, 200, { status: 'ok', product: 'ByoSync', mode: service.directory.enabled ? 'named-user' : accessToken ? 'portable-token' : 'local-operator' }); return; }
      if (request.method === 'POST' && url.pathname === '/api/session' && service.directory.enabled) {
        const input = z.object({ token: z.string().min(24).max(256) }).strict().parse(await body(request));
        if (!service.directory.authenticate(input.token)) throw new DemoError('Invalid sign-in credential.', 401);
        response.setHeader('Set-Cookie', `byosync_session=${encodeURIComponent(input.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.BYOSYNC_PUBLIC_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`);
        json(response, 200, { signed_in: true }); return;
      }
      if (request.method === 'GET' && url.pathname === '/login') {
        if (service.directory.enabled) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
          response.end('<!doctype html><html><head><title>ByoSync sign in</title></head><body style="font:16px system-ui;background:#f0f6fc;color:#173450;padding:8vh 20%"><h1>ByoSync</h1><p>Sign in with your personal operator credential.</p><form id="login"><label>Credential <input id="token" type="password" autocomplete="off" required minlength="24"></label><button>Sign in</button></form><p id="message"></p><script>document.getElementById("login").onsubmit=async e=>{e.preventDefault();const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:document.getElementById("token").value})});if(r.ok)location.href="/";else document.getElementById("message").textContent="Sign-in failed. Check your personal credential.";}</script></body></html>'); return;
        }
        if (!accessToken) { response.writeHead(302, { Location: '/' }); response.end(); return; }
        if (!sameSecret(url.searchParams.get('token') ?? undefined, accessToken)) throw new DemoError('The access token is invalid.', 401);
        const requestedRedirect = url.searchParams.get('redirect');
        const redirect = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//') && !requestedRedirect.includes('\\') ? requestedRedirect : '/';
        response.writeHead(302, { Location: redirect, 'Set-Cookie': `byosync_session=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.BYOSYNC_PUBLIC_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(); return;
      }
      const actor = service.directory.enabled ? service.directory.authenticate(bearer(request) || cookie(request, 'byosync_session')) : localActor;
      if (!actor || (!service.directory.enabled && accessToken && !sameSecret(bearer(request), accessToken) && !sameSecret(cookie(request, 'byosync_session'), accessToken))) {
        if (parts[0] === 'api') throw new DemoError('Authentication is required.', 401);
        response.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' }); response.end(); return;
      }
      await actorContext.run(actor, async () => {
      if (request.method === 'GET' && url.pathname === '/api/discovery/latest') { json(response, 200, await service.latestDiscovery()); return; }
      if (request.method === 'GET' && url.pathname === '/api/runtime') { if (!runtime) throw new DemoError('Room runtime unavailable.', 503); json(response, 200, await runtime.view()); return; }
      if (request.method === 'GET' && parts.length === 4 && parts[1] === 'runs' && parts[3] === 'download') {
        if (!runtime) throw new DemoError('Room runtime unavailable.', 503);
        const archive = await runtime.download(parts[2]);
        response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="byosync-reviewed-build.zip"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(Buffer.from(archive)); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') { json(response, 200, await service.getState()); return; }
      if (request.method === 'GET' && url.pathname === '/api/platform/status') {
        if (!platform) throw new DemoError('Platform service is unavailable.', 503);
        const snapshot = await service.getState();
        const status = await platform.status({ host: bindHost, authRequired: Boolean(accessToken) || service.directory.enabled, namedUsers: service.directory.enabled, governanceIntegrity: snapshot.integrity.status, governanceRecords: snapshot.integrity.recordCount });
        if (service.directory.enabled) status.deployment.auth = 'named-user token sessions with role permissions';
        json(response, 200, status); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/telemetry') {
        if (!platform) throw new DemoError('Platform service is unavailable.', 503);
        const records = await platform.telemetry(url.searchParams.get('trace_id') ?? undefined, Number(url.searchParams.get('limit') ?? 500));
        const rooms = new Set((await service.getState()).rooms.map(room => room.room_id));
        json(response, 200, actor.role === 'admin' ? records : records.filter(record => typeof record.evidence.room_id === 'string' && rooms.has(record.evidence.room_id))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/source-reports') {
        if (!platform) throw new DemoError('Platform service is unavailable.', 503);
        json(response, 200, await platform.reports(Number(url.searchParams.get('limit') ?? 100))); return;
      }
      if (request.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'agents' && parts[3] === 'trace') { json(response, 200, await service.trace(parts[2])); return; }
      if (request.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'agents' && parts[3] === 'identity-trace') {
        if (!platform) throw new DemoError('Platform service is unavailable.', 503);
        let trace = await platform.identityTrace(parts[2], await service.trace(parts[2]));
        if (actor.role !== 'admin') {
          const rooms = new Set((await service.getState()).rooms.map(room => room.room_id));
          trace = trace.filter(item => item.lane === 'authority' || (typeof item.record.evidence.room_id === 'string' && rooms.has(item.record.evidence.room_id)));
        }
        json(response, 200, trace); return;
      }
      if (request.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'agents' && parts[3] === 'passport') {
        const passport = await service.passport(parts[2]); if (!passport) throw new DemoError('Passport was not found.', 404); json(response, 200, passport); return;
      }
      if (request.method === 'POST' && parts[0] === 'api') {
        const input = await body(request); let output: unknown;
        if (actor.role === 'viewer' && !(parts[1] === 'brain' && parts[3] === 'search')) throw new DemoError('Read-only users cannot issue commands.', 403);
        const reviewerRoute = parts[3] === 'decision' || parts[3] === 'review' || parts[3] === 'publish' || parts[3] === 'sync';
        if (reviewerRoute && !['admin', 'reviewer'].includes(actor.role)) throw new DemoError('Reviewer permission required.', 403);
        const adminRoute = ['agents', 'adapters', 'telemetry', 'source-reports'].includes(parts[1]) || parts[3] === 'members' || url.pathname === '/api/rooms' || url.pathname === '/api/runtime/check' || url.pathname === '/api/discovery/import' || url.pathname === '/api/discovery/claw-hunter';
        if (adminRoute && actor.role !== 'admin') throw new DemoError('Administrator permission required.', 403);
        if (actor.role === 'reviewer' && !reviewerRoute && parts[3] !== 'search' && parts[3] !== 'cancel') throw new DemoError('Reviewer cannot initiate agent work.', 403);
        if (url.pathname === '/api/discovery/claw-hunter') { empty.parse(input); if (!platform) throw new DemoError('Platform unavailable.', 503); output = await platform.ingestSourceReport(await collectClawHunter(process.env.BYOSYNC_ROOT || resolve(process.cwd(), '../..'))); }
        else if (url.pathname === '/api/runtime/check') { empty.parse(input); if (!runtime) throw new DemoError('Room runtime unavailable.', 503); output = await runtime.checkEngines(); }
        else if (parts.length === 4 && parts[1] === 'agents' && parts[3] === 'runtime') { const data = z.object({ engine: engineSchema }).strict().parse(input); if (!runtime) throw new DemoError('Room runtime unavailable.', 503); output = await runtime.bind(parts[2], data.engine); }
        else if (parts.length === 4 && parts[1] === 'rooms' && parts[3] === 'members') { const data = z.object({ human_ids: z.array(id).max(100) }).strict().parse(input); output = await service.setRoomMembers(parts[2], data.human_ids); }
        else if (parts.length === 4 && parts[1] === 'rooms' && parts[3] === 'runs') { const data = z.object({ title: z.string().trim().min(3).max(160), objective: z.string().trim().min(8).max(12000), agent_ids: z.array(id).min(1).max(4) }).strict().parse(input); if (!runtime) throw new DemoError('Room runtime unavailable.', 503); output = await runtime.request(parts[2], data.title, data.objective, data.agent_ids); }
        else if (parts.length === 4 && parts[1] === 'runs' && ['decision', 'cancel', 'publish', 'memory'].includes(parts[3])) {
          if (!runtime) throw new DemoError('Room runtime unavailable.', 503);
          if (parts[3] === 'decision') { const data = z.object({ decision: z.enum(['approve', 'reject']) }).strict().parse(input); output = await runtime.decide(parts[2], data.decision === 'approve'); }
          else { empty.parse(input); output = parts[3] === 'cancel' ? await runtime.cancel(parts[2]) : parts[3] === 'publish' ? await runtime.publish(parts[2]) : await runtime.proposeMemory(parts[2]); }
        }
        else if (parts.length === 4 && parts[1] === 'brain' && parts[3] === 'search') { const data = z.object({ query: z.string().trim().max(2000) }).strict().parse(input); if (!runtime) throw new DemoError('Room runtime unavailable.', 503); output = await runtime.searchMemory(parts[2], data.query); }
        else if (parts.length === 4 && parts[1] === 'memories' && parts[3] === 'sync') { empty.parse(input); if (!runtime) throw new DemoError('Room runtime unavailable.', 503); output = await runtime.syncMemory(parts[2]); }
        else if (url.pathname === '/api/telemetry/ingest') {
          if (!platform) throw new DemoError('Platform service is unavailable.', 503);
          const payload = z.union([telemetryInputSchema, z.array(telemetryInputSchema).min(1).max(1000)]).parse(input);
          output = await platform.ingestTelemetry(payload);
        }
        else if (url.pathname === '/api/source-reports') {
          if (!platform) throw new DemoError('Platform service is unavailable.', 503);
          output = await platform.ingestSourceReport(sourceReportInputSchema.parse(input));
        }
        else if (url.pathname === '/api/adapters/claw-hunter') {
          if (!platform) throw new DemoError('Platform service is unavailable.', 503);
          output = await platform.ingestSourceReport(normalizeClawHunterReport(input));
        }
        else if (url.pathname === '/api/adapters/shadow-ai-guard') {
          if (!platform) throw new DemoError('Platform service is unavailable.', 503);
          output = await platform.ingestSourceReport(normalizeShadowAiGuardFindings(input));
        }
        else if (url.pathname === '/api/discovery/scan' || url.pathname === '/api/discover') { empty.parse(input); output = await service.discoverAgents(); }
        else if (url.pathname === '/api/discovery/import') { const data = z.object({ census_agent_id: id, scan_id: id.optional() }).strict().parse(input); output = await service.importAgent(data.census_agent_id, data.scan_id); }
        else if (parts.length === 4 && parts[1] === 'agents' && parts[3] === 'bind') { const data = z.object({ human_id: id }).strict().parse(input); output = await service.bind(parts[2], data.human_id); }
        else if (parts.length === 4 && parts[1] === 'agents' && parts[3] === 'passport') { empty.parse(input); output = await service.issuePassport(parts[2]); }
        else if (parts.length === 4 && parts[1] === 'agents' && parts[3] === 'mandate') { const data = z.object({ profile: z.literal('product-build').optional() }).strict().parse(input); output = await service.assignMandate(parts[2], data.profile === 'product-build'); }
        else if (parts.length === 5 && parts[1] === 'agents' && parts[3] === 'mandate' && parts[4] === 'lifecycle') { const data = z.object({ action: z.enum(['suspend', 'reactivate', 'revoke']) }).strict().parse(input); output = await service.updateMandate(parts[2], data.action); }
        else if (url.pathname === '/api/rooms') { const data = z.object({ agent_id: id, name: z.string().trim().min(2).max(160).optional(), agent_ids: z.array(id).max(20).optional() }).strict().parse(input); output = await service.createRoom(data.agent_id, data.name, data.agent_ids); }
        else if (parts.length === 4 && parts[1] === 'rooms' && parts[3] === 'work') { const data = z.object({ agent_id: id, title: z.string().trim().min(3).max(160), objective: z.string().trim().min(8).max(1000), risk: z.enum(['standard', 'sensitive', 'restricted']), priority: z.number().int().min(1).max(5) }).strict().parse(input); output = await service.createWork(parts[2], data.agent_id, data.title, data.objective, data.risk, data.priority); }
        else if (parts.length === 4 && parts[1] === 'rooms' && parts[3] === 'actions') { const data = z.object({ agent_id: id, action, idempotency_key: id.optional() }).strict().parse(input); output = await service.requestAction(parts[2], data.agent_id, data.action, data.idempotency_key); }
        else if (parts.length === 4 && parts[1] === 'work' && parts[3] === 'status') { const data = z.object({ status: z.enum(['queued', 'active', 'approval', 'blocked', 'complete']) }).strict().parse(input); output = await service.updateWork(parts[2], data.status); }
        else if (parts.length === 4 && parts[1] === 'work' && parts[3] === 'handoff') { const data = z.object({ from_agent_id: id, to_agent_id: id, act: z.enum(['request', 'inform', 'propose', 'query', 'response', 'handoff']), subject: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(4000) }).strict().parse(input); output = await service.sendHandoff(parts[2], data.from_agent_id, data.to_agent_id, data.act, data.subject, data.body); }
        else if (parts.length === 4 && parts[1] === 'work' && parts[3] === 'response') { const data = z.object({ agent_id: id, body: z.string().trim().min(1).max(4000) }).strict().parse(input); output = await service.recordWorkResponse(parts[2], data.agent_id, data.body); }
        else if (parts.length === 4 && parts[1] === 'approvals' && parts[3] === 'decision') { const data = z.object({ decision: z.enum(['approve', 'reject']) }).strict().parse(input); output = await service.decideApproval(parts[2], data.decision); }
        else if (parts.length === 4 && parts[1] === 'rooms' && parts[3] === 'memories') { const data = z.object({ agent_id: id, title: z.string().trim().min(2).max(160).optional(), content: z.string().trim().min(1).max(12000).optional() }).strict().parse(input); output = await service.proposeMemory(parts[2], data.agent_id, data.title, data.content); }
        else if (parts.length === 4 && parts[1] === 'memories' && parts[3] === 'review') { const data = z.object({ decision: z.enum(['approve', 'reject']), content: z.string().trim().min(1).max(12000).optional(), note: z.string().max(2000).optional() }).strict().parse(input); output = await service.reviewMemory(parts[2], data.decision, data.content, data.note); }
        else throw new DemoError('API route was not found.', 404);
        json(response, 200, output); return;
      }
      if (parts[0] === 'api') throw new DemoError('API route was not found.', 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new DemoError('Method is not supported.', 405);
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const filename = resolve(webRoot, relative);
      if (filename !== webRoot && !filename.startsWith(`${webRoot}${sep}`)) throw new DemoError('Invalid asset path.', 400);
      let data: Buffer;
      try { data = await readFile(filename); } catch { throw new DemoError('Page or asset was not found. Run npm run build first.', 404); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
      response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); response.end(request.method === 'HEAD' ? undefined : data);
      });
    } catch (error) {
      if (error instanceof z.ZodError) json(response, 400, { error: 'Invalid request or state data.', details: error.issues.map(issue => ({ path: issue.path, message: issue.message })) });
      else json(response, error instanceof DemoError ? error.status : 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
    }
  });
}

export async function startServer() {
  const dataPath = process.env.BYOSYNC_DATA_DIR ?? process.env.GOVERNANCE_DATA_DIR ?? resolve(process.cwd(), '../../integration-data/byosync');
  const productRoot = process.env.BYOSYNC_ROOT || resolve(process.cwd(), '../..');
  const discovery = process.env.BYOSYNC_ENDPOINT_DISCOVERY === '0' ? createCensusProvider() : withEndpointDiscovery(createCensusProvider(), productRoot);
  const directory = new ActorDirectory(); await directory.initialize();
  const service = new GovernanceService(dataPath, discovery, undefined, directory); await service.initialize();
  const platform = new PlatformService(dataPath, discovery); await platform.initialize();
  const runtime = new RoomRuntime(service, platform); await runtime.initialize();
  const server = createGovernanceServer(service, resolve(process.cwd(), 'apps/web/dist'), platform, runtime);
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.BYOSYNC_HOST?.trim() || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && !process.env.BYOSYNC_ACCESS_TOKEN?.trim() && !directory.enabled) throw new Error('Named users or BYOSYNC_ACCESS_TOKEN are required on a non-loopback bind.');
  server.listen(port, host, () => process.stdout.write(`ByoSync listening on http://${host}:${port}\n`));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void runtime.stop().finally(() => server.close(() => process.exit(0))); });
  return { service, platform, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : error}\n`); process.exitCode = 1; });
}
