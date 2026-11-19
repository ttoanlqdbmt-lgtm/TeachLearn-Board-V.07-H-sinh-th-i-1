/**
 * Multi-page Canvas-to-PDF 1.4 Binary Builder
 * Packages an array of high-resolution JPEG data URLs (16:9 Smartboard pages)
 * into a standards-compliant multi-page .pdf Blob for instant download.
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = window.atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface SmartboardPdfPageImage {
  jpegDataUrl: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Generates a valid multi-page PDF 1.4 Blob where each page is a 16:9 landscape
 * sheet (841.89 x 473.56 pt, A4 landscape width) containing the full-bleed
 * high-resolution Smartboard page image.
 */
export function buildMultiPageSmartboardPdf(pages: SmartboardPdfPageImage[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const xrefOffsets: number[] = [0]; // object 0 is free

  const pushString = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteOffset += bytes.length;
  };

  // PDF Header
  pushString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Object 1: Catalog
  // Object 2: Pages root
  // For each page i (0..N-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
  const pageCount = pages.length;
  const pageObjIds: number[] = [];

  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(3 + i * 3);
  }

  // Write Object 1: Catalog
  xrefOffsets[1] = byteOffset;
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Write Object 2: Pages
  xrefOffsets[2] = byteOffset;
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  pushString(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageCount} >>\nendobj\n`);

  // Landscape 16:9 page size in PDF points (11.69in x 6.58in -> 842 x 474 pt)
  const pdfPageW = 842;
  const pdfPageH = 474;

  for (let i = 0; i < pageCount; i++) {
    const pageItem = pages[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    const jpegBytes = base64ToUint8Array(pageItem.jpegDataUrl);

    // 1. Page Object
    xrefOffsets[pageObjId] = byteOffset;
    pushString(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${pdfPageW} ${pdfPageH} ] ` +
        `/Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    // 2. Content Stream Object (draws the image scaled to full page)
    const contentStream = `q\n${pdfPageW} 0 0 ${pdfPageH} 0 0 cm\n${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    xrefOffsets[contentObjId] = byteOffset;
    pushString(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushString('\nendstream\nendobj\n');

    // 3. Image XObject (DCTDecode JPEG)
    xrefOffsets[imageObjId] = byteOffset;
    pushString(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image ` +
        `/Width ${Math.round(pageItem.widthPx)} /Height ${Math.round(pageItem.heightPx)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${jpegBytes.length} >>\n` +
        `stream\n`
    );
    pushBytes(jpegBytes);
    pushString('\nendstream\nendobj\n');
  }

  // Write XRef table
  const totalObjects = 3 + pageCount * 3;
  const startXref = byteOffset;
  pushString(`xref\n0 ${totalObjects}\n`);
  pushString('0000000000 65535 f \n');
  for (let objId = 1; objId < totalObjects; objId++) {
    const offsetStr = String(xrefOffsets[objId] || 0).padStart(10, '0');
    pushString(`${offsetStr} 00000 n \n`);
  }

  // Trailer
  pushString(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`
  );

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}
