import type { RichContent as RichContentData } from "@/lib/api";

/**
 * Question content is structured blocks, never HTML (API_CONTRACTS.md), so it
 * is rendered as text: nothing an author typed can run as markup in a
 * student's browser. Math is shown as its source, left-to-right, until a
 * formula renderer is added.
 */
export function RichContent({ content }: { content: RichContentData }) {
  return (
    <>
      {content.blocks.map((block, index) =>
        block.type === "math" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity and never reorder
          <span key={index} className="math">
            {block.latex}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity and never reorder
          <span key={index}>{block.text}</span>
        ),
      )}
    </>
  );
}
