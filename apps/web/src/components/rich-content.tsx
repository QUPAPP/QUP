import { assetUrl, type ContentBlock, type RichContent as RichContentData } from "@/lib/api";
import { renderMath } from "@/lib/math";

/**
 * Question content is structured blocks, never HTML (API_CONTRACTS.md), so it
 * is rendered as text: nothing an author typed can run as markup in a
 * student's browser. Math is typeset by KaTeX with untrusted-input settings
 * (lib/math.ts), left to right. Images and audio load from the API, which checks
 * the session and serves them with a sandboxing policy.
 */
export function RichContent({ content }: { content: RichContentData }) {
  return (
    <>
      {content.blocks.map((block, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity and never reorder
        <Block key={index} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "math":
      return (
        <span
          className="math"
          dir="ltr"
          // KaTeX markup with trust off: it escapes all text and allows no links or includes.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output from trust:false rendering (lib/math.ts)
          dangerouslySetInnerHTML={{ __html: renderMath(block.latex) }}
        />
      );
    case "image":
      return (
        // biome-ignore lint/performance/noImgElement: next/image fetches server-side without the session cookie; assets need it
        <img
          className="content-image"
          src={assetUrl(block.assetId)}
          alt={block.alt}
          loading="lazy"
          decoding="async"
        />
      );
    case "audio":
      return (
        // A listening passage: the student starts it. No captions: they would read the answer out.
        // biome-ignore lint/a11y/useMediaCaption: a captioned listening test gives the answer away
        <audio className="content-audio" controls preload="metadata" src={assetUrl(block.assetId)}>
          متصفحك لا يشغّل الصوت.
        </audio>
      );
    case "text":
      return <span>{block.text}</span>;
  }
}
