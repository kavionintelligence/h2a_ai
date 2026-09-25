/**
 * One scene per demonstration in HP_CTO_CISO_BUTTON_BY_BUTTON_DEMONSTRATION_RUNBOOK.md.
 * Each scene produces exactly one video file.
 *
 * Truthfulness rules honoured here:
 *  - No scene claims a result the persisted product state does not show.
 *  - Provider execution is attempted against the real local CLIs; whatever the
 *    product records (succeeded / failed / waiting) is what the caption says.
 *  - Liveness stays `demo-bypass`; captions never call a proof high assurance.
 *  - A transport acknowledgement is never described as remote model execution.
 */
import {
  ADMIN,
  OPERATOR,
  beat,
  caption,
  closeWorkspace,
  dismissProofDialog,
  ensureControl,
  ensureOffice,
  enrollHumans,
  narrate,
  openControlScreen,
  openWorkspace,
  panThrough,
  proveHuman,
  refreshBothProofs,
  reloadShell,
  tryClickButton,
  tryClickControl,
  walkTabs
} from './harness.mjs';

const BOOTSTRAP_PURPOSE = 'authorize HP CTO and CISO demonstration bootstrap';
const GRAPH_PURPOSE = 'approve collaborative work graph';
const ESCALATION_REQUEST_PURPOSE = 'request restricted findings publication';
const CONTAINMENT_PURPOSE = 'revoke delegated work graph authority';

export const scenes = [
  /* =============================================================== *
   * 01 - Screen 1: Office overview and honest status header
   * =============================================================== */
  {
    id: 'office-overview',
    title: 'Screen 1 · Office overview',
    subtitle: 'One operational workspace, not a set of disconnected demos',
    async run({ page, note }) {
      await ensureOffice(page);
      await narrate(page, 'H2A Operations Office', 'The 2D floor is a visual index over canonical control-plane records.', 3000);

      const header = await page.locator('header.topbar, .office-topbar, header').first().innerText().catch(() => '');
      note(`Header status text: ${header.replace(/\s+/gu, ' ').slice(0, 300)}`);
      await narrate(page, 'Status header', 'Mode, trust ceiling, evidence integrity, and session cursor are read from persisted state.', 3200);

      await narrate(page, 'Trust ceiling', 'Every result in this recording is capped at connected-observed.', 2600);

      const hotspots = page.locator('[data-control-id="office.workspace.open"]');
      const count = await hotspots.count();
      note(`Office workspace hotspots: ${count}`);
      await caption(page, 'Ten audience-facing workspaces', 'Live organization, Agent roster, Tasks, Collaboration, Coworkers, Approvals, Context, Project delivery, Security, Evidence.');
      for (let index = 0; index < count; index += 1) {
        const label = (await hotspots.nth(index).innerText().catch(() => '')).replace(/\s+/gu, ' ').trim();
        await hotspots.nth(index).click().catch(() => undefined);
        await caption(page, `Workspace ${index + 1} of ${count}`, label);
        await beat(page, 1400);
        await closeWorkspace(page);
      }
      await narrate(page, 'Office tour complete', 'Switching views never creates a second copy of the task or changes its state.', 2400);
    }
  },

  /* =============================================================== *
   * 02 - Pre-demo preparation: two humans, separated authority,
   *      four Passport V2 participants, mandates and assignments
   * =============================================================== */
  {
    id: 'organization-bootstrap',
    title: 'Pre-demo · Enterprise bootstrap',
    subtitle: 'Two enrolled humans, separated authority, four attested participants',
    async run({ page, note, state }) {
      await ensureControl(page);
      await openControlScreen(page, 'Demo Gate');
      await narrate(page, 'Control · Demo Gate', 'The system does not self-declare readiness. Each prerequisite is a persisted step.', 3000);

      await caption(page, 'Enrolling two employees', 'Deterministic capture vectors through the real BCH fuzzy extractor · liveness demo-bypass.');
      const created = await enrollHumans(page);
      note(`Human Proof enrollment: ${created.length > 0 ? `enrolled ${created.join(', ')}` : 'already enrolled'} (liveness mode: demo-bypass, not high assurance)`);
      await beat(page, 1600);

      await caption(page, 'Fresh purpose-bound Human Proof', `Exact purpose: ${BOOTSTRAP_PURPOSE}`);
      const proofs = await refreshBothProofs(page, BOOTSTRAP_PURPOSE);
      note(`Administrator proof: ${proofs.admin?.humanProofId ?? 'none'} · Operator proof: ${proofs.operator?.humanProofId ?? 'none'}`);
      await reloadShell(page);
      await ensureControl(page);
      await openControlScreen(page, 'Demo Gate');
      await beat(page, 1200);

      await caption(page, 'Create ceremony', 'A shared acceptance ceremony trace binds every bootstrap record.');
      if (!(await tryClickButton(page, 'Create ceremony', { exact: true, timeout: 15_000 }))) {
        note('Create ceremony was unavailable - an active ceremony already exists.');
      }
      await beat(page, 2200);

      await caption(page, 'Assess prerequisites', 'H2A reads real local state instead of trusting the operator.');
      await tryClickButton(page, 'Assess prerequisites', { exact: true, timeout: 15_000 });
      await beat(page, 2600);

      const ceremonyIds = await page.locator('.ceremony-identity code').allInnerTexts().catch(() => []);
      if (ceremonyIds.length > 0) {
        state.ceremonyId = ceremonyIds[0];
        state.ceremonyTrace = ceremonyIds[1] ?? null;
        note(`Ceremony ${ceremonyIds[0]}${ceremonyIds[1] ? ` on trace ${ceremonyIds[1]}` : ''}`);
      }

      await caption(page, 'Validate two humans', 'Administrator/approver and operator are separate people with separate powers.');
      const administrator = page.locator('#bootstrap-administrator');
      if ((await administrator.count()) > 0) {
        await administrator.selectOption({ value: ADMIN.humanId }).catch(() => undefined);
        await beat(page, 700);
        await page.locator('#bootstrap-operator').selectOption({ value: OPERATOR.humanId }).catch(() => undefined);
        await beat(page, 900);
      }
      await tryClickControl(page, 'bootstrap.prepare', { timeout: 20_000 });
      await dismissProofDialog(page);
      await beat(page, 2600);

      for (const step of ['Configure authority', 'Create participants', 'Issue mandates and tasks']) {
        await refreshBothProofs(page, BOOTSTRAP_PURPOSE);
        await caption(page, step, 'Each step signs canonical records and links evidence to the ceremony trace.');
        const clicked = await tryClickButton(page, step, { exact: true, timeout: 20_000 });
        note(`${step}: ${clicked ? 'executed' : 'control unavailable'}`);
        await dismissProofDialog(page);
        await beat(page, 3200);
      }

      const summary = (await page.locator('.bootstrap-summary').innerText().catch(() => '')).replace(/\s+/gu, ' ');
      if (summary) note(`Bootstrap summary: ${summary}`);
      await narrate(page, 'Bootstrap result', summary || 'Bootstrap summary panel was not rendered.', 3600);

      const steps = (await page.locator('.bootstrap-step-grid').innerText().catch(() => '')).replace(/\s+/gu, ' ');
      if (steps) note(`Bootstrap steps: ${steps.slice(0, 400)}`);
      await panThrough(page, '.bootstrap-workspace', { steps: 2 });
    }
  },

  /* =============================================================== *
   * 03 - Live organization: people, roles, credentials, policy
   * =============================================================== */
  {
    id: 'live-organization',
    title: 'Screen 1 · Live organization',
    subtitle: 'Accountable humans hold different, bounded business powers',
    async run({ page, note }) {
      await openWorkspace(page, 'Live organization');
      await narrate(page, 'Office · Live organization', 'Human Proof says who is present. Membership, role, and credential say what they may authorize.', 3200);

      const tabs = await walkTabs(page, ['employees', 'roles', 'credentials', 'policy'], { hold: 2600 });
      note(`Organization tabs shown: ${tabs.join(', ') || 'none matched'}`);

      const body = (await page.locator('[data-office-workspace]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ');
      note(`Organization workspace content: ${body.slice(0, 500)}`);
      await panThrough(page, '[data-office-workspace]', { steps: 3 });

      await narrate(page, 'Separation of duty', 'The administrator/approver and the operator are not interchangeable.', 2800);
      await closeWorkspace(page);

      await ensureControl(page);
      await openControlScreen(page, 'People & Authority');
      await narrate(page, 'Control · People & Authority', 'Business authority is organization-scoped and separable from biometric identity.', 3200);
      await panThrough(page, 'main', { steps: 3 });
    }
  },

  /* =============================================================== *
   * 04 - Screen 2: agent Passport, sponsor, runtime session, attestation
   * =============================================================== */
  {
    id: 'agent-identity-and-runtime',
    title: 'Screen 2 · Agent roster',
    subtitle: 'A provider account is not authority',
    async run({ page, note }) {
      await openWorkspace(page, 'Agent roster');
      await narrate(page, 'Office · Agent roster', 'Passport V2, human sponsor, runtime session, attestation, mandate, and assignment.', 3200);

      const cards = page.locator('[data-office-workspace] article, [data-office-workspace] li').filter({ hasText: /Passport|passport|Claude|Codex|Antigravity|CLI/u });
      const total = Math.min(await cards.count(), 4);
      note(`Agent cards inspected: ${total}`);
      for (let index = 0; index < total; index += 1) {
        await cards.nth(index).click({ timeout: 5_000 }).catch(() => undefined);
        const text = (await cards.nth(index).innerText().catch(() => '')).replace(/\s+/gu, ' ');
        await caption(page, `Agent ${index + 1} of ${total}`, text.slice(0, 150));
        note(`Agent card ${index + 1}: ${text.slice(0, 220)}`);
        await beat(page, 2000);
        await walkTabs(page, ['identity', 'runtime'], { hold: 2200 });
      }

      await narrate(
        page,
        'Durable identity vs. replaceable runtime',
        'The provider binding can change without replacing the Passport, but execution needs a current session and attestation.',
        3600
      );
      await panThrough(page, '[data-office-workspace]', { steps: 3 });
      await closeWorkspace(page);

      await ensureControl(page);
      await openControlScreen(page, 'Command Floor');
      await narrate(page, 'Control · Command Floor', 'A Run control is enabled only when every named prerequisite resolves.', 3400);
      await panThrough(page, 'main', { steps: 3 });
    }
  },

  /* =============================================================== *
   * 05 - Screen 3: coworker pairing and the pinned remote boundary
   * =============================================================== */
  {
    id: 'coworkers-and-federation',
    title: 'Screen 3 · Coworkers',
    subtitle: 'A friendly name is not the trust anchor',
    async run({ page, note }) {
      await openWorkspace(page, 'Coworkers');
      await narrate(page, 'Office · Coworkers', 'Another employee H2A root stays independently keyed until both administrators connect it.', 3200);

      const before = (await page.locator('[data-office-workspace]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ');
      note(`Coworkers workspace state: ${before.slice(0, 400)}`);

      await caption(page, 'Add coworker', 'Discovery is attempted against the real local discovery path.');
      const added = await tryClickButton(page, 'Add coworker', { timeout: 8_000 });
      note(`"Add coworker" control: ${added ? 'opened' : 'not available in this state'}`);
      await beat(page, 2400);
      await dismissProofDialog(page);

      const after = (await page.locator('[data-office-workspace]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ');
      note(`Discovery result: ${after.slice(0, 400)}`);
      await narrate(
        page,
        'Truthful boundary',
        'No second H2A root is paired in this single-root recording, so no remote provider execution is claimed.',
        4000
      );
      await closeWorkspace(page);

      await ensureControl(page);
      await openControlScreen(page, 'Federation');
      await narrate(page, 'Control · Federation', 'Local node identity, pinned keys, listener, peers, handshake documents, and signed traffic receipts.', 3400);
      const federation = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/gu, ' ');
      note(`Federation control screen: ${federation.slice(0, 500)}`);
      await walkTabs(page, ['Peers', 'Handshake', 'Traffic'], { hold: 2600 });
      await panThrough(page, 'main', { steps: 3 });
      await narrate(
        page,
        'Acknowledgement is not execution',
        'A signed acknowledgement proves receipt and bounded transport, never that a remote provider produced the output.',
        3800
      );
    }
  },

  /* =============================================================== *
   * 06 - Screens 4 and 5: goal composer, work graph, exact-plan approval
   * =============================================================== */
  {
    id: 'goal-and-work-graph',
    title: 'Screens 4-5 · Goal to governed work graph',
    subtitle: 'One business outcome becomes separately governed work',
    async run({ page, note, state, storefrontRoot }) {
      await ensureOffice(page);
      await openWorkspace(page, 'Project delivery');
      await narrate(page, 'Office · Project delivery', 'The canonical local Git root, protected paths, and allowed commands are registered first.', 3200);

      const already = await page.evaluate(async () => (await window.h2a.getProjectDeliveryState()).projects.length);
      if (already === 0) {
        await page.getByLabel('Project name').first().fill('HP Governed Clothing Storefront').catch(() => undefined);
        await page.getByLabel('Canonical local Git root').first().fill(storefrontRoot).catch(() => undefined);
        await beat(page, 1000);
        await caption(page, 'Register project', 'Base branch, base revision, protected paths, and allowed commands are read from the real repository.');
        await tryClickControl(page, 'project.register', { timeout: 20_000 });
        await beat(page, 2600);
      }
      const projects = await page.evaluate(async () => (await window.h2a.getProjectDeliveryState()).projects.map((item) => ({ id: item.project_id, name: item.display_name, base: item.base_revision ?? null, mode: item.repository_mode })));
      state.projects = projects;
      note(`Registered projects: ${JSON.stringify(projects)}`);
      await closeWorkspace(page);

      await openWorkspace(page, 'Tasks');
      await narrate(page, 'Office · Tasks', 'H2A turns one human goal into bounded work instead of one unrestricted prompt.', 3000);

      const workspace = page.locator('[data-office-workspace]').first();
      const projectSelect = workspace.getByLabel('Project').first();
      if ((await projectSelect.count()) > 0 && projects[0]) {
        await projectSelect.selectOption({ value: projects[0].id }).catch(() => undefined);
        await beat(page, 800);
      }
      await workspace.getByLabel('Goal').first().fill('Build a small clothing website').catch(() => undefined);
      await workspace
        .getByLabel('Outcome')
        .first()
        .fill('A polished, accessible clothing storefront with source-backed content and passing validation.')
        .catch(() => undefined);
      await workspace
        .getByLabel('Objective')
        .first()
        .fill('Research product content, design the storefront UI, implement it, and validate accessibility and quality.')
        .catch(() => undefined);
      await workspace
        .getByLabel('Constraints')
        .first()
        .fill(
          [
            'No protected values in provider outputs',
            'No writes outside approved project paths',
            'Use only approved research hosts',
            'Require independent approval before integration'
          ].join('\n')
        )
        .catch(() => undefined);
      await beat(page, 1600);
      await narrate(page, 'Compose the exact goal', 'Goal, outcome, objective, and constraints are all part of the signed record.', 3000);

      await caption(page, '1. Compose goal', 'The goal is persisted with its own tr_goal_* trace.');
      await tryClickControl(page, 'work-graph.goal.compose', { timeout: 25_000 });
      await beat(page, 2600);

      const goal = await page.evaluate(async () => {
        const graphState = await window.h2a.getGoalWorkGraphState();
        const latest = graphState.goals.at(-1);
        return latest ? { goalId: latest.goal_id, traceId: latest.trace_id, title: latest.title } : null;
      });
      if (goal) {
        state.goalTrace = goal.traceId;
        state.goalId = goal.goalId;
        note(`Composed goal ${goal.goalId} on trace ${goal.traceId}`);
      } else {
        note('No collaborative goal was persisted - the composer prerequisites were not satisfied.');
      }

      await caption(page, '2. Propose graph', 'Deterministic proposal: research, UI, implementation, QA.');
      await tryClickControl(page, 'work-graph.plan.propose', { timeout: 25_000 });
      await beat(page, 3000);

      const graph = await page.evaluate(async () => {
        const graphState = await window.h2a.getGoalWorkGraphState();
        const latest = graphState.graphs.at(-1);
        return latest
          ? {
              graphId: latest.graph_id,
              status: latest.status,
              revision: latest.revision,
              nodes: latest.nodes.map((node) => ({
                title: node.title,
                provider: node.provider,
                target: node.execution_target,
                status: node.status,
                released: node.allowed_context_fields.length,
                withheld: node.withheld_context_fields.length,
                expires: node.mandate_expires_at
              })),
              edges: latest.dependency_edges.length,
              checkpoints: latest.approval_checkpoints.length
            }
          : null;
      });
      state.graph = graph;
      note(graph ? `Proposed graph ${graph.graphId} rev ${graph.revision}: ${JSON.stringify(graph.nodes)}` : 'No work graph was proposed.');
      await narrate(
        page,
        'Four separately governed nodes',
        graph ? graph.nodes.map((node) => `${node.title} · ${node.provider} · ${node.target}`).join('   |   ') : 'Graph proposal unavailable.',
        4200
      );
      await panThrough(page, '[data-office-workspace]', { steps: 4, hold: 2200 });

      await narrate(page, 'Dependencies', 'Research and UI start independently. Implementation waits for both. QA waits for implementation.', 3400);

      await refreshBothProofs(page, GRAPH_PURPOSE);
      await caption(page, '3. Approve exact plan', 'Approval signs this exact graph revision, not a vague conversation.');
      await tryClickControl(page, 'work-graph.plan.approve', { timeout: 25_000 });
      await dismissProofDialog(page);
      await beat(page, 3000);

      const approved = await page.evaluate(async () => {
        const graphState = await window.h2a.getGoalWorkGraphState();
        const latest = graphState.graphs.at(-1);
        return latest ? { status: latest.status, approvedBy: latest.approved_by_human_id, proof: latest.approved_human_proof_id, nodes: latest.nodes.map((node) => `${node.title}=${node.status}`) } : null;
      });
      note(approved ? `Graph after approval: ${JSON.stringify(approved)}` : 'Graph state unavailable after approval.');
      await narrate(
        page,
        'Plan approved',
        approved ? `Status ${approved.status} · approved by ${approved.approvedBy ?? 'unknown'} · proof ${approved.proof ?? 'none'}` : 'Approval did not persist.',
        4000
      );
    }
  },

  /* =============================================================== *
   * 07 - Screen 6: run the approved work against real local providers
   * =============================================================== */
  {
    id: 'run-governed-work',
    title: 'Screen 6 · Run independent work',
    subtitle: 'Real provider boundaries and honest waiting states',
    async run({ page, note, state }) {
      await ensureOffice(page);
      await openWorkspace(page, 'Tasks');
      await narrate(page, 'Office · Tasks', 'Only nodes whose dependencies succeeded are runnable.', 2800);

      const probe = await page
        .evaluate(async () => {
          const runtime = await window.h2a.probeLiveProviders({});
          return (runtime.providers ?? runtime.health ?? []).map((item) => `${item.provider ?? item.id}=${item.status ?? item.state ?? 'unknown'}`);
        })
        .catch(() => []);
      if (probe.length > 0) note(`Live provider probe: ${probe.join(', ')}`);
      await narrate(page, 'Provider health is not completion', 'A green provider badge never means the task finished.', 3000);

      await refreshBothProofs(page, GRAPH_PURPOSE);
      await caption(page, '4. Run ready work', 'H2A launches the real local provider CLI inside the approved worktree boundary.');
      await tryClickControl(page, 'work-graph.nodes.run-ready', { timeout: 30_000 });
      await dismissProofDialog(page);

      const deadline = Date.now() + 240_000;
      let last = '';
      while (Date.now() < deadline) {
        const snapshot = await page
          .evaluate(async () => {
            const graphState = await window.h2a.getGoalWorkGraphState();
            const latest = graphState.graphs.at(-1);
            if (!latest) return null;
            return {
              status: latest.status,
              nodes: latest.nodes.map((node) => ({ title: node.title, status: node.status, reason: node.reason_code, hash: node.output_hash }))
            };
          })
          .catch(() => null);
        if (!snapshot) break;
        const summary = snapshot.nodes.map((node) => `${node.title.split(' ').slice(0, 2).join(' ')}: ${node.status}`).join('   |   ');
        if (summary !== last) {
          await caption(page, 'Execution status', summary);
          last = summary;
        }
        if (!snapshot.nodes.some((node) => node.status === 'running')) break;
        await beat(page, 4000);
      }

      const final = await page
        .evaluate(async () => {
          const graphState = await window.h2a.getGoalWorkGraphState();
          const latest = graphState.graphs.at(-1);
          return latest
            ? {
                status: latest.status,
                nodes: latest.nodes.map((node) => ({ title: node.title, provider: node.provider, status: node.status, reason: node.reason_code, output_hash: node.output_hash, output_ref: node.output_ref }))
              }
            : null;
        })
        .catch(() => null);
      state.runResult = final;
      if (final) {
        for (const node of final.nodes) {
          note(`Node "${node.title}" (${node.provider}): status=${node.status} reason=${node.reason ?? 'none'} output_hash=${node.output_hash ?? 'none'}`);
        }
      }
      await panThrough(page, '[data-office-workspace]', { steps: 4, hold: 2200 });
      await narrate(
        page,
        'Recorded outcome',
        final
          ? final.nodes.map((node) => `${node.title.split(' ').slice(0, 2).join(' ')}=${node.status}${node.reason ? ` (${node.reason})` : ''}`).join('   |   ')
          : 'Work graph state unavailable.',
        5000
      );
      await narrate(
        page,
        'Nothing is relabelled',
        'A failed or waiting provider run stays failed or waiting, with its persisted reason code.',
        3400
      );
    }
  },

  /* =============================================================== *
   * 08 - Screen 7a: signed handoffs and predecessor hashes
   * =============================================================== */
  {
    id: 'collaboration-handoffs',
    title: 'Screen 7 · Collaboration',
    subtitle: 'Bounded handoffs and hashes, not a shared chat transcript',
    async run({ page, note }) {
      await openWorkspace(page, 'Collaboration');
      await narrate(page, 'Office · Collaboration', 'Released fields, withheld fields, predecessor hashes, and evidence references.', 3200);

      const body = (await page.locator('[data-office-workspace]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ');
      note(`Collaboration workspace: ${body.slice(0, 600)}`);

      const signals = page.locator('[data-office-workspace] article, [data-office-workspace] li');
      const total = Math.min(await signals.count(), 6);
      for (let index = 0; index < total; index += 1) {
        await signals.nth(index).click({ timeout: 4_000 }).catch(() => undefined);
        const text = (await signals.nth(index).innerText().catch(() => '')).replace(/\s+/gu, ' ');
        await caption(page, `Signed signal ${index + 1} of ${total}`, text.slice(0, 160));
        await beat(page, 2000);
      }
      await panThrough(page, '[data-office-workspace]', { steps: 3 });
      await narrate(
        page,
        'What the next agent receives',
        'The authorized projection plus predecessor output hashes - not a copy of every previous answer.',
        3600
      );
    }
  },

  /* =============================================================== *
   * 09 - Screen 7b: context released and withheld
   * =============================================================== */
  {
    id: 'context-released-and-withheld',
    title: 'Screen 7 · Context',
    subtitle: 'Least context is decided per recipient, before disclosure',
    async run({ page, note }) {
      await openWorkspace(page, 'Context');
      await narrate(page, 'Office · Context', 'Grants, disclosures, artifacts, and signed message routes.', 3000);

      const tabs = await walkTabs(page, ['Grants', 'Disclosures', 'Artifacts', 'Messages'], { hold: 3000 });
      note(`Context tabs shown: ${tabs.join(', ') || 'none matched'}`);

      const contextState = await page
        .evaluate(async () => {
          const broker = await window.h2a.getContextBrokerState();
          return {
            artifacts: broker.artifacts.length,
            grants: broker.grants.length,
            sample: broker.grants.slice(-3).map((item) => ({
              grant: item.grant?.context_grant_id ?? null,
              recipient: item.grant?.recipient_agent_id ?? null,
              allowed: item.grant?.allowed_fields ?? [],
              withheld: (item.grant?.withheld_field_hashes ?? []).length,
              uses: item.grant?.maximum_uses ?? null,
              expires: item.grant?.expires_at ?? null
            }))
          };
        })
        .catch(() => null);
      if (contextState) note(`Context broker: ${JSON.stringify(contextState)}`);
      await panThrough(page, '[data-office-workspace]', { steps: 3 });
      await narrate(
        page,
        'Withheld is evidence too',
        'Durable evidence stores the projection hash and the field decision. Protected source values are never copied into the ledger.',
        4000
      );
      await closeWorkspace(page);

      await ensureControl(page);
      await openControlScreen(page, 'Context Broker');
      await narrate(page, 'Control · Context Broker', 'Least-context policy is enforced before a provider process launches.', 3200);
      await panThrough(page, 'main', { steps: 3 });
    }
  },

  /* =============================================================== *
   * 10 - Screen 8: independent approval of one exact effect
   * =============================================================== */
  {
    id: 'independent-human-approval',
    title: 'Screen 8 · Independent approval',
    subtitle: 'One effect hash, one consumable resume',
    async run({ page, note, state }) {
      await ensureControl(page);
      await openControlScreen(page, 'Authority Inbox');
      await narrate(page, 'Control · Authority Inbox', 'A sensitive effect is frozen and routed to a different eligible human.', 3200);

      await refreshBothProofs(page, BOOTSTRAP_PURPOSE);
      await reloadShell(page);
      await ensureControl(page);
      await openControlScreen(page, 'Authority Inbox');

      await caption(page, 'Configure the protected action', 'The requester, approver, policy, mandate, and review grant are all canonical records.');
      const configured = await tryClickControl(page, 'phase28.configure', { timeout: 20_000 });
      note(`Protected-action configuration: ${configured ? 'executed' : 'already configured or unavailable'}`);
      await beat(page, 3000);

      const policy = await page
        .evaluate(async () => {
          const approvals = await window.h2a.getAuthorityApprovalState();
          const escalation = await window.h2a.getHumanEscalationState();
          const active = approvals.policies.filter((item) => item.status === 'active').at(-1);
          return {
            purpose: active?.proof_purpose ?? null,
            policyId: active?.approval_policy_id ?? null,
            quorum: active?.quorum ?? null,
            separation: active?.separation_of_duty ?? null,
            escalationStatus: escalation.status,
            requester: escalation.requester_human_id,
            approver: escalation.approver_human_id,
            effectHash: escalation.requested_effect_hash
          };
        })
        .catch(() => null);
      note(`Approval policy: ${JSON.stringify(policy)}`);
      if (policy?.purpose) state.approvalPurpose = policy.purpose;

      const requesterPerson = policy?.requester === ADMIN.humanId ? ADMIN : OPERATOR;
      const approverPerson = policy?.approver === ADMIN.humanId ? ADMIN : ADMIN;
      await proveHuman(page, requesterPerson, ESCALATION_REQUEST_PURPOSE);
      await reloadShell(page);
      await ensureControl(page);
      await openControlScreen(page, 'Authority Inbox');

      await caption(page, 'Route protected action', 'The request carries the exact requested-effect hash, policy, quorum, and expiry.');
      const routed = await tryClickControl(page, 'phase28.request', { timeout: 20_000 });
      note(`Route protected action: ${routed ? 'executed' : 'control unavailable'}`);
      await dismissProofDialog(page);
      await beat(page, 3200);

      const pending = await page
        .evaluate(async () => {
          const approvals = await window.h2a.getAuthorityApprovalState();
          const request = approvals.requests.filter((item) => item.status === 'pending').at(-1) ?? approvals.requests.at(-1);
          return request
            ? {
                id: request.approval_request_id,
                status: request.status,
                resource: request.required_resource,
                action: request.required_action,
                effectHash: request.requested_effect_hash,
                expires: request.expires_at ?? null
              }
            : null;
        })
        .catch(() => null);
      state.approvalRequest = pending;
      note(`Approval request: ${JSON.stringify(pending)}`);
      await narrate(
        page,
        'The exact effect',
        pending ? `${pending.action} · ${pending.resource} · ${pending.effectHash ?? 'no hash'}` : 'No approval request is pending.',
        4000
      );
      await panThrough(page, 'main', { steps: 3 });

      if (state.approvalPurpose) {
        await caption(page, 'Verify exact purpose', `Independent approver proof for: ${state.approvalPurpose}`);
        const approverProof = await proveHuman(page, approverPerson, state.approvalPurpose);
        note(`Approver proof: ${approverProof?.humanProofId ?? 'none'} for purpose "${state.approvalPurpose}"`);
        await reloadShell(page);
        await ensureControl(page);
        await openControlScreen(page, 'Authority Inbox');
        await beat(page, 1600);
      }

      await caption(page, 'Approve', 'A signature over one effect hash - not a standing permission for the agent.');
      const approved = await tryClickControl(page, 'approval.decision.approve', { timeout: 20_000 });
      note(`Approve control: ${approved ? 'executed' : 'unavailable'}`);
      await dismissProofDialog(page);
      await beat(page, 3200);

      await caption(page, 'Resume once', 'The approved effect is consumable exactly once.');
      const resumed = await tryClickControl(page, 'approval.resume', { timeout: 20_000 });
      note(`Resume once: ${resumed ? 'executed' : 'unavailable'}`);
      await beat(page, 3000);

      const secondResume = await tryClickControl(page, 'approval.resume', { timeout: 5_000 });
      note(`Second resume attempt: ${secondResume ? 'control still present - verify terminal state in evidence' : 'control no longer available (exactly-once)'}`);

      const outcome = await page
        .evaluate(async () => {
          const approvals = await window.h2a.getAuthorityApprovalState();
          const escalation = await window.h2a.getHumanEscalationState();
          return {
            requests: approvals.requests.slice(-2).map((item) => ({ id: item.approval_request_id, status: item.status })),
            decisions: approvals.decisions.slice(-2).map((item) => ({ decision: item.decision, approver: item.approver_membership_id })),
            resumes: approvals.resumes.slice(-2).map((item) => ({ status: item.status, output: item.output_hash ?? null })),
            escalation: { status: escalation.status, run: escalation.run_id, output: escalation.output_hash }
          };
        })
        .catch(() => null);
      note(`Approval outcome: ${JSON.stringify(outcome)}`);
      await narrate(
        page,
        'Terminal decision',
        outcome ? `resumes=${JSON.stringify(outcome.resumes)} escalation=${JSON.stringify(outcome.escalation)}` : 'Approval state unavailable.',
        4600
      );
      await panThrough(page, 'main', { steps: 3 });
    }
  },

  /* =============================================================== *
   * 11 - Screen 9: cancellation and revocation containment
   * =============================================================== */
  {
    id: 'cancellation-and-revocation',
    title: 'Screen 9 · Containment',
    subtitle: 'Stopping execution is separate from deleting history',
    async run({ page, note }) {
      await ensureOffice(page);
      await openWorkspace(page, 'Tasks');
      await narrate(page, 'Office · Tasks', 'Containment is demonstrated on disposable work, never on an accepted integration.', 3000);

      const target = await page
        .evaluate(async () => {
          const graphState = await window.h2a.getGoalWorkGraphState();
          const latest = graphState.graphs.at(-1);
          const node = latest?.nodes.find((item) => ['ready', 'waiting', 'failed', 'running'].includes(item.status));
          return node && latest ? { graphId: latest.graph_id, nodeId: node.node_id, title: node.title, status: node.status } : null;
        })
        .catch(() => null);
      note(`Containment target: ${JSON.stringify(target)}`);

      await refreshBothProofs(page, CONTAINMENT_PURPOSE);
      await caption(page, 'Revoke delegated authority', target ? `Disposable node: ${target.title} (${target.status})` : 'No disposable node is available.');
      const revoked = (await tryClickButton(page, 'Revoke', { timeout: 8_000 })) || (await tryClickButton(page, 'Cancel', { timeout: 8_000 }));
      note(`Containment control: ${revoked ? 'executed' : 'no cancel/revoke control was available'}`);
      await dismissProofDialog(page);
      await beat(page, 3200);

      const after = await page
        .evaluate(async () => {
          const graphState = await window.h2a.getGoalWorkGraphState();
          const latest = graphState.graphs.at(-1);
          return latest ? latest.nodes.map((node) => `${node.title}=${node.status}${node.reason_code ? `/${node.reason_code}` : ''}`) : null;
        })
        .catch(() => null);
      note(`Node states after containment: ${JSON.stringify(after)}`);
      await narrate(page, 'Result', after ? after.join('   |   ') : 'Work graph state unavailable.', 4200);
      await narrate(
        page,
        'History survives',
        'Revocation removes future authority. The signed record of what happened stays available for investigation.',
        3600
      );
    }
  },

  /* =============================================================== *
   * 12 - Security: adversarial controls and containment receipts
   * =============================================================== */
  {
    id: 'security-denials',
    title: 'Security · Denials and containment',
    subtitle: 'A blocked attempt counts only when a denial receipt is persisted',
    async run({ page, note }) {
      await ensureOffice(page);
      await openWorkspace(page, 'Security');
      await narrate(page, 'Office · Security', 'Replay, forged approval, over-broad delegation, context leakage, federation tamper, provider failure.', 3400);

      const before = await page
        .evaluate(async () => {
          const security = await window.h2a.getSecurityValidationState();
          return (security.attacks ?? security.controls ?? []).map((item) => `${item.attack_id ?? item.id}=${item.status ?? item.result ?? 'unknown'}`);
        })
        .catch(() => []);
      note(`Security validation state before: ${before.join(', ') || 'unavailable'}`);

      const cards = page.locator('[data-office-workspace] article, [data-office-workspace] li');
      const total = Math.min(await cards.count(), 8);
      for (let index = 0; index < total; index += 1) {
        const text = (await cards.nth(index).innerText().catch(() => '')).replace(/\s+/gu, ' ');
        if (!text) continue;
        await caption(page, `Adversarial control ${index + 1}`, text.slice(0, 170));
        await beat(page, 1800);
      }

      const ran = await tryClickButton(page, /^Run/u, { timeout: 8_000 });
      note(`Adversarial run control: ${ran ? 'executed' : 'not available in this state'}`);
      await beat(page, 3400);

      const after = await page
        .evaluate(async () => {
          const security = await window.h2a.getSecurityValidationState();
          return (security.attacks ?? security.controls ?? []).map((item) => ({
            id: item.attack_id ?? item.id,
            status: item.status ?? item.result ?? null,
            reason: item.reason_code ?? null,
            evidence: item.evidence_refs ?? item.event_id ?? null
          }));
        })
        .catch(() => null);
      note(`Security validation state after: ${JSON.stringify(after)}`);
      await panThrough(page, '[data-office-workspace]', { steps: 3 });
      await narrate(
        page,
        'Reason codes, not checkboxes',
        'Each blocked attempt is a persisted denial receipt with an evidence event.',
        3600
      );
    }
  },

  /* =============================================================== *
   * 13 - Screen 10: reconstruct the whole chain in the evidence ledger
   * =============================================================== */
  {
    id: 'evidence-reconstruction',
    title: 'Screen 10 · Evidence',
    subtitle: 'The output is never separated from the path that produced it',
    async run({ page, note, state }) {
      await ensureOffice(page);
      await openWorkspace(page, 'Evidence');
      await narrate(page, 'Office · Evidence', 'Ledger count, integrity status, timeline, attribution, topology, and control coverage.', 3200);

      const trace = state.goalTrace ?? state.ceremonyTrace ?? '';
      if (trace) {
        const search = page.locator('[data-office-workspace] input[type="search"], [data-office-workspace] input[type="text"]').first();
        if ((await search.count()) > 0) {
          await search.fill(trace).catch(() => undefined);
          await beat(page, 900);
          await tryClickButton(page, 'Apply evidence filters', { timeout: 6_000 });
          await beat(page, 2400);
        }
        await caption(page, 'Filter by the business trace', trace);
        note(`Evidence filtered on trace ${trace}`);
      } else {
        note('No goal trace was available to filter the evidence ledger.');
      }

      const tabs = await walkTabs(page, ['Investigation', 'Enterprise topology', 'Controls'], { hold: 3400 });
      note(`Evidence views shown: ${tabs.join(', ') || 'none matched'}`);
      await panThrough(page, '[data-office-workspace]', { steps: 4, hold: 2200 });

      const ledger = await page
        .evaluate(async (traceId) => {
          const explorer = await window.h2a.getEvidenceExplorerState();
          const events = explorer.events ?? explorer.timeline ?? [];
          const filtered = traceId ? events.filter((item) => item.trace_id === traceId) : events;
          const types = {};
          for (const event of filtered) types[event.event_type] = (types[event.event_type] ?? 0) + 1;
          return {
            totalEvents: events.length,
            traceEvents: filtered.length,
            integrity: explorer.integrity ?? explorer.integrity_status ?? null,
            eventTypes: types,
            firstOnTrace: filtered.slice(0, 3).map((item) => ({ id: item.event_id, type: item.event_type, previous: item.previous_hash, hash: item.event_hash }))
          };
        }, trace)
        .catch(() => null);
      state.ledger = ledger;
      note(`Evidence ledger: ${JSON.stringify(ledger)}`);
      await narrate(
        page,
        'Hash-linked ledger',
        ledger ? `${ledger.totalEvents} persisted events · ${ledger.traceEvents} on this trace · integrity ${JSON.stringify(ledger.integrity)}` : 'Evidence explorer unavailable.',
        4600
      );
      await closeWorkspace(page);

      await ensureControl(page);
      await openControlScreen(page, 'Evidence');
      await narrate(page, 'Control · Evidence', 'The same trace, record IDs, hashes, reason codes, and trust ceiling remain visible.', 3600);
      await panThrough(page, 'main', { steps: 4, hold: 2200 });
      await narrate(
        page,
        'The differentiator',
        'Who initiated the goal, which identity and runtime acted, what authority and context were valid, who approved the effect, and why anything stopped.',
        5000
      );
    }
  },

  /* =============================================================== *
   * 14 - Technical drill-down across the Control surface
   * =============================================================== */
  {
    id: 'control-technical-drilldown',
    title: 'Technical drill-down · Control',
    subtitle: 'The same canonical records, for security and platform review',
    async run({ page, note }) {
      await ensureControl(page);
      for (const screen of ['Command Floor', 'Human Proof', 'People & Authority', 'Authority Inbox', 'Mandates', 'Context Broker', 'Federation', 'Evidence', 'Demo Gate', 'Settings']) {
        const opened = await page
          .getByRole('button', { name: screen, exact: true })
          .first()
          .click({ timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        if (!opened) {
          note(`Control screen "${screen}" was not reachable.`);
          continue;
        }
        await beat(page, 1400);
        const heading = (await page.locator('header.topbar h1').first().innerText().catch(() => screen)).trim();
        await caption(page, `Control · ${heading}`, controlPurpose[screen] ?? '');
        await beat(page, 2600);
        await panThrough(page, 'main', { steps: 2, hold: 1600 });
        note(`Control screen "${screen}" rendered as "${heading}".`);
      }

      const settings = await page
        .evaluate(async () => {
          const status = await window.h2a.getSystemStatus();
          return {
            storageMode: status.storageMode ?? status.storage_mode ?? null,
            agentMode: status.agentMode ?? status.agent_mode ?? null,
            humanProofMode: status.humanProofMode ?? status.human_proof_mode ?? null,
            livenessMode: status.livenessMode ?? status.liveness_mode ?? null,
            resourceMode: status.resourceMode ?? status.resource_mode ?? null,
            dataPath: status.dataPath ?? status.data_path ?? null,
            trustCeiling: status.trustCeiling ?? status.trust_ceiling ?? null
          };
        })
        .catch(() => null);
      note(`System status: ${JSON.stringify(settings)}`);
      await narrate(
        page,
        'Honest posture',
        settings ? `agent mode ${settings.agentMode} · liveness ${settings.livenessMode} · trust ${settings.trustCeiling}` : 'System status unavailable.',
        4600
      );
      await narrate(
        page,
        'Closing boundary',
        'Phase 51 final operator acceptance has not passed. Liveness is demo-bypass. Trust stays connected-observed.',
        5000
      );
    }
  }
];

const controlPurpose = {
  'Command Floor': 'Why a Run control is enabled or blocked.',
  'Human Proof': 'Enrolment, capture policy, distance, face count, and proof expiry.',
  'People & Authority': 'Organization-scoped business authority and the deterministic policy tester.',
  'Authority Inbox': 'Routed effects, quorum, eligible approvers, and exactly-once resume.',
  Mandates: 'Signed authority registry with attenuated parent-to-child delegation.',
  'Context Broker': 'Artifacts, grants, disclosures, projection hashes, and revocation.',
  Federation: 'Node identity, pinned keys, peers, handshake documents, and signed traffic.',
  Evidence: 'Investigation timeline, attribution chain, topology, controls, and integrity.',
  'Demo Gate': 'Acceptance gates and adversarial controls - readiness is never self-declared.',
  Settings: 'The exact data path and the truthful runtime posture of this window.'
};
