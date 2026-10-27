# QUP logo assets — 2026-10-17

The new primary logo pairs a substantial Q symbol and a custom QUP wordmark. A gold folded stroke distinguishes the Q. The approved navy/gold identity and existing Arabic tagline are preserved.

## Files and usage

- `public/brand/qup-logo-v2.png`: primary horizontal logo, 1983 × 793, transparent RGBA PNG.
- `public/brand/qup-symbol-v2.png`: standalone symbol, 1254 × 1254, transparent RGBA PNG.
- `src/app/icon.png`: the same standalone symbol for Next.js file-based favicon metadata.
- `src/components/brand.tsx`: shared logo for public header/footer and student navigation. Next Image optimizes the large source for its 136px/112px display widths; the existing accessible link name and Arabic tagline remain text.

Use the primary navy artwork on white or light surfaces. Keep its aspect ratio and clear space. These are raster assets, not vector masters. Keep the PNGs' native alpha; do not bake in a white or black background. There is no change to the unresolved QUP/معين naming decision.

## Provenance

Produced with the built-in `image_gen` tool, not the CLI or an external logo source. Original generated files remain in the user's Codex generated-images folder. Workspace assets are copies.

### Primary logo prompt

Create a finished professional brand logo for QUP, an Arabic adaptive learning and exam-readiness web platform. This is one final primary horizontal logo asset on a genuinely transparent background, not a brand board or mockup. Exact text: QUP (uppercase Latin letters only). Design an original distinctive compact monogram Q: a refined substantial geometric open circular/squircle navy form, with a clever negative-space opening and a single upward gold diagonal page-fold stroke suggesting both a book page and forward progress; make the symbol immediately legible as Q even at favicon size. Place the symbol to the left of a bespoke geometric QUP wordmark, generous but deliberate optical kerning, medium-bold architectural clean typography with subtly softened corners and custom matching letterforms. Restrained, confident, premium educational technology identity; intelligent and timeless, not playful or corporate stock. Two flat colors only: midnight navy #081F3D and warm gold #D39A27; navy wordmark, navy symbol with small gold accent. Strong silhouette, mathematically clean curves and contours, consistent optical weight. Transparent negative space everywhere around and inside the logo. No Arabic text, no tagline, no dots or additional words, no gradients, no shadows, no 3D, no texture, no decorative background, no graduation cap, no shield, no magnifying-glass appearance, no generic swoosh, no thin fragile lines, no existing brand imitation. Wide horizontal centered lockup with tidy clear space and the logo large in the canvas, suitable for a real website masthead. Deliver only the crisp logo artwork with alpha transparency.

### Standalone symbol prompt

Reference: `public/brand/qup-logo-v2.png`.

Extract and faithfully reproduce ONLY the standalone Q symbol at the far LEFT of this supplied QUP logo, removing the separate QUP wordmark entirely. Preserve the exact distinctive shape: substantial midnight navy #081F3D open circular Q form with the same warm gold #D39A27 folded diagonal tail/page stroke. No redesign, no extra objects, no lettering or text, no background, no gradients, no shadows, no border or square container. Center the isolated symbol, large, with balanced modest clearspace in a SQUARE canvas and true alpha transparency, ready for a favicon and app icon. Flat crisp logo artwork, consistent optical weight, recognizable at 32 pixels. The only output should be that original leftmost icon.

## Additions — 2026-10-27

- `public/brand/qup-logo-light.png`: the primary logo for navy and photographic backgrounds
  (sidebar, hero, footer, sign-in panel). Derived from `qup-logo-v2.png` by recolouring every
  non-gold pixel to white and keeping the original alpha; not regenerated or redrawn.
- `public/brand/qup-mountain-journey.webp` (2172 px) and `qup-mountain-journey-1200.webp`
  (1200 px): the hero photograph used on the home page, sign-in pages, dashboard banner and
  sidebar card. WebP re-encodes of `qup-mountain-journey-v1.png`, an AI-generated image made for
  the 2026-10-19 reference redesign (not a photograph of a real student; its prompt was not
  recorded). The owner chose to keep it on 2026-10-27. Replace it with a licensed or commissioned
  photograph when one is available.
