import { unzipSync, strFromU8 } from "fflate";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type DocumentKind = "pdf" | "docx" | "txt";

const TYPES: Record<DocumentKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

/** The kind of an upload, from its name or type; null when unsupported. */
export function kindOf(name: string, type: string): DocumentKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || type === TYPES.pdf) return "pdf";
  if (ext === "docx" || type === TYPES.docx) return "docx";
  if (ext === "txt" || type === TYPES.txt) return "txt";
  return null;
}

export function contentTypeOf(kind: DocumentKind): string {
  return kind === "txt" ? "text/plain; charset=utf-8" : TYPES[kind];
}

/** The text in a Word document's main part. */
export function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (file) => file.name === "word/document.xml",
  });
  const xml = files["word/document.xml"];
  if (!xml) return "";
  return decodeEntities(
    strFromU8(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Extracts a document's text for the AI features. */
export async function extractText(
  kind: DocumentKind,
  bytes: Uint8Array,
): Promise<string> {
  if (kind === "txt") return new TextDecoder().decode(bytes);
  if (kind === "docx") return docxText(bytes);
  const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await pdfText(pdf, { mergePages: true });
  return text;
}
