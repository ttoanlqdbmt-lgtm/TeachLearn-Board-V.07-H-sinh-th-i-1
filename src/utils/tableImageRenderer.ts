import { toCanvas } from 'html-to-image';
import katex from 'katex';
import { sanitizeKatexMath } from './solutionFormat';

export type TableCellBorderStyle = 'none' | 'single' | 'double' | 'dashed';

export interface TableCellBorders {
  top: TableCellBorderStyle;
  bottom: TableCellBorderStyle;
  left: TableCellBorderStyle;
  right: TableCellBorderStyle;
}

export interface DocxTableCell {
  text: string;
  colSpan: number;
  rowSpan: number;
  align: 'left' | 'center' | 'right';
  vAlign: 'top' | 'center' | 'bottom';
  bold?: boolean;
  borders: TableCellBorders;
}

export interface DocxStructuredTable {
  colCount: number;
  rowCount: number;
  hasMergedCells: boolean;
  isVariationTable: boolean;
  rows: DocxTableCell[][];
  flatRows: string[][];
  embeddedImages: string[];
}

export interface ExtractedParagraphResult {
  text: string;
  images: string[];
  markedOpt?: string;
}

function getWAttr(el: Element | undefined | null, name: string): string | null {
  if (!el) return null;
  return (
    el.getAttribute(`w:${name}`) ||
    el.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', name) ||
    el.getAttribute(name)
  );
}

function mapWordBorderStyle(borderEl: Element | undefined | null, fallback: TableCellBorderStyle): TableCellBorderStyle {
  if (!borderEl) return fallback;
  const val = (getWAttr(borderEl, 'val') || '').toLowerCase();
  if (!val) return fallback;
  if (val === 'none' || val === 'nil') return 'none';
  if (val === 'double' || val === 'triple') return 'double';
  if (val.includes('dash') || val === 'dotted') return 'dashed';
  return 'single';
}

function directChildrenByLocalName(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i];
    if (n.nodeType === 1 && (n as Element).localName === localName) {
      out.push(n as Element);
    }
  }
  return out;
}

function firstDirectChild(parent: Element, localName: string): Element | undefined {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i];
    if (n.nodeType === 1 && (n as Element).localName === localName) {
      return n as Element;
    }
  }
  return undefined;
}

export function parseWordTableElement(
  tblEl: Element,
  extractParagraphFn: (pEl: Element, mediaMap: Map<string, string>) => ExtractedParagraphResult,
  mediaMap: Map<string, string>
): DocxStructuredTable {
  const tblPr = firstDirectChild(tblEl, 'tblPr');
  const tblBorders = tblPr ? firstDirectChild(tblPr, 'tblBorders') : undefined;

  const tblTop = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'top') : undefined, 'single');
  const tblBottom = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'bottom') : undefined, 'single');
  const tblLeft = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'left') : undefined, 'single');
  const tblRight = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'right') : undefined, 'single');
  const tblInsideH = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'insideH') : undefined, 'single');
  const tblInsideV = mapWordBorderStyle(tblBorders ? firstDirectChild(tblBorders, 'insideV') : undefined, 'single');

  const tblGrid = firstDirectChild(tblEl, 'tblGrid');
  const gridCols = tblGrid ? directChildrenByLocalName(tblGrid, 'gridCol').length : 0;

  const trEls = directChildrenByLocalName(tblEl, 'tr');
  const effectiveTrs = trEls.length > 0 ? trEls : Array.from(tblEl.getElementsByTagNameNS('*', 'tr'));

  const rowCount = effectiveTrs.length;
  let maxCols = gridCols;
  let hasMergedCells = false;
  const embeddedImages: string[] = [];

  // Track vertical merge anchors per logical column
  interface VMergeAnchor {
    cell: DocxTableCell;
    colSpan: number;
  }
  const activeVMergeByCol: (VMergeAnchor | undefined)[] = [];
  const occupiedInRow: boolean[][] = effectiveTrs.map(() => []);
  const structuredRows: DocxTableCell[][] = [];
  const rawGridText: string[][] = [];

  effectiveTrs.forEach((trEl, rIdx) => {
    const tcEls = directChildrenByLocalName(trEl, 'tc');
    const effectiveTcs = tcEls.length > 0 ? tcEls : Array.from(trEl.getElementsByTagNameNS('*', 'tc'));
    const rowCells: DocxTableCell[] = [];
    const flatRow: string[] = [];

    let colCursor = 0;

    effectiveTcs.forEach((tcEl) => {
      while (occupiedInRow[rIdx]?.[colCursor]) {
        colCursor++;
      }

      const tcPr = firstDirectChild(tcEl, 'tcPr');
      const gridSpanEl = tcPr ? firstDirectChild(tcPr, 'gridSpan') : undefined;
      const colSpanRaw = Number(getWAttr(gridSpanEl, 'val') || '1');
      const colSpan = Number.isFinite(colSpanRaw) && colSpanRaw > 1 ? colSpanRaw : 1;
      if (colSpan > 1) hasMergedCells = true;

      const vMergeEl = tcPr ? firstDirectChild(tcPr, 'vMerge') : undefined;
      const vMergeAttr = vMergeEl ? (getWAttr(vMergeEl, 'val') || 'continue').toLowerCase() : null;
      const isVMergeContinue = Boolean(vMergeEl) && vMergeAttr !== 'restart';
      if (vMergeEl) hasMergedCells = true;

      const tcBorders = tcPr ? firstDirectChild(tcPr, 'tcBorders') : undefined;
      const isFirstRow = rIdx === 0;
      const isLastRow = rIdx === rowCount - 1;
      const isFirstCol = colCursor === 0;

      const topBorder = mapWordBorderStyle(
        tcBorders ? firstDirectChild(tcBorders, 'top') : undefined,
        isFirstRow ? tblTop : tblInsideH
      );
      const bottomBorder = mapWordBorderStyle(
        tcBorders ? firstDirectChild(tcBorders, 'bottom') : undefined,
        isLastRow ? tblBottom : tblInsideH
      );
      const leftBorder = mapWordBorderStyle(
        tcBorders ? firstDirectChild(tcBorders, 'left') : undefined,
        isFirstCol ? tblLeft : tblInsideV
      );
      const rightBorder = mapWordBorderStyle(
        tcBorders ? firstDirectChild(tcBorders, 'right') : undefined,
        tblInsideV
      );

      if (isVMergeContinue) {
        const anchor = activeVMergeByCol[colCursor];
        if (anchor) {
          anchor.cell.rowSpan += 1;
          if (isLastRow || tcBorders) {
            anchor.cell.borders.bottom = bottomBorder;
          }
          for (let c = 0; c < anchor.colSpan; c++) {
            occupiedInRow[rIdx][colCursor + c] = true;
            flatRow[colCursor + c] = '';
          }
          colCursor += anchor.colSpan;
          maxCols = Math.max(maxCols, colCursor);
          return;
        }
      }

      const pEls = directChildrenByLocalName(tcEl, 'p');
      const effectivePs = pEls.length > 0 ? pEls : Array.from(tcEl.getElementsByTagNameNS('*', 'p'));
      const cellLines: string[] = [];
      let detectedAlign: 'left' | 'center' | 'right' = 'center';
      let hasExplicitAlign = false;
      let cellBold = false;

      effectivePs.forEach((pEl) => {
        const pPr = firstDirectChild(pEl, 'pPr');
        const jcEl = pPr ? firstDirectChild(pPr, 'jc') : undefined;
        const jcVal = (getWAttr(jcEl, 'val') || '').toLowerCase();
        if (jcVal === 'left' || jcVal === 'start' || jcVal === 'both') {
          detectedAlign = 'left';
          hasExplicitAlign = true;
        } else if (jcVal === 'right' || jcVal === 'end') {
          detectedAlign = 'right';
          hasExplicitAlign = true;
        } else if (jcVal === 'center') {
          detectedAlign = 'center';
          hasExplicitAlign = true;
        }

        const rEls = pEl.getElementsByTagNameNS('*', 'r');
        for (let ri = 0; ri < rEls.length; ri++) {
          const rPr = firstDirectChild(rEls[ri], 'rPr');
          const bEl = rPr ? firstDirectChild(rPr, 'b') : undefined;
          if (bEl) {
            const bVal = (getWAttr(bEl, 'val') || 'true').toLowerCase();
            if (bVal !== 'false' && bVal !== '0') cellBold = true;
          }
        }

        const extracted = extractParagraphFn(pEl, mediaMap);
        if (extracted.text) {
          cellLines.push(extracted.text);
        }
        extracted.images.forEach((img) => embeddedImages.push(img));
      });

      const cellText = cellLines.join('\n').trim();
      if (!hasExplicitAlign && colCursor === 0 && cellText.length > 18 && !/^\$.*\$$/.test(cellText)) {
        detectedAlign = 'left';
      }

      const vAlignEl = tcPr ? firstDirectChild(tcPr, 'vAlign') : undefined;
      const vAlignRaw = (getWAttr(vAlignEl, 'val') || 'center').toLowerCase();
      const vAlign: 'top' | 'center' | 'bottom' =
        vAlignRaw === 'top' ? 'top' : vAlignRaw === 'bottom' ? 'bottom' : 'center';

      const cellObj: DocxTableCell = {
        text: cellText,
        colSpan,
        rowSpan: 1,
        align: detectedAlign,
        vAlign,
        bold: cellBold,
        borders: {
          top: topBorder,
          bottom: bottomBorder,
          left: leftBorder,
          right: rightBorder,
        },
      };

      rowCells.push(cellObj);

      for (let c = 0; c < colSpan; c++) {
        occupiedInRow[rIdx][colCursor + c] = true;
        flatRow[colCursor + c] = c === 0 ? cellText.replace(/\n+/g, ' ') : '';
      }

      if (vMergeEl && vMergeAttr === 'restart') {
        for (let c = 0; c < colSpan; c++) {
          activeVMergeByCol[colCursor + c] = { cell: cellObj, colSpan };
        }
      } else {
        for (let c = 0; c < colSpan; c++) {
          activeVMergeByCol[colCursor + c] = undefined;
        }
      }

      colCursor += colSpan;
      maxCols = Math.max(maxCols, colCursor);
    });

    if (rowCells.length > 0) {
      structuredRows.push(rowCells);
      rawGridText.push(flatRow);
    }
  });

  // Ensure right-most column border falls back to tblRight cleanly when not explicitly overridden
  structuredRows.forEach((rCells) => {
    if (rCells.length === 0) return;
    const totalColSpan = rCells.reduce((acc, c) => acc + c.colSpan, 0);
    if (totalColSpan >= maxCols && maxCols > 0) {
      const lastCell = rCells[rCells.length - 1];
      if (lastCell.borders.right === tblInsideV && tblRight !== tblInsideV) {
        lastCell.borders.right = tblRight;
      }
    }
  });

  const flatRows = rawGridText.map((row) => {
    const padded = new Array(Math.max(maxCols, row.length)).fill('');
    for (let i = 0; i < row.length; i++) padded[i] = row[i] || '';
    return padded;
  });

  const allText = flatRows.map((r) => r.join(' ')).join(' ');
  const hasDoubleBorder = structuredRows.some((r) =>
    r.some((c) => c.borders.left === 'double' || c.borders.right === 'double')
  );
  const isVariationTable =
    hasDoubleBorder ||
    /y'|f'\(x\)|\\infty|∞|↗|↘|\\nearrow|\\searrow|\|\|/.test(allText);

  return {
    colCount: Math.max(maxCols, 1),
    rowCount: structuredRows.length,
    hasMergedCells,
    isVariationTable,
    rows: structuredRows,
    flatRows,
    embeddedImages,
  };
}

export function buildStructuredTableFromFlatRows(rows: string[][]): DocxStructuredTable {
  const colCount = rows.length > 0 ? Math.max(...rows.map((r) => r.length), 1) : 1;
  const allText = rows.map((r) => r.join(' ')).join(' ');
  const isVariationTable = /y'|f'\(x\)|\\infty|∞|↗|↘|\\nearrow|\\searrow|\|\|/.test(allText);

  const structuredRows: DocxTableCell[][] = rows.map((r, rIdx) => {
    const cells: DocxTableCell[] = [];
    for (let cIdx = 0; cIdx < colCount; cIdx++) {
      const txt = (r[cIdx] || '').trim();
      cells.push({
        text: txt,
        colSpan: 1,
        rowSpan: 1,
        align: cIdx === 0 && txt.length > 18 && !/^\$.*\$$/.test(txt) ? 'left' : 'center',
        vAlign: 'center',
        bold: rIdx === 0 || (cIdx === 0 && isVariationTable),
        borders: {
          top: 'single',
          bottom: 'single',
          left: 'single',
          right: 'single',
        },
      });
    }
    return cells;
  });

  return {
    colCount,
    rowCount: structuredRows.length,
    hasMergedCells: false,
    isVariationTable,
    rows: structuredRows,
    flatRows: rows,
    embeddedImages: [],
  };
}

function estimateBytesFromDataUrl(dataUrl: string): number {
  if (!dataUrl) return 0;
  const idx = dataUrl.indexOf('base64,');
  if (idx === -1) return dataUrl.length;
  return Math.floor(((dataUrl.length - idx - 7) * 3) / 4);
}

export function formatMathCellForCanvas(raw: string): string {
  return (raw || '')
    .replace(/\$/g, '')
    .replace(/\\infty/g, '∞')
    .replace(/\\pm/g, '±')
    .replace(/\\to(?![a-zA-Z])/g, '→')
    .replace(/\\nearrow/g, '↗')
    .replace(/\\searrow/g, '↘')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\ne(?![a-zA-Z])|\\neq/g, '≠')
    .replace(/\\le(?![a-zA-Z])/g, '≤')
    .replace(/\\ge(?![a-zA-Z])/g, '≥')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\varphi/g, 'φ')
    .replace(/\\cdot/g, '·')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\{([^{}]+)\}/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function renderCellTextToHtml(raw: string): string {
  if (!raw) return '&nbsp;';
  const normalized = raw
    .replace(/\\nearrow/g, '↗')
    .replace(/\\searrow/g, '↘')
    .replace(/\r?\n/g, '\n');

  const sanitized = sanitizeKatexMath(normalized);
  const lines = sanitized.split('\n');
  const htmlLines = lines.map((line) => {
    const tokens: { type: 'text' | 'math'; content: string }[] = [];
    const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$]+?)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = mathRegex.exec(line)) !== null) {
      if (m.index > last) {
        tokens.push({ type: 'text', content: line.slice(last, m.index) });
      }
      tokens.push({ type: 'math', content: (m[1] ?? m[2] ?? '').trim() });
      last = mathRegex.lastIndex;
    }
    if (last < line.length) {
      tokens.push({ type: 'text', content: line.slice(last) });
    }

    const renderedParts = tokens.map((tok) => {
      if (tok.type === 'math' && tok.content) {
        try {
          return katex.renderToString(tok.content, {
            displayMode: false,
            throwOnError: false,
            strict: false,
            errorColor: 'inherit',
          });
        } catch {
          return escapeHtml(formatMathCellForCanvas(tok.content));
        }
      }
      return escapeHtml(tok.content);
    });

    return renderedParts.join('') || '&nbsp;';
  });

  return htmlLines.join('<br/>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function borderCssValue(style: TableCellBorderStyle): string {
  if (style === 'none') return 'none';
  if (style === 'double') return '3.5px double #000000';
  if (style === 'dashed') return '1.25px dashed #000000';
  return '1.25px solid #000000';
}

function canvasHasInkPixels(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width < 10 || canvas.height < 10) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 8000)) & ~3;
    for (let i = 0; i < data.length; i += step) {
      if (data[i] < 220 || data[i + 1] < 220 || data[i + 2] < 220) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function compressCanvasSyncUnder100KB(
  canvas: HTMLCanvasElement,
  maxBytes = 94 * 1024
): string {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return '';

  // Try crisp lossless PNG first — solid white math tables typically compress to 15-60KB
  const pngUrl = canvas.toDataURL('image/png');
  if (estimateBytesFromDataUrl(pngUrl) <= maxBytes) {
    return pngUrl;
  }

  // High-quality WebP keeps crisp black text/lines on white without JPEG ringing
  const webpQualities = [0.92, 0.85, 0.78, 0.68, 0.56];
  let bestUrl = pngUrl;
  for (const q of webpQualities) {
    const candidate = canvas.toDataURL('image/webp', q);
    if (candidate.startsWith('data:image/webp')) {
      bestUrl = candidate;
      if (estimateBytesFromDataUrl(candidate) <= maxBytes) {
        return candidate;
      }
    }
  }

  // Downscale cleanly while maintaining white backdrop if table is massive
  const scales = [0.85, 0.72, 0.6];
  for (const scale of scales) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(64, Math.round(canvas.width * scale));
    scaled.height = Math.max(48, Math.round(canvas.height * scale));
    const sCtx = scaled.getContext('2d');
    if (!sCtx) continue;
    sCtx.fillStyle = '#FFFFFF';
    sCtx.fillRect(0, 0, scaled.width, scaled.height);
    sCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);

    const sWebp = scaled.toDataURL('image/webp', 0.8);
    if (sWebp.startsWith('data:image/webp')) {
      bestUrl = sWebp;
      if (estimateBytesFromDataUrl(sWebp) <= maxBytes) return sWebp;
    } else {
      const sJpeg = scaled.toDataURL('image/jpeg', 0.82);
      bestUrl = sJpeg;
      if (estimateBytesFromDataUrl(sJpeg) <= maxBytes) return sJpeg;
    }
  }

  return bestUrl;
}

export function renderStructuredTableViaCanvasSync(
  table: DocxStructuredTable,
  dprScale = 2,
  maxBytes = 94 * 1024
): string {
  if (!table || table.rows.length === 0 || typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const fontSize = 15;
  const lineHeight = 20;
  const paddingX = 14;
  const paddingY = 9;
  const colCount = Math.max(table.colCount, 1);
  const colWidths: number[] = new Array(colCount).fill(78);

  ctx.font = `${fontSize}px "Times New Roman", Times, Georgia, serif`;

  // Measure single-span cells first, then widen spanned columns proportionally if needed
  const occupancy: boolean[][] = table.rows.map(() => new Array(colCount).fill(false));
  const rowHeights: number[] = new Array(table.rows.length).fill(fontSize + paddingY * 2);

  interface PositionedCell {
    cell: DocxTableCell;
    rIdx: number;
    cStart: number;
    lines: string[];
  }
  const positioned: PositionedCell[] = [];

  table.rows.forEach((row, rIdx) => {
    let cCursor = 0;
    row.forEach((cell) => {
      while (cCursor < colCount && occupancy[rIdx]?.[cCursor]) {
        cCursor++;
      }
      const cSpan = Math.max(1, Math.min(cell.colSpan, colCount - cCursor));
      const rSpan = Math.max(1, cell.rowSpan);
      for (let rr = 0; rr < rSpan; rr++) {
        if (!occupancy[rIdx + rr]) occupancy[rIdx + rr] = new Array(colCount).fill(false);
        for (let cc = 0; cc < cSpan; cc++) {
          occupancy[rIdx + rr][cCursor + cc] = true;
        }
      }

      const formattedLines = (cell.text || '')
        .split('\n')
        .map((l) => formatMathCellForCanvas(l))
        .filter((l, idx, arr) => l.length > 0 || arr.length === 1);

      positioned.push({ cell, rIdx, cStart: cCursor, lines: formattedLines });

      const neededH = Math.max(1, formattedLines.length) * lineHeight + paddingY * 2;
      if (rSpan === 1) {
        rowHeights[rIdx] = Math.max(rowHeights[rIdx], neededH);
      }

      if (cSpan === 1) {
        const maxLineW = Math.max(...formattedLines.map((l) => ctx.measureText(l).width), 40);
        colWidths[cCursor] = Math.min(Math.max(colWidths[cCursor], maxLineW + paddingX * 2), 340);
      }
      cCursor += cSpan;
    });
  });

  // Ensure multi-colspan cells fit comfortably across their columns
  positioned.forEach(({ cell, cStart, lines }) => {
    if (cell.colSpan > 1) {
      const spanW = colWidths.slice(cStart, cStart + cell.colSpan).reduce((a, b) => a + b, 0);
      const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 0) + paddingX * 2;
      if (maxLineW > spanW) {
        const extraPerCol = (maxLineW - spanW) / cell.colSpan;
        for (let c = 0; c < cell.colSpan; c++) {
          colWidths[cStart + c] += extraPerCol;
        }
      }
    }
  });

  const padOuter = 8;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const tableH = rowHeights.reduce((a, b) => a + b, 0);
  const totalW = Math.ceil(tableW + padOuter * 2);
  const totalH = Math.ceil(tableH + padOuter * 2);

  canvas.width = totalW * dprScale;
  canvas.height = totalH * dprScale;
  ctx.scale(dprScale, dprScale);

  // Pure white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalW, totalH);

  const colX: number[] = [padOuter];
  for (let c = 0; c < colCount; c++) {
    colX.push(colX[c] + colWidths[c]);
  }
  const rowY: number[] = [padOuter];
  for (let r = 0; r < table.rows.length; r++) {
    rowY.push(rowY[r] + rowHeights[r]);
  }

  const drawSideBorder = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style: TableCellBorderStyle,
    isVertical: boolean
  ) => {
    if (style === 'none') return;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.25;
    if (style === 'dashed') {
      ctx.setLineDash([4, 3]);
    }
    if (style === 'double') {
      const offset = 1.8;
      ctx.beginPath();
      if (isVertical) {
        ctx.moveTo(x1 - offset, y1);
        ctx.lineTo(x2 - offset, y2);
        ctx.moveTo(x1 + offset, y1);
        ctx.lineTo(x2 + offset, y2);
      } else {
        ctx.moveTo(x1, y1 - offset);
        ctx.lineTo(x2, y2 - offset);
        ctx.moveTo(x1, y1 + offset);
        ctx.lineTo(x2, y2 + offset);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  };

  positioned.forEach(({ cell, rIdx, cStart, lines }) => {
    const x = colX[cStart];
    const y = rowY[rIdx];
    const w = colX[Math.min(colCount, cStart + cell.colSpan)] - x;
    const h = rowY[Math.min(table.rows.length, rIdx + cell.rowSpan)] - y;

    // White cell fill
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, h);

    // Crisp black borders
    drawSideBorder(x, y, x + w, y, cell.borders.top, false);
    drawSideBorder(x, y + h, x + w, y + h, cell.borders.bottom, false);
    drawSideBorder(x, y, x, y + h, cell.borders.left, true);
    drawSideBorder(x + w, y, x + w, y + h, cell.borders.right, true);

    const isBold =
      Boolean(cell.bold) ||
      (!table.isVariationTable && rIdx === 0) ||
      (table.isVariationTable && cStart === 0);

    ctx.fillStyle = '#000000';
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px "Times New Roman", Times, Georgia, serif`;
    ctx.textBaseline = 'middle';

    const contentBlockH = lines.length * lineHeight;
    let startLineY = y + (h - contentBlockH) / 2 + lineHeight / 2;

    lines.forEach((lineText) => {
      let textX = x + w / 2;
      if (cell.align === 'left') {
        ctx.textAlign = 'left';
        textX = x + paddingX;
      } else if (cell.align === 'right') {
        ctx.textAlign = 'right';
        textX = x + w - paddingX;
      } else {
        ctx.textAlign = 'center';
        textX = x + w / 2;
      }
      ctx.fillText(lineText, textX, startLineY, Math.max(24, w - paddingX * 1.4));
      startLineY += lineHeight;
    });
  });

  return compressCanvasSyncUnder100KB(canvas, maxBytes);
}

/**
 * Renders a structured Word table to a crisp 2x/3x image with real KaTeX typography,
 * Times New Roman font, crisp black borders, pure white background, and compresses < 100KB.
 */
export async function renderStructuredTableToImageUnder100KB(
  table: DocxStructuredTable,
  dprScale = 2,
  maxBytes = 94 * 1024
): Promise<string> {
  if (!table || table.rows.length === 0 || typeof document === 'undefined') return '';

  // Attempt high-fidelity DOM + KaTeX + html-to-image capture
  const mount = document.createElement('div');
  mount.setAttribute('aria-hidden', 'true');
  mount.style.position = 'fixed';
  mount.style.left = '-12000px';
  mount.style.top = '0';
  mount.style.zIndex = '-1';
  mount.style.backgroundColor = '#ffffff';
  mount.style.padding = '8px';
  mount.style.margin = '0';
  mount.style.display = 'inline-block';
  mount.style.pointerEvents = 'none';

  const tableEl = document.createElement('table');
  tableEl.style.borderCollapse = 'collapse';
  tableEl.style.backgroundColor = '#ffffff';
  tableEl.style.color = '#000000';
  tableEl.style.fontFamily = '"Times New Roman", Times, Georgia, serif';
  tableEl.style.fontSize = '15px';
  tableEl.style.lineHeight = '1.38';
  tableEl.style.width = 'max-content';
  tableEl.style.maxWidth = '760px';

  const tbody = document.createElement('tbody');
  table.rows.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    row.forEach((cell, cIdx) => {
      const td = document.createElement('td');
      if (cell.colSpan > 1) td.colSpan = cell.colSpan;
      if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;

      td.style.backgroundColor = '#ffffff';
      td.style.color = '#000000';
      td.style.padding = '7px 12px';
      td.style.textAlign = cell.align;
      td.style.verticalAlign = cell.vAlign === 'center' ? 'middle' : cell.vAlign;
      td.style.borderTop = borderCssValue(cell.borders.top);
      td.style.borderBottom = borderCssValue(cell.borders.bottom);
      td.style.borderLeft = borderCssValue(cell.borders.left);
      td.style.borderRight = borderCssValue(cell.borders.right);
      td.style.whiteSpace = cell.text.length > 36 ? 'normal' : 'nowrap';

      const shouldBold =
        Boolean(cell.bold) ||
        (!table.isVariationTable && rIdx === 0) ||
        (table.isVariationTable && cIdx === 0);
      if (shouldBold) {
        td.style.fontWeight = '700';
      }

      td.innerHTML = renderCellTextToHtml(cell.text);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tableEl.appendChild(tbody);
  mount.appendChild(tableEl);
  document.body.appendChild(mount);

  try {
    const canvas = await toCanvas(mount, {
      pixelRatio: dprScale,
      backgroundColor: '#ffffff',
      cacheBust: false,
      skipFonts: false,
    });
    if (canvas && canvas.width > 12 && canvas.height > 12 && canvasHasInkPixels(canvas)) {
      const compressed = compressCanvasSyncUnder100KB(canvas, maxBytes);
      if (compressed) return compressed;
    }
  } catch {
    // Fall back silently to structured 2x Canvas renderer
  } finally {
    if (mount.parentNode) {
      mount.parentNode.removeChild(mount);
    }
  }

  return renderStructuredTableViaCanvasSync(table, dprScale, maxBytes);
}
