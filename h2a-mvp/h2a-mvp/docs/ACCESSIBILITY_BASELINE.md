# H2A Accessibility Baseline

Status: Phase 2 baseline for the local desktop MVP

## Implemented

- Skip link targets the main content region.
- Navigation uses native buttons and `aria-current` for the active route.
- Responsive icon navigation retains explicit accessible names and visible mobile labels.
- Route changes move programmatic focus to the main region without scrolling.
- Agent cards expose selected state with `aria-pressed`.
- Loading uses `role="status"`, a screen-reader label, and `aria-busy`.
- Errors use `role="alert"` and include a keyboard-accessible retry action.
- Empty states use polite live-status semantics.
- Status meaning uses text and icons in addition to color.
- Focus rings remain visible.
- Reduced-motion preferences disable transitions and loading shimmer.
- Narrow navigation reserves content space so controls do not cover the final page content.

## Required Verification

- Keyboard traversal follows navigation, agent roster, assignment board, and recovery actions in visual order.
- Enter and Space activate native buttons.
- Main focus updates when switching routes.
- Text and status colors meet WCAG AA against their surfaces.
- 375x812, 768x1024, 1024x768, and 1440x900 layouts have no horizontal overflow or incoherent overlap.
- At 200% browser text zoom, visible actions remain reachable and labels do not overlap.
- Reduced-motion media query removes active animations.
- Browser console remains free of runtime and accessibility-related errors.

## Deferred With Feature Ownership

- Form validation and modal focus trapping belong to the first forms/dialogs introduced in later phases.
- Camera permission and biometric capture accessibility belong to Phase 4.
- Drag-and-drop keyboard alternatives belong to Phase 6 if task movement uses drag behavior.
- Data table sorting semantics belong to Phase 9 evidence tables.

Deferred items are not considered implemented and must be accepted in their owning phase.

