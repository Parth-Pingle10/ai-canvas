import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import type { DraftContentType } from "../types/ai";

/**
 * Turns model-produced content into safe, renderable HTML. This is the only
 * place model output is ever treated as anything richer than plain text —
 * everything downstream (AiObjectLayer) trusts that what comes out of here
 * has already been sanitized.
 *
 * markdown: parsed with `marked`, then run through DOMPurify — model output
 * is untrusted input, no different from any other third-party HTML source.
 *
 * latex: rendered with KaTeX (`trust: false`, the default), which does not
 * accept raw HTML in the source and escapes everything it emits; the result
 * is still passed through DOMPurify as defense in depth in case a future
 * KaTeX extension or config change ever loosens that.
 */
export function renderDraftContent(content: string, type: DraftContentType): string {
  if (type === "latex") {
    return renderLatex(content);
  }
  return renderMarkdown(content);
}

function renderMathInText(text: string): string {
  // 1. Replace block math $$...$$
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        throwOnError: false,
        trust: false,
        displayMode: true,
        output: "html",
      });
    } catch {
      return `$$${math}$$`;
    }
  });

  // 2. Replace inline math $...$ (avoiding double $$ or empty $)
  processed = processed.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        throwOnError: false,
        trust: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      return `$${math}$`;
    }
  });

  return processed;
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "blockquote",
      "h1", "h2", "h3", "h4", "a", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
      "semantics", "annotation", "math", "mstyle", "mrow", "mi", "mo", "mn",
      "msqrt", "mfrac", "msup", "msub", "msubsup", "mtable", "mtr", "mtd", "svg", "path", "line",
    ],
    ALLOWED_ATTR: [
      "href", "class", "style", "aria-hidden", "aria-label", "role",
      "viewBox", "d", "width", "height", "fill", "stroke",
    ],
  });
}

function renderMarkdown(content: string): string {
  const withMath = renderMathInText(content);
  const rawHtml = marked.parse(withMath, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(rawHtml);
}

function renderLatex(content: string): string {
  try {
    const html = katex.renderToString(content, {
      throwOnError: false,
      trust: false,
      displayMode: true,
      output: "html",
    });
    return sanitizeHtml(html);
  } catch {
    // KaTeX with throwOnError: false shouldn't normally throw, but never let
    // a rendering failure break the draft card — fall back to escaped text.
    return `<pre>${escapeHtml(content)}</pre>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

