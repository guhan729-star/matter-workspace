import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxText, extractText, kindOf } from "./extract";

describe("document text", () => {
  it("accepts PDF, DOCX and TXT only", () => {
    expect(kindOf("Lease.PDF", "")).toBe("pdf");
    expect(kindOf("memo.docx", "")).toBe("docx");
    expect(kindOf("notes", "text/plain")).toBe("txt");
    expect(kindOf("photo.png", "image/png")).toBeNull();
  });

  it("reads the paragraphs of a Word document", () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>1.1 Rent is due monthly.</w:t></w:r></w:p><w:p><w:r><w:t>Terms &amp; conditions</w:t></w:r></w:p></w:body></w:document>';
    const docx = zipSync({ "word/document.xml": strToU8(xml) });
    expect(docxText(docx)).toBe("1.1 Rent is due monthly.\nTerms & conditions");
  });

  it("reads plain text", async () => {
    expect(await extractText("txt", strToU8("Clause 4"))).toBe("Clause 4");
  });
});
