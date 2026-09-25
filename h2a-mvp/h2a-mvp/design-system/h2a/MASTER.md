# H2A Design System

Status: Phase 2 source of truth  
Audience: product designers, frontend engineers, QA, and executive-demo operators

## Product Character

H2A is an enterprise security operations product. It should feel precise, calm, trustworthy, and designed for repeated inspection. It is not a marketing site, game, cyberpunk terminal, parody office, or decorative AI dashboard.

The product combines:

- Munder-style visibility of named agents, tasks, providers, and activity
- enterprise SaaS information density
- security semantics for identity, mandates, approvals, revocation, and evidence

## Visual Direction

- Light neutral operational canvas with white working surfaces.
- Dark navigation for strong orientation and product identity.
- Blue indicates selection, primary focus, and active operational context.
- Green is reserved for verified, active, or successfully resolved security state.
- Amber is reserved for approval gates, expiry risk, or constrained attention.
- Red is reserved for denial, revocation, destructive action, or integrity failure.
- Purple and provider colors may identify agents but must not dominate the product palette.
- Borders and spacing establish hierarchy; shadows remain subtle.
- No gradients except the loading skeleton's functional shimmer.
- No decorative orbs, glow, glitch, scanline, or atmospheric effects.

## Semantic Color Tokens

| Token | Value | Purpose |
|---|---|---|
| `--nav` | `#101922` | primary navigation surface |
| `--nav-muted` | `#9dacbb` | navigation secondary text |
| `--canvas` | `#f4f6f8` | application background |
| `--surface` | `#ffffff` | working panels and cards |
| `--surface-subtle` | `#f8fafb` | grouped data and secondary regions |
| `--text` | `#17212b` | primary text |
| `--muted` | `#667085` | secondary text |
| `--border` | `#d9e0e7` | default separation |
| `--primary` | `#2563eb` | selected and primary focus |
| `--verified` | `#15803d` | verified security state |
| `--approval` | `#a15c07` | approval-required state |
| `--danger` | `#b42318` | denial, revocation, and integrity failure |

Functional state always includes readable text or an icon; color alone is insufficient.

## Typography

- Font stack: `Inter`, `Segoe UI`, `Arial`, sans-serif.
- Monospace stack: `SFMono-Regular`, `Consolas`, monospace.
- Body base: 14px desktop with 1.5 line height.
- Page title: 22px.
- Panel heading: 16-18px.
- Card title: 13-15px.
- Operational labels and metadata: 10-12px with sufficient contrast.
- Letter spacing is always zero.
- Use weight, spacing, and surface hierarchy instead of oversized text.
- Long identifiers use monospace and wrap safely.

## Spacing And Geometry

- Use a 4px base rhythm with primary steps at 8, 12, 16, 20, 24, and 32px.
- Controls have 6px radius; panels and cards have at most 8px radius.
- Minimum interactive height is 44px; mobile navigation targets are at least 54px.
- Fixed-format cards, columns, metrics, and loading states use stable minimum dimensions.
- Desktop content gutters are 30px, tablet 20px, and narrow layouts 16px.

## Elevation

- Level 0: canvas and grouped background.
- Level 1: bordered surface with `--shadow`.
- Level 2: selected or hovered work item with stronger border and restrained shadow.
- Modal elevation will use one approved scrim and shadow token when dialogs are introduced.
- Do not nest decorative cards inside cards.

## Motion

- Standard interaction duration: 160-220ms.
- Animate only opacity, transform, border, background, or shadow.
- Motion must explain selection, navigation, loading, opening, or dismissal.
- Loading shimmer is the only continuous animation in Phase 2.
- `prefers-reduced-motion: reduce` disables transitions and replaces shimmer with a static surface.

## Navigation

- Desktop: persistent left sidebar with icon and label.
- Tablet: narrow icon rail with accessible labels and native tooltips.
- Narrow viewport: five-item bottom navigation with icon and visible compact label.
- Active route uses text, background, and a positional indicator.
- Route changes move focus to the main content region.
- A skip link allows keyboard users to bypass navigation.

## Component States

Every interactive component must define:

- default
- hover
- pressed
- keyboard focus
- selected or current
- disabled when applicable
- loading when an operation is asynchronous
- empty when its data set is empty
- error with a concrete recovery action

## Accessibility Baseline

- Semantic landmarks and headings.
- Native buttons for all clickable controls.
- Explicit accessible names for icon-only responsive states.
- Visible 3px focus ring.
- No keyboard traps.
- Color is not the sole status indicator.
- Errors use `role="alert"`; loading and empty states use live status semantics.
- Main content exposes `aria-busy` during workspace loading.
- 375px and larger layouts must avoid horizontal overflow.
- Text zoom and system scaling must not hide required actions.

## Asset And Brand Rules

- Use Lucide for interface icons.
- Do not copy Munder pixel assets, parody branding, or restricted art.
- Provider identity uses text labels until approved official brand assets are supplied.
- H2A visuals must be owned, licensed for commercial use, or generated specifically for H2A.

## Explicit Rejections

- Cyberpunk, neon, terminal-HUD, glow, glitch, or scanline styling.
- Oversized marketing headers inside the application.
- Purple-dominated or one-note palettes.
- Decorative cards for page sections.
- Invisible error, loading, or empty states.
- Security success claims unsupported by implemented state.
- Placeholder buttons that do not execute their visible command.

