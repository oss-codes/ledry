# Ledry Design System

## 1. Atmosphere & Identity

A local research command center: calm, exact, and evidence-first. The browser dashboard preserves the OpenTUI product language, with a deep navy canvas, cool cyan focus, compact data density, and status colors used only when they carry meaning. The signature is the source rail: approved browser tabs and their live connection state remain visible beside the lead review workspace.

Design read: operational dashboard for nontechnical operators and agent-assisted technical users. `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`. Existing OpenTUI patterns are the primary reference; Linear contributes precise dark-surface hierarchy and restrained interaction anatomy without copying its brand.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| Canvas | `--surface-canvas` | `#07111f` | Page background |
| Panel | `--surface-panel` | `#0b1728` | Navigation and content panels |
| Raised | `--surface-raised` | `#112036` | Selected rows, popovers, controls |
| Hover | `--surface-hover` | `#172943` | Hover and pressed surfaces |
| Text primary | `--text-primary` | `#f8fafc` | Lead names, headings, key values |
| Text secondary | `--text-secondary` | `#cbd5e1` | Body text and table content |
| Text muted | `--text-muted` | `#94a3b8` | Metadata and placeholders |
| Border | `--border-default` | `#64748b` | Panel and control boundaries |
| Border subtle | `--border-subtle` | `#1e293b` | Row separators |
| Accent | `--accent-primary` | `#38bdf8` | Focus, primary action, live selection |
| Accent text | `--accent-text` | `#7dd3fc` | Brand and highlighted labels |
| Qualified | `--status-qualified` | `#4ade80` | Qualified status |
| Found | `--status-found` | `#f59e0b` | Unreviewed found status |
| Not qualified | `--status-rejected` | `#fb7185` | Not-qualified status |
| Error | `--status-error` | `#f87171` | Failed requests and destructive feedback |
| Side-panel canvas | `--sidepanel-canvas` | `#f8fafc` | Chrome companion workspace |
| Side-panel surface | `--sidepanel-surface` | `#ffffff` | Composer and context cards |
| Side-panel text | `--sidepanel-text` | `#0f172a` | Side-panel headings and body copy |
| Side-panel muted | `--sidepanel-muted` | `#64748b` | Side-panel metadata and helper copy |
| Side-panel border | `--sidepanel-border` | `#e2e8f0` | Side-panel separators and rings |
| Side-panel strong border | `--sidepanel-border-strong` | `#64748b` | Form-control boundaries |
| Side-panel hover | `--sidepanel-hover` | `#f1f5f9` | Hover and scope surfaces |
| Side-panel accent | `--sidepanel-accent` | `#0284c7` | Active readiness state |
| Side-panel accent strong | `--sidepanel-accent-strong` | `#0369a1` | Primary actions and focus |
| Side-panel accent soft | `--sidepanel-accent-soft` | `#e0f2fe` | Approved-tab and selected controls |
| Side-panel success | `--sidepanel-success` | `#15803d` | Connected and approved text |
| Side-panel success soft | `--sidepanel-success-soft` | `#dcfce7` | Connected and approved surfaces |
| Side-panel warning | `--sidepanel-warning` | `#b45309` | Approval-required text |
| Side-panel warning soft | `--sidepanel-warning-soft` | `#fef3c7` | Approval-required surfaces |
| Side-panel danger | `--sidepanel-danger` | `#be123c` | Offline, blocked, and error text |
| Side-panel danger soft | `--sidepanel-danger-soft` | `#ffe4e6` | Offline, blocked, and error surfaces |

Rules:

- Dark theme is locked for the OpenTUI and browser dashboard. The Chrome side
  panel is the deliberate companion exception: a cool paper-like workspace
  framed by the browser chrome, using Ledry cyan instead of Claude terracotta.
- Cyan is the only interaction accent. Status colors are semantic, never decorative.
- Surfaces create hierarchy through tonal shifts; borders clarify dense controls.
- New colors must be added here before use.

## 3. Typography

| Level | Size | Weight | Line height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Page title | `24px` | 650 | 1.2 | `-0.02em` | Workspace title |
| Section title | `15px` | 650 | 1.35 | `-0.01em` | Panel headings |
| Detail title | `18px` | 650 | 1.35 | `0` | Selected lead heading |
| Metric | `22px` | 650 | 1.2 | `0` | Summary counts |
| Body | `14px` | 450 | 1.5 | `0` | Default UI copy |
| Body compact | `13px` | 450 | 1.4 | `0` | Rows and metadata |
| Caption | `12px` | 550 | 1.35 | `0.02em` | Labels and counts |
| Mono | `12px` | 500 | 1.4 | `0` | URLs, IDs, agent commands |

Font stacks:

- Primary: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `"SFMono-Regular", Consolas, "Liberation Mono", monospace`

Body text never drops below 12px. Numeric summaries and machine-oriented values use the mono stack.

## 4. Spacing & Layout

Base unit: 4px.

| Token | Value | Usage |
|---|---:|---|
| `--space-half` | `2px` | Segmented-control inset gaps |
| `--space-1` | `4px` | Icon and label gaps |
| `--space-2` | `8px` | Compact row gaps |
| `--space-3` | `12px` | Control padding |
| `--space-4` | `16px` | Panel padding |
| `--space-5` | `20px` | Comfortable block gaps |
| `--space-6` | `24px` | Page gutters |
| `--space-8` | `32px` | Major separation |

Layout:

- Maximum workspace width: 1600px.
- Desktop: 248px source rail, flexible lead list, 360px detail panel.
- Tablet: source rail above a two-column lead/detail workspace.
- Mobile: one column; detail opens below the selected lead and controls remain full width.
- Breakpoints: 480px for compact actions, 768px for single-column mobile, and 1100px for the tablet source-rail transition.
- Radius system: 6px controls, 8px panels, full-radius status filters only.
  The Chrome side panel uses 8px controls and 12px cards so its compact paper
  workspace remains legible against Chrome's own surrounding UI.
- Chrome side panel: one column from 320px to 600px wide, fixed header and
  composer, flexible conversation/activity region, and `100dvh` height.

## 5. Components

### Button

- Structure: semantic `button`, optional icon, one-line label.
- Variants: primary, secondary, ghost.
- Spacing: `--space-2` and `--space-3`.
- States: default, hover, active, focus-visible, disabled, loading.
- Accessibility: visible cyan focus ring, disabled state conveyed natively, loading label remains descriptive.
- Motion: 120ms color and transform feedback; no autonomous animation.

### StatusControl

- Structure: radio-like group of three semantic buttons: Found, Qualified, Not qualified.
- Variants: compact row and detail panel.
- States: default, hover, active/current, focus-visible, disabled, saving.
- Accessibility: group label, `aria-pressed`, full keyboard tab reachability, color plus text.

### SourceRow

- Structure: selectable button containing source type, tab title, URL, and scrape action context.
- States: default, hover, selected, focus-visible.
- Accessibility: full text title, source adapter announced, selection conveyed with `aria-pressed`.

### LeadRow

- Structure: selectable button with name, organization/contact, score, source, and persisted status.
- States: default, hover, selected, focus-visible, saving.
- Accessibility: lead summary is a single understandable accessible name; status is always textual.

### Panel

- Structure: heading, optional toolbar, content region.
- Variants: source, list, detail, metric.
- States: default, loading skeleton, empty guidance.
- Accessibility: semantic heading order and landmark labels.

### Toast

- Structure: concise inline live message.
- Variants: success, error, neutral.
- States: visible and auto-dismissed after four seconds in the product workspace.
- Accessibility: `role=status` for neutral/success and `role=alert` for errors.

### RunReport

- Structure: latest-run status, saved/discovered/quarantined/skipped metrics, and data-quality warnings.
- States: completed and empty. Historical records remain immutable even when a lead is recaptured later.
- Accessibility: metrics use a descriptive list, status is textual, and the export action names its latest-run scope.

### SidePanelShell

- Structure: compact brand header, active-tab context, task/activity region,
  and bottom composer. This borrows the public Claude extension's companion
  panel anatomy without its branding, copy, or assets.
- States: configuring, bridge offline, no active research tab, tab blocked, tab
  awaiting approval, and approved and ready.
- Accessibility: one `main` region, descriptive connection status, logical
  heading order, and no icon-only control without an accessible name.

### TabContextCard

- Structure: source icon, tab title, origin, approval state, and one explicit
  approve action.
- States: blocked, awaiting approval, approving, approved, and error.
- Accessibility: approval is textual as well as chromatic; the action remains
  at least 40px tall and never grants cross-origin access implicitly.

### TaskComposer

- Structure: labelled multiline research brief, truthful approved-origin scope,
  and primary local-save action. Saving a brief does not imply that an agent
  has started executing it.
- States: empty, focused, ready, saving, saved, and error.
- Accessibility: visible label, `aria-describedby` helper copy, keyboard submit
  with Command/Ctrl+Enter, and persistent focus-visible ring.

### ReadinessStep

- Structure: semantic ordered item with status marker, title, and supporting
  detail.
- States: pending, active, complete, and blocked.
- Accessibility: visible text describes status; motion and color are never the
  only indicators.

### IconButton

- Structure: semantic button with inline SVG and accessible name.
- States: default, hover, active, focus-visible, and disabled.
- Accessibility: 40px minimum target; SVG is decorative when the button label
  already supplies the name.

### Primitive Showcase

The dashboard supports `/?showcase=1`. It renders every primitive and its required visual states using the same production CSS. This route is the state harness for mobile, tablet, and desktop visual QA before product-screen sign-off.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | 120ms | ease-out | Button press, hover, focus |
| Standard | 200ms | ease-in-out | Detail replacement, toast |

- Motion communicates feedback or state change only.
- Animate opacity and transform only.
- Polling updates do not animate or steal focus.
- `prefers-reduced-motion: reduce` removes nonessential transitions.

## 7. Depth & Surface

Strategy: tonal shift plus thin borders.

- Canvas is deepest, panels are one step lighter, selected and raised controls are another step lighter.
- Default panels use a 1px `--border-default` outline.
- Dense rows use only one bottom divider and never card-per-row shadows.
- Focus uses a two-layer cyan ring; elevation does not depend on shadow alone.

## 8. Accessibility Constraints & Accepted Debt

Constraints:

- WCAG 2.2 AA target: 4.5:1 body contrast, 3:1 large text and interface boundaries.
- Every task is keyboard-operable with a visible focus indicator.
- Touch targets are at least 40px tall on mobile.
- Status never relies on color alone.
- Loading, empty, offline, saving, and error states are explicit.
- Polling preserves focus and selection.

Accepted debt: none. Any discovered debt must be recorded here with location, affected users, reason, and exit condition before sign-off.
