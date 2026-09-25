import { describe, expect, it } from 'vitest';
import { h2aTheme } from '@h2a/ui';

function luminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('H2A design-system contract', () => {
  it.each([
    ['primary text', h2aTheme.color.text, h2aTheme.color.surface],
    ['secondary text', h2aTheme.color.muted, h2aTheme.color.surface],
    ['navigation text', h2aTheme.color.navigationMuted, h2aTheme.color.navigation],
    ['verified state', h2aTheme.color.verified, h2aTheme.color.verifiedSoft],
    ['approval state', h2aTheme.color.approval, h2aTheme.color.approvalSoft],
    ['danger state', h2aTheme.color.danger, h2aTheme.color.dangerSoft]
  ])('%s meets WCAG AA text contrast', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps component geometry within the approved radius limit', () => {
    expect(h2aTheme.radius.control).toBeLessThanOrEqual(8);
    expect(h2aTheme.radius.panel).toBeLessThanOrEqual(8);
  });

  it('keeps standard motion inside the approved interaction interval', () => {
    expect(h2aTheme.motion.fast).toBeGreaterThanOrEqual(150);
    expect(h2aTheme.motion.standard).toBeLessThanOrEqual(300);
  });
});
