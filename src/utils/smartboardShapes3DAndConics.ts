export type StrokeLineStyle = 'solid' | 'dashed' | 'dotted' | 'dash_dot';

export type SmartShapeCategoryTab = '2d' | '3d' | 'conic';

export type SmartTemplateId =
  // 3D Solids - Group 1: Pyramids (Nhóm Hình chóp)
  | 'pyramid_sabc'
  | 'pyramid_sabcd'
  | 'pyramid_regular_sabcd'
  | 'frustum_pyramid'
  // 3D Solids - Group 2: Prisms & Boxes (Nhóm Lăng trụ & Hình hộp)
  | 'prism_triangular'
  | 'box_abcd_a1b1c1d1'
  | 'prism_regular_polygon'
  // 3D Solids - Group 3: Solids of Revolution (Nhóm Khối tròn xoay)
  | 'cone_revolution'
  | 'frustum_cone'
  | 'cylinder_revolution'
  | 'sphere_globe'
  // 3D Solids - Group 4: Coordinate Axes (Nhóm Hệ trục tọa độ)
  | 'axes_oxyz_3d'
  | 'axes_oxy_2d'
  // Conics & Graphs (Thẻ 3 Đường Conic & Đồ thị)
  | 'conic_ellipse'
  | 'conic_hyperbola'
  | 'conic_parabola';

export interface TemplatePoint {
  x: number;
  y: number;
}

export interface TemplateSegment {
  points: TemplatePoint[];
  lineStyle: StrokeLineStyle;
  arrowEnd?: boolean;
  widthScale?: number;
  opacityScale?: number;
}

export interface TemplateRightAngle {
  vertex: TemplatePoint;
  along1: TemplatePoint;
  along2: TemplatePoint;
  size?: number;
}

export interface TemplateVertexLabel {
  text: string;
  x: number;
  y: number;
  offsetX?: number;
  offsetY?: number;
  showDot?: boolean;
}

export interface GeneratedSmartFigure {
  segments: TemplateSegment[];
  rightAngles: TemplateRightAngle[];
  labels: TemplateVertexLabel[];
}

export interface SmartTemplateConfig {
  showLabels: boolean;
  showAuxGuides: boolean;
  /** Horizontal perspective shift (-0.45 to +0.45) */
  viewSkewX: number;
  /** Vertical perspective depth ratio (0.18 to 0.55) */
  viewTiltY: number;
  /** Rotation in degrees for the whole template */
  rotationDeg?: number;
  /** Sub-variant e.g. 'sa_perp' | 'regular' | 'parallelogram' | 'trapezoid' | 'tri' | 'quad' | 'right' | 'oblique' | 'box' | 'cube' | 'hexagonal' | 'pentagonal' | 'canonical' | 'quadratic' */
  variant: string;
}

export interface SmartTemplateCatalogItem {
  id: SmartTemplateId;
  tab: SmartShapeCategoryTab;
  groupTitle: string;
  numberBadge: number;
  title: string;
  subtitle: string;
  defaultVariant: string;
  variants?: Array<{ id: string; label: string }>;
  defaultShowLabels?: boolean;
}

export const LINE_STYLE_PRESETS: Array<{
  id: StrokeLineStyle;
  label: string;
  shortLabel: string;
  usageHint: string;
  dashArray: number[];
}> = [
  {
    id: 'solid',
    label: 'Nét liền (Solid)',
    shortLabel: 'Liền —',
    usageHint: 'Dùng cho cạnh thấy, đường bao chính',
    dashArray: [],
  },
  {
    id: 'dashed',
    label: 'Nét đứt chuẩn (Dashed)',
    shortLabel: 'Đứt - -',
    usageHint: 'Dùng cho cạnh khuất, đường gióng tọa độ',
    dashArray: [10, 6],
  },
  {
    id: 'dotted',
    label: 'Nét đứt mảnh (Dotted)',
    shortLabel: 'Chấm ···',
    usageHint: 'Dùng cho đường phụ, lưới gióng mờ',
    dashArray: [3, 5],
  },
  {
    id: 'dash_dot',
    label: 'Nét chấm gạch (Dash-Dot)',
    shortLabel: 'Tâm -·-',
    usageHint: 'Dùng cho trục đối xứng, đường cao nón/trụ',
    dashArray: [14, 5, 3, 5],
  },
];

export function getCanvasLineDash(style: StrokeLineStyle | undefined, zoom = 1): number[] {
  const s = style || 'solid';
  const scale = zoom === 1 ? 1 : Math.max(0.5, zoom);
  switch (s) {
    case 'dashed':
      return scale === 1 ? [10, 6] : [10 * scale, 6 * scale];
    case 'dotted':
      return scale === 1 ? [3, 5] : [3 * scale, 5 * scale];
    case 'dash_dot':
      return scale === 1
        ? [14, 5, 3, 5]
        : [14 * scale, 5 * scale, 3 * scale, 5 * scale];
    case 'solid':
    default:
      return [];
  }
}

export const SMART_TEMPLATE_CATALOG: SmartTemplateCatalogItem[] = [
  // ================= NHÓM HÌNH CHÓP (1 - 4) =================
  {
    id: 'pyramid_sabc',
    tab: '3d',
    groupTitle: 'Nhóm Hình chóp',
    numberBadge: 1,
    title: 'Tứ diện / Chóp tam giác S.ABC',
    subtitle: 'Tùy chọn SA ⊥ (ABC) hoặc chóp tam giác đều',
    defaultVariant: 'sa_perp',
    variants: [
      { id: 'sa_perp', label: 'SA ⊥ (ABC)' },
      { id: 'regular', label: 'Chóp đều S.ABC' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'pyramid_sabcd',
    tab: '3d',
    groupTitle: 'Nhóm Hình chóp',
    numberBadge: 2,
    title: 'Hình chóp tứ giác S.ABCD',
    subtitle: 'Đáy hình bình hành / hình thang (SA ⊥ đáy)',
    defaultVariant: 'parallelogram_perp',
    variants: [
      { id: 'parallelogram_perp', label: 'Đáy HBH (SA ⊥ đáy)' },
      { id: 'trapezoid_perp', label: 'Đáy hình thang' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'pyramid_regular_sabcd',
    tab: '3d',
    groupTitle: 'Nhóm Hình chóp',
    numberBadge: 3,
    title: 'Chóp tứ giác đều S.ABCD',
    subtitle: 'Có sẵn tâm đáy O và đường cao SO nét chấm gạch',
    defaultVariant: 'regular_so',
    variants: [
      { id: 'regular_so', label: 'Có tâm O & đường cao SO' },
      { id: 'minimal', label: 'Chỉ khung cạnh' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'frustum_pyramid',
    tab: '3d',
    groupTitle: 'Nhóm Hình chóp',
    numberBadge: 4,
    title: 'Hình chóp cụt tam giác & tứ giác',
    subtitle: "Hai đáy song song ABC.A'B'C' / ABCD.A'B'C'D'",
    defaultVariant: 'quad',
    variants: [
      { id: 'quad', label: 'Chóp cụt tứ giác' },
      { id: 'tri', label: 'Chóp cụt tam giác' },
    ],
    defaultShowLabels: true,
  },

  // ================= NHÓM LĂNG TRỤ & HÌNH HỘP (5 - 7) =================
  {
    id: 'prism_triangular',
    tab: '3d',
    groupTitle: 'Nhóm Lăng trụ & Hình hộp',
    numberBadge: 5,
    title: "Lăng trụ tam giác ABC.A'B'C'",
    subtitle: 'Lăng trụ đứng hoặc lăng trụ xiên tự động nét khuất',
    defaultVariant: 'right',
    variants: [
      { id: 'right', label: 'Lăng trụ đứng' },
      { id: 'oblique', label: 'Lăng trụ xiên' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'box_abcd_a1b1c1d1',
    tab: '3d',
    groupTitle: 'Nhóm Lăng trụ & Hình hộp',
    numberBadge: 6,
    title: "Hình hộp / Lập phương ABCD.A'B'C'D'",
    subtitle: 'Chuẩn 3 cạnh khuất xuất phát từ đỉnh A nét đứt',
    defaultVariant: 'box',
    variants: [
      { id: 'box', label: 'Hình hộp chữ nhật' },
      { id: 'cube', label: 'Hình lập phương' },
      { id: 'diag', label: 'Kèm đường chéo AC\'' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'prism_regular_polygon',
    tab: '3d',
    groupTitle: 'Nhóm Lăng trụ & Hình hộp',
    numberBadge: 7,
    title: 'Lăng trụ ngũ giác / lục giác đều',
    subtitle: 'Đáy đa giác đều có phân biệt cạnh thấy & cạnh khuất',
    defaultVariant: 'hexagonal',
    variants: [
      { id: 'hexagonal', label: 'Lăng trụ lục giác đều' },
      { id: 'pentagonal', label: 'Lăng trụ ngũ giác đều' },
    ],
    defaultShowLabels: true,
  },

  // ================= NHÓM KHỐI TRÒN XOAY (8 - 11) =================
  {
    id: 'cone_revolution',
    tab: '3d',
    groupTitle: 'Nhóm Khối tròn xoay',
    numberBadge: 8,
    title: 'Hình nón tròn xoay (Đỉnh S, tâm O)',
    subtitle: 'Đáy elip nửa trước liền, nửa sau đứt, trục SO & bán kính OA',
    defaultVariant: 'standard',
    variants: [
      { id: 'standard', label: 'Đủ trục SO & bán kính OA' },
      { id: 'section', label: 'Kèm thiết diện qua đỉnh' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'frustum_cone',
    tab: '3d',
    groupTitle: 'Nhóm Khối tròn xoay',
    numberBadge: 9,
    title: "Hình nón cụt tròn xoay (Trục OO')",
    subtitle: 'Hai đáy tròn xoay bán kính R, r và đường sinh l',
    defaultVariant: 'standard',
    defaultShowLabels: true,
  },
  {
    id: 'cylinder_revolution',
    tab: '3d',
    groupTitle: 'Nhóm Khối tròn xoay',
    numberBadge: 10,
    title: "Hình trụ tròn xoay (Trục OO')",
    subtitle: '2 đáy elip chuẩn nét khuất, trục tâm OO\' chấm gạch',
    defaultVariant: 'standard',
    variants: [
      { id: 'standard', label: 'Chuẩn trục OO\' & bán kính' },
      { id: 'axial_rect', label: 'Kèm thiết diện qua trục' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'sphere_globe',
    tab: '3d',
    groupTitle: 'Nhóm Khối tròn xoay',
    numberBadge: 11,
    title: 'Hình cầu / Mặt cầu S(O; R)',
    subtitle: 'Đường tròn lớn liền, xích đạo nửa trước liền nửa sau đứt',
    defaultVariant: 'standard',
    variants: [
      { id: 'standard', label: 'Mặt cầu tâm O bán kính R' },
      { id: 'lat_circle', label: 'Kèm đường tròn giao tuyến' },
    ],
    defaultShowLabels: true,
  },

  // ================= NHÓM HỆ TRỤC TỌA ĐỘ (12 - 13) =================
  {
    id: 'axes_oxyz_3d',
    tab: '3d',
    groupTitle: 'Nhóm Hệ trục tọa độ',
    numberBadge: 12,
    title: 'Hệ trục tọa độ không gian Oxyz',
    subtitle: '3 trục Ox, Oy, Oz có mũi tên, góc vuông & chia vạch',
    defaultVariant: 'standard',
    variants: [
      { id: 'standard', label: 'Hệ trục Oxyz chuẩn SGK' },
      { id: 'with_point', label: 'Kèm điểm M(x;y;z) & hình hộp gióng' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'axes_oxy_2d',
    tab: '3d',
    groupTitle: 'Nhóm Hệ trục tọa độ',
    numberBadge: 13,
    title: 'Hệ trục tọa độ phẳng Oxy',
    subtitle: 'Có lưới tọa độ mờ, chia vạch đơn vị & mũi tên chuẩn SGK',
    defaultVariant: 'with_grid',
    variants: [
      { id: 'with_grid', label: 'Có lưới tọa độ mờ' },
      { id: 'clean', label: 'Chỉ trục & vạch đơn vị' },
    ],
    defaultShowLabels: true,
  },

  // ================= THẺ 3 ĐƯỜNG CONIC & ĐỒ THỊ (14 - 16) =================
  {
    id: 'conic_ellipse',
    tab: 'conic',
    groupTitle: '3 Đường Conic chuẩn Toán 10 & 12',
    numberBadge: 14,
    title: 'Đường Elip x²/a² + y²/b² = 1',
    subtitle: 'Tiêu điểm F₁, F₂, trục lớn A₁A₂, trục nhỏ B₁B₂ & HCN cơ sở nét đứt',
    defaultVariant: 'full_box',
    variants: [
      { id: 'full_box', label: 'Kèm HCN cơ sở & F₁, F₂' },
      { id: 'clean_axes', label: 'Elip & trục tọa độ' },
      { id: 'ellipse_only', label: 'Chỉ đường Elip' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'conic_hyperbola',
    tab: 'conic',
    groupTitle: '3 Đường Conic chuẩn Toán 10 & 12',
    numberBadge: 15,
    title: 'Đường Hypebol x²/a² - y²/b² = 1',
    subtitle: '2 nhánh đối xứng, tiêu điểm F₁, F₂, HCN cơ sở & 2 tiệm cận nét đứt',
    defaultVariant: 'asymptotes_box',
    variants: [
      { id: 'asymptotes_box', label: 'Đủ 2 tiệm cận & HCN cơ sở' },
      { id: 'asymptotes_only', label: '2 nhánh & 2 tiệm cận' },
    ],
    defaultShowLabels: true,
  },
  {
    id: 'conic_parabola',
    tab: 'conic',
    groupTitle: '3 Đường Conic chuẩn Toán 10 & 12',
    numberBadge: 16,
    title: 'Đường Parabol y² = 2px & y = ax²+bx+c',
    subtitle: 'Hiển thị tiêu điểm F và đường chuẩn Δ nét đứt chuẩn SGK',
    defaultVariant: 'canonical_right',
    variants: [
      { id: 'canonical_right', label: 'Chính tắc y² = 2px (F & Δ)' },
      { id: 'quadratic_up', label: 'Hàm bậc hai y = ax² + bx + c' },
    ],
    defaultShowLabels: true,
  },
];

export function createDefaultTemplateConfig(templateId: SmartTemplateId): SmartTemplateConfig {
  const item = SMART_TEMPLATE_CATALOG.find((c) => c.id === templateId);
  return {
    showLabels: item?.defaultShowLabels ?? true,
    showAuxGuides: true,
    viewSkewX: 0,
    viewTiltY: 0,
    rotationDeg: 0,
    variant: item?.defaultVariant || 'standard',
  };
}

// Helper to generate ellipse arc polyline
function buildEllipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle: number,
  endAngle: number,
  steps = 48
): TemplatePoint[] {
  const pts: TemplatePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = startAngle + ((endAngle - startAngle) * i) / steps;
    pts.push({
      x: cx + rx * Math.cos(t),
      y: cy + ry * Math.sin(t),
    });
  }
  return pts;
}

function seg(
  p1: TemplatePoint,
  p2: TemplatePoint,
  lineStyle: StrokeLineStyle = 'solid',
  arrowEnd = false,
  widthScale = 1,
  opacityScale = 1
): TemplateSegment {
  return {
    points: [p1, p2],
    lineStyle,
    arrowEnd,
    widthScale,
    opacityScale,
  };
}

function polySeg(
  points: TemplatePoint[],
  lineStyle: StrokeLineStyle = 'solid',
  arrowEnd = false,
  widthScale = 1,
  opacityScale = 1
): TemplateSegment {
  return {
    points,
    lineStyle,
    arrowEnd,
    widthScale,
    opacityScale,
  };
}

/**
 * Generates high-precision 2D/3D/Conic geometry within the given bounding box.
 * Supports interactive resizing (width, height), perspective skew/tilt, and vertex labels.
 */
export function buildSmartFigureGeometry(
  templateId: SmartTemplateId,
  box: { x: number; y: number; width: number; height: number },
  config: SmartTemplateConfig
): GeneratedSmartFigure {
  const x0 = box.x;
  const y0 = box.y;
  const w = Math.max(40, box.width);
  const h = Math.max(40, box.height);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;

  const skewX = config.viewSkewX || 0; // -0.35 .. +0.35
  const tiltY = config.viewTiltY || 0; // -0.15 .. +0.15
  const variant = config.variant || 'standard';

  const pt = (nx: number, ny: number): TemplatePoint => ({
    x: x0 + nx * w,
    y: y0 + ny * h,
  });

  const segments: TemplateSegment[] = [];
  const rightAngles: TemplateRightAngle[] = [];
  const labels: TemplateVertexLabel[] = [];

  switch (templateId) {
    // =========================================================================
    // 1. TỨ DIỆN / HÌNH CHÓP TAM GIÁC S.ABC
    // =========================================================================
    case 'pyramid_sabc': {
      const isRegular = variant === 'regular';
      const A = pt(0.12, 0.72 + tiltY * 0.2);
      const C = pt(0.90, 0.72 - tiltY * 0.1);
      const B = pt(0.44 + skewX * 0.25, 0.94);
      const G = {
        x: (A.x + B.x + C.x) / 3,
        y: (A.y + B.y + C.y) / 3,
      };
      const S = isRegular
        ? { x: G.x + skewX * w * 0.12, y: y0 + 0.08 * h }
        : { x: A.x + skewX * w * 0.08, y: y0 + 0.08 * h };

      // Visible base edges AB, BC
      segments.push(seg(A, B, 'solid'));
      segments.push(seg(B, C, 'solid'));
      // Hidden back base edge AC (dashed)
      segments.push(seg(A, C, 'dashed'));

      // Lateral edges SA, SB, SC (visible)
      segments.push(seg(S, A, 'solid'));
      segments.push(seg(S, B, 'solid'));
      segments.push(seg(S, C, 'solid'));

      if (isRegular && config.showAuxGuides) {
        const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
        segments.push(seg(A, M, 'dotted', false, 0.85));
        segments.push(seg(S, G, 'dash_dot', false, 0.9));
        rightAngles.push({ vertex: G, along1: S, along2: A, size: 10 });
        labels.push({ text: 'G', x: G.x, y: G.y, offsetX: 6, offsetY: 14, showDot: true });
      } else {
        rightAngles.push({ vertex: A, along1: S, along2: C, size: 11 });
        rightAngles.push({ vertex: A, along1: S, along2: B, size: 10 });
      }

      labels.push(
        { text: 'S', x: S.x, y: S.y, offsetX: -4, offsetY: -12, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: -4, offsetY: 18, showDot: true },
        { text: 'C', x: C.x, y: C.y, offsetX: 10, offsetY: 4, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 2. HÌNH CHÓP TỨ GIÁC S.ABCD (SA ⊥ (ABCD), ĐÁY HBH / HÌNH THANG)
    // =========================================================================
    case 'pyramid_sabcd': {
      const isTrapezoid = variant === 'trapezoid_perp';
      const A = pt(0.24 + skewX * 0.15, 0.66 + tiltY * 0.2);
      const D = pt(0.88, 0.66 + tiltY * 0.2);
      const B = pt(0.08, 0.92);
      const C = isTrapezoid
        ? pt(0.56 + skewX * 0.1, 0.92)
        : { x: B.x + (D.x - A.x), y: B.y };
      const S = { x: A.x + skewX * w * 0.06, y: y0 + 0.08 * h };

      // Hidden edges from A: SA, AB, AD (and AC, BD diagonals if aux enabled)
      segments.push(seg(S, A, 'dashed'));
      segments.push(seg(A, B, 'dashed'));
      segments.push(seg(A, D, 'dashed'));

      if (config.showAuxGuides) {
        segments.push(seg(A, C, 'dotted', false, 0.85));
        segments.push(seg(B, D, 'dotted', false, 0.85));
      }

      // Visible edges: BC, CD, SB, SC, SD
      segments.push(seg(B, C, 'solid'));
      segments.push(seg(C, D, 'solid'));
      segments.push(seg(S, B, 'solid'));
      segments.push(seg(S, C, 'solid'));
      segments.push(seg(S, D, 'solid'));

      rightAngles.push({ vertex: A, along1: S, along2: D, size: 11 });
      rightAngles.push({ vertex: A, along1: S, along2: B, size: 10 });

      labels.push(
        { text: 'S', x: S.x, y: S.y, offsetX: -4, offsetY: -12, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -16, offsetY: -4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: -16, offsetY: 14, showDot: true },
        { text: 'C', x: C.x, y: C.y, offsetX: 6, offsetY: 16, showDot: true },
        { text: 'D', x: D.x, y: D.y, offsetX: 10, offsetY: 2, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 3. HÌNH CHÓP TỨ GIÁC ĐỀU S.ABCD (CÓ TÂM O & ĐƯỜNG CAO SO NÉT CHẤM GẠCH)
    // =========================================================================
    case 'pyramid_regular_sabcd': {
      const A = pt(0.26 + skewX * 0.15, 0.67 + tiltY * 0.2);
      const D = pt(0.90, 0.67 + tiltY * 0.2);
      const B = pt(0.10, 0.92);
      const C = { x: B.x + (D.x - A.x), y: B.y };
      const O = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };
      const S = { x: O.x + skewX * w * 0.05, y: y0 + 0.07 * h };

      // Hidden edges from A: AB, AD, SA
      segments.push(seg(A, B, 'dashed'));
      segments.push(seg(A, D, 'dashed'));
      segments.push(seg(S, A, 'dashed'));

      if (variant !== 'minimal') {
        // Base diagonals AC, BD (dashed)
        segments.push(seg(A, C, 'dashed', false, 0.9));
        segments.push(seg(B, D, 'dashed', false, 0.9));
        // Altitude SO (dash-dot)
        segments.push(seg(S, O, 'dash_dot'));
        rightAngles.push({ vertex: O, along1: S, along2: D, size: 10 });
        labels.push({ text: 'O', x: O.x, y: O.y, offsetX: 4, offsetY: 15, showDot: true });
      }

      // Visible edges: BC, CD, SB, SC, SD
      segments.push(seg(B, C, 'solid'));
      segments.push(seg(C, D, 'solid'));
      segments.push(seg(S, B, 'solid'));
      segments.push(seg(S, C, 'solid'));
      segments.push(seg(S, D, 'solid'));

      labels.push(
        { text: 'S', x: S.x, y: S.y, offsetX: -4, offsetY: -12, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -16, offsetY: -4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: -16, offsetY: 14, showDot: true },
        { text: 'C', x: C.x, y: C.y, offsetX: 8, offsetY: 15, showDot: true },
        { text: 'D', x: D.x, y: D.y, offsetX: 10, offsetY: 2, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 4. HÌNH CHÓP CỤT TAM GIÁC & TỨ GIÁC
    // =========================================================================
    case 'frustum_pyramid': {
      if (variant === 'tri') {
        const A = pt(0.10, 0.76 + tiltY * 0.15);
        const C = pt(0.90, 0.76 + tiltY * 0.15);
        const B = pt(0.46 + skewX * 0.18, 0.95);

        const A1 = pt(0.28 + skewX * 0.1, 0.24);
        const C1 = pt(0.72 + skewX * 0.1, 0.24);
        const B1 = pt(0.48 + skewX * 0.2, 0.37);

        // Top base A'B'C' (all visible)
        segments.push(seg(A1, B1, 'solid'));
        segments.push(seg(B1, C1, 'solid'));
        segments.push(seg(A1, C1, 'solid'));

        // Bottom base ABC (AC hidden)
        segments.push(seg(A, B, 'solid'));
        segments.push(seg(B, C, 'solid'));
        segments.push(seg(A, C, 'dashed'));

        // Lateral edges
        segments.push(seg(A, A1, 'solid'));
        segments.push(seg(B, B1, 'solid'));
        segments.push(seg(C, C1, 'solid'));

        labels.push(
          { text: "A'", x: A1.x, y: A1.y, offsetX: -18, offsetY: -6, showDot: true },
          { text: "B'", x: B1.x, y: B1.y, offsetX: -4, offsetY: 15, showDot: true },
          { text: "C'", x: C1.x, y: C1.y, offsetX: 8, offsetY: -6, showDot: true },
          { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
          { text: 'B', x: B.x, y: B.y, offsetX: -4, offsetY: 16, showDot: true },
          { text: 'C', x: C.x, y: C.y, offsetX: 10, offsetY: 4, showDot: true }
        );
      } else {
        // Quad frustum ABCD.A'B'C'D'
        const A = pt(0.24 + skewX * 0.12, 0.68 + tiltY * 0.15);
        const D = pt(0.92, 0.68 + tiltY * 0.15);
        const B = pt(0.08, 0.93);
        const C = { x: B.x + (D.x - A.x), y: B.y };

        const A1 = pt(0.35 + skewX * 0.12, 0.18);
        const D1 = pt(0.76 + skewX * 0.12, 0.18);
        const B1 = pt(0.25 + skewX * 0.12, 0.34);
        const C1 = { x: B1.x + (D1.x - A1.x), y: B1.y };

        // Top base A'B'C'D' (all visible)
        segments.push(seg(A1, B1, 'solid'));
        segments.push(seg(B1, C1, 'solid'));
        segments.push(seg(C1, D1, 'solid'));
        segments.push(seg(D1, A1, 'solid'));

        // Hidden from A: AB, AD, AA'
        segments.push(seg(A, B, 'dashed'));
        segments.push(seg(A, D, 'dashed'));
        segments.push(seg(A, A1, 'dashed'));

        // Visible bottom & lateral edges
        segments.push(seg(B, C, 'solid'));
        segments.push(seg(C, D, 'solid'));
        segments.push(seg(B, B1, 'solid'));
        segments.push(seg(C, C1, 'solid'));
        segments.push(seg(D, D1, 'solid'));

        // Axis OO'
        if (config.showAuxGuides) {
          const O = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };
          const O1 = { x: (A1.x + C1.x) / 2, y: (A1.y + C1.y) / 2 };
          segments.push(seg(O1, O, 'dash_dot', false, 0.9));
          labels.push(
            { text: "O'", x: O1.x, y: O1.y, offsetX: 6, offsetY: -4, showDot: true },
            { text: 'O', x: O.x, y: O.y, offsetX: 6, offsetY: 14, showDot: true }
          );
        }

        labels.push(
          { text: "A'", x: A1.x, y: A1.y, offsetX: -18, offsetY: -6, showDot: true },
          { text: "B'", x: B1.x, y: B1.y, offsetX: -20, offsetY: 4, showDot: true },
          { text: "C'", x: C1.x, y: C1.y, offsetX: 8, offsetY: 6, showDot: true },
          { text: "D'", x: D1.x, y: D1.y, offsetX: 8, offsetY: -6, showDot: true },
          { text: 'A', x: A.x, y: A.y, offsetX: -16, offsetY: -4, showDot: true },
          { text: 'B', x: B.x, y: B.y, offsetX: -18, offsetY: 12, showDot: true },
          { text: 'C', x: C.x, y: C.y, offsetX: 8, offsetY: 14, showDot: true },
          { text: 'D', x: D.x, y: D.y, offsetX: 10, offsetY: 2, showDot: true }
        );
      }
      break;
    }

    // =========================================================================
    // 5. HÌNH LĂNG TRỤ TAM GIÁC ABC.A'B'C' (ĐỨNG & XIÊN)
    // =========================================================================
    case 'prism_triangular': {
      const isOblique = variant === 'oblique';
      const shiftX = (isOblique ? 0.16 : 0) + skewX * 0.2;

      const A = pt(0.12, 0.76 + tiltY * 0.15);
      const C = pt(0.84, 0.76 + tiltY * 0.15);
      const B = pt(0.44, 0.94);

      const A1 = pt(0.12 + shiftX, 0.12);
      const C1 = pt(0.84 + shiftX, 0.12);
      const B1 = pt(0.44 + shiftX, 0.30);

      // Top base A'B'C' (all visible)
      segments.push(seg(A1, B1, 'solid'));
      segments.push(seg(B1, C1, 'solid'));
      segments.push(seg(A1, C1, 'solid'));

      // Bottom base ABC (AC hidden)
      segments.push(seg(A, B, 'solid'));
      segments.push(seg(B, C, 'solid'));
      segments.push(seg(A, C, 'dashed'));

      // Lateral edges AA', BB', CC'
      segments.push(seg(A, A1, 'solid'));
      segments.push(seg(B, B1, 'solid'));
      segments.push(seg(C, C1, 'solid'));

      if (!isOblique) {
        rightAngles.push({ vertex: A, along1: A1, along2: B, size: 10 });
      }

      labels.push(
        { text: "A'", x: A1.x, y: A1.y, offsetX: -18, offsetY: -6, showDot: true },
        { text: "B'", x: B1.x, y: B1.y, offsetX: -4, offsetY: 15, showDot: true },
        { text: "C'", x: C1.x, y: C1.y, offsetX: 8, offsetY: -6, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: -4, offsetY: 16, showDot: true },
        { text: 'C', x: C.x, y: C.y, offsetX: 10, offsetY: 4, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 6. HÌNH HỘP CHỮ NHẬT / LẬP PHƯƠNG ABCD.A'B'C'D'
    // =========================================================================
    case 'box_abcd_a1b1c1d1': {
      const depthX = 0.24 + skewX * 0.12;
      const depthY = 0.22 + tiltY * 0.12;

      const B = pt(0.08, 0.92);
      const C = pt(0.68, 0.92);
      const A = { x: B.x + depthX * w, y: B.y - depthY * h };
      const D = { x: C.x + depthX * w, y: C.y - depthY * h };

      const topRise = 0.58 * h;
      const A1 = { x: A.x, y: A.y - topRise };
      const B1 = { x: B.x, y: B.y - topRise };
      const C1 = { x: C.x, y: C.y - topRise };
      const D1 = { x: D.x, y: D.y - topRise };

      // Top face A'B'C'D' (all visible)
      segments.push(seg(A1, B1, 'solid'));
      segments.push(seg(B1, C1, 'solid'));
      segments.push(seg(C1, D1, 'solid'));
      segments.push(seg(D1, A1, 'solid'));

      // Front & right visible edges
      segments.push(seg(B, C, 'solid'));
      segments.push(seg(C, D, 'solid'));
      segments.push(seg(B, B1, 'solid'));
      segments.push(seg(C, C1, 'solid'));
      segments.push(seg(D, D1, 'solid'));

      // 3 Hidden edges meeting at A: AB, AD, AA'
      segments.push(seg(A, B, 'dashed'));
      segments.push(seg(A, D, 'dashed'));
      segments.push(seg(A, A1, 'dashed'));

      if (variant === 'diag') {
        segments.push(seg(A, C1, 'dash_dot'));
        segments.push(seg(A, C, 'dotted', false, 0.85));
      }

      labels.push(
        { text: "A'", x: A1.x, y: A1.y, offsetX: -6, offsetY: -10, showDot: true },
        { text: "B'", x: B1.x, y: B1.y, offsetX: -18, offsetY: -4, showDot: true },
        { text: "C'", x: C1.x, y: C1.y, offsetX: -4, offsetY: 15, showDot: true },
        { text: "D'", x: D1.x, y: D1.y, offsetX: 8, offsetY: -6, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -14, offsetY: -4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: -18, offsetY: 12, showDot: true },
        { text: 'C', x: C.x, y: C.y, offsetX: 4, offsetY: 16, showDot: true },
        { text: 'D', x: D.x, y: D.y, offsetX: 10, offsetY: 4, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 7. HÌNH LĂNG TRỤ NGŨ GIÁC / LỤC GIÁC ĐỀU
    // =========================================================================
    case 'prism_regular_polygon': {
      const isPent = variant === 'pentagonal';
      const n = isPent ? 5 : 6;
      const rx = 0.38 * w;
      const ry = (0.15 + tiltY * 0.08) * h;
      const topCy = y0 + 0.22 * h;
      const botCy = y0 + 0.78 * h;

      const topVerts: TemplatePoint[] = [];
      const botVerts: TemplatePoint[] = [];
      for (let i = 0; i < n; i++) {
        // Angle 0 at right, going counter-clockwise so back is sin < 0, front is sin > 0
        const theta = (i * 2 * Math.PI) / n;
        topVerts.push({
          x: cx + rx * Math.cos(theta) + skewX * w * 0.08,
          y: topCy + ry * Math.sin(theta),
        });
        botVerts.push({
          x: cx + rx * Math.cos(theta),
          y: botCy + ry * Math.sin(theta),
        });
      }

      // Top polygon is completely visible
      for (let i = 0; i < n; i++) {
        segments.push(seg(topVerts[i], topVerts[(i + 1) % n], 'solid'));
      }

      // Bottom polygon & vertical edges: vertices in the back (y < botCy - 2) are hidden
      for (let i = 0; i < n; i++) {
        const p1 = botVerts[i];
        const p2 = botVerts[(i + 1) % n];
        const midY = (p1.y + p2.y) / 2;
        const isBackEdge = midY < botCy - 1;
        segments.push(seg(p1, p2, isBackEdge ? 'dashed' : 'solid'));

        const isBackVert = p1.y < botCy - ry * 0.25;
        segments.push(seg(p1, topVerts[i], isBackVert ? 'dashed' : 'solid'));
      }

      const names = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (let i = 0; i < n; i++) {
        labels.push(
          {
            text: `${names[i]}'`,
            x: topVerts[i].x,
            y: topVerts[i].y,
            offsetX: topVerts[i].x < cx ? -16 : 8,
            offsetY: -8,
            showDot: true,
          },
          {
            text: names[i],
            x: botVerts[i].x,
            y: botVerts[i].y,
            offsetX: botVerts[i].x < cx ? -16 : 8,
            offsetY: 14,
            showDot: true,
          }
        );
      }
      break;
    }

    // =========================================================================
    // 8. HÌNH NÓN TRÒN XOAY (ĐỈNH S, TÂM ĐÁY O)
    // =========================================================================
    case 'cone_revolution': {
      const O = pt(0.50, 0.78);
      const S = pt(0.50 + skewX * 0.15, 0.08);
      const rx = 0.40 * w;
      const ry = Math.max(14, (0.14 + tiltY * 0.08) * h);

      const A = { x: O.x - rx, y: O.y };
      const B = { x: O.x + rx, y: O.y };

      // Front half of base ellipse: angle 0 .. PI (solid)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, ry, 0, Math.PI, 40), 'solid'));
      // Back half of base ellipse: angle PI .. 2*PI (dashed)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, ry, Math.PI, Math.PI * 2, 40), 'dashed'));

      // Two outer generators SA, SB (solid)
      segments.push(seg(S, A, 'solid'));
      segments.push(seg(S, B, 'solid'));

      // Altitude SO (dash-dot) and radius OA, OB (dashed)
      segments.push(seg(S, O, 'dash_dot'));
      segments.push(seg(O, B, 'dashed'));
      segments.push(seg(O, A, 'dashed'));

      if (variant === 'section') {
        const M = {
          x: O.x + rx * Math.cos(Math.PI * 0.28),
          y: O.y + ry * Math.sin(Math.PI * 0.28),
        };
        segments.push(seg(S, M, 'solid'));
        segments.push(seg(A, M, 'dashed'));
        labels.push({ text: 'M', x: M.x, y: M.y, offsetX: 6, offsetY: 14, showDot: true });
      }

      rightAngles.push({ vertex: O, along1: S, along2: B, size: 10 });

      labels.push(
        { text: 'S', x: S.x, y: S.y, offsetX: -4, offsetY: -12, showDot: true },
        { text: 'O', x: O.x, y: O.y, offsetX: -14, offsetY: 16, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: 8, offsetY: 4, showDot: true },
        { text: 'h', x: (S.x + O.x) / 2, y: (S.y + O.y) / 2, offsetX: -16, offsetY: 0 },
        { text: 'R', x: (O.x + B.x) / 2, y: O.y, offsetX: 0, offsetY: -8 }
      );
      break;
    }

    // =========================================================================
    // 9. HÌNH NÓN CỤT TRÒN XOAY (TRỤC OO')
    // =========================================================================
    case 'frustum_cone': {
      const O1 = pt(0.50 + skewX * 0.1, 0.18);
      const O = pt(0.50, 0.80);
      const rTopX = 0.24 * w;
      const rTopY = Math.max(10, (0.08 + tiltY * 0.05) * h);
      const rBotX = 0.42 * w;
      const rBotY = Math.max(15, (0.14 + tiltY * 0.08) * h);

      const A1 = { x: O1.x - rTopX, y: O1.y };
      const B1 = { x: O1.x + rTopX, y: O1.y };
      const A = { x: O.x - rBotX, y: O.y };
      const B = { x: O.x + rBotX, y: O.y };

      // Top ellipse (full solid)
      segments.push(polySeg(buildEllipseArc(O1.x, O1.y, rTopX, rTopY, 0, Math.PI * 2, 48), 'solid'));
      // Bottom ellipse (front solid, back dashed)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rBotX, rBotY, 0, Math.PI, 40), 'solid'));
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rBotX, rBotY, Math.PI, Math.PI * 2, 40), 'dashed'));

      // Side generators
      segments.push(seg(A1, A, 'solid'));
      segments.push(seg(B1, B, 'solid'));

      // Axis OO' & radii O'B', OB
      segments.push(seg(O1, O, 'dash_dot'));
      segments.push(seg(O1, B1, 'dashed'));
      segments.push(seg(O, B, 'dashed'));

      rightAngles.push({ vertex: O, along1: O1, along2: B, size: 10 });

      labels.push(
        { text: "O'", x: O1.x, y: O1.y, offsetX: -16, offsetY: -6, showDot: true },
        { text: 'O', x: O.x, y: O.y, offsetX: -16, offsetY: 14, showDot: true },
        { text: "A'", x: A1.x, y: A1.y, offsetX: -20, offsetY: 2, showDot: true },
        { text: "B'", x: B1.x, y: B1.y, offsetX: 8, offsetY: 2, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: 8, offsetY: 4, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 10. HÌNH TRỤ TRÒN XOAY (TRỤC OO')
    // =========================================================================
    case 'cylinder_revolution': {
      const O1 = pt(0.50 + skewX * 0.08, 0.18);
      const O = pt(0.50, 0.80);
      const rx = 0.36 * w;
      const ry = Math.max(14, (0.13 + tiltY * 0.07) * h);

      const A1 = { x: O1.x - rx, y: O1.y };
      const B1 = { x: O1.x + rx, y: O1.y };
      const A = { x: O.x - rx, y: O.y };
      const B = { x: O.x + rx, y: O.y };

      // Top base ellipse (full solid)
      segments.push(polySeg(buildEllipseArc(O1.x, O1.y, rx, ry, 0, Math.PI * 2, 52), 'solid'));
      // Bottom base ellipse (front half solid, back half dashed)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, ry, 0, Math.PI, 40), 'solid'));
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, ry, Math.PI, Math.PI * 2, 40), 'dashed'));

      // Generators AA', BB'
      segments.push(seg(A1, A, 'solid'));
      segments.push(seg(B1, B, 'solid'));

      // Axis OO' (dash-dot) & radii
      segments.push(seg(O1, O, 'dash_dot'));
      segments.push(seg(O1, B1, 'dashed'));
      segments.push(seg(O, B, 'dashed'));

      if (variant === 'axial_rect') {
        segments.push(seg(A1, B1, 'dashed'));
        segments.push(seg(A, B, 'dashed'));
      }

      rightAngles.push({ vertex: O, along1: O1, along2: B, size: 10 });

      labels.push(
        { text: "O'", x: O1.x, y: O1.y, offsetX: -16, offsetY: -6, showDot: true },
        { text: 'O', x: O.x, y: O.y, offsetX: -16, offsetY: 14, showDot: true },
        { text: "A'", x: A1.x, y: A1.y, offsetX: -20, offsetY: 2, showDot: true },
        { text: "B'", x: B1.x, y: B1.y, offsetX: 8, offsetY: 2, showDot: true },
        { text: 'A', x: A.x, y: A.y, offsetX: -18, offsetY: 4, showDot: true },
        { text: 'B', x: B.x, y: B.y, offsetX: 8, offsetY: 4, showDot: true },
        { text: 'R', x: (O.x + B.x) / 2, y: O.y, offsetX: 0, offsetY: -8 }
      );
      break;
    }

    // =========================================================================
    // 11. HÌNH CẦU / MẶT CẦU S(O; R)
    // =========================================================================
    case 'sphere_globe': {
      const O = { x: cx, y: cy };
      const rx = 0.42 * w;
      const ry = 0.42 * h;
      const eqRy = Math.max(12, (0.14 + tiltY * 0.08) * h);

      // Outer great circle (solid)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, ry, 0, Math.PI * 2, 64), 'solid'));
      // Equator ellipse: front half solid, back half dashed
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, eqRy, 0, Math.PI, 40), 'solid'));
      segments.push(polySeg(buildEllipseArc(O.x, O.y, rx, eqRy, Math.PI, Math.PI * 2, 40), 'dashed'));

      // Radius R from O to right pole M
      const M = { x: O.x + rx, y: O.y };
      const N = { x: O.x, y: O.y - ry };
      segments.push(seg(O, M, 'dashed'));
      segments.push(seg(O, N, 'dash_dot'));

      if (variant === 'lat_circle') {
        const latY = O.y - 0.52 * ry;
        const latRx = rx * Math.sqrt(Math.max(0.1, 1 - 0.52 * 0.52));
        const latRy = eqRy * 0.65;
        segments.push(polySeg(buildEllipseArc(O.x, latY, latRx, latRy, 0, Math.PI, 36), 'solid'));
        segments.push(
          polySeg(buildEllipseArc(O.x, latY, latRx, latRy, Math.PI, Math.PI * 2, 36), 'dashed')
        );
        segments.push(seg({ x: O.x, y: latY }, { x: O.x + latRx, y: latY }, 'dashed'));
        labels.push({ text: 'I', x: O.x, y: latY, offsetX: -14, offsetY: 4, showDot: true });
      }

      labels.push(
        { text: 'O', x: O.x, y: O.y, offsetX: -15, offsetY: 15, showDot: true },
        { text: 'R', x: (O.x + M.x) / 2, y: O.y, offsetX: 0, offsetY: -8 },
        { text: 'A', x: M.x, y: M.y, offsetX: 8, offsetY: 4, showDot: true }
      );
      break;
    }

    // =========================================================================
    // 12. HỆ TRỤC TỌA ĐỘ KHÔNG GIAN Oxyz
    // =========================================================================
    case 'axes_oxyz_3d': {
      const O = pt(0.38, 0.58);
      const Z = pt(0.38, 0.06); // Oz vertical up
      const Y = pt(0.94, 0.58); // Oy horizontal right
      const X = pt(0.06, 0.92); // Ox forward-left

      // 3 Axes with arrows
      segments.push(seg(O, X, 'solid', true, 1.15));
      segments.push(seg(O, Y, 'solid', true, 1.15));
      segments.push(seg(O, Z, 'solid', true, 1.15));

      // Right angle markers at O
      rightAngles.push({ vertex: O, along1: Z, along2: Y, size: 11 });
      rightAngles.push({ vertex: O, along1: Z, along2: X, size: 10 });

      // Unit ticks along Ox, Oy, Oz
      for (let k = 1; k <= 3; k++) {
        const t = k * 0.24;
        // Oy tick
        const py = { x: O.x + (Y.x - O.x) * t, y: O.y };
        segments.push(seg({ x: py.x, y: py.y - 4 }, { x: py.x, y: py.y + 4 }, 'solid', false, 0.85));
        // Oz tick
        const pz = { x: O.x, y: O.y + (Z.y - O.y) * t };
        segments.push(seg({ x: pz.x - 4, y: pz.y }, { x: pz.x + 4, y: pz.y }, 'solid', false, 0.85));
        // Ox tick
        const px = { x: O.x + (X.x - O.x) * t, y: O.y + (X.y - O.y) * t };
        segments.push(seg({ x: px.x - 4, y: px.y }, { x: px.x + 4, y: px.y }, 'solid', false, 0.85));
      }

      if (variant === 'with_point') {
        const mx = { x: O.x + (X.x - O.x) * 0.55, y: O.y + (X.y - O.y) * 0.55 };
        const my = { x: O.x + (Y.x - O.x) * 0.52, y: O.y };
        const mz = { x: O.x, y: O.y + (Z.y - O.y) * 0.55 };
        const mxy = { x: mx.x + (my.x - O.x), y: mx.y };
        const M = { x: mxy.x, y: mxy.y + (mz.y - O.y) };

        segments.push(seg(mx, mxy, 'dashed', false, 0.9));
        segments.push(seg(my, mxy, 'dashed', false, 0.9));
        segments.push(seg(O, mxy, 'dashed', false, 0.9));
        segments.push(seg(mxy, M, 'dashed', false, 0.9));
        segments.push(seg(mz, M, 'dashed', false, 0.9));
        segments.push(seg(O, M, 'solid', true, 1));

        labels.push(
          { text: 'M(x;y;z)', x: M.x, y: M.y, offsetX: 8, offsetY: -8, showDot: true },
          { text: "M'", x: mxy.x, y: mxy.y, offsetX: 6, offsetY: 14, showDot: true }
        );
      }

      labels.push(
        { text: 'O', x: O.x, y: O.y, offsetX: -16, offsetY: -4, showDot: true },
        { text: 'x', x: X.x, y: X.y, offsetX: -14, offsetY: 8 },
        { text: 'y', x: Y.x, y: Y.y, offsetX: 8, offsetY: 4 },
        { text: 'z', x: Z.x, y: Z.y, offsetX: -14, offsetY: 4 }
      );
      break;
    }

    // =========================================================================
    // 13. HỆ TRỤC TỌA ĐỘ PHẲNG Oxy (CÓ LƯỚI TỌA ĐỘ MỜ & MŨI TÊN CHUẨN SGK)
    // =========================================================================
    case 'axes_oxy_2d': {
      const O = { x: cx, y: cy };
      const gridCols = 4;
      const gridRows = 3;
      const stepX = (w * 0.88) / (gridCols * 2);
      const stepY = (h * 0.88) / (gridRows * 2);

      if (variant === 'with_grid') {
        for (let gx = -gridCols; gx <= gridCols; gx++) {
          if (gx === 0) continue;
          const xPos = O.x + gx * stepX;
          segments.push(
            seg({ x: xPos, y: y0 + 0.06 * h }, { x: xPos, y: y0 + 0.94 * h }, 'dotted', false, 0.7, 0.45)
          );
        }
        for (let gy = -gridRows; gy <= gridRows; gy++) {
          if (gy === 0) continue;
          const yPos = O.y + gy * stepY;
          segments.push(
            seg({ x: x0 + 0.06 * w, y: yPos }, { x: x0 + 0.94 * w, y: yPos }, 'dotted', false, 0.7, 0.45)
          );
        }
      }

      // Main Axes Ox, Oy
      segments.push(seg({ x: x0 + 0.04 * w, y: O.y }, { x: x0 + 0.96 * w, y: O.y }, 'solid', true, 1.15));
      segments.push(seg({ x: O.x, y: y0 + 0.96 * h }, { x: O.x, y: y0 + 0.04 * h }, 'solid', true, 1.15));

      // Ticks
      for (let gx = -gridCols; gx <= gridCols; gx++) {
        if (gx === 0) continue;
        const xPos = O.x + gx * stepX;
        segments.push(seg({ x: xPos, y: O.y - 4 }, { x: xPos, y: O.y + 4 }, 'solid', false, 0.9));
      }
      for (let gy = -gridRows; gy <= gridRows; gy++) {
        if (gy === 0) continue;
        const yPos = O.y + gy * stepY;
        segments.push(seg({ x: O.x - 4, y: yPos }, { x: O.x + 4, y: yPos }, 'solid', false, 0.9));
      }

      labels.push(
        { text: 'O', x: O.x, y: O.y, offsetX: -15, offsetY: 16, showDot: true },
        { text: 'x', x: x0 + 0.96 * w, y: O.y, offsetX: 4, offsetY: 16 },
        { text: 'y', x: O.x, y: y0 + 0.04 * h, offsetX: 10, offsetY: 6 },
        { text: '1', x: O.x + stepX, y: O.y, offsetX: -3, offsetY: 16 },
        { text: '1', x: O.x, y: O.y - stepY, offsetX: -14, offsetY: 4 }
      );
      break;
    }

    // =========================================================================
    // 14. ĐƯỜNG ELIP x²/a² + y²/b² = 1 (TIÊU ĐIỂM F1, F2 & HCN CƠ SỞ NÉT ĐỨT)
    // =========================================================================
    case 'conic_ellipse': {
      const O = { x: cx, y: cy };
      const a = 0.38 * w;
      const b = 0.30 * h;
      const c = Math.sqrt(Math.max(16, Math.abs(a * a - b * b)));

      // Ellipse curve (solid)
      segments.push(polySeg(buildEllipseArc(O.x, O.y, a, b, 0, Math.PI * 2, 72), 'solid', false, 1.15));

      if (variant !== 'ellipse_only') {
        // Coordinate axes Ox, Oy
        segments.push(seg({ x: x0 + 0.02 * w, y: O.y }, { x: x0 + 0.98 * w, y: O.y }, 'solid', true, 0.95));
        segments.push(seg({ x: O.x, y: y0 + 0.98 * h }, { x: O.x, y: y0 + 0.02 * h }, 'solid', true, 0.95));
      }

      if (variant === 'full_box' && config.showAuxGuides) {
        // Fundamental rectangle x = ±a, y = ±b (dashed)
        const tl = { x: O.x - a, y: O.y - b };
        const tr = { x: O.x + a, y: O.y - b };
        const br = { x: O.x + a, y: O.y + b };
        const bl = { x: O.x - a, y: O.y + b };
        segments.push(seg(tl, tr, 'dashed', false, 0.85));
        segments.push(seg(tr, br, 'dashed', false, 0.85));
        segments.push(seg(br, bl, 'dashed', false, 0.85));
        segments.push(seg(bl, tl, 'dashed', false, 0.85));
      }

      const F1 = { x: O.x - Math.min(c, a * 0.85), y: O.y };
      const F2 = { x: O.x + Math.min(c, a * 0.85), y: O.y };

      labels.push(
        { text: 'O', x: O.x, y: O.y, offsetX: -14, offsetY: 15, showDot: true },
        { text: 'F₁', x: F1.x, y: F1.y, offsetX: -6, offsetY: 16, showDot: true },
        { text: 'F₂', x: F2.x, y: F2.y, offsetX: -6, offsetY: 16, showDot: true },
        { text: 'A₁', x: O.x - a, y: O.y, offsetX: -20, offsetY: 15, showDot: true },
        { text: 'A₂', x: O.x + a, y: O.y, offsetX: 6, offsetY: 15, showDot: true },
        { text: 'B₁', x: O.x, y: O.y + b, offsetX: 8, offsetY: 14, showDot: true },
        { text: 'B₂', x: O.x, y: O.y - b, offsetX: 8, offsetY: -6, showDot: true },
        { text: 'x', x: x0 + 0.96 * w, y: O.y, offsetX: 4, offsetY: -8 },
        { text: 'y', x: O.x, y: y0 + 0.04 * h, offsetX: 10, offsetY: 4 }
      );
      break;
    }

    // =========================================================================
    // 15. ĐƯỜNG HYPEBOL x²/a² - y²/b² = 1 (2 NHÁNH, F1, F2 & 2 TIỆM CẬN NÉT ĐỨT)
    // =========================================================================
    case 'conic_hyperbola': {
      const O = { x: cx, y: cy };
      const a = 0.17 * w;
      const b = 0.22 * h;
      const c = Math.hypot(a, b);

      // Axes Ox, Oy
      segments.push(seg({ x: x0 + 0.02 * w, y: O.y }, { x: x0 + 0.98 * w, y: O.y }, 'solid', true, 0.95));
      segments.push(seg({ x: O.x, y: y0 + 0.98 * h }, { x: O.x, y: y0 + 0.02 * h }, 'solid', true, 0.95));

      // 2 Asymptotes y = ±(b/a)x (dashed)
      const dxMax = 0.45 * w;
      const dyMax = (b / a) * dxMax;
      segments.push(
        seg({ x: O.x - dxMax, y: O.y - dyMax }, { x: O.x + dxMax, y: O.y + dyMax }, 'dashed', false, 0.9)
      );
      segments.push(
        seg({ x: O.x - dxMax, y: O.y + dyMax }, { x: O.x + dxMax, y: O.y - dyMax }, 'dashed', false, 0.9)
      );

      // Fundamental rectangle (dotted)
      if (variant === 'asymptotes_box' && config.showAuxGuides) {
        const tl = { x: O.x - a, y: O.y - b };
        const tr = { x: O.x + a, y: O.y - b };
        const br = { x: O.x + a, y: O.y + b };
        const bl = { x: O.x - a, y: O.y + b };
        segments.push(seg(tl, tr, 'dotted', false, 0.85));
        segments.push(seg(tr, br, 'dotted', false, 0.85));
        segments.push(seg(br, bl, 'dotted', false, 0.85));
        segments.push(seg(bl, tl, 'dotted', false, 0.85));
      }

      // Right & Left branches parameterized by x = ±a cosh(t), y = b sinh(t)
      const rightBranch: TemplatePoint[] = [];
      const leftBranch: TemplatePoint[] = [];
      const tMax = 1.48;
      const steps = 44;
      for (let i = 0; i <= steps; i++) {
        const t = -tMax + (2 * tMax * i) / steps;
        const ch = Math.cosh(t);
        const sh = Math.sinh(t);
        rightBranch.push({ x: O.x + a * ch, y: O.y + b * sh });
        leftBranch.push({ x: O.x - a * ch, y: O.y + b * sh });
      }
      segments.push(polySeg(rightBranch, 'solid', false, 1.2));
      segments.push(polySeg(leftBranch, 'solid', false, 1.2));

      const F1 = { x: O.x - Math.min(c, 0.42 * w), y: O.y };
      const F2 = { x: O.x + Math.min(c, 0.42 * w), y: O.y };

      labels.push(
        { text: 'O', x: O.x, y: O.y, offsetX: -14, offsetY: 15, showDot: true },
        { text: 'A₁', x: O.x - a, y: O.y, offsetX: -18, offsetY: 15, showDot: true },
        { text: 'A₂', x: O.x + a, y: O.y, offsetX: 4, offsetY: 15, showDot: true },
        { text: 'F₁', x: F1.x, y: F1.y, offsetX: -8, offsetY: -8, showDot: true },
        { text: 'F₂', x: F2.x, y: F2.y, offsetX: 4, offsetY: -8, showDot: true },
        { text: 'x', x: x0 + 0.96 * w, y: O.y, offsetX: 4, offsetY: -8 },
        { text: 'y', x: O.x, y: y0 + 0.04 * h, offsetX: 10, offsetY: 4 }
      );
      break;
    }

    // =========================================================================
    // 16. ĐƯỜNG PARABOL y² = 2px (TIÊU ĐIỂM F & ĐƯỜNG CHUẨN Δ) VÀ y = ax²+bx+c
    // =========================================================================
    case 'conic_parabola': {
      if (variant === 'quadratic_up') {
        // Standard upward quadratic parabola y = ax^2 + bx + c
        const O = pt(0.45, 0.65);
        const V = pt(0.55 + skewX * 0.15, 0.82); // Vertex I
        segments.push(seg({ x: x0 + 0.04 * w, y: O.y }, { x: x0 + 0.96 * w, y: O.y }, 'solid', true, 0.95));
        segments.push(seg({ x: O.x, y: y0 + 0.96 * h }, { x: O.x, y: y0 + 0.04 * h }, 'solid', true, 0.95));

        // Axis of symmetry x = x_I (dash_dot)
        segments.push(seg({ x: V.x, y: y0 + 0.06 * h }, { x: V.x, y: y0 + 0.94 * h }, 'dash_dot', false, 0.85));

        // Projection lines from Vertex I to Ox, Oy (dashed)
        segments.push(seg(V, { x: V.x, y: O.y }, 'dashed', false, 0.85));
        segments.push(seg(V, { x: O.x, y: V.y }, 'dashed', false, 0.85));

        // Parabola curve opening upward from V
        const curvePts: TemplatePoint[] = [];
        const spanX = 0.34 * w;
        const heightSpan = 0.72 * h;
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const u = -1 + (2 * i) / steps; // -1 .. 1
          curvePts.push({
            x: V.x + u * spanX,
            y: V.y - u * u * heightSpan,
          });
        }
        segments.push(polySeg(curvePts, 'solid', false, 1.2));

        labels.push(
          { text: 'O', x: O.x, y: O.y, offsetX: -15, offsetY: 15, showDot: true },
          { text: 'I', x: V.x, y: V.y, offsetX: 8, offsetY: 14, showDot: true },
          { text: 'x', x: x0 + 0.95 * w, y: O.y, offsetX: 4, offsetY: -8 },
          { text: 'y', x: O.x, y: y0 + 0.05 * h, offsetX: 10, offsetY: 4 }
        );
      } else {
        // Canonical parabola y^2 = 2px with Focus F(p/2; 0) and Directrix Δ: x = -p/2
        const O = pt(0.36, 0.50);
        const halfP = 0.14 * w; // p/2
        const directrixX = O.x - halfP;
        const focusX = O.x + halfP;

        // Axes Ox, Oy
        segments.push(seg({ x: x0 + 0.03 * w, y: O.y }, { x: x0 + 0.96 * w, y: O.y }, 'solid', true, 0.95));
        segments.push(seg({ x: O.x, y: y0 + 0.96 * h }, { x: O.x, y: y0 + 0.04 * h }, 'solid', true, 0.95));

        // Directrix line Δ: x = -p/2 (dashed)
        segments.push(
          seg({ x: directrixX, y: y0 + 0.08 * h }, { x: directrixX, y: y0 + 0.92 * h }, 'dashed', false, 1.0)
        );

        // Canonical curve y^2 = 2px opening to the right from O
        const curvePts: TemplatePoint[] = [];
        const maxDy = 0.42 * h;
        const maxDx = 0.54 * w;
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const u = -1 + (2 * i) / steps; // -1 .. 1
          curvePts.push({
            x: O.x + u * u * maxDx,
            y: O.y + u * maxDy,
          });
        }
        segments.push(polySeg(curvePts, 'solid', false, 1.2));

        // Sample point M on parabola with MF = d(M, Δ) dashed segments
        if (config.showAuxGuides) {
          const uM = -0.68;
          const M = { x: O.x + uM * uM * maxDx, y: O.y + uM * maxDy };
          const H = { x: directrixX, y: M.y };
          segments.push(seg(M, H, 'dotted', false, 0.85));
          segments.push(seg(M, { x: focusX, y: O.y }, 'dotted', false, 0.85));
          rightAngles.push({ vertex: H, along1: M, along2: { x: directrixX, y: O.y }, size: 9 });
          labels.push(
            { text: 'M', x: M.x, y: M.y, offsetX: 6, offsetY: -8, showDot: true },
            { text: 'H', x: H.x, y: H.y, offsetX: -16, offsetY: 4, showDot: true }
          );
        }

        labels.push(
          { text: 'O', x: O.x, y: O.y, offsetX: 6, offsetY: 16, showDot: true },
          { text: 'F(p/2; 0)', x: focusX, y: O.y, offsetX: -10, offsetY: 18, showDot: true },
          { text: 'Δ', x: directrixX, y: y0 + 0.12 * h, offsetX: -16, offsetY: 0 },
          { text: 'x', x: x0 + 0.95 * w, y: O.y, offsetX: 4, offsetY: -8 },
          { text: 'y', x: O.x, y: y0 + 0.05 * h, offsetX: 10, offsetY: 4 }
        );
      }
      break;
    }
  }

  // Optional whole-figure rotation around center (cx, cy)
  const rotDeg = config.rotationDeg || 0;
  if (Math.abs(rotDeg) > 0.1) {
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotPt = (p: TemplatePoint): TemplatePoint => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      };
    };

    for (const s of segments) {
      s.points = s.points.map(rotPt);
    }
    for (const ra of rightAngles) {
      ra.vertex = rotPt(ra.vertex);
      ra.along1 = rotPt(ra.along1);
      ra.along2 = rotPt(ra.along2);
    }
    for (const lb of labels) {
      const rp = rotPt({ x: lb.x, y: lb.y });
      lb.x = rp.x;
      lb.y = rp.y;
    }
  }

  return { segments, rightAngles, labels };
}
