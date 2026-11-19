import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Math as DocxMath,
  MathRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import { latexToMath } from 'docx/math';
import { saveAs } from 'file-saver';
import { CurriculumRow, DiagramKind, ExamPaper, LessonPlan5512, ViewMode } from '../types/eduplan';
import { buildDiagramSvgSpec, DiagramSvgSpec, svgToPngUint8Array } from './diagramSvg';
import {
  convertTableRowsToMarkdown,
  loadBankTableExportSettings,
  renderTableToPngBase64,
} from './questionBankDb';

// Convert 1 cm to twips (1 cm = 567 twips)
const CM = 567;

function fallbackUnicodeMath(expr: string): string {
  return expr
    .replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\mathbb\{Z\}/g, 'ℤ')
    .replace(/\\mathbb\{N\}/g, 'ℕ')
    .replace(/\\vec\{([^{}]+)\}/g, '$1\u20D7')
    .replace(/\\overrightarrow\{([^{}]+)\}/g, '$1\u20D7')
    .replace(/\\overline\{([^{}]+)\}/g, '$1\u0304')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '∥')
    .replace(/\\Leftrightarrow/g, '⇔')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/\\notin/g, '∉')
    .replace(/\\in(?![a-zA-Z])/g, '∈')
    .replace(/\\subset/g, '⊂')
    .replace(/\\setminus/g, '∖')
    .replace(/\\mid/g, '∣')
    .replace(/\\cdot/g, '·')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\ne(?![a-zA-Z])/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\pi/g, 'π')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\int/g, '∫')
    .replace(/\\max/g, 'max')
    .replace(/\\min/g, 'min')
    .replace(/\\lim/g, 'lim')
    .replace(/\\left|\\right|\\,|\\limits|\\mathrm\{([^{}]+)\}|\\text\{([^{}]+)\}/g, '$1$2')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\circ/g, '°')
    .replace(/\\triangle/g, '△')
    .replace(/\\pm/g, '±')
    .replace(/\\to(?![a-zA-Z])/g, '→')
    .replace(/\$/g, '')
    .trim();
}

function normalizeLatexForOmml(raw: string): string {
  return raw
    .trim()
    .replace(/\\displaystyle/g, '')
    .replace(/\\tfrac/g, '\\frac')
    .replace(/\\Big\|/g, '|')
    .replace(/\\big\|/g, '|')
    .replace(/\\limits/g, '')
    .replace(/\\ne(?![a-zA-Z])/g, '\\neq')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\!/g, '');
}

function createOmmlNode(latexExpr: string): DocxMath {
  const normalized = normalizeLatexForOmml(latexExpr);
  try {
    const components = latexToMath(normalized);
    return new DocxMath({ children: [...components] });
  } catch {
    return new DocxMath({
      children: [new MathRun(fallbackUnicodeMath(normalized))],
    });
  }
}

export function buildMathTextRuns(
  input: string,
  opts?: { bold?: boolean; color?: string; underline?: boolean }
): (TextRun | DocxMath)[] {
  const sanitized = (input || '').replace(/\*\*(.*?)\*\*/g, '$1');
  const runs: (TextRun | DocxMath)[] = [];

  // Tokenize $$...$$ first, then $...$
  const tokenRegex = /\$\$([\s\S]*?)\$\$|\$([^$]+?)\$/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(sanitized)) !== null) {
    if (match.index > lastIdx) {
      const plain = sanitized.slice(lastIdx, match.index).replace(/\$/g, '');
      if (plain) {
        runs.push(
          new TextRun({
            text: plain,
            font: 'Times New Roman',
            size: 26,
            bold: opts?.bold ?? false,
            color: opts?.color ?? '000000',
            underline: opts?.underline ? { type: UnderlineType.SINGLE } : undefined,
          })
        );
      }
    }
    const expr = (match[1] ?? match[2] ?? '').trim();
    if (expr) {
      runs.push(createOmmlNode(expr));
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < sanitized.length) {
    const tail = sanitized.slice(lastIdx).replace(/\$/g, '');
    if (tail) {
      runs.push(
        new TextRun({
          text: tail,
          font: 'Times New Roman',
          size: 26,
          bold: opts?.bold ?? false,
          color: opts?.color ?? '000000',
          underline: opts?.underline ? { type: UnderlineType.SINGLE } : undefined,
        })
      );
    }
  }

  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text: '',
        font: 'Times New Roman',
        size: 26,
      })
    );
  }
  return runs;
}

function splitLeadInColonLines(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\\n(?![a-zA-Z])/g, '\n');
  let out = '';
  let inMath = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '$') {
      inMath = !inMath;
      out += ch;
    } else if (ch === ':' && !inMath) {
      const rest = normalized.slice(i + 1);
      if (/^\s+(?:\$|[A-ZÀ-Ỹ])/.test(rest)) {
        out += ':\n';
      } else {
        out += ch;
      }
    } else {
      out += ch;
    }
  }
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function p(
  text: string,
  opts?: {
    bold?: boolean;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    underline?: boolean;
    thinBottomBorder?: boolean;
    spaceAfter?: number;
    spaceBefore?: number;
  }
) {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { after: opts?.spaceAfter ?? 80, before: opts?.spaceBefore ?? 0, line: 276 },
    border: opts?.thinBottomBorder
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: opts?.color ?? '0070C0',
            space: 3,
          },
        }
      : undefined,
    children: buildMathTextRuns(text, {
      bold: opts?.bold,
      color: opts?.color,
      underline: opts?.underline,
    }),
  });
}

function pushSolutionLines(children: (Paragraph | Table)[], rawText: string, spaceAfter = 40) {
  const lines = splitLeadInColonLines(rawText);
  lines.forEach((line, idx) => {
    children.push(
      p(line, {
        align: AlignmentType.JUSTIFIED,
        spaceAfter: idx === lines.length - 1 ? spaceAfter : 25,
      })
    );
  });
}

interface LoadedDiagramAsset {
  spec: DiagramSvgSpec;
  png: Uint8Array | null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const commaIdx = base64.indexOf(',');
  const b64 = commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64;
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function pushImageBlock(children: (Paragraph | Table)[], image?: string) {
  if (!image) return;
  try {
    const pngBytes = base64ToUint8Array(image);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 100 },
        children: [
          new ImageRun({
            type: 'png',
            data: pngBytes,
            transformation: {
              width: 450,
              height: 140,
            },
            altText: {
              name: 'TableImage',
              title: 'Bảng số liệu thống kê',
              description: 'Bảng số liệu trích xuất từ Word',
            },
          }),
        ],
      })
    );
  } catch {
    // ignore
  }
}

function pushTableDataBlock(children: (Paragraph | Table)[], tableData?: string[][]) {
  if (!tableData || tableData.length === 0) return;

  const settings = loadBankTableExportSettings();
  if (settings.exportDocxTableStyle === 'embedded_png_image') {
    const pngBase64 = renderTableToPngBase64(tableData, settings.imageDpiScale);
    if (pngBase64) {
      pushImageBlock(children, pngBase64);
      return;
    }
  } else if (settings.exportDocxTableStyle === 'markdown_text') {
    const md = convertTableRowsToMarkdown(tableData, settings.preserveMathInCells);
    md.split('\n').forEach((line) => {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 20, after: 20, line: 240 },
          children: [
            new TextRun({
              text: line,
              font: 'Courier New',
              size: 21,
              color: '0C4A6E',
            }),
          ],
        })
      );
    });
    return;
  }

  const colCount = Math.max(...tableData.map((r) => r.length));
  const totalWidthCm = 16.0;
  const leftColCm = 2.8;
  const remWidthCm = totalWidthCm - leftColCm;
  const remCols = Math.max(colCount - 1, 1);

  const rows = tableData.map((row, rIdx) => {
    const isHeader = rIdx === 0;
    return new TableRow({
      children: row.map((cellText, cIdx) => {
        const widthCm = cIdx === 0 ? leftColCm : remWidthCm / remCols;
        const cellChildren = settings.preserveMathInCells
          ? buildMathTextRuns(cellText, {
              bold: isHeader || cIdx === 0,
              color: isHeader ? '1F497D' : '000000',
            })
          : [
              new TextRun({
                text: cellText.replace(/\$/g, ''),
                font: 'Times New Roman',
                size: 24,
                bold: isHeader || cIdx === 0,
                color: isHeader ? '1F497D' : '000000',
              }),
            ];

        return new TableCell({
          width: { size: Math.round(widthCm * CM), type: WidthType.DXA },
          shading: isHeader ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8F1FA' } : undefined,
          children: [
            new Paragraph({
              alignment: cIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
              spacing: { before: 50, after: 50, line: 240 },
              children: cellChildren,
            }),
          ],
        });
      }),
    });
  });

  children.push(
    new Table({
      width: { size: Math.round(totalWidthCm * CM), type: WidthType.DXA },
      rows,
    })
  );
}

function pushDiagramBlock(
  children: (Paragraph | Table)[],
  diagram: DiagramKind | undefined,
  viewMode: ViewMode,
  assets: Map<DiagramKind, LoadedDiagramAsset>
) {
  if (!diagram) return;
  if (diagram === 'stat_table_12') {
    const defaultStatRows = [
      ['Thời gian (phút)', '[30; 50)', '[50; 70)', '[70; 90)', '[90; 110)', '[110; 130)'],
      ['Số học sinh', '6', '10', '12', '8', '4'],
    ];
    pushTableDataBlock(children, defaultStatRows);
    return;
  }

  const asset = assets.get(diagram);
  if (asset?.png) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 80 },
        children: [
          new ImageRun({
            type: 'png',
            data: asset.png,
            transformation: {
              width: asset.spec.displayWidthPx,
              height: asset.spec.displayHeightPx,
            },
            altText: {
              name: diagram,
              title: diagram,
              description: asset.spec.solCaption || `Hình minh họa ${diagram}`,
            },
          }),
        ],
      })
    );
  }
}

export interface MatrixDocxRow {
  stt: number;
  lessonTitle: string;
  partLabel: string;
  levelLabel: string;
  idTag: string;
  questionCount: number;
  commandCount: number;
  points: string;
}

export interface MatrixDocxAttachment {
  position: 'none' | 'start' | 'end';
  title: string;
  summaryLine?: string;
  rows: MatrixDocxRow[];
}

function buildMatrixSpecBlock(attachment: MatrixDocxAttachment): (Paragraph | Table)[] {
  const headerShade = { type: ShadingType.CLEAR, color: 'auto', fill: 'E0F2FE' };
  const totalShade = { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F5F9' };

  const headerRow = new TableRow({
    children: [
      { label: 'TT', width: 6 },
      { label: 'Bài học / Chuyên đề', width: 28 },
      { label: 'Phần thi', width: 16 },
      { label: 'Mức độ', width: 10 },
      { label: 'Mã ID Chuẩn', width: 16 },
      { label: 'Số câu', width: 8 },
      { label: 'Số lệnh', width: 8 },
      { label: 'Điểm', width: 8 },
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.PERCENTAGE },
          shading: headerShade,
          children: [
            p(col.label, {
              bold: true,
              color: '0F4C81',
              align: AlignmentType.CENTER,
              spaceBefore: 30,
              spaceAfter: 30,
            }),
          ],
        })
    ),
  });

  const bodyRows = attachment.rows.map(
    (r) =>
      new TableRow({
        children: [
          new TableCell({
            children: [p(String(r.stt), { align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
          new TableCell({
            children: [p(r.lessonTitle, { spaceAfter: 20 })],
          }),
          new TableCell({
            children: [p(r.partLabel, { align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
          new TableCell({
            children: [p(r.levelLabel, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
          new TableCell({
            children: [
              p(r.idTag, {
                bold: true,
                color: '136F63',
                align: AlignmentType.CENTER,
                spaceAfter: 20,
              }),
            ],
          }),
          new TableCell({
            children: [p(String(r.questionCount), { align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
          new TableCell({
            children: [p(String(r.commandCount), { align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
          new TableCell({
            children: [p(r.points, { bold: true, color: 'C00000', align: AlignmentType.CENTER, spaceAfter: 20 })],
          }),
        ],
      })
  );

  const totalQuestions = attachment.rows.reduce((acc, r) => acc + r.questionCount, 0);
  const totalCommands = attachment.rows.reduce((acc, r) => acc + r.commandCount, 0);

  const summaryRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 5,
        shading: totalShade,
        children: [
          p('TỔNG CỘNG TOÀN ĐỀ', {
            bold: true,
            color: '0F4C81',
            align: AlignmentType.CENTER,
            spaceAfter: 25,
          }),
        ],
      }),
      new TableCell({
        shading: totalShade,
        children: [
          p(`${totalQuestions} câu`, {
            bold: true,
            color: '0F4C81',
            align: AlignmentType.CENTER,
            spaceAfter: 25,
          }),
        ],
      }),
      new TableCell({
        shading: totalShade,
        children: [
          p(`${totalCommands} lệnh`, {
            bold: true,
            color: '0F4C81',
            align: AlignmentType.CENTER,
            spaceAfter: 25,
          }),
        ],
      }),
      new TableCell({
        shading: totalShade,
        children: [
          p('10,0đ', {
            bold: true,
            color: 'C00000',
            align: AlignmentType.CENTER,
            spaceAfter: 25,
          }),
        ],
      }),
    ],
  });

  const blocks: (Paragraph | Table)[] = [
    p(attachment.title, {
      bold: true,
      color: '0F4C81',
      align: AlignmentType.CENTER,
      spaceBefore: 120,
      spaceAfter: 40,
    }),
  ];

  if (attachment.summaryLine) {
    blocks.push(
      p(attachment.summaryLine, {
        color: '136F63',
        align: AlignmentType.CENTER,
        spaceAfter: 80,
      })
    );
  }

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows, summaryRow],
    }),
    p('', { spaceAfter: 120 })
  );

  return blocks;
}

export async function buildExamDocxDocument(
  exam: ExamPaper,
  viewMode: ViewMode,
  matrixAttachment?: MatrixDocxAttachment
): Promise<Document> {
  const letters = ['A', 'B', 'C', 'D'] as const;
  const diagramLayer: 'stem' | 'sol' = viewMode === 'teacher' ? 'sol' : 'stem';
  const neededDiagrams = new Set<DiagramKind>();
  exam.part1.forEach((q) => q.diagram && neededDiagrams.add(q.diagram));
  exam.part2.forEach((q) => q.diagram && neededDiagrams.add(q.diagram));
  exam.part3.forEach((q) => q.diagram && neededDiagrams.add(q.diagram));

  const diagramAssets = new Map<DiagramKind, LoadedDiagramAsset>();
  await Promise.all(
    Array.from(neededDiagrams).map(async (kind) => {
      if (kind === 'stat_table_12') return;
      const spec = buildDiagramSvgSpec(kind, diagramLayer, true);
      if (!spec) return;
      const png = await svgToPngUint8Array(spec.svg, spec.width, spec.height, 3);
      diagramAssets.set(kind, { spec, png });
    })
  );

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorder,
            width: { size: 46, type: WidthType.PERCENTAGE },
            children: [
              p(exam.department, { bold: true, color: '0070C0', align: AlignmentType.CENTER, spaceAfter: 25 }),
              p(exam.schoolName, {
                bold: true,
                color: '0070C0',
                underline: true,
                thinBottomBorder: true,
                align: AlignmentType.CENTER,
                spaceAfter: 35,
              }),
              p('(Đề thi có 04 trang)', { align: AlignmentType.CENTER, spaceAfter: 25 }),
              p(exam.author, { align: AlignmentType.CENTER, spaceAfter: 25 }),
              p(exam.sourceRepo, { align: AlignmentType.CENTER, spaceAfter: 25 }),
            ],
          }),
          new TableCell({
            borders: noBorder,
            width: { size: 54, type: WidthType.PERCENTAGE },
            children: [
              p(exam.examTitle, { bold: true, color: '0070C0', align: AlignmentType.CENTER, spaceAfter: 25 }),
              p(`Môn thi: ${exam.subject}`, { bold: true, align: AlignmentType.CENTER, spaceAfter: 25 }),
              p(`Thời gian làm bài: ${exam.durationMinutes} phút, Không kể thời gian phát đề`, {
                align: AlignmentType.CENTER,
                spaceAfter: 25,
              }),
              p(
                `(Đề có ${exam.part1.length + exam.part2.length + exam.part3.length} câu trong 3 Phần) — Mã đề: ${exam.examCode}`,
                { bold: true, color: 'C00000', align: AlignmentType.CENTER, spaceAfter: 25 }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    headerTable,
    new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [
        new TextRun({
          text: 'Họ, tên thí sinh: ....................................................\t',
          font: 'Times New Roman',
          size: 26,
          color: '1F497D',
          bold: true,
        }),
        new TextRun({
          text: `Mã đề: ${exam.examCode}`,
          font: 'Times New Roman',
          size: 26,
          color: 'C00000',
          bold: true,
        }),
      ],
    }),
    p('Số báo danh: .........................................................', {
      color: '1F497D',
      bold: true,
      spaceAfter: 120,
    }),
  ];

  // Part I
  if (exam.part1.length > 0) {
    children.push(
      p(`PHẦN I. Thí sinh trả lời từ câu 1 đến câu ${exam.part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`, {
        bold: true,
        spaceBefore: 100,
        spaceAfter: 100,
      })
    );
  }
  exam.part1.forEach((q) => {
    const tagPart = viewMode === 'teacher' ? ` ${q.tag}` : '';
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 60, line: 276 },
        children: [
          new TextRun({ text: `Câu ${q.number}${tagPart}. `, font: 'Times New Roman', size: 26, bold: true }),
          ...buildMathTextRuns(q.stem),
        ],
      })
    );

    pushDiagramBlock(children, q.diagram, viewMode, diagramAssets);
    if (q.tableData && q.tableData.length > 0) {
      pushTableDataBlock(children, q.tableData);
    } else {
      pushImageBlock(children, q.image || q.imageUrl);
    }

    q.options.forEach((opt, idx) => {
      const isCorrect = idx === q.correctIndex;
      const highlight = viewMode === 'teacher' && isCorrect;
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 40, line: 276 },
          children: [
            new TextRun({
              text: `${letters[idx]}. `,
              font: 'Times New Roman',
              size: 26,
              bold: true,
              color: highlight ? 'C00000' : '000000',
              underline: highlight ? { type: UnderlineType.SINGLE } : undefined,
            }),
            ...buildMathTextRuns(opt),
          ],
        })
      );
    });

    if (viewMode === 'teacher') {
      children.push(p('Lời giải:', { bold: true, color: '0F4C81', spaceBefore: 50, spaceAfter: 20 }));
      pushImageBlock(children, q.solutionImage);
      q.solutionSteps.forEach((st) => {
        children.push(p(st.title, { bold: true, color: '0F4C81', spaceAfter: 20 }));
        pushSolutionLines(children, st.leadIn, 20);
        pushSolutionLines(children, st.math, 40);
      });
      if (q.diagram === 'stat_table_12' && q.id === 'p1_12') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 30, after: 50 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF1F2' },
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C', space: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C', space: 4 },
              left: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C', space: 6 },
              right: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C', space: 6 },
            },
            children: buildMathTextRuns(
              'Nhóm tần số cao nhất [70; 90) (12 HS) · Điểm cực đại $x = 7$ ($t = 70$ phút) $\\Rightarrow H_{\\max} = 148$.',
              { bold: true, color: 'B91C1C' }
            ),
          })
        );
      }
      children.push(p(`Kết luận: Chọn ${letters[q.correctIndex]}.`, { bold: true, color: 'C00000', spaceAfter: 100 }));
    }
  });

  // Part II
  if (exam.part2.length > 0) {
    children.push(
      p(
        `PHẦN II. Thí sinh trả lời từ câu 1 đến câu ${exam.part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
        { bold: true, spaceBefore: 140, spaceAfter: 100 }
      )
    );
  }
  exam.part2.forEach((q) => {
    const tagPart = viewMode === 'teacher' ? ` ${q.tag}` : '';
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 60, line: 276 },
        children: [
          new TextRun({ text: `Câu ${q.number}${tagPart}. `, font: 'Times New Roman', size: 26, bold: true }),
          ...buildMathTextRuns(q.stem),
        ],
      })
    );
    pushDiagramBlock(children, q.diagram, viewMode, diagramAssets);
    if (q.tableData && q.tableData.length > 0) {
      pushTableDataBlock(children, q.tableData);
    } else {
      pushImageBlock(children, q.image || q.imageUrl);
    }

    q.statements.forEach((s) => {
      const highlight = viewMode === 'teacher' && s.isTrue;
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 40, line: 276 },
          children: [
            new TextRun({
              text: `${s.label}) `,
              font: 'Times New Roman',
              size: 26,
              bold: true,
              color: highlight ? 'B91C1C' : '000000',
              underline: highlight ? { type: UnderlineType.SINGLE } : undefined,
            }),
            ...buildMathTextRuns(s.text),
          ],
        })
      );
    });

    if (viewMode === 'teacher') {
      children.push(p('Lời giải:', { bold: true, color: '0F4C81', spaceBefore: 50, spaceAfter: 20 }));
      pushImageBlock(children, q.solutionImage);
      q.statements.forEach((s) => {
        children.push(p(s.stepTitle, { bold: true, color: '0F4C81', spaceAfter: 20 }));
        pushSolutionLines(children, s.leadIn, 20);
        pushSolutionLines(children, s.explanation, 25);
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 40, line: 276 },
            children: [
              new TextRun({ text: `Vậy mệnh đề ${s.label}) `, font: 'Times New Roman', size: 26 }),
              new TextRun({
                text: s.isTrue ? 'Đúng.' : 'Sai.',
                font: 'Times New Roman',
                size: 26,
                bold: true,
                color: s.isTrue ? 'FF0000' : '0070C0',
              }),
            ],
          })
        );
      });
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({ text: 'Kết luận: ', font: 'Times New Roman', size: 26, bold: true }),
            ...q.statements.flatMap((s, idx) => [
              new TextRun({
                text: `${s.label}) ${s.isTrue ? 'Đúng' : 'Sai'}`,
                font: 'Times New Roman',
                size: 26,
                bold: true,
                color: s.isTrue ? 'C00000' : '0070C0',
              }),
              new TextRun({ text: idx < 3 ? '; ' : '.', font: 'Times New Roman', size: 26 }),
            ]),
          ],
        })
      );
    }
  });

  // Part III
  if (exam.part3.length > 0) {
    children.push(
      p(`PHẦN III. Thí sinh trả lời từ câu 1 đến câu ${exam.part3.length}.`, {
        bold: true,
        spaceBefore: 140,
        spaceAfter: 100,
      })
    );
  }
  exam.part3.forEach((q) => {
    const tagPart = viewMode === 'teacher' ? ` ${q.tag}` : '';
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 60, line: 276 },
        children: [
          new TextRun({ text: `Câu ${q.number}${tagPart}. `, font: 'Times New Roman', size: 26, bold: true }),
          ...buildMathTextRuns(q.stem),
        ],
      })
    );
    pushDiagramBlock(children, q.diagram, viewMode, diagramAssets);
    if (q.tableData && q.tableData.length > 0) {
      pushTableDataBlock(children, q.tableData);
    } else {
      pushImageBlock(children, q.image || q.imageUrl);
    }

    if (viewMode === 'teacher') {
      children.push(p('Lời giải:', { bold: true, color: '0F4C81', spaceBefore: 50, spaceAfter: 20 }));
      children.push(p(`Trả lời: ${q.answer}`, { bold: true, color: 'C00000', spaceAfter: 40 }));
      pushImageBlock(children, q.solutionImage);
      q.solutionSteps.forEach((st) => {
        children.push(p(st.title, { bold: true, color: '0F4C81', spaceAfter: 20 }));
        pushSolutionLines(children, st.leadIn, 20);
        pushSolutionLines(children, st.math, 40);
      });
      children.push(p(`Kết luận: Giá trị cần tìm là ${q.answer}`, { bold: true, color: 'C00000', spaceAfter: 100 }));
    }
  });

  // Summary tables for Teacher Version
  if (viewMode === 'teacher') {
    children.push(
      p(`BẢNG ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM TỔNG HỢP (MÃ ĐỀ ${exam.examCode})`, {
        bold: true,
        color: 'C00000',
        align: AlignmentType.CENTER,
        spaceBefore: 180,
        spaceAfter: 100,
      })
    );
    if (exam.part1.length > 0) {
      children.push(
        p(`1. Bảng đáp án Phần I (${exam.part1.length} câu trắc nghiệm nhiều lựa chọn):`, {
          bold: true,
          spaceAfter: 60,
        })
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: exam.part1.map(
                (q) =>
                  new TableCell({ children: [p(`C${q.number}`, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })] })
              ),
            }),
            new TableRow({
              children: exam.part1.map(
                (q) =>
                  new TableCell({
                    children: [
                      p(letters[q.correctIndex], {
                        bold: true,
                        color: 'C00000',
                        align: AlignmentType.CENTER,
                        spaceAfter: 20,
                      }),
                    ],
                  })
              ),
            }),
          ],
        })
      );
    }

    if (exam.part2.length > 0) {
      children.push(
        p(`2. Bảng đáp án Phần II (${exam.part2.length} câu trắc nghiệm Đúng/Sai):`, {
          bold: true,
          spaceBefore: 120,
          spaceAfter: 60,
        })
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ['Câu', 'Mệnh đề a)', 'Mệnh đề b)', 'Mệnh đề c)', 'Mệnh đề d)'].map(
                (h) => new TableCell({ children: [p(h, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })] })
              ),
            }),
            ...exam.part2.map(
              (q) =>
                new TableRow({
                  children: [
                    new TableCell({
                      children: [p(`Câu ${q.number}`, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })],
                    }),
                    ...q.statements.map(
                      (s) =>
                        new TableCell({
                          children: [
                            p(s.isTrue ? 'Đúng' : 'Sai', {
                              bold: true,
                              color: s.isTrue ? 'C00000' : '0070C0',
                              align: AlignmentType.CENTER,
                              spaceAfter: 20,
                            }),
                          ],
                        })
                    ),
                  ],
                })
            ),
          ],
        })
      );
    }

    if (exam.part3.length > 0) {
      children.push(
        p(`3. Bảng đáp số Phần III (${exam.part3.length} câu trả lời ngắn):`, {
          bold: true,
          spaceBefore: 120,
          spaceAfter: 60,
        })
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: exam.part3.map(
                (q) =>
                  new TableCell({
                    children: [p(`Câu ${q.number}`, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })],
                  })
              ),
            }),
            new TableRow({
              children: exam.part3.map(
                (q) =>
                  new TableCell({
                    children: [p(q.answer, { bold: true, color: 'C00000', align: AlignmentType.CENTER, spaceAfter: 20 })],
                  })
              ),
            }),
          ],
        })
      );
    }
  }

  if (
    matrixAttachment &&
    matrixAttachment.position === 'start' &&
    matrixAttachment.rows.length > 0
  ) {
    children.unshift(...buildMatrixSpecBlock(matrixAttachment));
  }

  if (
    matrixAttachment &&
    matrixAttachment.position === 'end' &&
    matrixAttachment.rows.length > 0
  ) {
    children.push(...buildMatrixSpecBlock(matrixAttachment));
  }

  children.push(p('--- HẾT ---', { bold: true, align: AlignmentType.CENTER, spaceBefore: 160 }));

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(21 * CM), height: Math.round(29.7 * CM) },
            margin: { top: 2 * CM, right: 2 * CM, bottom: 2 * CM, left: 2 * CM },
          },
        },
        children,
      },
    ],
  });
}

export async function exportExamToDocx(
  exam: ExamPaper,
  viewMode: ViewMode,
  matrixAttachment?: MatrixDocxAttachment
) {
  const doc = await buildExamDocxDocument(exam, viewMode, matrixAttachment);
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `TeachLearnEdu_${exam.examCode}_${viewMode === 'teacher' ? 'BanGiaoVien' : 'BanHocSinh'}.docx`);
}

export async function exportLessonPlanToDocx(plan: LessonPlan5512) {
  const children: (Paragraph | Table)[] = [
    p('TRƯỜNG THPT LÊ QUÝ ĐÔN — TỔ TOÁN', { bold: true, color: '0070C0', align: AlignmentType.CENTER, spaceAfter: 40 }),
    p('KẾ HOẠCH BÀI DẠY CHUẨN CÔNG VĂN 5512', { bold: true, color: '0F4C81', align: AlignmentType.CENTER, spaceAfter: 40 }),
    p(`${plan.title} — ${plan.subject} Lớp ${plan.grade} (${plan.periods} tiết · ${plan.track})`, {
      bold: true,
      align: AlignmentType.CENTER,
      spaceAfter: 120,
    }),
    p('I. MỤC TIÊU DẠY HỌC', { bold: true, color: '0070C0', spaceAfter: 60 }),
    p(`1. Về kiến thức: ${plan.objectives.knowledge}`, { align: AlignmentType.JUSTIFIED }),
    p(`2. Về năng lực: ${plan.objectives.competencies}`, { align: AlignmentType.JUSTIFIED }),
    p(`3. Về phẩm chất: ${plan.objectives.qualities}`, { align: AlignmentType.JUSTIFIED }),
    p(`4. Năng lực số & AI (TT 02/2025 & CV 3456): ${plan.objectives.digitalAi}`, { align: AlignmentType.JUSTIFIED }),
    p('II. TIẾN TRÌNH DẠY HỌC', { bold: true, color: '0070C0', spaceBefore: 100, spaceAfter: 60 }),
  ];

  plan.activities.forEach((act) => {
    children.push(p(`${act.name} (${act.duration})`, { bold: true, color: '0F4C81', spaceBefore: 80, spaceAfter: 30 }));
    children.push(p(`a) Mục tiêu: ${act.goal}`, { align: AlignmentType.JUSTIFIED }));
    children.push(p(`b) Nội dung: ${act.content}`, { align: AlignmentType.JUSTIFIED }));
    children.push(p(`c) Sản phẩm: ${act.product}`, { align: AlignmentType.JUSTIFIED }));
    children.push(p(`d) Tổ chức thực hiện: ${act.execution}`, { align: AlignmentType.JUSTIFIED }));
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(21 * CM), height: Math.round(29.7 * CM) },
            margin: { top: 2 * CM, right: 2 * CM, bottom: 2 * CM, left: 2 * CM },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `GiaoAn_CV5512_${plan.grade}.docx`);
}

export async function exportCurriculumToDocx(rows: CurriculumRow[], title: string) {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ['STT', 'Bài học', 'Số tiết', 'Yêu cầu cần đạt', 'Năng lực số', 'Năng lực AI', 'STEM'].map((h) =>
          new TableCell({ children: [p(h, { bold: true, align: AlignmentType.CENTER, spaceAfter: 20 })] })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              String(r.stt),
              r.lesson,
              String(r.periods),
              r.objectives,
              r.digitalCompetency,
              r.aiCompetency,
              r.stemIntegration,
            ].map((cell) => new TableCell({ children: [p(cell, { align: AlignmentType.JUSTIFIED, spaceAfter: 20 })] })),
          })
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(21 * CM), height: Math.round(29.7 * CM) },
            margin: { top: 2 * CM, right: 2 * CM, bottom: 2 * CM, left: 2 * CM },
          },
        },
        children: [
          p('TRƯỜNG THPT LÊ QUÝ ĐÔN — SỞ GD&ĐT ĐẮK LẮK', { bold: true, color: '0070C0', align: AlignmentType.CENTER }),
          p(title, { bold: true, align: AlignmentType.CENTER, spaceAfter: 120 }),
          table,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'KeHoachGiaoDuc_CV5512_QD2422.docx');
}
