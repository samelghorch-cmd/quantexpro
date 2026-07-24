// Générateur PDF minimal (PDF 1.4, Helvetica) — zéro dépendance.
// Suffisant pour des tearsheets texte multi-pages A4.

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const LINE_H = 14;

function escPdf(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, (ch) => {
      // Latin-1 approximatif via hex pour accents FR courants
      const map = {
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "à": "a", "â": "a", "ä": "a",
        "ù": "u", "û": "u", "ü": "u",
        "ô": "o", "ö": "o", "î": "i", "ï": "i",
        "ç": "c", "É": "E", "È": "E", "À": "A", "Ç": "C",
        "—": "-", "–": "-", "’": "'", "‘": "'", "“": "\"", "”": "\"",
        "€": "EUR", "·": "-",
      };
      return map[ch] || "?";
    });
}

/**
 * Construit un PDF à partir de lignes de texte.
 * @param {string[]} lines
 * @param {{ title?: string }} [opts]
 * @returns {Uint8Array}
 */
export function buildTextPdf(lines, opts = {}) {
  const title = opts.title || "QuantEXPro";
  const maxChars = 90;
  const wrapped = [];
  for (const raw of lines) {
    const line = String(raw ?? "");
    if (line.length <= maxChars) {
      wrapped.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut < 40) cut = maxChars;
      wrapped.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) wrapped.push(rest);
  }

  const usableH = PAGE_H - MARGIN * 2 - 40;
  const linesPerPage = Math.max(1, Math.floor(usableH / LINE_H));
  const pages = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length; // 1-based id
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageIds = [];
  const contentIds = [];

  for (let p = 0; p < pages.length; p++) {
    const contentLines = [];
    contentLines.push("BT");
    // En-tête
    contentLines.push(`/F2 11 Tf`);
    contentLines.push(`${MARGIN} ${PAGE_H - MARGIN} Td`);
    contentLines.push(`(${escPdf(title)}) Tj`);
    contentLines.push(`/F1 8 Tf`);
    contentLines.push(`0 -12 Td`);
    contentLines.push(`(Page ${p + 1}/${pages.length}) Tj`);
    contentLines.push(`/F1 10 Tf`);
    contentLines.push(`0 -24 Td`);

    const pageLines = pages[p];
    for (let i = 0; i < pageLines.length; i++) {
      const t = pageLines[i];
      const isHeading = t.startsWith("## ");
      const text = isHeading ? t.slice(3) : t;
      if (isHeading) {
        contentLines.push(`/F2 11 Tf`);
        contentLines.push(`(${escPdf(text)}) Tj`);
        contentLines.push(`/F1 10 Tf`);
      } else {
        contentLines.push(`(${escPdf(text)}) Tj`);
      }
      if (i < pageLines.length - 1) contentLines.push(`0 -${LINE_H} Td`);
    }
    contentLines.push("ET");
    const stream = contentLines.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
  }

  // Pages object placeholder — we'll insert after knowing kids
  const kids = [];
  for (let p = 0; p < pages.length; p++) {
    const pageId = add(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
      + `/Contents ${contentIds[p]} 0 R `
      + `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
    kids.push(`${pageId} 0 R`);
  }

  const pagesId = add(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageIds.length} >>`);
  // Fix Parent refs
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i];
    objects[id - 1] = objects[id - 1].replace("PAGES_REF", `${pagesId} 0 R`);
  }

  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Assemble
  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [0]; // xref 0

  const push = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushStr = (s) => push(encoder.encode(s));

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    pushStr(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }

  const xrefStart = offset;
  pushStr(`xref\n0 ${objects.length + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let i = 1; i <= objects.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`);
  pushStr(`startxref\n${xrefStart}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function pdfToBlob(bytes) {
  return new Blob([bytes], { type: "application/pdf" });
}
