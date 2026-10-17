---
name: QUP
description: A clear, supportive Arabic workspace for understanding exam readiness.
colors:
  navy: "#081f3d"
  blue: "#1769aa"
  gold: "#d39a27"
  white: "#ffffff"
  surface: "#f5f7fa"
  blue-surface: "#edf4fb"
  border: "#e1e7ee"
  text: "#162d47"
  text-muted: "#596a7d"
  success: "#23734e"
  success-surface: "#edf7f1"
  danger: "#aa302a"
  danger-surface: "#fdf0ef"
  warning-surface: "#fbf5e9"
  on-navy-muted: "#c1cedf"
  navy-elevated: "#132f50"
  navy-line: "#2d4664"
typography:
  display:
    fontFamily: '"Noto Kufi Arabic", system-ui, sans-serif'
    fontSize: "clamp(2.5rem, 3.4vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.75
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Noto Kufi Arabic", system-ui, sans-serif'
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.6
  section:
    fontFamily: '"Noto Kufi Arabic", system-ui, sans-serif'
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.6
  title:
    fontFamily: '"Noto Kufi Arabic", system-ui, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.6
  body:
    fontFamily: '"Noto Sans Arabic", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  small:
    fontFamily: '"Noto Sans Arabic", system-ui, sans-serif'
    fontSize: "0.8125rem"
  label:
    fontFamily: '"Noto Sans Arabic", system-ui, sans-serif'
    fontSize: "0.85rem"
    fontWeight: 600
  control:
    fontFamily: '"Noto Sans Arabic", system-ui, sans-serif'
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.6
rounded:
  default: "1rem"
  small: "0.625rem"
  badge: "0.4rem"
  editorial: "1.5rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    typography: "{typography.control}"
    rounded: "{rounded.small}"
    padding: "0.65rem 1.3rem"
  button-primary-hover:
    backgroundColor: "{colors.navy}"
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.navy}"
    rounded: "{rounded.small}"
    padding: "0.65rem 1.3rem"
  button-gold-hover:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.small}"
    padding: "0.65rem 1.3rem"
  button-ghost-hover:
    backgroundColor: "{colors.blue-surface}"
    textColor: "{colors.blue}"
  button-on-dark:
    backgroundColor: "transparent"
    textColor: "{colors.white}"
    rounded: "{rounded.small}"
    padding: "0.65rem 1.3rem"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.small}"
    padding: "0.7rem 0.85rem"
  nav-active:
    backgroundColor: "{colors.blue-surface}"
    textColor: "{colors.blue}"
    rounded: "{rounded.small}"
    padding: "0.85rem 1rem"
  status-completed:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.badge}"
    padding: "0.25rem 0.65rem"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.default}"
    padding: "1.75rem"
  history-row:
    backgroundColor: "{colors.white}"
    padding: "1.5rem 1.75rem"
  answer-option:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.small}"
    padding: "1rem 1.25rem"
  answer-option-selected:
    backgroundColor: "{colors.blue-surface}"
---

# Design System: QUP

## Overview

**Creative North Star: "The Guided Learning Workspace"**

QUP is supportive, ambitious and trustworthy. Its existing Arabic identity combines confident navy framing, clear learning-blue actions and selective future-gold emphasis. This documentation records the implemented expansion of that identity; it does not resolve the still-open relationship between QUP and معين or introduce a new brand.

The interface gives each task a clear hierarchy: generous editorial space for introductions, a quiet canvas for student work and narrower reading space for assessment. Structured educational graphics and consistent stroke icons carry the visual story without stock photography, fictional dashboards or decorative data. Warmth comes from readable Arabic, calm surfaces and useful next steps.

**Key Characteristics:**

- RTL-first composition and logical alignment.
- Kufi headings with Sans Arabic reading and control text.
- White and cool surfaces anchored by navy; blue actions and selective gold emphasis.
- Row-based repeated records, restrained borders and focused task hierarchy.
- Visible states, keyboard focus and reduced-motion support.

The normative values above are extracted from `src/app/globals.css`; that stylesheet remains the runtime authority. `UI_BRAND.md` supplies brand intent, `PRODUCT.md` supplies capability constraints, and `DESIGN_DIRECTION.md` records this redesign's approved scope. The north-star name summarizes that approved direction rather than claiming a separate naming decision.

## Colors

The palette is cool and composed, with a warm gold accent reserved for orientation and high-value emphasis.

The sidecar's eight-step OKLCH tonal ramps are synthesized panel previews, not additional runtime color tokens. Use the frontmatter colors for implementation.

### Primary

- **Deep Navy (`navy`)** anchors major headings, welcome/result summaries, editorial panels and action hover states.
- **Learning Blue (`blue`)** identifies standard actions, links, selected navigation and answer selection.
- **Blue Wash (`blue-surface`)** gives selections and informational areas a quiet colored ground.

### Secondary

- **Future Gold (`gold`)** emphasizes the public primary action, brand details and the displayed result score; use navy text on gold controls.
- **Warm Notice (`warning-surface`)** supports guidance and neutral notices without making them errors.

### Tertiary

- **Measured Green (`success`, `success-surface`)** pairs text with a pale field for completed/success states.
- **Clear Red (`danger`, `danger-surface`)** pairs error text with a pale field for validation and request failures.

### Neutral

- **White (`white`)** is the base for cards, navigation, fields and public-page sections.
- **Cool Canvas (`surface`)** separates work areas from white surfaces.
- **Quiet Divider (`border`)** outlines fields and containers and separates repeated rows.
- **Reading Ink (`text`)** and **Supporting Ink (`text-muted`)** distinguish body content from secondary explanations.
- **Light Supporting Ink (`on-navy-muted`)** preserves secondary text on navy panels.
- **Raised Navy (`navy-elevated`)** and **Navy Divider (`navy-line`)** structure inset content on dark surfaces.

**The Gold Emphasis Rule.** Gold provides emphasis and achievement cues; do not use it for long reading text on white.

**The Explicit State Rule.** Pair status color with a readable label or other semantic cue; color alone never explains status.

## Typography

**Display Font:** Noto Kufi Arabic with system sans-serif fallback.

**Body Font:** Noto Sans Arabic with system sans-serif fallback.

**Character:** Kufi gives headings an assured Arabic presence; Sans Arabic keeps longer reading, labels and dense controls approachable. The implemented buttons use the body/control role, a deliberate source fact to preserve when extending this version; the broader brand guide's suggested Kufi buttons are not the current CSS behavior.

### Hierarchy

- **Display:** the frontmatter `display` role is the desktop public hero. It becomes (2.6rem) at the medium breakpoint and (2.1rem, line-height 1.85) at the small breakpoint.
- **Headline:** the `headline` role is the base page h1. Its responsive size becomes (1.7rem) at the medium breakpoint and (1.5rem) at the small breakpoint.
- **Section / Title:** the `section` and `title` roles are base h2/h3. Public section headings deliberately use a larger (2rem, line-height 1.8) treatment; do not flatten this editorial hierarchy into the default scale.
- **Body:** use the `body` role for reading. Descriptive public copy has relaxed leading; FAQ explanations cap at (65ch), empty-state explanations at (48ch).
- **Label / Control / Small:** use `label` for field names, `control` for buttons and `small` for supporting text. Component-specific history/status metadata is intentionally smaller than ordinary reading text.
- **Numbers / Math:** use tabular numerals for scores, prices, codes and sequence numbers. Math is LTR-isolated and uses `ui-monospace, "Cascadia Mono", monospace`; email and password inputs can also be explicitly LTR.

**The Reading First Rule.** Keep Arabic reading text in Sans Arabic with comfortable leading; reserve Kufi's stronger presence for hierarchy.

## Layout

Start with `lang="ar"` and `dir="rtl"`. Use logical padding, borders, margins and alignment; isolate LTR content locally. The public container is (76rem), the standard workspace page (72rem) and the focused assessment page (54rem). These are distinct reading/task densities, not interchangeable wrappers.

Desktop workspace navigation occupies a sticky full-height sidebar (15.5rem), narrowing to (13.5rem) at (1100px). At (800px) and below, replace it with the compact four-column navigation beneath the workspace header. At (520px), navigation icons stack above labels. Keep active-route text, tint and semantic current-page state together.

The public hero uses a two-column copy/journey composition, while authentication pairs an editorial panel with a form capped at (28rem). At the medium breakpoint, the hero stacks, the auth story hides and the form can use (30rem). FAQs become one column. At the small breakpoint, exam/plan/result columns stack and result score separation changes from an inline border to a horizontal divider.

Use the frontmatter spacing scale as the rhythm. Larger public sections use (5rem) vertical breathing room; standard work pages use (2.5rem) padding, reducing through (2rem), (1.5rem) and mobile (1rem) inline padding. History remains a divided list: desktop rows align symbol, details, progress and action; intermediate rows place progress beneath details; small rows also move the action beneath details. Do not shrink whole desktop layouts into mobile cards or allow secondary content to force horizontal overflow.

For new screens, choose the workspace or focused density from the task, then reuse existing page headings, containers, fields, state treatments and navigation. Do not copy the public split hero into every screen.

## Elevation & Depth

Depth comes primarily from white/cool tonal layering and quiet borders. Ordinary cards and history rows are flat. The public journey illustration alone receives a stronger soft shadow; this is an emphasis treatment rather than a default card effect.

### Shadow Vocabulary

- **Ambient token** (`0 16px 48px rgb(8 31 61 / 7%)`): available as `--shadow`; not a default card style.
- **Journey emphasis** (`0 24px 64px rgb(8 31 61 / 12%)`): the public educational journey panel.
- **Focus halo** (`0 0 0 4px rgb(23 105 170 / 22%)`): field and answer-option focus, not surface elevation.

**The Quiet Surface Rule.** Use borders and tonal contrast for ordinary containers; reserve the stronger shadow for the established journey emphasis.

## Shapes

Use the frontmatter `default` radius for panels/cards and `small` for fields, buttons, navigation and answer options. The smaller `badge` radius distinguishes metadata from controls. The `editorial` radius belongs to the large journey/auth panels; the journey reduces to the default radius on small screens. Borders are generally (1px) and muted; selection and input error replace their color without changing geometry. Circles belong to small status dots and the welcome symbol, not every container.

Keep icons in the authored stroke family, normally (1.35rem). Icons should support labels and hierarchy; ornamental oversized marks are confined to the existing editorial treatment.

## Components

The shared Brand component now displays the transparent navy/gold raster logo at
`public/brand/qup-logo-v2.png`, optimized through Next Image. The matching symbol supplies
`src/app/icon.png`. Keep the existing accessible link name and Arabic tagline as text.
Logo widths are 136px on larger screens and 112px on mobile; preserve its aspect ratio.
See `BRAND_ASSETS.md` for originals and generation provenance.

### Buttons

Compact, confident actions with modest corners. Standard controls have minimum height (2.9rem); large actions use (3.5rem), small ones (2.65rem). The primary blue variant hovers to navy; the gold variant changes to navy with white text; ghost controls retain a border and hover to blue wash. On-dark secondary controls use transparent fill, white text and navy divider borders. The existing closing CTA overrides its hover to white with navy text for contrast on its dark panel.

Use visible keyboard focus (2px blue outline with 4px offset). Active buttons translate down (1px); disabled buttons show reduced opacity and an unavailable cursor. Transitions use `--motion-fast` (180ms) for the properties actually declared; the base button does not animate its background through pale intermediate colors. Respect reduced motion by setting this token to (0ms), with smooth scrolling disabled.

### Chips

Status badges are small labeled inline elements with a current-color dot. Completed uses the success pair; in-progress uses the blue pair; neutral states use cool canvas and supporting ink. General informational badges use blue wash and blue text. These are status displays, not invented interactive filters.

### Cards / Containers

White, bordered and flat. The frontmatter `card` defines normal padding; small-screen cards reduce to (1.25rem). Exam cards separate an identity/top area, flexible body and divided action footer. History uses one shared rounded panel with divided rows and a toolbar/pagination rather than a pile of individual cards. Plan cards use real server-provided offers; account facts use labeled rows with safe wrapping for long values.

### Inputs / Fields

White fields have a muted border and minimum height (3rem). Focus changes the border to blue and adds the focus halo. Invalid fields use a red border and explicit linked error text. Keep visible labels and optional hints, with errors exposed through `aria-invalid` and `aria-describedby`. Password visibility has its own labeled button in the inline-end area; preserve input room for it and keep its pressed state accessible.

### Navigation

Desktop navigation is a white sidebar with muted text, a cool hover wash and blue selected treatment. The active chevron supplements the selected label. Mobile navigation carries the same labels/current route into a compact top grid. Public navigation is quieter and becomes compact header actions at medium widths. Preserve the skip link and obvious keyboard focus.

### Assessment / Results

Questions use the focused page width, readable position metadata, restrained progress and a fieldset with a visible legend. Full-row radio labels use a border plus blue wash when checked and a halo when focused. Keep answer controls close to the task. Results begin with a navy summary and gold score, followed by distinct strengths and needs areas. Labels and explanations must describe only the server-provided preliminary outcome; no UI decoration may imply certified mastery.

### Feedback / Empty States

Loading uses a readable live status and quiet static skeleton lines. Errors use a labeled danger notice with a useful recovery action when available. Empty states pair an icon with a clear heading, short explanation and relevant next step. Not-found/error pages retain the same typography, spacious alignment and button states. Test hover contrast on both light and dark surroundings.

## Do's and Don'ts

### Do:

- **Do** preserve QUP's established navy, blue, gold and Arabic identity.
- **Do** use the existing visual tokens and logical RTL layout properties when adding screens.
- **Do** distinguish broad task workspaces from focused assessment reading space.
- **Do** keep repeated session records as readable divided rows with responsive actions.
- **Do** pair colors with text, preserve visible focus and honor reduced motion.
- **Do** use real API scores, prices, access and activity; fixture screenshots are QA examples only.

### Don't:

- **Don't** use gold for long text on white or default shadows on every card.
- **Don't** add stock photos, fake charts, invented testimonials or decorative performance metrics.
- **Don't** advertise full diagnostics, adaptive training or reassessment as shipped capabilities until product implementation supports them.
- **Don't** resolve the QUP/معين naming relationship through an incidental UI change.
- **Don't** replace meaningful empty/error/loading states with fictional data.
- **Don't** use hidden controls or visual status styling as a substitute for backend authority.
