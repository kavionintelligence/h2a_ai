import { useState } from 'react';
import { Bot } from 'lucide-react';

type Identity = { name?: string; framework?: string | null; fingerprint?: Record<string, unknown>; discovery_snapshot?: Identity };
export type Product = 'claude' | 'codex' | 'chatgpt' | 'gemini' | 'antigravity' | 'custom';
/** Product identity, not the model/provider used by an otherwise custom agent. */
export function detectedProduct(entity?: Identity): Product {
  if (!entity) return 'custom';
  const source = entity.discovery_snapshot || entity;
  const tool = String(source.fingerprint?.tool_id || '').toLowerCase();
  const known: Record<string, Product> = { claude: 'claude', 'claude-code': 'claude', 'codex-cli': 'codex', codex: 'codex', chatgpt: 'chatgpt', gemini: 'gemini', 'gemini-cli': 'gemini', antigravity: 'antigravity', 'google-antigravity': 'antigravity' };
  if (known[tool]) return known[tool];
  const name = (source.name || '').split(/\s[·|]\s/)[0].trim().toLowerCase();
  if (/^(claude|claude code|claude desktop|claude cowork)$/.test(name)) return 'claude';
  if (/^(codex|codex cli|openai codex)$/.test(name)) return 'codex';
  if (/^(gemini|gemini cli|google gemini)$/.test(name)) return 'gemini';
  if (/^(antigravity|google antigravity)$/.test(name)) return 'antigravity';
  if (name === 'chatgpt') return 'chatgpt';
  return 'custom';
}
const marks: Record<Exclude<Product, 'custom'>, { file: string; label: string }> = {
  claude: { file: 'claude.png', label: 'Claude' }, codex: { file: 'openai.svg', label: 'Codex' },
  chatgpt: { file: 'openai.svg', label: 'ChatGPT' }, gemini: { file: 'gemini.png', label: 'Gemini' },
  antigravity: { file: 'antigravity.png', label: 'Google Antigravity' },
};
export function ProductMark({ entity, product, size = 'normal' }: { entity?: Identity; product?: Product; size?: 'small' | 'normal' | 'large' }) {
  const resolved = product || detectedProduct(entity);
  const [failedSource, setFailedSource] = useState('');
  const mark = resolved === 'custom' ? null : marks[resolved];
  return <span className={`product-mark ${size} ${resolved}`} data-product={resolved} title={mark?.label || 'Custom or unidentified agent'}>
    {mark && failedSource !== mark.file ? <img src={`/product-marks/${mark.file}`} alt={`${mark.label} logo`} width="28" height="28" onError={() => setFailedSource(mark.file)} /> : <Bot aria-label="Custom or unidentified agent" />}
  </span>;
}
