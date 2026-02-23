import type { JSONContent } from "@tiptap/core";

export interface ExportDocumentInput {
  title: string;
  content: JSONContent | Record<string, unknown> | null | undefined;
  updatedAt?: string;
}

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_MARGIN_LEFT = 40;
const PDF_MARGIN_TOP = 44;
const PDF_MARGIN_BOTTOM = 44;
const PDF_LINE_HEIGHT = 14;
const PDF_CHARS_PER_LINE = 96;

const sanitizeFileName = (value: string) => {
  const fallback = "document";
  const normalized = value.trim() || fallback;
  const withoutSpecialChars = normalized.replace(/[<>:"/\\|?*]/g, "");
  const withoutControlChars = withoutSpecialChars
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  return withoutControlChars
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
};

const formatExportDate = (value?: string) => {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapePdfText = (value: string) =>
  value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const toNodeArray = (value: unknown): JSONContent[] =>
  Array.isArray(value) ? (value as JSONContent[]) : [];

const trimTrailingNewline = (value: string) => value.replace(/\n+$/g, "");

const extractNodeText = (node: JSONContent): string => {
  const nodeType = node.type || "";
  const nodeContent = toNodeArray(node.content);

  if (nodeType === "text") {
    return node.text || "";
  }

  if (nodeType === "hardBreak") {
    return "\n";
  }

  if (nodeType === "bulletList") {
    return (
      nodeContent
        .map((child) => `- ${trimTrailingNewline(extractNodeText(child))}`)
        .filter((line) => line.trim().length > 0)
        .join("\n") + "\n"
    );
  }

  if (nodeType === "orderedList") {
    return (
      nodeContent
        .map((child, index) => `${index + 1}. ${trimTrailingNewline(extractNodeText(child))}`)
        .filter((line) => line.trim().length > 0)
        .join("\n") + "\n"
    );
  }

  if (nodeType === "paragraph" || nodeType === "heading" || nodeType === "blockquote" || nodeType === "codeBlock") {
    return nodeContent.map((child) => extractNodeText(child)).join("") + "\n";
  }

  if (nodeType === "listItem") {
    return nodeContent.map((child) => extractNodeText(child)).join("");
  }

  if (nodeContent.length > 0) {
    return nodeContent.map((child) => extractNodeText(child)).join("");
  }

  return "";
};

const extractPlainText = (content: JSONContent | Record<string, unknown> | null | undefined) => {
  if (!isRecord(content)) {
    return "";
  }
  const rootNode = content as JSONContent;
  const text = extractNodeText(rootNode)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
};

const wrapParagraph = (paragraph: string, maxChars: number) => {
  if (!paragraph.trim()) {
    return [""];
  }

  const words = paragraph.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
};

const wrapText = (text: string, maxChars: number) => {
  const paragraphs = text.split(/\n/);
  return paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, maxChars));
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildPdf = (pages: string[][]) => {
  const safePages = pages.length > 0 ? pages : [[""]];
  const pageCount = safePages.length;
  const fontObjectId = 3 + pageCount * 2;
  const lastObjectId = fontObjectId;
  const objects: string[] = new Array(lastObjectId + 1).fill("");
  const pageObjectIds: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  safePages.forEach((pageLines, pageIndex) => {
    const pageObjectId = 3 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);

    const lineCommands = pageLines.map((line, lineIndex) => {
      const y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP - lineIndex * PDF_LINE_HEIGHT;
      return `1 0 0 1 ${PDF_MARGIN_LEFT} ${y} Tm (${escapePdfText(line)}) Tj`;
    });

    const streamContent = `BT\n/F1 12 Tf\n${lineCommands.join("\n")}\nET`;
    objects[contentObjectId] =
      `<< /Length ${streamContent.length} >>\n` +
      `stream\n${streamContent}\nendstream`;

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> ` +
      `/Contents ${contentObjectId} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n";
  const offsets: number[] = new Array(lastObjectId + 1).fill(0);

  for (let objectId = 1; objectId <= lastObjectId; objectId += 1) {
    offsets[objectId] = output.length;
    output += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefOffset = output.length;
  output += `xref\n0 ${lastObjectId + 1}\n`;
  output += "0000000000 65535 f \n";

  for (let objectId = 1; objectId <= lastObjectId; objectId += 1) {
    output += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${lastObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([output], { type: "application/pdf" });
};

export const exportDocumentAsDoc = ({ title, content, updatedAt }: ExportDocumentInput) => {
  const safeTitle = sanitizeFileName(title);
  const plainText = extractPlainText(content);
  const lines = plainText ? plainText.split("\n") : ["(empty document)"];
  const lineMarkup = lines
    .map((line) => `<p>${line.trim() ? escapeHtml(line) : "&nbsp;"}</p>`)
    .join("");

  const htmlDocument =
    "<html><head><meta charset=\"utf-8\" />" +
    "<style>" +
    "body{font-family:Calibri,Arial,sans-serif;padding:24px;color:#111827;line-height:1.45;}" +
    "h1{font-size:20px;margin:0 0 8px;} .meta{font-size:12px;color:#4b5563;margin-bottom:16px;}" +
    "p{margin:0 0 8px;}" +
    "</style></head><body>" +
    `<h1>${escapeHtml(title)}</h1>` +
    `<div class="meta">Updated: ${escapeHtml(formatExportDate(updatedAt))}</div>` +
    lineMarkup +
    "</body></html>";

  const blob = new Blob([htmlDocument], { type: "application/msword;charset=utf-8" });
  triggerDownload(blob, `${safeTitle}.doc`);
};

export const exportDocumentAsPdf = ({ title, content, updatedAt }: ExportDocumentInput) => {
  const safeTitle = sanitizeFileName(title);
  const plainText = extractPlainText(content);
  const body = plainText || "(empty document)";

  const lines = [
    `Document: ${title}`,
    `Updated: ${formatExportDate(updatedAt)}`,
    "",
    ...wrapText(body, PDF_CHARS_PER_LINE)
  ];

  const usableHeight = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;
  const linesPerPage = Math.max(1, Math.floor(usableHeight / PDF_LINE_HEIGHT));
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const blob = buildPdf(pages);
  triggerDownload(blob, `${safeTitle}.pdf`);
};
