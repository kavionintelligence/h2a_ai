import { z } from 'zod';
import type { SourceReportInput } from './platform';

const boundedText = z.string().max(2048).default('');

/** Native JSON shape emitted by the MIT Claw Hunter PowerShell/Bash collectors. */
export const clawHunterReportSchema = z.object({
  mdm_metadata: z.object({
    hostname: z.string().min(1).max(300),
    serial_number: z.string().max(300).default(''),
    timestamp: z.string().max(80),
    script_version: z.string().max(80).default('unknown'),
  }).passthrough(),
  security_summary: z.object({
    risk_level: z.enum(['clean', 'warning', 'critical']),
    critical_issues: z.number().int().min(0).default(0),
    warnings: z.number().int().min(0).default(0),
    info_items: z.number().int().min(0).default(0),
  }).passthrough(),
  platform: z.string().max(40).default('unknown'),
  cli_installed: z.boolean().default(false),
  cli_version: z.string().max(100).default(''),
  gateway_running: z.boolean().default(false),
  gateway_token_set: z.boolean().default(false),
  gateway_bind_to_all: z.boolean().default(false),
  risk_shell_access_enabled: z.boolean().default(false),
  risk_filesystem_write_enabled: z.boolean().default(false),
  secrets_found: z.boolean().default(false),
  secrets_count: z.number().int().min(0).default(0),
  agents_configured: z.number().int().min(0).default(0),
  integrations_count: z.number().int().min(0).default(0),
}).passthrough();

/** Stable finding shape accepted by the Apache-2.0 Shadow AI Guard receiver. */
export const shadowAiGuardFindingSchema = z.object({
  tool: z.string().min(1).max(200),
  surface: z.string().max(32).default('browser'),
  os: z.string().max(32).default('unknown'),
  account_domain: z.string().max(253).default(''),
  device: z.string().max(256).default('unknown'),
  user: z.string().max(256).default(''),
  evidence: boundedText,
  severity: z.string().max(16).default('warn'),
  reported_at: z.string().max(64).default(''),
  source: z.string().max(64).default(''),
  signal: z.string().max(16).default(''),
  mode: z.string().max(16).default(''),
  identity: z.string().max(16).default(''),
  trigger: z.string().max(200).default(''),
  schedule: z.string().max(120).default(''),
  device_name: z.string().max(256).default(''),
  risk_tier: z.string().max(32).default(''),
  occurrence_count: z.number().int().min(1).max(1_000_000).default(1),
  occurrence_unit: z.string().max(32).default('detections'),
}).strict();

export function normalizeClawHunterReport(raw: unknown): SourceReportInput {
  const report = clawHunterReportSchema.parse(raw);
  const findings: SourceReportInput['findings'] = [];
  const add = (condition: boolean, title: string, severity: 'medium' | 'high' | 'critical', category: string, detail: string) => {
    if (condition) findings.push({ title, severity, category, detail, evidence: { platform: report.platform, cli_version: report.cli_version || 'unknown' } });
  };
  add(report.risk_shell_access_enabled, 'OpenClaw shell access is enabled', 'critical', 'excessive-capability', 'The local agent configuration permits shell execution.');
  add(report.risk_filesystem_write_enabled, 'OpenClaw filesystem write is enabled', 'high', 'excessive-capability', 'The local agent configuration permits filesystem writes.');
  add(report.secrets_found, 'Potential credentials found in agent files', 'critical', 'credential-exposure', `Claw Hunter reported ${report.secrets_count} file(s) with potential secrets.`);
  add(report.gateway_bind_to_all, 'Agent gateway listens on all interfaces', 'critical', 'network-exposure', 'The gateway is reachable beyond loopback.');
  add(report.gateway_running && !report.gateway_token_set, 'Running agent gateway has no configured token', 'high', 'missing-authentication', 'The local gateway is active without a configured authentication token.');
  return {
    source: 'claw-hunter',
    observed_at: report.mdm_metadata.timestamp,
    collector: 'Claw Hunter',
    collector_version: report.mdm_metadata.script_version,
    host: report.mdm_metadata.hostname,
    status: report.security_summary.risk_level === 'clean' ? 'healthy' : 'degraded',
    summary: { observed_agents: Math.max(report.agents_configured, report.cli_installed ? 1 : 0), shadow_agents: 0, findings: findings.length },
    findings,
  };
}

export function normalizeShadowAiGuardFindings(raw: unknown): SourceReportInput {
  const values = z.union([shadowAiGuardFindingSchema, z.array(shadowAiGuardFindingSchema).min(1).max(5000)]).parse(raw);
  const findings = Array.isArray(values) ? values : [values];
  const first = findings[0];
  const highRisk = findings.filter(item => item.severity === 'warn' || item.risk_tier === 'high' || item.risk_tier === 'critical').length;
  return {
    source: 'shadow-ai-guard',
    observed_at: first.reported_at || undefined,
    collector: first.source || 'Shadow AI Guard',
    host: first.device_name || first.device,
    status: highRisk ? 'degraded' : 'healthy',
    summary: { observed_agents: new Set(findings.map(item => `${item.device}:${item.tool}`)).size, shadow_agents: highRisk, findings: findings.length },
    findings: findings.map(item => ({
      title: `${item.tool} observed on ${item.surface}`,
      severity: item.severity === 'warn' ? 'high' : item.risk_tier === 'critical' ? 'critical' : item.risk_tier === 'high' ? 'high' : 'low',
      category: item.mode === 'autonomous' ? 'autonomous-ai' : item.account_domain ? 'account-usage' : 'ai-usage',
      detail: item.evidence || `${item.occurrence_count} ${item.occurrence_unit}; identity=${item.identity || 'unknown'}; mode=${item.mode || 'unknown'}`,
      evidence: { tool: item.tool, surface: item.surface, os: item.os, account_domain: item.account_domain || 'unknown', mode: item.mode || 'unknown', identity: item.identity || 'unknown', trigger: item.trigger || 'unknown', schedule: item.schedule || 'unknown' },
    })),
  };
}
