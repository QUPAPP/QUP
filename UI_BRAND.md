# UI & Brand System

## Naming Note

الهوية المقدمة تحمل **"معين — خير معين لمستقبلك"** مع علامة QUP، بينما متطلبات المنتج تستخدم اسم QUP. العلاقة الرسمية تحتاج حسم قبل تثبيت naming النهائي داخل المنتج.

## Brand Personality

- مساندة.
- طموحة.
- موثوقة.

Tone:
- قريب.
- محفز.
- واضح.
- عملي.
- وعود واقعية بدون مبالغة.

## Colors

من دليل الهوية:
- Dark Blue: `#081F3D`
- Learning Blue: `#1769AA`
- Future Gold: `#D39A27`
- White: `#FFFFFF`

Usage guidance:
- Dark Blue ~45%
- Learning Blue ~30%
- Gold ~15%
- Supporting colors ~10%

Gold للتأكيد والإنجاز والزخرفة، وليس للنصوص الطويلة على الأبيض.

## Logo Assets

The website uses the navy/gold QUP logo in `apps/web/public/brand/qup-logo-v2.png` and the
matching standalone symbol `qup-symbol-v2.png`. Both preserve native transparency. Shared
`Brand` rendering retains the Arabic tagline as accessible text. Asset usage and generation
provenance are documented in `apps/web/BRAND_ASSETS.md`.

## Typography

- `Noto Kufi Arabic`: headings/buttons/high-presence UI.
- `Noto Sans Arabic`: body/educational content/dense UI.

Suggested scale:
- H1: 32–40px
- Section: 22–28px
- Subheading: 16–20px
- Body: 14–16px
- CTA: 14–16px

Implement as responsive tokens.

## RTL First

Support correctly:
- layout direction.
- directional icons.
- breadcrumbs.
- tables.
- charts labels.
- forms.
- keyboard navigation.

## Design Tokens

```text
color.brand.primary
color.brand.learning
color.brand.gold
color.surface
color.text.primary
color.text.secondary
color.success
color.warning
color.danger
space.*
radius.*
shadow.*
type.*
```

No raw colors repeated across components.

## Core Components

Base:
- Button
- Input
- Select
- Dialog
- Drawer
- Tabs
- Table
- Pagination
- Toast
- EmptyState
- Skeleton

Domain:
- QuestionCard
- AnswerOption
- AssessmentProgress
- ExamTimer
- SkillProgress
- MasteryIndicator
- GapCard
- RecommendationCard
- TaxonomyTree
- QuestionEditor
- ImportPreview
- ReviewPanel

## Student Dashboard Principle

يجب أن يجيب:
- أين أنا الآن؟
- ما نقاط قوتي؟
- أين الفواقد؟
- ماذا أفعل الآن؟

Primary CTA = next recommended learning action.

## Accessibility

- adequate contrast.
- keyboard usable.
- visible focus.
- semantic labels/errors.
- mastery not communicated by color only.
- reduced motion consideration.
- chart textual equivalents.
