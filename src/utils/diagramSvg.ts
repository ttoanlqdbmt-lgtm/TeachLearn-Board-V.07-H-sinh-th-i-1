import { DiagramKind } from '../types/eduplan';

export interface DiagramSvgSpec {
  svg: string;
  width: number;
  height: number;
  displayWidthPx: number;
  displayHeightPx: number;
  solCaption?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWithSolBox(
  innerBody: string,
  width: number,
  baseHeight: number,
  solCaption: string | undefined,
  includeSolBoxInSvg: boolean,
  hasBorder = false
): { svg: string; height: number } {
  const boxGap = 10;
  const boxHeight = 32;
  const totalHeight = includeSolBoxInSvg && solCaption ? baseHeight + boxGap + boxHeight + 4 : baseHeight;

  const baseFrame = hasBorder
    ? `<rect x="0.6" y="0.6" width="${width - 1.2}" height="${baseHeight - 1.2}" fill="#FFFFFF" stroke="#000000" stroke-width="1.2"/>`
    : `<rect x="0" y="0" width="${width}" height="${baseHeight}" fill="#FFFFFF"/>`;

  const solBoxXml =
    includeSolBoxInSvg && solCaption
      ? `<rect x="2" y="${baseHeight + boxGap}" width="${width - 4}" height="${boxHeight}" rx="6" ry="6" fill="#FFF1F2" stroke="#B91C1C" stroke-width="1.4"/>` +
        `<text x="${width / 2}" y="${baseHeight + boxGap + 20}" text-anchor="middle" font-size="12" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">${escapeXml(solCaption)}</text>`
      : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">` +
    `<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>` +
    baseFrame +
    innerBody +
    solBoxXml +
    `</svg>`;

  return { svg, height: totalHeight };
}

export function buildDiagramSvgSpec(
  kind: DiagramKind,
  layer: 'stem' | 'sol',
  includeSolBoxInSvg = false
): DiagramSvgSpec | null {
  if (kind === 'stat_table_12') {
    return null;
  }

  if (kind === 'bbt_cubic') {
    const w = 460;
    const h = 175;
    const solCaption = "f'(x) < 0 trên (1; 3) ⇒ Hàm số nghịch biến trên khoảng (1; 3).";
    const solOverlay =
      layer === 'sol'
        ? `<circle cx="200" cy="20" r="14" fill="none" stroke="#B91C1C" stroke-width="2"/>` +
          `<circle cx="320" cy="20" r="14" fill="none" stroke="#B91C1C" stroke-width="2"/>` +
          `<rect x="216" y="42" width="88" height="26" rx="5" fill="none" stroke="#B91C1C" stroke-width="1.8" stroke-dasharray="3 2"/>`
        : '';

    const body =
      `<defs><marker id="arr-bbt-cubic" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0 0, 7 3.5, 0 7" fill="#0f172a"/></marker></defs>` +
      `<line x1="0" y1="35" x2="460" y2="35" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="0" y1="72" x2="460" y2="72" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="75" y1="0" x2="75" y2="175" stroke="#000000" stroke-width="1.2"/>` +
      `<text x="37" y="23" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">x</text>` +
      `<text x="37" y="59" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">f'(x)</text>` +
      `<text x="37" y="124" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">f(x)</text>` +
      `<text x="102" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">-∞</text>` +
      `<text x="200" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">1</text>` +
      `<text x="320" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">3</text>` +
      `<text x="432" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">+∞</text>` +
      `<text x="145" y="58" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">+</text>` +
      `<text x="200" y="58" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">0</text>` +
      `<text x="260" y="58" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">-</text>` +
      `<text x="320" y="58" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">0</text>` +
      `<text x="380" y="58" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">+</text>` +
      `<text x="102" y="158" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">-∞</text>` +
      `<text x="200" y="94" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">5</text>` +
      `<text x="320" y="158" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">1</text>` +
      `<text x="432" y="94" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">+∞</text>` +
      `<line x1="115" y1="145" x2="186" y2="97" stroke="#0f172a" stroke-width="1.4" marker-end="url(#arr-bbt-cubic)"/>` +
      `<line x1="214" y1="97" x2="306" y2="145" stroke="#0f172a" stroke-width="1.4" marker-end="url(#arr-bbt-cubic)"/>` +
      `<line x1="334" y1="145" x2="418" y2="97" stroke="#0f172a" stroke-width="1.4" marker-end="url(#arr-bbt-cubic)"/>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, true);
    const displayW = 390;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'bbt_rational') {
    const w = 440;
    const h = 165;
    const solCaption = 'TCĐ: x = 1 (vạch kép) · TCN: y = 2 (giới hạn tại ±∞).';
    const solOverlay =
      layer === 'sol'
        ? `<circle cx="255" cy="18" r="13" fill="none" stroke="#B91C1C" stroke-width="2"/>` +
          `<circle cx="105" cy="87" r="12" fill="none" stroke="#0284C7" stroke-width="2"/>` +
          `<circle cx="410" cy="147" r="12" fill="none" stroke="#0284C7" stroke-width="2"/>`
        : '';

    const body =
      `<defs><marker id="arr-bbt-rat" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0 0, 7 3.5, 0 7" fill="#0f172a"/></marker></defs>` +
      `<line x1="0" y1="35" x2="440" y2="35" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="0" y1="70" x2="440" y2="70" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="75" y1="0" x2="75" y2="165" stroke="#000000" stroke-width="1.2"/>` +
      `<text x="37" y="23" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">x</text>` +
      `<text x="37" y="57" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">y'</text>` +
      `<text x="37" y="122" text-anchor="middle" font-size="14" font-style="italic" font-family="Times New Roman, serif">y</text>` +
      `<text x="105" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">-∞</text>` +
      `<text x="255" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">1</text>` +
      `<text x="410" y="23" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">+∞</text>` +
      `<line x1="252" y1="35" x2="252" y2="165" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="258" y1="35" x2="258" y2="165" stroke="#000000" stroke-width="1.2"/>` +
      `<text x="170" y="57" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">-</text>` +
      `<text x="335" y="57" text-anchor="middle" font-size="14" font-family="Times New Roman, serif">-</text>` +
      `<text x="105" y="92" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">2</text>` +
      `<text x="236" y="152" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">-∞</text>` +
      `<text x="275" y="92" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">+∞</text>` +
      `<text x="410" y="152" text-anchor="middle" font-size="13" font-family="Times New Roman, serif">2</text>` +
      `<line x1="120" y1="95" x2="220" y2="145" stroke="#0f172a" stroke-width="1.4" marker-end="url(#arr-bbt-rat)"/>` +
      `<line x1="290" y1="95" x2="395" y2="145" stroke="#0f172a" stroke-width="1.4" marker-end="url(#arr-bbt-rat)"/>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, true);
    const displayW = 380;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'pyramid_rect') {
    const w = 340;
    const h = 245;
    const solCaption = 'CD ⊥ AD và CD ⊥ SA ⇒ CD ⊥ (SAD).';
    const solOverlay =
      layer === 'sol'
        ? `<line x1="95" y1="155" x2="35" y2="220" stroke="#0284C7" stroke-width="1.2" stroke-dasharray="3 2"/>` +
          `<line x1="95" y1="155" x2="275" y2="155" stroke="#0284C7" stroke-width="1.2" stroke-dasharray="3 2"/>` +
          `<line x1="95" y1="155" x2="95" y2="20" stroke="#0284C7" stroke-width="1.2" stroke-dasharray="3 2"/>` +
          `<text x="30" y="228" font-size="11" font-family="Times New Roman, serif" fill="#0284C7">Ox</text>` +
          `<text x="278" y="159" font-size="11" font-family="Times New Roman, serif" fill="#0284C7">Oy</text>` +
          `<text x="100" y="22" font-size="11" font-family="Times New Roman, serif" fill="#0284C7">Oz</text>` +
          `<line x1="245" y1="155" x2="200" y2="205" stroke="#B91C1C" stroke-width="2.6"/>` +
          `<polygon points="95,45 95,155 50,205" fill="rgba(185,28,28,0.12)" stroke="#B91C1C" stroke-width="1.5"/>`
        : '';

    const body =
      `<polygon points="95,155 245,155 200,205 50,205" fill="none" stroke="#0f172a" stroke-width="1.6"/>` +
      `<line x1="95" y1="45" x2="95" y2="155" stroke="#0f172a" stroke-width="1.6" stroke-dasharray="5 4"/>` +
      `<line x1="95" y1="155" x2="50" y2="205" stroke="#0f172a" stroke-width="1.6" stroke-dasharray="5 4"/>` +
      `<line x1="95" y1="155" x2="245" y2="155" stroke="#0f172a" stroke-width="1.6" stroke-dasharray="5 4"/>` +
      `<line x1="95" y1="45" x2="50" y2="205" stroke="#0f172a" stroke-width="1.6"/>` +
      `<line x1="95" y1="45" x2="200" y2="205" stroke="#0f172a" stroke-width="1.6"/>` +
      `<line x1="95" y1="45" x2="245" y2="155" stroke="#0f172a" stroke-width="1.6"/>` +
      `<polyline points="95,140 110,140 110,155" fill="none" stroke="#0f172a" stroke-width="1.2"/>` +
      solOverlay +
      `<text x="95" y="37" text-anchor="middle" font-size="14" font-weight="bold" font-family="Times New Roman, serif">S</text>` +
      `<text x="82" y="153" font-size="14" font-weight="bold" font-family="Times New Roman, serif">A</text>` +
      `<text x="253" y="159" font-size="14" font-weight="bold" font-family="Times New Roman, serif">B</text>` +
      `<text x="206" y="218" font-size="14" font-weight="bold" font-family="Times New Roman, serif">C</text>` +
      `<text x="36" y="215" font-size="14" font-weight="bold" font-family="Times New Roman, serif">D</text>`;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
    const displayW = 300;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'cubic_graph_p2') {
    const w = 320;
    const h = 230;
    const mapX = (x: number) => 150 + x * 48;
    const mapY = (y: number) => 115 - y * 24;
    const pts: string[] = [];
    for (let x = -1.25; x <= 3.25; x += 0.08) {
      const y = x * x * x - 3 * x * x + 2;
      if (y >= -4.2 && y <= 4.5) {
        pts.push(`${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`);
      }
    }
    const solCaption = 'Tâm đối xứng I(1;0) · Đường nối 2 cực trị: y = −2x + 2.';
    const solOverlay =
      layer === 'sol'
        ? `<line x1="${mapX(-0.5)}" y1="${mapY(3)}" x2="${mapX(2.6)}" y2="${mapY(-3.2)}" stroke="#B91C1C" stroke-width="1.6" stroke-dasharray="5 3"/>` +
          `<circle cx="${mapX(1)}" cy="${mapY(0)}" r="6" fill="none" stroke="#B91C1C" stroke-width="2"/>` +
          `<text x="${mapX(1) + 10}" y="${mapY(0) - 6}" font-size="12" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">I(1;0)</text>`
        : '';

    const body =
      `<line x1="20" y1="${mapY(0)}" x2="300" y2="${mapY(0)}" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="${mapX(0)}" y1="15" x2="${mapX(0)}" y2="215" stroke="#000000" stroke-width="1.2"/>` +
      `<text x="295" y="${mapY(0) - 6}" font-size="13" font-style="italic" font-family="Times New Roman, serif">x</text>` +
      `<text x="${mapX(0) + 8}" y="24" font-size="13" font-style="italic" font-family="Times New Roman, serif">y</text>` +
      `<text x="${mapX(0) - 12}" y="${mapY(0) + 14}" font-size="12" font-family="Times New Roman, serif">O</text>` +
      `<polyline points="${pts.join(' ')}" fill="none" stroke="#0284C7" stroke-width="2.2"/>` +
      `<line x1="${mapX(2)}" y1="${mapY(0)}" x2="${mapX(2)}" y2="${mapY(-2)}" stroke="#64748b" stroke-dasharray="3 3"/>` +
      `<line x1="${mapX(0)}" y1="${mapY(-2)}" x2="${mapX(2)}" y2="${mapY(-2)}" stroke="#64748b" stroke-dasharray="3 3"/>` +
      `<text x="${mapX(2)}" y="${mapY(0) - 6}" text-anchor="middle" font-size="12" font-family="Times New Roman, serif">2</text>` +
      `<text x="${mapX(0) - 14}" y="${mapY(2) + 4}" font-size="12" font-family="Times New Roman, serif">2</text>` +
      `<text x="${mapX(0) - 18}" y="${mapY(-2) + 4}" font-size="12" font-family="Times New Roman, serif">-2</text>` +
      `<text x="${mapX(1)}" y="${mapY(0) + 14}" text-anchor="middle" font-size="12" font-family="Times New Roman, serif">1</text>` +
      `<circle cx="${mapX(0)}" cy="${mapY(2)}" r="3.5" fill="#0f172a"/>` +
      `<circle cx="${mapX(2)}" cy="${mapY(-2)}" r="3.5" fill="#0f172a"/>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
    const displayW = 290;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'rational_oblique_p2') {
    const w = 320;
    const h = 230;
    const mapX = (x: number) => 165 + x * 24;
    const mapY = (y: number) => 115 - y * 14;
    const leftPts: string[] = [];
    const rightPts: string[] = [];
    for (let x = -5.5; x <= -1.25; x += 0.1) {
      const y = (-x * x + x - 1) / (x + 1);
      if (y > -7 && y < 10) leftPts.push(`${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`);
    }
    for (let x = -0.75; x <= 4.5; x += 0.1) {
      const y = (-x * x + x - 1) / (x + 1);
      if (y > -7 && y < 10) rightPts.push(`${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`);
    }
    const solCaption = 'TCĐ x = −1 và TCX y = −x + 2 cắt nhau tại I(−1; 3).';
    const solOverlay =
      layer === 'sol'
        ? `<circle cx="${mapX(-1)}" cy="${mapY(3)}" r="6" fill="none" stroke="#B91C1C" stroke-width="2"/>` +
          `<text x="${mapX(-1) + 8}" y="${mapY(3) - 6}" font-size="11" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">I(-1; 3)</text>`
        : '';

    const body =
      `<line x1="20" y1="${mapY(0)}" x2="300" y2="${mapY(0)}" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="${mapX(0)}" y1="15" x2="${mapX(0)}" y2="215" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="${mapX(-1)}" y1="15" x2="${mapX(-1)}" y2="215" stroke="#64748b" stroke-dasharray="4 4" stroke-width="1.3"/>` +
      `<line x1="${mapX(-5)}" y1="${mapY(7)}" x2="${mapX(4.5)}" y2="${mapY(-2.5)}" stroke="#64748b" stroke-dasharray="4 4" stroke-width="1.3"/>` +
      `<polyline points="${leftPts.join(' ')}" fill="none" stroke="#0284C7" stroke-width="2.2"/>` +
      `<polyline points="${rightPts.join(' ')}" fill="none" stroke="#0284C7" stroke-width="2.2"/>` +
      `<text x="${mapX(-1) - 18}" y="${mapY(0) + 14}" font-size="11" font-family="Times New Roman, serif">-1</text>` +
      `<text x="${mapX(0) + 6}" y="24" font-size="12" font-style="italic" font-family="Times New Roman, serif">y</text>` +
      `<text x="292" y="${mapY(0) - 5}" font-size="12" font-style="italic" font-family="Times New Roman, serif">x</text>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
    const displayW = 290;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'ellipse_circle_solid') {
    const w = 320;
    const h = 185;
    const cx = 160;
    const cy = 140;
    const s = 15;
    const solCaption = 'Giao điểm: x = ±4 ⇒ V = 208π / 3 ≈ 218 cm³.';
    const solOverlay =
      layer === 'sol'
        ? `<line x1="${cx - 4 * s}" y1="${cy - 3 * s}" x2="${cx - 4 * s}" y2="${cy}" stroke="#B91C1C" stroke-dasharray="3 3" stroke-width="1.4"/>` +
          `<line x1="${cx + 4 * s}" y1="${cy - 3 * s}" x2="${cx + 4 * s}" y2="${cy}" stroke="#B91C1C" stroke-dasharray="3 3" stroke-width="1.4"/>` +
          `<text x="${cx - 4 * s}" y="${cy + 14}" text-anchor="middle" font-size="11" font-family="Times New Roman, serif" fill="#B91C1C" font-weight="bold">-4</text>` +
          `<text x="${cx + 4 * s}" y="${cy + 14}" text-anchor="middle" font-size="11" font-family="Times New Roman, serif" fill="#B91C1C" font-weight="bold">4</text>`
        : '';

    const body =
      `<path d="M ${cx - 4 * s},${cy - 3 * s} A ${5 * s} ${5 * s} 0 0 1 ${cx + 4 * s},${cy - 3 * s} A ${8 * s} ${Math.sqrt(12) * s} 0 0 0 ${cx - 4 * s},${cy - 3 * s} Z" fill="${
        layer === 'sol' ? 'rgba(2,132,199,0.22)' : 'rgba(148,163,184,0.35)'
      }" stroke="#0284C7" stroke-width="1.5"/>` +
      `<path d="M ${cx - 5 * s},${cy} A ${5 * s} ${5 * s} 0 0 1 ${cx + 5 * s},${cy}" fill="none" stroke="#0f172a" stroke-width="1.6"/>` +
      `<path d="M ${cx - 8 * s},${cy} A ${8 * s} ${Math.sqrt(12) * s} 0 0 1 ${cx + 8 * s},${cy}" fill="none" stroke="#0f172a" stroke-width="1.6"/>` +
      `<line x1="20" y1="${cy}" x2="300" y2="${cy}" stroke="#000000" stroke-width="1.2"/>` +
      `<line x1="${cx}" y1="15" x2="${cx}" y2="165" stroke="#000000" stroke-width="1.2"/>` +
      `<text x="294" y="${cy - 6}" font-size="12" font-style="italic" font-family="Times New Roman, serif">x</text>` +
      `<text x="${cx + 8}" y="24" font-size="12" font-style="italic" font-family="Times New Roman, serif">y</text>` +
      `<text x="${cx - 12}" y="${cy + 14}" font-size="12" font-family="Times New Roman, serif">O</text>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
    const displayW = 300;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  if (kind === 'semicircle_trapezoid') {
    const w = 320;
    const h = 175;
    const cx = 160;
    const cy = 145;
    const R = 100;
    const xPos = 50;
    const trapH = Math.sqrt(R * R - xPos * xPos);
    const solCaption = 'Đặt OH = x = 3 cm ⇒ S_max = 27√3 ≈ 46,8 cm².';
    const solOverlay =
      layer === 'sol'
        ? `<line x1="${cx + xPos}" y1="${cy - trapH}" x2="${cx + xPos}" y2="${cy}" stroke="#B91C1C" stroke-dasharray="4 3" stroke-width="1.5"/>` +
          `<text x="${cx + xPos - 4}" y="${cy + 14}" font-size="12" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">H</text>` +
          `<text x="${cx + xPos / 2 - 4}" y="${cy - 5}" font-size="11" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">x</text>`
        : '';

    const body =
      `<path d="M ${cx - R},${cy} A ${R} ${R} 0 0 1 ${cx + R},${cy} Z" fill="none" stroke="#0f172a" stroke-width="1.6"/>` +
      `<polygon points="${cx - R},${cy} ${cx + R},${cy} ${cx + xPos},${cy - trapH} ${cx - xPos},${cy - trapH}" fill="rgba(14,165,233,0.16)" stroke="#0284C7" stroke-width="1.8"/>` +
      `<text x="${cx - R - 10}" y="${cy + 14}" font-size="13" font-weight="bold" font-family="Times New Roman, serif">A</text>` +
      `<text x="${cx + R + 4}" y="${cy + 14}" font-size="13" font-weight="bold" font-family="Times New Roman, serif">B</text>` +
      `<text x="${cx + xPos + 4}" y="${cy - trapH - 4}" font-size="13" font-weight="bold" font-family="Times New Roman, serif">C</text>` +
      `<text x="${cx - xPos - 14}" y="${cy - trapH - 4}" font-size="13" font-weight="bold" font-family="Times New Roman, serif">D</text>` +
      `<text x="${cx - 4}" y="${cy + 14}" font-size="12" font-family="Times New Roman, serif">O</text>` +
      solOverlay;

    const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
    const displayW = 290;
    return {
      svg,
      width: w,
      height,
      displayWidthPx: displayW,
      displayHeightPx: Math.round((displayW * height) / w),
      solCaption: layer === 'sol' ? solCaption : undefined,
    };
  }

  // open_box_cutout (and fallback for cubic_area)
  const w = 260;
  const h = 215;
  const solCaption = 'x = 3 cm ⇒ V_max = 432 cm³.';
  const solOverlay =
    layer === 'sol'
      ? `<text x="130" y="104" text-anchor="middle" font-size="11" font-weight="bold" font-family="Times New Roman, serif" fill="#B91C1C">18 − 2x</text>`
      : '';

  const body =
    `<rect x="50" y="20" width="160" height="160" fill="rgba(224,242,254,0.5)" stroke="#0f172a" stroke-width="1.6"/>` +
    `<rect x="50" y="20" width="32" height="32" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2"/>` +
    `<rect x="178" y="20" width="32" height="32" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2"/>` +
    `<rect x="50" y="148" width="32" height="32" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2"/>` +
    `<rect x="178" y="148" width="32" height="32" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2"/>` +
    `<rect x="82" y="52" width="96" height="96" fill="none" stroke="#0284C7" stroke-dasharray="4 3" stroke-width="1.5"/>` +
    `<text x="66" y="40" text-anchor="middle" font-size="11" font-family="Times New Roman, serif">x</text>` +
    `<text x="130" y="198" text-anchor="middle" font-size="12" font-weight="bold" font-family="Times New Roman, serif">18 cm</text>` +
    solOverlay;

  const { svg, height } = wrapWithSolBox(body, w, h, layer === 'sol' ? solCaption : undefined, includeSolBoxInSvg, false);
  const displayW = 240;
  return {
    svg,
    width: w,
    height,
    displayWidthPx: displayW,
    displayHeightPx: Math.round((displayW * height) / w),
    solCaption: layer === 'sol' ? solCaption : undefined,
  };
}

/**
 * Render an SVG string into a crisp high-DPI (~300 DPI at scale=3) PNG Uint8Array
 * using an offscreen HTML5 Canvas so docx ImageRun embeds high-resolution figures.
 */
export async function svgToPngUint8Array(
  svg: string,
  width: number,
  height: number,
  scale = 3
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (pngBlob) => {
            if (!pngBlob) {
              resolve(null);
              return;
            }
            pngBlob
              .arrayBuffer()
              .then((buf) => resolve(new Uint8Array(buf)))
              .catch(() => resolve(null));
          },
          'image/png'
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
