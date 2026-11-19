import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Eye,
  EyeOff,
  FileText,
  FolderUp,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  PenTool,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  WifiOff,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { FunctionInvestigationPanel } from '../components/FunctionInvestigationPanel';
import { MathText } from '../components/MathText';
import { SmartboardCanvasStudio } from '../components/SmartboardCanvasStudio';
import { SmartboardViewport } from '../components/SmartboardViewport';
import { ThreeSpatialAndGameLab } from '../components/ThreeSpatialAndGameLab';
import { ToolErrorBoundary } from '../components/ToolErrorBoundary';
import { KNTT_MATH_CURRICULUM } from '../data/curriculumKNTT';
import { MOCK_EXAM_0107 } from '../data/mockExam0107';
import { BankQuestion, ModuleId } from '../types/eduplan';
import { examPaperToBankQuestions } from '../utils/questionBankDb';
import {
  formatExampleTitle,
  formatMcqOptionDisplay,
  normalizeSolutionSteps,
  safeParseJsonWithMathEscape,
  sanitizeKatexMath,
  stripAnswerPrefix,
  stripConclusionPrefix,
  stripDuplicateHeadingFromStem,
  stripExampleTitlePrefix,
  stripLeadingStepHeaders,
  stripMcqOptionPrefix,
} from '../utils/solutionFormat';
import { tactile3dClass } from '../utils/uiStyles';

// ============================================================================
// PEDAGOGICAL 3-PART LESSON TYPES (I. LÝ THUYẾT · II. VÍ DỤ · III. BÀI TẬP)
// ============================================================================

export interface LessonTheoryCard {
  id: string;
  title: string;
  tag: string;
  points: string[];
}

export interface LessonExampleStep {
  stepTitle: string;
  content: string;
}

export interface LessonExampleItem {
  id: string;
  title: string;
  levelBadge: string;
  problem: string;
  steps: LessonExampleStep[];
  conclusion: string;
}

export interface LessonExerciseItem {
  id: string;
  code: string;
  levelBadge: string;
  stem: string;
  options?: [string, string, string, string];
  answer: string;
  solutionSteps: string[];
}

export interface SharedLessonRecord {
  id: string;
  title: string;
  grade: '10' | '11' | '12';
  chapterId: string;
  chapterTitle: string;
  lessonTitle: string;
  sourceType: 'cloud_app' | 'local_file' | 'google_drive' | 'ai_direct';
  authorName: string;
  updatedAt: string;
  driveEmbedUrl?: string;
  localPdfUrl?: string;
  theoryItems: LessonTheoryCard[];
  exampleItems: LessonExampleItem[];
  exerciseItems: LessonExerciseItem[];
}

type LessonSourceMode = 'cloud_app' | 'local_file' | 'google_drive' | 'ai_direct';
type LessonSectionView = 'all' | 'theory' | 'examples' | 'exercises';

interface DirectAiLessonPayload {
  tieu_de: string;
  ly_thuyet: Array<{
    tieu_de: string;
    nhan: string;
    noi_dung: string[];
  }>;
  vi_du: Array<{
    tieu_de: string;
    muc_do: string;
    de_bai: string;
    cac_buoc_giai: string[];
    dap_so?: string;
    ket_luan?: string;
  }>;
  bai_tap: Array<{
    loai: string;
    muc_do: string;
    de_bai: string;
    phuong_an: string[];
    dap_so?: string;
    dap_an?: string;
    loi_giai: string[];
  }>;
}

// ============================================================================
// BUILT-IN CLOUD SYNC LESSONS (SGK KẾT NỐI TRI THỨC KHỐI 10, 11, 12)
// ============================================================================

const SEEDED_CLOUD_LESSONS: SharedLessonRecord[] = [
  {
    id: 'lesson-12-c1-b1',
    title: 'Bài 1. Tính đơn điệu và cực trị của hàm số',
    grade: '12',
    chapterId: '12-c1',
    chapterTitle: 'Chương I. Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    lessonTitle: 'Bài 1. Tính đơn điệu và cực trị của hàm số',
    sourceType: 'cloud_app',
    authorName: 'Thầy Lê Trọng Toàn (App Chính TeachLearn Edu)',
    updatedAt: '2026-11-18T08:00:00.000Z',
    theoryItems: [
      {
        id: 'th-12-1',
        title: '1. Định lý về tính đơn điệu của hàm số',
        tag: 'Định lý SGK KNTT',
        points: [
          'Cho hàm số $y = f(x)$ có đạo hàm trên khoảng $K$. Nếu $f\'(x) > 0$ với mọi $x \\in K$ thì hàm số $f(x)$ đồng biến trên khoảng $K$.',
          'Nếu $f\'(x) < 0$ với mọi $x \\in K$ thì hàm số $f(x)$ nghịch biến trên khoảng $K$.',
          'Chú ý: Nếu $f\'(x) \\ge 0$ (hoặc $f\'(x) \\le 0$) với mọi $x \\in K$ và $f\'(x) = 0$ chỉ tại một số hữu hạn điểm của $K$ thì hàm số vẫn đồng biến (hoặc nghịch biến) trên $K$.',
        ],
      },
      {
        id: 'th-12-2',
        title: '2. Điều kiện đủ để hàm số có cực trị',
        tag: 'Quy tắc xét dấu đạo hàm',
        points: [
          'Giả sử hàm số $y = f(x)$ liên tục trên khoảng $(a; b)$ chứa điểm $x_0$ và có đạo hàm trên các khoảng $(a; x_0)$ và $(x_0; b)$.',
          'Nếu $f\'(x)$ đổi dấu từ dương ($+$) sang âm ($-$) khi $x$ đi qua điểm $x_0$ thì $x_0$ là một điểm cực đại của hàm số ($y_{\\text{CĐ}} = f(x_0)$).',
          'Nếu $f\'(x)$ đổi dấu từ âm ($-$) sang dương ($+$) khi $x$ đi qua điểm $x_0$ thì $x_0$ là một điểm cực tiểu của hàm số ($y_{\\text{CT}} = f(x_0)$).',
        ],
      },
    ],
    exampleItems: [
      {
        id: 'exm-12-1',
        title: 'Ví dụ 1: Tìm các khoảng đơn điệu và điểm cực trị của hàm số bậc ba',
        levelBadge: 'Thông hiểu · Trọng tâm',
        problem:
          'Tìm các khoảng đồng biến, nghịch biến và các điểm cực trị của hàm số $y = f(x) = x^3 - 3x^2 + 2$.',
        steps: [
          {
            stepTitle: 'Bước 1: Tìm tập xác định và tính đạo hàm',
            content:
              'Tập xác định của hàm số là $D = \\mathbb{R}$. Đạo hàm: $f\'(x) = 3x^2 - 6x = 3x(x - 2)$.',
          },
          {
            stepTitle: 'Bước 2: Tìm các điểm tới hạn và xét dấu đạo hàm',
            content:
              'Cho $f\'(x) = 0 \\Leftrightarrow x = 0$ hoặc $x = 2$. Trên các khoảng $(-\\infty; 0)$ và $(2; +\\infty)$ ta có $f\'(x) > 0$; trên khoảng $(0; 2)$ ta có $f\'(x) < 0$.',
          },
          {
            stepTitle: 'Bước 3: Kết luận tính đơn điệu và cực trị',
            content:
              'Hàm số đồng biến trên $(-\\infty; 0)$ và $(2; +\\infty)$, nghịch biến trên $(0; 2)$. Hàm số đạt cực đại tại $x = 0$ với $y_{\\text{CĐ}} = f(0) = 2$ và đạt cực tiểu tại $x = 2$ với $y_{\\text{CT}} = f(2) = -2$.',
          },
        ],
        conclusion:
          'Đồng biến: $(-\\infty; 0)$ và $(2; +\\infty)$; Nghịch biến: $(0; 2)$; $x_{\\text{CĐ}} = 0$, $x_{\\text{CT}} = 2$.',
      },
      {
        id: 'exm-12-2',
        title: 'Ví dụ 2: Ứng dụng cực trị tối ưu lợi nhuận sản xuất thực tiễn',
        levelBadge: 'Vận dụng thực tiễn',
        problem:
          'Một cơ sở kinh doanh đặc sản hạt điều rang muối tại Đắk Lắk nhận thấy khi định giá bán ở mức $x$ trăm nghìn đồng/hộp (với $1 < x < 15$) thì hàm lợi nhuận mỗi tuần (triệu đồng) là $P(x) = -x^3 + 12x^2 + 60x - 80$. Tìm mức giá bán $x$ để lợi nhuận hàng tuần đạt cực đại.',
        steps: [
          {
            stepTitle: 'Bước 1: Tính đạo hàm của hàm lợi nhuận trên (1; 15)',
            content:
              'Ta có $P\'(x) = -3x^2 + 24x + 60 = -3(x^2 - 8x - 20) = -3(x - 10)(x + 2)$.',
          },
          {
            stepTitle: 'Bước 2: Tìm điểm cực đại trên miền xác định',
            content:
              'Giải $P\'(x) = 0$ với $x \\in (1; 15)$ ta được nghiệm duy nhất $x = 10$. Qua $x = 10$, đạo hàm $P\'(x)$ đổi dấu từ dương sang âm.',
          },
        ],
        conclusion:
          'Cơ sở cần định giá bán $x = 10$ trăm nghìn đồng/hộp để đạt lợi nhuận cực đại $P(10) = 720$ triệu đồng/tuần.',
      },
    ],
    exerciseItems: [
      {
        id: 'exc-12-1',
        code: 'Bài tập 1',
        levelBadge: 'Nhận biết',
        stem:
          'Cho hàm số $y = f(x)$ có đạo hàm $f\'(x) = (x - 1)(x - 3)$ với mọi $x \\in \\mathbb{R}$. Điểm cực tiểu của hàm số đã cho là:',
        options: ['A. $x = 1$.', 'B. $y = 1$.', 'C. $x = 3$.', 'D. $x = -3$.'],
        answer: 'C',
        solutionSteps: [
          'Bước 1: Cho $f\'(x) = 0 \\Leftrightarrow (x - 1)(x - 3) = 0 \\Leftrightarrow x = 1$ hoặc $x = 3$.',
          'Bước 2: Khi đi qua $x = 3$, đạo hàm $f\'(x)$ đổi dấu từ âm ($-$) sang dương ($+$) nên điểm cực tiểu của hàm số là $x = 3$. Chọn C.',
        ],
      },
      {
        id: 'exc-12-2',
        code: 'Bài tập 2',
        levelBadge: 'Thông hiểu',
        stem:
          'Cho hàm số bậc ba $y = f(x) = x^3 - 3x^2 + 2$ có đồ thị $(C)$. Viết phương trình đường thẳng đi qua hai điểm cực trị của đồ thị $(C)$.',
        options: [
          'A. $y = -2x + 2$.',
          'B. $y = -2x + 1$.',
          'C. $y = 2x - 2$.',
          'D. $y = -x + 2$.',
        ],
        answer: 'A',
        solutionSteps: [
          'Bước 1: Giải $f\'(x) = 3x^2 - 6x = 0 \\Leftrightarrow x = 0 \\Rightarrow y = 2$ và $x = 2 \\Rightarrow y = -2$. Hai điểm cực trị là $A(0; 2)$ và $B(2; -2)$.',
          'Bước 2: Đường thẳng $AB$ có hệ số góc $k = \\dfrac{-2 - 2}{2 - 0} = -2$ và đi qua $A(0; 2)$ nên có phương trình $y = -2x + 2$. Chọn A.',
        ],
      },
      {
        id: 'exc-12-3',
        code: 'Bài tập 3',
        levelBadge: 'Vận dụng',
        stem:
          'Trong hệ thống truyền dẫn cáp quang ghép kênh theo bước sóng (WDM), khi kích hoạt $x$ kênh bước sóng đồng thời ($1 \\le x \\le 15$), tốc độ truyền dẫn hiệu dụng (Gbps) được mô hình hóa bởi $R(x) = \\dfrac{-x^2 + 26x + 31}{x + 2}$. Tìm số kênh $x$ để tốc độ truyền dẫn đạt giá trị lớn nhất và tính giá trị lớn nhất đó.',
        answer: 'x = 3 kênh; max R(x) = 20 Gbps',
        solutionSteps: [
          'Bước 1: Viết lại hàm số $R(x) = -x + 28 - \\dfrac{25}{x + 2}$ với $x \\in [1; 15]$.',
          'Bước 2: Tính đạo hàm $R\'(x) = -1 + \\dfrac{25}{(x + 2)^2} = 0 \\Leftrightarrow (x + 2)^2 = 25 \\Leftrightarrow x = 3$ (vì $x \\ge 1$).',
          'Bước 3: Thay $x = 3$ ta được $\\max_{[1; 15]} R(x) = R(3) = 20$ (Gbps).',
        ],
      },
    ],
  },
  {
    id: 'lesson-12-c4-b11',
    title: 'Bài 11. Nguyên hàm & Bài 13. Ứng dụng hình học của tích phân',
    grade: '12',
    chapterId: '12-c4',
    chapterTitle: 'Chương IV. Nguyên hàm và Tích phân',
    lessonTitle: 'Bài 13. Ứng dụng hình học của tích phân',
    sourceType: 'cloud_app',
    authorName: 'Thầy Lê Trọng Toàn (App Chính TeachLearn Edu)',
    updatedAt: '2026-11-18T08:30:00.000Z',
    theoryItems: [
      {
        id: 'th-12-int-1',
        title: '1. Diện tích hình phẳng giới hạn bởi đồ thị hàm số',
        tag: 'Công thức chuẩn SGK',
        points: [
          'Diện tích $S$ của hình phẳng giới hạn bởi đồ thị hàm số liên tục $y = f(x)$, trục hoành $Ox$ và hai đường thẳng $x = a, x = b$ ($a < b$) là: $S = \\int_a^b |f(x)|\\,\\mathrm{d}x$.',
          'Diện tích hình phẳng giới hạn bởi hai đồ thị $y = f(x)$, $y = g(x)$ và $x = a, x = b$ là: $S = \\int_a^b |f(x) - g(x)|\\,\\mathrm{d}x$.',
        ],
      },
      {
        id: 'th-12-int-2',
        title: '2. Thể tích vật thể và khối tròn xoay',
        tag: 'Công thức chuẩn SGK',
        points: [
          'Cắt một vật thể bởi hai mặt phẳng vuông góc với trục $Ox$ tại $x = a$ và $x = b$ ($a < b$). Thiết diện tại hoành độ $x \\in [a; b]$ có diện tích liên tục $S(x)$ thì thể tích là: $V = \\int_a^b S(x)\\,\\mathrm{d}x$.',
          'Thể tích khối tròn xoay khi quay hình phẳng giới hạn bởi $y = f(x)$, trục $Ox$, $x = a, x = b$ quanh trục $Ox$ là: $V = \\pi \\int_a^b [f(x)]^2\\,\\mathrm{d}x$.',
        ],
      },
    ],
    exampleItems: [
      {
        id: 'exm-12-int-1',
        title: 'Ví dụ 1: Tính diện tích hình phẳng giới hạn bởi đường bậc ba và trục hoành',
        levelBadge: 'Thông hiểu',
        problem:
          'Tính diện tích hình phẳng giới hạn bởi đồ thị hàm số $y = x^3 - 3x^2 + 2x$ và trục hoành $Ox$.',
        steps: [
          {
            stepTitle: 'Bước 1: Giải phương trình hoành độ giao điểm',
            content:
              'Ta có $x^3 - 3x^2 + 2x = 0 \\Leftrightarrow x(x - 1)(x - 2) = 0 \\Leftrightarrow x = 0, x = 1, x = 2$.',
          },
          {
            stepTitle: 'Bước 2: Tách cận tích phân và tính giá trị',
            content:
              '$S = \\int_0^1 (x^3 - 3x^2 + 2x)\\,\\mathrm{d}x - \\int_1^2 (x^3 - 3x^2 + 2x)\\,\\mathrm{d}x = \\dfrac{1}{4} + \\dfrac{1}{4} = \\dfrac{1}{2}$.',
          },
        ],
        conclusion: 'Diện tích hình phẳng cần tìm bằng $S = \\dfrac{1}{2}$.',
      },
      {
        id: 'exm-12-int-2',
        title: 'Ví dụ 2: Tính thể tích chi tiết máy kim loại tròn xoay',
        levelBadge: 'Vận dụng cao',
        problem:
          'Trên hệ trục $Oxy$ (đơn vị $1\\text{ cm}$), gọi $(H)$ là hình phẳng giới hạn bởi nửa trên elip $\\dfrac{x^2}{64} + \\dfrac{y^2}{12} = 1$ ($y \\ge 0$) và đường tròn tâm $O$ bán kính $R = 5$. Quay $(H)$ quanh trục $Ox$ tạo thành một chi tiết máy. Tính thể tích chi tiết máy đó (làm tròn đến hàng đơn vị).',
        steps: [
          {
            stepTitle: 'Bước 1: Tìm phương trình các đường cong và hoành độ giao điểm',
            content:
              'Nửa trên elip: $y_1^2 = 12 - \\dfrac{3}{16}x^2$. Nửa trên đường tròn: $y_2^2 = 25 - x^2$. Giải $25 - x^2 = 12 - \\dfrac{3}{16}x^2 \\Leftrightarrow \\dfrac{13}{16}x^2 = 13 \\Leftrightarrow x = \\pm 4$.',
          },
          {
            stepTitle: 'Bước 2: Thiết lập và tính tích phân thể tích khối tròn xoay',
            content:
              '$V = \\pi \\int_{-4}^{4} \\left[(25 - x^2) - \\left(12 - \\dfrac{3}{16}x^2\\right)\\right]\\mathrm{d}x = 2\\pi \\int_0^4 \\left(13 - \\dfrac{13}{16}x^2\\right)\\mathrm{d}x = \\dfrac{208\\pi}{3} \\approx 218\\text{ cm}^3$.',
          },
        ],
        conclusion: 'Thể tích của chi tiết máy bằng $218\\text{ cm}^3$.',
      },
    ],
    exerciseItems: [
      {
        id: 'exc-12-int-1',
        code: 'Bài tập 1',
        levelBadge: 'Nhận biết',
        stem:
          'Họ tất cả các nguyên hàm của hàm số $f(x) = 3x^2 - \\sin x$ trên $\\mathbb{R}$ là:',
        options: [
          'A. $x^3 - \\cos x + C$.',
          'B. $6x + \\cos x + C$.',
          'C. $6x - \\cos x + C$.',
          'D. $x^3 + \\cos x + C$.',
        ],
        answer: 'D',
        solutionSteps: [
          'Bước 1: Áp dụng bảng nguyên hàm: $\\int 3x^2\\,\\mathrm{d}x = x^3 + C_1$ và $\\int (-\\sin x)\\,\\mathrm{d}x = \\cos x + C_2$.',
          'Bước 2: Vậy $\\int (3x^2 - \\sin x)\\,\\mathrm{d}x = x^3 + \\cos x + C$. Chọn D.',
        ],
      },
      {
        id: 'exc-12-int-2',
        code: 'Bài tập 2',
        levelBadge: 'Vận dụng',
        stem:
          'Một khu rừng keo lai trồng mới có tốc độ tăng trữ lượng gỗ sau $t$ năm ($t \\ge 1$) là $M\'(t) = 18t - \\dfrac{12}{t^2}$ ($\\text{m}^3/\\text{năm}$). Biết tại thời điểm $t = 1$ năm trữ lượng gỗ là $M(1) = 25\\text{ m}^3$, tính trữ lượng gỗ tại thời điểm $t = 3$ năm.',
        options: ['A. $97\\text{ m}^3$.', 'B. $81\\text{ m}^3$.', 'C. $89\\text{ m}^3$.', 'D. $105\\text{ m}^3$.'],
        answer: 'C',
        solutionSteps: [
          'Bước 1: Ta có $M(t) = \\int (18t - 12t^{-2})\\,\\mathrm{d}t = 9t^2 + \\dfrac{12}{t} + C$. Thay $M(1) = 25 \\Rightarrow 9 + 12 + C = 25 \\Rightarrow C = 4$.',
          'Bước 2: Tại $t = 3$ năm: $M(3) = 9\\cdot 3^2 + \\dfrac{12}{3} + 4 = 81 + 4 + 4 = 89\\text{ m}^3$. Chọn C.',
        ],
      },
    ],
  },
  {
    id: 'lesson-11-c7-b22',
    title: 'Bài 22. Hai đường thẳng vuông góc & Đường thẳng vuông góc với mặt phẳng',
    grade: '11',
    chapterId: '11-c7',
    chapterTitle: 'Chương VII. Quan hệ vuông góc trong không gian',
    lessonTitle: 'Bài 23. Đường thẳng vuông góc với mặt phẳng',
    sourceType: 'cloud_app',
    authorName: 'Thầy Lê Trọng Toàn (App Chính TeachLearn Edu)',
    updatedAt: '2026-11-18T07:45:00.000Z',
    theoryItems: [
      {
        id: 'th-11-1',
        title: '1. Điều kiện để đường thẳng vuông góc với mặt phẳng',
        tag: 'Định lý trọng tâm',
        points: [
          'Nếu một đường thẳng vuông góc với hai đường thẳng cắt nhau cùng thuộc một mặt phẳng thì nó vuông góc với mặt phẳng ấy: $d \\perp a, d \\perp b$ ($a, b \\subset (P)$, $a \\cap b = I$) $\\Rightarrow d \\perp (P)$.',
          'Tính chất: Nếu $d \\perp (P)$ thì $d$ vuông góc với mọi đường thẳng $a$ nằm trong mặt phẳng $(P)$.',
        ],
      },
      {
        id: 'th-11-2',
        title: '2. Công thức tính thể tích khối chóp và khoảng cách',
        tag: 'Hình học không gian',
        points: [
          'Thể tích khối chóp có diện tích đáy $S_{\\text{đáy}}$ và chiều cao $h$ là: $V = \\dfrac{1}{3} S_{\\text{đáy}} \\cdot h$.',
          'Khoảng cách giữa hai đường thẳng chéo nhau $a$ và $b$: Nếu $a \\parallel (P)$ và $b \\subset (P)$ thì $d(a, b) = d(a, (P)) = d(H, (P))$ với $H \\in a$.',
        ],
      },
    ],
    exampleItems: [
      {
        id: 'exm-11-1',
        title: 'Ví dụ 1: Chứng minh đường thẳng vuông góc với mặt phẳng trong hình chóp',
        levelBadge: 'Thông hiểu',
        problem:
          'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình chữ nhật và $SA \\perp (ABCD)$. Chứng minh rằng $CD \\perp (SAD)$.',
        steps: [
          {
            stepTitle: 'Bước 1: Phân tích các quan hệ vuông góc của CD',
            content:
              'Vì đáy $ABCD$ là hình chữ nhật nên $CD \\perp AD$. Mặt khác, do $SA \\perp (ABCD)$ và $CD \\subset (ABCD)$ nên $CD \\perp SA$.',
          },
          {
            stepTitle: 'Bước 2: Kết luận theo định lý',
            content:
              'Trong mặt phẳng $(SAD)$, hai đường thẳng $AD$ và $SA$ cắt nhau tại $A$, mà $CD \\perp AD$ và $CD \\perp SA$ nên suy ra $CD \\perp (SAD)$.',
          },
        ],
        conclusion: 'Đường thẳng $CD$ vuông góc với mặt phẳng $(SAD)$.',
      },
    ],
    exerciseItems: [
      {
        id: 'exc-11-1',
        code: 'Bài tập 1',
        levelBadge: 'Thông hiểu',
        stem:
          'Cho khối chóp $S.ABC$ có $SA \\perp (ABC)$, tam giác $ABC$ vuông tại $B$ với $AB = 3, BC = 4$ và $SA = 6$. Thể tích của khối chóp $S.ABC$ bằng:',
        options: ['A. $12$.', 'B. $36$.', 'C. $24$.', 'D. $18$.'],
        answer: 'A',
        solutionSteps: [
          'Bước 1: Diện tích đáy $S_{\\triangle ABC} = \\dfrac{1}{2}AB \\cdot BC = \\dfrac{1}{2}\\cdot 3\\cdot 4 = 6$.',
          'Bước 2: Thể tích khối chóp $V = \\dfrac{1}{3}SA \\cdot S_{\\triangle ABC} = \\dfrac{1}{3}\\cdot 6\\cdot 6 = 12$. Chọn A.',
        ],
      },
      {
        id: 'exc-11-2',
        code: 'Bài tập 2',
        levelBadge: 'Vận dụng',
        stem:
          'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình vuông cạnh bằng $3$. Gọi $H$ là trung điểm của cạnh $AB$, biết $SH \\perp (ABCD)$ và $SH = 4$. Tính khoảng cách giữa hai đường thẳng chéo nhau $AB$ và $SC$.',
        answer: '2,4',
        solutionSteps: [
          'Bước 1: Vì $AB \\parallel CD$ và $CD \\subset (SCD)$ nên $d(AB, SC) = d(AB, (SCD)) = d(H, (SCD))$.',
          'Bước 2: Gọi $K$ là trung điểm $CD \\Rightarrow HK \\perp CD$ và $HK = 3$. Kẻ $HE \\perp SK$ trong $\\triangle SHK$ vuông tại $H \\Rightarrow HE \\perp (SCD)$.',
          'Bước 3: $d(AB, SC) = HE = \\dfrac{SH \\cdot HK}{\\sqrt{SH^2 + HK^2}} = \\dfrac{4\\cdot 3}{5} = 2,4$.',
        ],
      },
    ],
  },
  {
    id: 'lesson-10-c2-b4',
    title: 'Bài 4. Hệ bất phương trình bậc nhất hai ẩn & Bài toán tối ưu',
    grade: '10',
    chapterId: '10-c2',
    chapterTitle: 'Chương II. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    lessonTitle: 'Bài 4. Hệ bất phương trình bậc nhất hai ẩn',
    sourceType: 'cloud_app',
    authorName: 'Thầy Lê Trọng Toàn (App Chính TeachLearn Edu)',
    updatedAt: '2026-11-18T07:15:00.000Z',
    theoryItems: [
      {
        id: 'th-10-1',
        title: '1. Khái niệm hệ bất phương trình bậc nhất hai ẩn và miền nghiệm',
        tag: 'Lý thuyết SGK KNTT',
        points: [
          'Hệ bất phương trình bậc nhất hai ẩn gồm hai hay nhiều bất phương trình bậc nhất hai ẩn $ax + by \\le c$ (hoặc $\\ge, <, >$).',
          'Trên mặt phẳng tọa độ $Oxy$, tập hợp các điểm $(x_0; y_0)$ là nghiệm chung của tất cả các bất phương trình trong hệ được gọi là miền nghiệm của hệ.',
        ],
      },
      {
        id: 'th-10-2',
        title: '2. Phương pháp giải bài toán tối ưu $F(x; y) = ax + by$',
        tag: 'Quy tắc đỉnh đa giác',
        points: [
          'Giá trị lớn nhất hoặc giá trị nhỏ nhất của biểu thức bậc nhất $F(x; y) = ax + by$ trên một miền nghiệm đa giác lồi đạt được tại một trong các đỉnh của đa giác đó.',
        ],
      },
    ],
    exampleItems: [
      {
        id: 'exm-10-1',
        title: 'Ví dụ 1: Tối ưu chi phí thuê xe vận chuyển nông sản xuất khẩu',
        levelBadge: 'Vận dụng thực tiễn',
        problem:
          'Một hợp tác xã tại Buôn Ma Thuột cần thuê xe tải loại A và B để vận chuyển ít nhất $18$ tấn cà phê nhân và ít nhất $10$ tấn hồ tiêu. Mỗi xe loại A chở được $3$ tấn cà phê, $1$ tấn hồ tiêu (chi phí $25$ triệu đồng/chuyến); mỗi xe loại B chở được $2$ tấn cà phê, $2$ tấn hồ tiêu (chi phí $20$ triệu đồng/chuyến). Tổng số xe thuê không quá $9$ xe. Tìm chi phí thuê xe nhỏ nhất.',
        steps: [
          {
            stepTitle: 'Bước 1: Lập hệ bất phương trình ràng buộc và hàm mục tiêu',
            content:
              'Gọi $x, y \\in \\mathbb{N}$ là số xe tải loại A và B. Hệ ràng buộc: $3x + 2y \\ge 18$, $x + 2y \\ge 10$, $x + y \\le 9$, $x \\ge 0, y \\ge 0$. Hàm chi phí: $F(x; y) = 25x + 20y$ (triệu đồng).',
          },
          {
            stepTitle: 'Bước 2: Tính giá trị hàm mục tiêu tại các đỉnh của miền nghiệm',
            content:
              'Miền nghiệm là tam giác $ABC$ có 3 đỉnh nguyên: $A(4; 3)$, $B(0; 9)$ và $C(8; 1)$. Ta có $F(4; 3) = 160$; $F(0; 9) = 180$; $F(8; 1) = 220$.',
          },
        ],
        conclusion:
          'Chi phí thuê xe nhỏ nhất là $160$ triệu đồng (khi thuê $4$ xe loại A và $3$ xe loại B).',
      },
    ],
    exerciseItems: [
      {
        id: 'exc-10-1',
        code: 'Bài tập 1',
        levelBadge: 'Nhận biết',
        stem:
          'Cặp số $(x; y)$ nào sau đây là một nghiệm của bất phương trình bậc nhất hai ẩn $2x - 3y + 6 > 0$?',
        options: ['A. $(0; 3)$.', 'B. $(-3; 1)$.', 'C. $(1; 1)$.', 'D. $(-2; 2)$.'],
        answer: 'C',
        solutionSteps: [
          'Bước 1: Thay tọa độ điểm $(1; 1)$ vào vế trái của bất phương trình ta được $2\\cdot 1 - 3\\cdot 1 + 6 = 5 > 0$ (luôn đúng).',
          'Bước 2: Vậy cặp số $(1; 1)$ là nghiệm của bất phương trình đã cho. Chọn C.',
        ],
      },
    ],
  },
];

// ============================================================================
// HELPER: GENERATE DYNAMIC 3-PART LESSON FOR ANY CURRICULUM CHAPTER/LESSON
// ============================================================================

function buildDynamicCurriculumLesson(
  grade: '10' | '11' | '12',
  chapterId: string,
  chapterTitle: string,
  lessonTitle: string
): SharedLessonRecord {
  const existing = SEEDED_CLOUD_LESSONS.find(
    (l) => l.grade === grade && (l.lessonTitle === lessonTitle || l.chapterId === chapterId)
  );
  if (existing && existing.lessonTitle === lessonTitle) {
    return existing;
  }

  return {
    id: `lesson-${grade}-${chapterId}-${encodeURIComponent(lessonTitle).slice(0, 24)}`,
    title: lessonTitle,
    grade,
    chapterId,
    chapterTitle,
    lessonTitle,
    sourceType: 'cloud_app',
    authorName: 'Thầy Lê Trọng Toàn (App Chính TeachLearn Edu)',
    updatedAt: new Date().toISOString(),
    theoryItems: [
      {
        id: `th-${chapterId}-1`,
        title: `1. Kiến thức cốt lõi — ${lessonTitle}`,
        tag: `Lớp ${grade} · SGK KNTT`,
        points:
          grade === '10'
            ? [
                `Chủ đề trọng tâm thuộc ${chapterTitle}.`,
                'Ký hiệu & Công thức chuẩn SGK: Tập hợp số thực $\\mathbb{R}$, mệnh đề kéo theo $P \\Rightarrow Q$, hệ thức lượng trong tam giác $a^2 = b^2 + c^2 - 2bc\\cos A$ và $S = \\dfrac{1}{2}bc\\sin A$.',
                'Quy trình giải toán chuẩn: Xác định điều kiện xác định $\\to$ Biến đổi tương đương hoặc biểu diễn hình học $\\to$ Đối chiếu điều kiện và kết luận.',
              ]
            : grade === '11'
              ? [
                  `Chủ đề trọng tâm thuộc ${chapterTitle}.`,
                  'Công thức nền tảng: Phương trình lượng giác $\\cos x = 0 \\Leftrightarrow x = \\dfrac{\\pi}{2} + k\\pi$ ($k \\in \\mathbb{Z}$); phương trình lôgarit $\\log_a f(x) = b \\Leftrightarrow f(x) = a^b$ ($0 < a \\ne 1$).',
                  'Hình học không gian: Điều kiện đường thẳng vuông góc với mặt phẳng $d \\perp a, d \\perp b \\Rightarrow d \\perp (P)$ và thể tích khối chóp $V = \\dfrac{1}{3}S_{\\text{đáy}}\\cdot h$.',
                ]
              : [
                  `Chủ đề trọng tâm thuộc ${chapterTitle}.`,
                  'Giải tích 12: Xét dấu đạo hàm $f\'(x)$ để tìm khoảng đơn điệu và cực trị; tích phân diện tích $S = \\int_a^b |f(x)|\\,\\mathrm{d}x$ và thể tích vật thể $V = \\int_a^b S(x)\\,\\mathrm{d}x$.',
                  'Hình học Oxyz & Xác suất: Phương trình mặt phẳng $A(x - x_0) + B(y - y_0) + C(z - z_0) = 0$; công thức Bayes $P(A \\mid B) = \\dfrac{P(A)P(B \\mid A)}{P(B)}$.',
                ],
      },
    ],
    exampleItems:
      existing?.exampleItems || SEEDED_CLOUD_LESSONS[0].exampleItems,
    exerciseItems:
      existing?.exerciseItems || SEEDED_CLOUD_LESSONS[0].exerciseItems,
  };
}

// ============================================================================
// HELPER: PARSE .DOCX OR .JSON FILE INTO 3-PART PEDAGOGICAL STRUCTURE
// ============================================================================

async function parseDocxToLessonRecord(
  file: File,
  grade: '10' | '11' | '12',
  chapterId: string,
  chapterTitle: string
): Promise<SharedLessonRecord> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error('Không tìm thấy nội dung văn bản trong tệp .docx');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, 'application/xml');
  const pNodes = Array.from(xmlDoc.getElementsByTagName('w:p'));
  const lines: string[] = [];

  for (const p of pNodes) {
    const tNodes = Array.from(p.getElementsByTagName('*')).filter(
      (el) => el.tagName === 'w:t' || el.tagName === 'm:t'
    );
    const text = tNodes
      .map((n) => n.textContent || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push(text);
  }

  const theoryLines: string[] = [];
  const exampleLines: string[] = [];
  const exerciseLines: string[] = [];

  let currentBucket: 'theory' | 'examples' | 'exercises' = 'theory';
  for (const line of lines) {
    if (/^(II\.|2\.|Ví dụ|VÍ DỤ)/i.test(line)) {
      currentBucket = 'examples';
    } else if (/^(III\.|3\.|Bài tập|BÀI TẬP|Câu\s+\d+)/i.test(line)) {
      currentBucket = 'exercises';
    } else if (/^(I\.|1\.|Lý thuyết|LÝ THUYẾT)/i.test(line)) {
      currentBucket = 'theory';
    }

    if (currentBucket === 'theory') theoryLines.push(line);
    else if (currentBucket === 'examples') exampleLines.push(line);
    else exerciseLines.push(line);
  }

  const cleanTitle = file.name.replace(/\.(docx|pdf|json)$/i, '');

  return {
    id: `local-docx-${Date.now()}`,
    title: cleanTitle,
    grade,
    chapterId,
    chapterTitle,
    lessonTitle: cleanTitle,
    sourceType: 'local_file',
    authorName: `Tệp máy tính (${file.name})`,
    updatedAt: new Date().toISOString(),
    theoryItems: [
      {
        id: `th-docx-1`,
        title: `I. Lý thuyết trọng tâm — ${cleanTitle}`,
        tag: 'Nạp từ tệp .docx',
        points:
          theoryLines.length > 0
            ? theoryLines.slice(0, 12)
            : lines.slice(0, Math.min(8, lines.length)),
      },
    ],
    exampleItems: [
      {
        id: `exm-docx-1`,
        title: 'Ví dụ minh họa trích xuất từ giáo án',
        levelBadge: 'Ví dụ trọng tâm',
        problem:
          exampleLines[0] ||
          lines[Math.min(1, lines.length - 1)] ||
          'Ví dụ minh họa trong tệp giáo án đã tải lên.',
        steps:
          exampleLines.slice(1, 5).map((txt, idx) => ({
            stepTitle: `Bước ${idx + 1}`,
            content: txt,
          })) || [],
        conclusion:
          exampleLines[exampleLines.length - 1] || 'Hoàn thành phân tích ví dụ minh họa.',
      },
    ],
    exerciseItems:
      exerciseLines.length > 0
        ? exerciseLines.slice(0, 6).map((txt, idx) => ({
            id: `exc-docx-${idx + 1}`,
            code: `Bài tập ${idx + 1}`,
            levelBadge: 'Luyện tập trên lớp',
            stem: txt,
            answer: 'Xem lời giải trên Bảng trắng',
            solutionSteps: [
              'Nhấn nút "Đưa sang Bảng trắng" để trình bày lời giải viết tay trực tiếp cùng học sinh.',
            ],
          }))
        : SEEDED_CLOUD_LESSONS[0].exerciseItems.slice(0, 2),
  };
}

function convertExampleToBankQuestion(
  example: LessonExampleItem,
  lesson: SharedLessonRecord
): BankQuestion {
  return {
    id: `lesson-exm-${example.id}-${Date.now()}`,
    partType: 'part3',
    tag: `[${lesson.grade}-${lesson.chapterId.toUpperCase()}-TH]`,
    grade: lesson.grade,
    chapter: lesson.chapterTitle,
    lesson: lesson.lessonTitle,
    level: 'TH',
    stem: stripDuplicateHeadingFromStem(example.problem, example.title),
    answer: stripAnswerPrefix(example.conclusion),
    solutionSteps: normalizeSolutionSteps(example.steps).map((s) => ({
      title: s.label,
      leadIn: '',
      math: s.body,
    })),
    source: `Bài giảng: ${lesson.title}`,
    updatedAt: new Date().toISOString(),
  };
}

function convertExerciseToBankQuestion(
  ex: LessonExerciseItem,
  lesson: SharedLessonRecord
): BankQuestion {
  const isMcq = Array.isArray(ex.options) && ex.options.length === 4;
  const cleanAns = stripAnswerPrefix(ex.answer);
  const ansUpper = cleanAns.trim().toUpperCase();
  const idxMap: Record<string, 0 | 1 | 2 | 3> = { A: 0, B: 1, C: 2, D: 3 };
  return {
    id: `lesson-exc-${ex.id}-${Date.now()}`,
    partType: isMcq ? 'part1' : 'part3',
    tag: `[${lesson.grade}-${lesson.chapterId.toUpperCase()}-VD]`,
    grade: lesson.grade,
    chapter: lesson.chapterTitle,
    lesson: lesson.lessonTitle,
    level: 'VD',
    stem: stripDuplicateHeadingFromStem(ex.stem, ex.code),
    options: isMcq
      ? ([
          stripMcqOptionPrefix(ex.options![0]),
          stripMcqOptionPrefix(ex.options![1]),
          stripMcqOptionPrefix(ex.options![2]),
          stripMcqOptionPrefix(ex.options![3]),
        ] as [string, string, string, string])
      : undefined,
    correctIndex: isMcq ? idxMap[ansUpper] ?? 0 : undefined,
    answer: cleanAns,
    solutionSteps: normalizeSolutionSteps(ex.solutionSteps).map((s) => ({
      title: s.label,
      leadIn: '',
      math: s.body,
    })),
    source: `Bài giảng: ${lesson.title}`,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// MAIN COMPONENT: TEACHING MODULE
// ============================================================================

export interface TeachingModuleProps {
  activeTab: 'smartboard' | 'function_plot' | 'geometry_3d' | 'slides' | 'realworld';
  bankItems?: BankQuestion[];
  schoolName?: string;
  teacherName?: string;
  onSelectModule?: (id: ModuleId) => void;
  onOpenJsonBankLoader?: () => void;
  onPublishToStudentNotebook?: (payload: {
    title: string;
    className: string;
    grade: '10' | '11' | '12';
    pageImages: string[];
    summaryText: string;
  }) => Promise<void>;
  availableClasses?: Array<{ id: string; name: string; grade: '10' | '11' | '12' }>;
  activeClassName?: string;
  isOwnerAdmin?: boolean;
}

export const TeachingModule: React.FC<TeachingModuleProps> = ({
  activeTab,
  bankItems,
  schoolName,
  teacherName,
  onSelectModule,
  onOpenJsonBankLoader,
  onPublishToStudentNotebook,
  availableClasses,
  activeClassName,
  isOwnerAdmin = false,
}) => {
  const [pendingIncomingWidget, setPendingIncomingWidget] = useState<{
    id: string;
    title: string;
    imageDataUrl?: string;
    solidKind?: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane';
    question?: BankQuestion;
  } | null>(null);

  const effectiveBankItems = useMemo(
    () =>
      bankItems && bankItems.length > 0
        ? bankItems
        : examPaperToBankQuestions(MOCK_EXAM_0107, `Đề chuẩn ${MOCK_EXAM_0107.examCode}`),
    [bankItems]
  );

  // ==========================================================================
  // TOOL #5: 5. BÀI GIẢNG (LIÊN THÔNG APP CHÍNH · TẢI FILE · GOOGLE DRIVE)
  // ==========================================================================
  const [sourceMode, setSourceMode] = useState<LessonSourceMode>('cloud_app');
  const [sectionView, setSectionView] = useState<LessonSectionView>('all');
  const [largeBoardFont, setLargeBoardFont] = useState<boolean>(true);

  const [lessonGrade, setLessonGrade] = useState<'10' | '11' | '12'>('12');
  const gradeChapters = useMemo(
    () => KNTT_MATH_CURRICULUM.filter((ch) => ch.grade === lessonGrade),
    [lessonGrade]
  );
  const [chapterId, setChapterId] = useState<string>(gradeChapters[0]?.id || '12-c1');
  const activeChapter =
    gradeChapters.find((ch) => ch.id === chapterId) ||
    gradeChapters[0] ||
    KNTT_MATH_CURRICULUM[0];
  const [selectedLessonTitle, setSelectedLessonTitle] = useState<string>(
    activeChapter.lessons[0]
  );

  // Cloud lessons synced with Firestore collection `lessons`
  const [cloudLessons, setCloudLessons] = useState<SharedLessonRecord[]>(SEEDED_CLOUD_LESSONS);
  const [activeLesson, setActiveLesson] = useState<SharedLessonRecord>(SEEDED_CLOUD_LESSONS[0]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>(
    'Đã kết nối bộ sưu tập lessons (Cloud Firestore TeachLearn Edu)'
  );
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  // Toggle states for Step-by-Step Solution in II. Ví dụ minh họa & III. Bài tập vận dụng
  const [revealedExampleMap, setRevealedExampleMap] = useState<Record<string, boolean>>({});
  const [revealedExerciseMap, setRevealedExerciseMap] = useState<Record<string, boolean>>({});

  // Local file & Google Drive states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [driveUrlInput, setDriveUrlInput] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Source #4: 4. AI Soạn giảng Trực tiếp (Structured Outputs + Offline/API Guard + Auto-Retry)
  const [aiFocusNote, setAiFocusNote] = useState<string>('');
  const [aiExampleCount, setAiExampleCount] = useState<number>(2);
  const [aiExerciseCount, setAiExerciseCount] = useState<number>(4);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [apiKeyReady, setApiKeyReady] = useState<boolean | null>(null);
  const [aiGenStatus, setAiGenStatus] = useState<
    'idle' | 'checking' | 'loading' | 'retrying' | 'error' | 'cancelled'
  >('idle');
  const [aiGenAttempt, setAiGenAttempt] = useState<number>(0);
  const [aiGenErrorType, setAiGenErrorType] = useState<
    'offline' | 'no_api_key' | 'network' | 'generic' | null
  >(null);
  const [aiGenErrorMsg, setAiGenErrorMsg] = useState<string | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const aiRetryTimerRef = useRef<number | null>(null);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((cur) => (cur === msg ? null : cur));
    }, 3600);
  };

  // Monitor online/offline state for AI Direct Lesson guard
  useEffect(() => {
    const handleOnline = () => {
      setIsDeviceOnline(true);
      setAiGenErrorType((prev) => (prev === 'offline' ? null : prev));
      setAiGenErrorMsg((prev) =>
        prev && prev.includes('Ngoại tuyến') ? null : prev
      );
    };
    const handleOffline = () => {
      setIsDeviceOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (aiRetryTimerRef.current !== null) {
        window.clearTimeout(aiRetryTimerRef.current);
      }
      aiAbortControllerRef.current?.abort();
    };
  }, []);

  // Pre-check server Gemini API key readiness whenever entering tab 4. AI Soạn giảng Trực tiếp
  const checkAiReadiness = async (signal?: AbortSignal): Promise<{ online: boolean; hasKey: boolean }> => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsDeviceOnline(online);
    if (!online) {
      setApiKeyReady(false);
      return { online: false, hasKey: false };
    }
    try {
      const res = await fetch('/api/health', { signal, cache: 'no-store' });
      if (!res.ok) {
        return { online: true, hasKey: apiKeyReady ?? true };
      }
      const health = (await res.json()) as { aiConfigured?: boolean };
      const configured = Boolean(health.aiConfigured);
      setApiKeyReady(configured);
      return { online: true, hasKey: configured };
    } catch {
      return { online: typeof navigator !== 'undefined' ? navigator.onLine : false, hasKey: false };
    }
  };

  useEffect(() => {
    if (sourceMode !== 'ai_direct') return;
    const ctrl = new AbortController();
    void checkAiReadiness(ctrl.signal);
    return () => ctrl.abort();
  }, [sourceMode]);

  const handleStopAiGeneration = () => {
    if (aiRetryTimerRef.current !== null) {
      window.clearTimeout(aiRetryTimerRef.current);
      aiRetryTimerRef.current = null;
    }
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    setAiGenStatus('cancelled');
    setAiGenAttempt(0);
    setAiGenErrorType(null);
    setAiGenErrorMsg('Đã dừng quá trình AI Soạn giảng theo yêu cầu của thầy.');
  };

  const mapStructuredLessonToRecord = (
    payload: DirectAiLessonPayload
  ): SharedLessonRecord => {
    const nowIso = new Date().toISOString();
    const ts = Date.now();
    const cleanTitle = sanitizeKatexMath(payload.tieu_de || selectedLessonTitle);

    const theoryItems: LessonTheoryCard[] = (payload.ly_thuyet || [])
      .filter((t) => t && (t.tieu_de || (Array.isArray(t.noi_dung) && t.noi_dung.length > 0)))
      .map((t, idx) => ({
        id: `ai-th-${ts}-${idx + 1}`,
        title: sanitizeKatexMath(t.tieu_de || `${idx + 1}. Kiến thức trọng tâm`),
        tag: sanitizeKatexMath(t.nhan || 'AI Soạn giảng · SGK KNTT'),
        points: (Array.isArray(t.noi_dung) ? t.noi_dung : [])
          .map((p) => sanitizeKatexMath(String(p)))
          .filter(Boolean),
      }));

    const exampleItems: LessonExampleItem[] = (payload.vi_du || [])
      .filter((ex) => ex && ex.de_bai)
      .map((ex, idx) => {
        const cleanTitle = formatExampleTitle(ex.tieu_de || `Dạng toán trọng tâm ${idx + 1}`, idx);
        return {
          id: `ai-exm-${ts}-${idx + 1}`,
          title: cleanTitle,
          levelBadge: sanitizeKatexMath(ex.muc_do || 'Thông hiểu'),
          problem: stripDuplicateHeadingFromStem(sanitizeKatexMath(ex.de_bai), cleanTitle),
          steps: (Array.isArray(ex.cac_buoc_giai) ? ex.cac_buoc_giai : [])
            .map((rawStep, sIdx) => ({
              stepTitle: `Bước ${sIdx + 1}:`,
              content: stripLeadingStepHeaders(sanitizeKatexMath(String(rawStep))),
            }))
            .filter((st) => Boolean(st.content)),
          conclusion: stripAnswerPrefix(
            stripConclusionPrefix(sanitizeKatexMath(ex.dap_so || ex.ket_luan || ''))
          ),
        };
      });

    const exerciseItems: LessonExerciseItem[] = (payload.bai_tap || [])
      .filter((exc) => exc && exc.de_bai)
      .map((exc, idx) => {
        const cleanedOpts = (Array.isArray(exc.phuong_an) ? exc.phuong_an : [])
          .map((o) => stripMcqOptionPrefix(sanitizeKatexMath(String(o))))
          .filter(Boolean);
        const isMcq =
          (exc.loai === 'trac_nghiem' || cleanedOpts.length === 4) && cleanedOpts.length >= 4;
        const cleanedSteps = (Array.isArray(exc.loi_giai) ? exc.loi_giai : [])
          .map((st) => stripLeadingStepHeaders(sanitizeKatexMath(String(st))))
          .filter(Boolean);
        const exCode = `Bài tập ${idx + 1}`;

        return {
          id: `ai-exc-${ts}-${idx + 1}`,
          code: exCode,
          levelBadge: sanitizeKatexMath(exc.muc_do || 'Vận dụng'),
          stem: stripDuplicateHeadingFromStem(sanitizeKatexMath(exc.de_bai), exCode),
          options: isMcq
            ? ([cleanedOpts[0], cleanedOpts[1], cleanedOpts[2], cleanedOpts[3]] as [
                string,
                string,
                string,
                string,
              ])
            : undefined,
          answer: stripAnswerPrefix(
            sanitizeKatexMath(exc.dap_so || exc.dap_an || (isMcq ? 'A' : '0'))
          ),
          solutionSteps:
            cleanedSteps.length > 0
              ? cleanedSteps
              : ['Nhấn "Đưa sang Bảng trắng" để trình bày lời giải trực tiếp cùng học sinh.'],
        };
      });

    return {
      id: `ai-lesson-${lessonGrade}-${activeChapter.id}-${ts}`,
      title: cleanTitle,
      grade: lessonGrade,
      chapterId: activeChapter.id,
      chapterTitle: activeChapter.title,
      lessonTitle: selectedLessonTitle,
      sourceType: 'ai_direct',
      authorName: 'Gemini AI Soạn giảng Trực tiếp (Structured JSON)',
      updatedAt: nowIso,
      theoryItems:
        theoryItems.length > 0
          ? theoryItems
          : [
              {
                id: `ai-th-fallback-${ts}`,
                title: `1. Trọng tâm kiến thức — ${cleanTitle}`,
                tag: 'SGK KNTT',
                points: [`Nội dung trọng tâm bài học ${cleanTitle} thuộc ${activeChapter.title}.`],
              },
            ],
      exampleItems,
      exerciseItems,
    };
  };

  const handleGenerateAiDirectLesson = async () => {
    // Cancel any previous in-flight generation before starting a fresh run
    if (aiRetryTimerRef.current !== null) {
      window.clearTimeout(aiRetryTimerRef.current);
      aiRetryTimerRef.current = null;
    }
    aiAbortControllerRef.current?.abort();

    const controller = new AbortController();
    aiAbortControllerRef.current = controller;

    setAiGenErrorType(null);
    setAiGenErrorMsg(null);

    // 1. Offline Guard: check navigator.onLine before sending request
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsDeviceOnline(false);
      setAiGenStatus('error');
      setAiGenErrorType('offline');
      setAiGenErrorMsg(
        'Thiết bị đang ngoại tuyến (không có kết nối Internet). Thầy vui lòng bật Wi-Fi / 4G để dùng AI Soạn giảng Trực tiếp, hoặc nhấn nút bên dưới để mở Kho bài giảng có sẵn.'
      );
      return;
    }

    // 2. API Key Guard: check /api/health before calling Gemini
    setAiGenStatus('checking');
    setAiGenAttempt(1);
    const readiness = await checkAiReadiness(controller.signal);
    if (controller.signal.aborted) return;

    if (!readiness.online) {
      setAiGenStatus('error');
      setAiGenErrorType('offline');
      setAiGenErrorMsg(
        'Không thể kết nối mạng tới máy chủ. Thầy vui lòng kiểm tra lại Internet hoặc mở Kho bài giảng có sẵn (hoạt động 100% ngoại tuyến).'
      );
      return;
    }

    if (!readiness.hasKey) {
      setAiGenStatus('error');
      setAiGenErrorType('no_api_key');
      setAiGenErrorMsg(
        'Hệ thống chưa được cấu hình Gemini API Key (GEMINI_API_KEY trong Settings > Secrets). Thầy vui lòng bổ sung API Key hoặc chuyển sang Kho bài giảng có sẵn để trình chiếu ngay.'
      );
      return;
    }

    const requestSingleAttempt = async (attemptNo: number): Promise<DirectAiLessonPayload> => {
      setAiGenAttempt(attemptNo);
      setAiGenStatus(attemptNo === 1 ? 'loading' : 'retrying');

      const res = await fetch('/api/ai/direct-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          grade: lessonGrade,
          chapterTitle: activeChapter.title,
          lessonTitle: selectedLessonTitle,
          focusNote: aiFocusNote.trim(),
          exampleCount: aiExampleCount,
          exerciseCount: aiExerciseCount,
        }),
      });

      const rawBodyText = await res.text();
      let parsedBody: { lesson?: DirectAiLessonPayload; error?: string; code?: string } = {};
      if (rawBodyText) {
        try {
          parsedBody = safeParseJsonWithMathEscape(rawBodyText);
        } catch {
          throw Object.assign(new Error('Dữ liệu phản hồi từ máy chủ chưa hợp lệ.'), {
            retryable: true,
          });
        }
      }

      if (!res.ok) {
        if (parsedBody.code === 'NO_API_KEY') {
          setApiKeyReady(false);
          throw Object.assign(
            new Error(
              parsedBody.error ||
                'Chưa cấu hình Gemini API Key trong Settings > Secrets của hệ thống.'
            ),
            { retryable: false, errorType: 'no_api_key' as const }
          );
        }
        throw Object.assign(
          new Error(parsedBody.error || `Máy chủ phản hồi lỗi (${res.status}).`),
          { retryable: res.status >= 500 || res.status === 429 || res.status === 408 }
        );
      }

      if (
        !parsedBody.lesson ||
        !Array.isArray(parsedBody.lesson.ly_thuyet) ||
        !Array.isArray(parsedBody.lesson.vi_du) ||
        !Array.isArray(parsedBody.lesson.bai_tap)
      ) {
        throw Object.assign(
          new Error('Cấu trúc bài giảng AI thiếu dữ liệu (ly_thuyet / vi_du / bai_tap).'),
          { retryable: true }
        );
      }

      return parsedBody.lesson;
    };

    try {
      let lessonPayload: DirectAiLessonPayload;
      try {
        lessonPayload = await requestSingleAttempt(1);
      } catch (firstErr: unknown) {
        if (controller.signal.aborted) return;
        const errObj = firstErr as Error & {
          retryable?: boolean;
          errorType?: 'offline' | 'no_api_key' | 'network' | 'generic';
        };
        const isNetworkErr =
          errObj.name === 'TypeError' ||
          /network|fetch|timeout|failed to fetch/i.test(errObj.message || '');
        const shouldAutoRetry = errObj.retryable !== false && (isNetworkErr || errObj.retryable === true);

        if (!shouldAutoRetry) {
          throw firstErr;
        }

        // Automatic 1x retry after brief 1.2s backoff (abortable)
        setAiGenStatus('retrying');
        setAiGenAttempt(2);
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            if (aiRetryTimerRef.current !== null) {
              window.clearTimeout(aiRetryTimerRef.current);
              aiRetryTimerRef.current = null;
            }
            reject(new DOMException('Aborted', 'AbortError'));
          };
          controller.signal.addEventListener('abort', onAbort, { once: true });
          aiRetryTimerRef.current = window.setTimeout(() => {
            aiRetryTimerRef.current = null;
            controller.signal.removeEventListener('abort', onAbort);
            resolve();
          }, 1200);
        });

        if (controller.signal.aborted) return;
        lessonPayload = await requestSingleAttempt(2);
      }

      if (controller.signal.aborted) return;

      const nextRecord = mapStructuredLessonToRecord(lessonPayload);
      setActiveLesson(nextRecord);
      setRevealedExampleMap({});
      setRevealedExerciseMap({});
      setSectionView('all');
      setAiGenStatus('idle');
      setAiGenAttempt(0);
      setAiGenErrorType(null);
      setAiGenErrorMsg(null);
      showNotice(
        `AI đã soạn xong bài giảng "${nextRecord.title}" (${nextRecord.theoryItems.length} mục Lý thuyết · ${nextRecord.exampleItems.length} Ví dụ · ${nextRecord.exerciseItems.length} Bài tập)!`
      );
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const errObj = err as Error & {
        errorType?: 'offline' | 'no_api_key' | 'network' | 'generic';
      };
      const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine;
      if (offlineNow) {
        setIsDeviceOnline(false);
        setAiGenErrorType('offline');
        setAiGenErrorMsg(
          'Mất kết nối Internet giữa chừng. Thầy vui lòng bật lại mạng rồi nhấn Thử lại, hoặc mở Kho bài giảng có sẵn.'
        );
      } else if (errObj.errorType === 'no_api_key') {
        setAiGenErrorType('no_api_key');
        setAiGenErrorMsg(errObj.message);
      } else {
        setAiGenErrorType('network');
        setAiGenErrorMsg(
          `${errObj.message || 'Kết nối mạng chập chờn hoặc quá thời gian chờ.'} (Hệ thống đã tự động thử lại 1 lần). Thầy có thể nhấn Thử lại hoặc mở Kho bài giảng có sẵn.`
        );
      }
      setAiGenStatus('error');
    } finally {
      if (aiAbortControllerRef.current === controller) {
        aiAbortControllerRef.current = null;
      }
    }
  };

  // Subscribe to `lessons` collection on Cloud Firestore (Main App shared database)
  useEffect(() => {
    const lessonsCol = collection(db, 'lessons');
    const unsub = onSnapshot(
      lessonsCol,
      (snap) => {
        const fetched: SharedLessonRecord[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && typeof data.title === 'string') {
            fetched.push({
              id: docSnap.id,
              title: data.title,
              grade: (data.grade as '10' | '11' | '12') || '12',
              chapterId: data.chapterId || '12-c1',
              chapterTitle: data.chapterTitle || 'Chương I',
              lessonTitle: data.lessonTitle || data.title,
              sourceType: 'cloud_app',
              authorName: data.authorName || 'Thầy Lê Trọng Toàn (App Chính)',
              updatedAt: data.updatedAt || new Date().toISOString(),
              driveEmbedUrl: data.driveEmbedUrl,
              theoryItems: Array.isArray(data.theoryItems)
                ? data.theoryItems
                : SEEDED_CLOUD_LESSONS[0].theoryItems,
              exampleItems: Array.isArray(data.exampleItems)
                ? data.exampleItems
                : SEEDED_CLOUD_LESSONS[0].exampleItems,
              exerciseItems: Array.isArray(data.exerciseItems)
                ? data.exerciseItems
                : SEEDED_CLOUD_LESSONS[0].exerciseItems,
            });
          }
        });

        // Merge with seeded KNTT lessons so the teacher always has rich lessons available
        const mergedMap = new Map<string, SharedLessonRecord>();
        for (const seed of SEEDED_CLOUD_LESSONS) {
          mergedMap.set(seed.id, seed);
        }
        for (const item of fetched) {
          mergedMap.set(item.id, item);
        }
        const mergedList = Array.from(mergedMap.values());
        setCloudLessons(mergedList);
        setCloudSyncStatus(
          `Đồng bộ trực tiếp ${mergedList.length} bài giảng từ Cloud Firestore (lessons)`
        );
      },
      () => {
        setCloudSyncStatus('Đang dùng kho bài giảng chuẩn SGK KNTT (Sẵn sàng ngoại tuyến)');
      }
    );

    return () => unsub();
  }, []);

  const filteredCloudLessons = useMemo(
    () => cloudLessons.filter((l) => l.grade === lessonGrade),
    [cloudLessons, lessonGrade]
  );

  const handleSelectGrade = (g: '10' | '11' | '12') => {
    setLessonGrade(g);
    const firstChap = KNTT_MATH_CURRICULUM.find((ch) => ch.grade === g);
    if (firstChap) {
      setChapterId(firstChap.id);
      const firstLessonTitle = firstChap.lessons[0];
      setSelectedLessonTitle(firstLessonTitle);
      const foundCloud = cloudLessons.find(
        (l) => l.grade === g && (l.lessonTitle === firstLessonTitle || l.chapterId === firstChap.id)
      );
      setActiveLesson(
        foundCloud ||
          buildDynamicCurriculumLesson(g, firstChap.id, firstChap.title, firstLessonTitle)
      );
    }
  };

  const handleSelectChapter = (cid: string) => {
    setChapterId(cid);
    const ch = KNTT_MATH_CURRICULUM.find((item) => item.id === cid);
    if (ch) {
      const firstLessonTitle = ch.lessons[0];
      setSelectedLessonTitle(firstLessonTitle);
      const foundCloud = cloudLessons.find(
        (l) => l.grade === lessonGrade && l.lessonTitle === firstLessonTitle
      );
      setActiveLesson(
        foundCloud ||
          buildDynamicCurriculumLesson(lessonGrade, ch.id, ch.title, firstLessonTitle)
      );
    }
  };

  const handleSelectCurriculumLesson = (lTitle: string) => {
    setSelectedLessonTitle(lTitle);
    const foundCloud = cloudLessons.find(
      (l) => l.grade === lessonGrade && l.lessonTitle === lTitle
    );
    setActiveLesson(
      foundCloud ||
        buildDynamicCurriculumLesson(lessonGrade, activeChapter.id, activeChapter.title, lTitle)
    );
  };

  const handleSyncActiveLessonToFirestore = async () => {
    if (!isOwnerAdmin) {
      showNotice(
        'Chế độ Chỉ Xem & Giảng dạy (Read-Only): Chỉ tài khoản Quản trị viên của tác giả mới có quyền ghi đè bài giảng lên Cloud Firestore.'
      );
      return;
    }
    setIsSyncingCloud(true);
    try {
      const lessonDocRef = doc(db, 'lessons', activeLesson.id);
      await setDoc(
        lessonDocRef,
        {
          id: activeLesson.id,
          title: activeLesson.title,
          grade: activeLesson.grade,
          chapterId: activeLesson.chapterId,
          chapterTitle: activeLesson.chapterTitle,
          lessonTitle: activeLesson.lessonTitle,
          sourceType: activeLesson.sourceType,
          authorName: teacherName || activeLesson.authorName,
          updatedAt: new Date().toISOString(),
          driveEmbedUrl: activeLesson.driveEmbedUrl || '',
          theoryItems: activeLesson.theoryItems,
          exampleItems: activeLesson.exampleItems,
          exerciseItems: activeLesson.exerciseItems,
        },
        { merge: true }
      );
      showNotice(`Đã đồng bộ bài giảng "${activeLesson.title}" lên bộ sưu tập lessons (App Chính)!`);
    } catch {
      showNotice('Đã lưu bài giảng vào bộ nhớ đệm cục bộ trên bảng tương tác.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Source #2: Upload file (.docx, .pdf, .json) from computer/USB
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (parsed && Array.isArray(parsed.theoryItems)) {
          const customRecord: SharedLessonRecord = {
            id: parsed.id || `json-lesson-${Date.now()}`,
            title: parsed.title || file.name.replace(/\.json$/i, ''),
            grade: parsed.grade || lessonGrade,
            chapterId: parsed.chapterId || activeChapter.id,
            chapterTitle: parsed.chapterTitle || activeChapter.title,
            lessonTitle: parsed.lessonTitle || parsed.title || file.name,
            sourceType: 'local_file',
            authorName: parsed.authorName || `Tệp JSON (${file.name})`,
            updatedAt: new Date().toISOString(),
            theoryItems: parsed.theoryItems,
            exampleItems: Array.isArray(parsed.exampleItems) ? parsed.exampleItems : [],
            exerciseItems: Array.isArray(parsed.exerciseItems) ? parsed.exerciseItems : [],
          };
          setActiveLesson(customRecord);
          showNotice(`Đã nạp bài giảng cấu trúc JSON: "${customRecord.title}"`);
          return;
        }

        // Also support loading a question-bank JSON as exercises in the lesson
        const questionsArray = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.questions)
            ? parsed.questions
            : [];
        if (questionsArray.length > 0) {
          const exercises: LessonExerciseItem[] = questionsArray
            .slice(0, 12)
            .map((q: Partial<BankQuestion>, idx: number) => ({
              id: q.id || `json-q-${idx + 1}`,
              code: `Câu ${idx + 1}`,
              levelBadge: q.level || 'Vận dụng',
              stem: q.stem || 'Nội dung câu hỏi',
              options: Array.isArray(q.options)
                ? q.options.map((opt) => stripMcqOptionPrefix(opt))
                : undefined,
              answer:
                q.answer ||
                (typeof q.correctIndex === 'number'
                  ? (['A', 'B', 'C', 'D'][q.correctIndex] ?? 'A')
                  : 'Xem lời giải'),
              solutionSteps:
                Array.isArray(q.solutionSteps) && q.solutionSteps.length > 0
                  ? normalizeSolutionSteps(q.solutionSteps).map((s) => `${s.label} ${s.body}`)
                  : ['Giải trực tiếp trên Bảng trắng tương tác.'],
            }));
          const base = buildDynamicCurriculumLesson(
            lessonGrade,
            activeChapter.id,
            activeChapter.title,
            selectedLessonTitle
          );
          const nextLesson: SharedLessonRecord = {
            ...base,
            id: `json-pack-${Date.now()}`,
            title: `${file.name.replace(/\.json$/i, '')} (${exercises.length} bài tập)`,
            sourceType: 'local_file',
            exerciseItems: exercises,
          };
          setActiveLesson(nextLesson);
          showNotice(`Đã nạp ${exercises.length} bài tập từ tệp "${file.name}" vào Bài giảng!`);
          return;
        }
      }

      if (lower.endsWith('.docx')) {
        const record = await parseDocxToLessonRecord(
          file,
          lessonGrade,
          activeChapter.id,
          activeChapter.title
        );
        setActiveLesson(record);
        showNotice(`Đã đọc và tách 3 phần sư phạm từ tệp Word "${file.name}"!`);
        return;
      }

      if (lower.endsWith('.pdf')) {
        const pdfUrl = URL.createObjectURL(file);
        const base = buildDynamicCurriculumLesson(
          lessonGrade,
          activeChapter.id,
          activeChapter.title,
          selectedLessonTitle
        );
        const pdfLesson: SharedLessonRecord = {
          ...base,
          id: `local-pdf-${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ''),
          sourceType: 'local_file',
          authorName: `Tệp PDF (${file.name})`,
          localPdfUrl: pdfUrl,
        };
        setActiveLesson(pdfLesson);
        showNotice(`Đã mở trực tiếp tệp PDF "${file.name}" trên mặt bảng tương tác!`);
        return;
      }

      showNotice('Vui lòng chọn tệp có định dạng .docx, .pdf hoặc .json.');
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Không thể đọc tệp đã chọn. Vui lòng kiểm tra lại.'
      );
    }
  };

  // Source #3: Import from Google Drive share link
  const handleImportGoogleDriveLink = () => {
    const raw = driveUrlInput.trim();
    if (!raw) {
      showNotice('Vui lòng dán đường link chia sẻ từ Google Drive.');
      return;
    }

    // Extract Google Drive file ID or Google Docs ID
    const fileMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const docMatch = raw.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    const presentationMatch = raw.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    const idParamMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    let embedUrl = raw;
    let docLabel = 'Bài giảng từ Google Drive';

    if (fileMatch?.[1]) {
      embedUrl = `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      docLabel = `Tài liệu Google Drive (#${fileMatch[1].slice(0, 6)})`;
    } else if (docMatch?.[1]) {
      embedUrl = `https://docs.google.com/document/d/${docMatch[1]}/preview`;
      docLabel = `Giáo án Google Docs (#${docMatch[1].slice(0, 6)})`;
    } else if (presentationMatch?.[1]) {
      embedUrl = `https://docs.google.com/presentation/d/${presentationMatch[1]}/embed?start=false&loop=false`;
      docLabel = `Bài trình chiếu Google Slides (#${presentationMatch[1].slice(0, 6)})`;
    } else if (idParamMatch?.[1]) {
      embedUrl = `https://drive.google.com/file/d/${idParamMatch[1]}/preview`;
      docLabel = `Tài liệu Google Drive (#${idParamMatch[1].slice(0, 6)})`;
    }

    const base = buildDynamicCurriculumLesson(
      lessonGrade,
      activeChapter.id,
      activeChapter.title,
      selectedLessonTitle
    );

    const driveLesson: SharedLessonRecord = {
      ...base,
      id: `gdrive-${Date.now()}`,
      title: `${docLabel} — ${selectedLessonTitle}`,
      sourceType: 'google_drive',
      authorName: 'Liên kết Google Drive',
      driveEmbedUrl: embedUrl,
    };

    setActiveLesson(driveLesson);
    showNotice('Đã nạp và hiển thị trực tiếp bài giảng từ Google Drive lên bảng tương tác!');
  };

  // Push any Theory card, Example, or Exercise directly to Smartboard Canvas (Tool #1)
  const handleSendExampleToSmartboard = (example: LessonExampleItem) => {
    const q = convertExampleToBankQuestion(example, activeLesson);
    setPendingIncomingWidget({
      id: `${Date.now()}`,
      title: `${example.title} (${activeLesson.title})`,
      question: q,
    });
    onSelectModule?.('teaching_smartboard');
  };

  const handleSendExerciseToSmartboard = (exercise: LessonExerciseItem) => {
    const q = convertExerciseToBankQuestion(exercise, activeLesson);
    setPendingIncomingWidget({
      id: `${Date.now()}`,
      title: `${exercise.code} — ${activeLesson.title}`,
      question: q,
    });
    onSelectModule?.('teaching_smartboard');
  };

  const handleSendTheoryToSmartboard = (theory: LessonTheoryCard) => {
    const q: BankQuestion = {
      id: `lesson-th-${theory.id}-${Date.now()}`,
      partType: 'part3',
      tag: `[${activeLesson.grade}-${activeLesson.chapterId.toUpperCase()}-NB]`,
      grade: activeLesson.grade,
      chapter: activeLesson.chapterTitle,
      lesson: activeLesson.lessonTitle,
      level: 'NB',
      stem: theory.points.map((pt, i) => `(${i + 1}) ${pt}`).join('\n'),
      solutionSteps: theory.points.map((pt, idx) => ({
        title: `Ý ${idx + 1}:`,
        leadIn: '',
        math: pt,
      })),
      source: `Lý thuyết: ${activeLesson.title}`,
      updatedAt: new Date().toISOString(),
    };
    setPendingIncomingWidget({
      id: `${Date.now()}`,
      title: `${theory.title}`,
      question: q,
    });
    onSelectModule?.('teaching_smartboard');
  };

  return (
    <div className="space-y-2.5">
      {/* 1. Bảng Trắng Tương Tác Thông Minh (Smartboard Canvas - 95% diện tích hiển thị) */}
      {activeTab === 'smartboard' && (
        <SmartboardCanvasStudio
          bankItems={effectiveBankItems}
          schoolName={schoolName}
          teacherName={teacherName}
          onOpenJsonBankLoader={onOpenJsonBankLoader}
          onPublishToStudentNotebook={isOwnerAdmin ? onPublishToStudentNotebook : undefined}
          availableClasses={availableClasses}
          activeClassName={activeClassName}
          pendingIncomingWidget={pendingIncomingWidget}
          onClearPendingIncomingWidget={() => setPendingIncomingWidget(null)}
          isOwnerAdmin={isOwnerAdmin}
        />
      )}

      {/* 2. Khảo sát & Vẽ đồ thị hàm số */}
      {activeTab === 'function_plot' && (
        <ToolErrorBoundary toolName="Công cụ Khảo sát & Vẽ đồ thị Hàm số">
          <FunctionInvestigationPanel />
        </ToolErrorBoundary>
      )}

      {/* 3. Không gian Hình học 3D động (Đã xóa bỏ khung vẽ 2D/3D Xuất Word & PNG trùng lặp) */}
      {activeTab === 'geometry_3d' && (
        <ToolErrorBoundary toolName="Phòng thí nghiệm Hình học Không gian 3D">
          <ThreeSpatialAndGameLab
            onSendToSmartboard={(payload) => {
              setPendingIncomingWidget({
                id: `${Date.now()}`,
                ...payload,
              });
              onSelectModule?.('teaching_smartboard');
            }}
          />
        </ToolErrorBoundary>
      )}

      {/* 5. Bài giảng (Liên thông trực tiếp với App Chính · Tải file Máy tính · Google Drive) */}
      {(activeTab === 'slides' || activeTab === 'realworld') && (
        <div className="space-y-3">
          {/* Thanh chọn 3 Nguồn Bài giảng linh hoạt */}
          <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#E2E8F0] pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#136F63] text-white shadow-2xs">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[14.5px] font-bold text-[#0F172A] dark:text-white">
                    5. Bài giảng — Liên thông Trực tiếp với App Chính (TeachLearn Edu)
                  </h2>
                  <p className="text-[11.5px] text-[#64748B] dark:text-slate-400">
                    {cloudSyncStatus}
                  </p>
                </div>
              </div>

              {/* 4 Nguồn Bài giảng Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSourceMode('cloud_app')}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-all ${tactile3dClass(
                    sourceMode === 'cloud_app'
                  )}`}
                >
                  <Cloud className="h-4 w-4" />
                  <span>1. Bài giảng từ App Chính (Cloud Sync)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceMode('local_file')}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-all ${tactile3dClass(
                    sourceMode === 'local_file'
                  )}`}
                >
                  <FolderUp className="h-4 w-4" />
                  <span>2. Tải file từ Máy tính (.docx, .pdf, .json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceMode('google_drive')}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-all ${tactile3dClass(
                    sourceMode === 'google_drive'
                  )}`}
                >
                  <Link2 className="h-4 w-4" />
                  <span>3. Nhập từ Google Drive</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceMode('ai_direct')}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-all ${tactile3dClass(
                    sourceMode === 'ai_direct'
                  )}`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>4. AI Soạn giảng Trực tiếp</span>
                </button>
              </div>
            </div>

            {/* Nội dung chi tiết của từng Nguồn Bài giảng */}
            {sourceMode === 'cloud_app' && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
                  {/* Lọc theo Khối 10, 11, 12 */}
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Lọc theo Khối lớp
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['10', '11', '12'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => handleSelectGrade(g)}
                          className={`min-h-[38px] rounded-[8px] text-[12.5px] font-semibold transition-all ${tactile3dClass(
                            lessonGrade === g
                              )}`}
                        >
                          Khối {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lọc theo Chương */}
                  <div className="md:col-span-4">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Chương SGK Kết nối tri thức
                    </label>
                    <select
                      value={activeChapter.id}
                      onChange={(e) => handleSelectChapter(e.target.value)}
                      className="min-h-[38px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {gradeChapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Chọn Bài học */}
                  <div className="md:col-span-5">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Chạm chọn Bài giảng để tải ngay nội dung trình chiếu
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={selectedLessonTitle}
                        onChange={(e) => handleSelectCurriculumLesson(e.target.value)}
                        className="min-h-[38px] flex-1 rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {activeChapter.lessons.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>

                      {isOwnerAdmin ? (
                        <button
                          type="button"
                          onClick={handleSyncActiveLessonToFirestore}
                          disabled={isSyncingCloud}
                          title="Lưu & Đồng bộ bài giảng này lên bộ sưu tập lessons trên Cloud Firestore (Dành riêng cho Quản trị viên)"
                          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-[8px] border border-[#136F63] bg-emerald-50/80 px-3 py-1.5 text-[12px] font-semibold text-[#136F63] transition-colors hover:bg-[#136F63] hover:text-white disabled:opacity-50 dark:bg-emerald-950/50 dark:text-emerald-300"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                          <span>Đồng bộ Cloud</span>
                        </button>
                      ) : (
                        <span
                          title="Chế độ Chỉ Xem & Giảng dạy (Read-Only): Không ghi đè dữ liệu bài giảng gốc trên Cloud Firestore"
                          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11.5px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        >
                          <span>Chỉ Xem &amp; Trình chiếu</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Danh sách Bài giảng Cloud đã soạn sẵn của Khối đang chọn */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[12px] font-semibold text-[#475569] dark:text-slate-300">
                    Bài giảng Cloud Khối {lessonGrade} đã chia sẻ:
                  </span>
                  {filteredCloudLessons.map((item) => {
                    const isSelected = activeLesson.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveLesson(item);
                          setChapterId(item.chapterId);
                          setSelectedLessonTitle(item.lessonTitle);
                          showNotice(`Đã tải bài giảng "${item.title}" từ Cloud Sync!`);
                        }}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                          isSelected
                            ? 'border-[#136F63] bg-[#136F63] text-white shadow-2xs'
                            : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[260px] truncate">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sourceMode === 'local_file' && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-[#136F63]/50 bg-emerald-50/40 p-3.5 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#136F63] text-white">
                    <FolderUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-bold text-[#0F172A] dark:text-white">
                      Chọn tệp giáo án từ Máy tính hoặc USB (.docx, .pdf, .json)
                    </div>
                    <div className="text-[12px] text-[#475569] dark:text-slate-300">
                      Hệ thống tự động bóc tách thành 3 phần: I. Lý thuyết trọng tâm · II. Ví dụ minh họa · III. Bài tập vận dụng (hoặc trình chiếu PDF trực tiếp).
                    </div>
                  </div>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.json,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleLocalFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-glossy-3d-active inline-flex min-h-[42px] items-center gap-2 rounded-[8px] px-4 py-2 text-[13px] font-semibold"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Chọn tệp Giáo án (.docx / .pdf / .json)</span>
                  </button>
                </div>
              </div>
            )}

            {sourceMode === 'google_drive' && (
              <div className="mt-3 flex flex-col gap-2.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] p-3 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-800/60">
                <div className="flex flex-1 items-center overflow-hidden rounded-[8px] border border-[#CBD5E1] bg-white focus-within:border-[#136F63] dark:border-slate-700 dark:bg-slate-900">
                  <span className="border-r border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-[12.5px] font-semibold text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300">
                    Google Drive URL
                  </span>
                  <input
                    type="url"
                    value={driveUrlInput}
                    onChange={(e) => setDriveUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleImportGoogleDriveLink();
                    }}
                    placeholder="Dán đường link chia sẻ Google Drive / Google Docs / Google Slides..."
                    className="min-h-[40px] w-full bg-transparent px-3 py-1.5 text-[13px] text-[#0F172A] focus:outline-none dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleImportGoogleDriveLink}
                  className="btn-glossy-3d-active inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-[8px] px-4 py-2 text-[13px] font-semibold"
                >
                  <Link2 className="h-4 w-4" />
                  <span>Nạp lên Bảng tương tác</span>
                </button>
              </div>
            )}

            {sourceMode === 'ai_direct' && (
              <div className="mt-3 space-y-3 rounded-[8px] border border-[#136F63]/35 bg-emerald-50/35 p-3.5 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
                  {/* Khối lớp */}
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Khối lớp SGK KNTT
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['10', '11', '12'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => handleSelectGrade(g)}
                          disabled={
                            aiGenStatus === 'checking' ||
                            aiGenStatus === 'loading' ||
                            aiGenStatus === 'retrying'
                          }
                          className={`min-h-[38px] rounded-[8px] text-[12.5px] font-semibold transition-all disabled:opacity-60 ${tactile3dClass(
                            lessonGrade === g
                          )}`}
                        >
                          Khối {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chương */}
                  <div className="md:col-span-4">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Chương trình chuẩn
                    </label>
                    <select
                      value={activeChapter.id}
                      onChange={(e) => handleSelectChapter(e.target.value)}
                      disabled={
                        aiGenStatus === 'checking' ||
                        aiGenStatus === 'loading' ||
                        aiGenStatus === 'retrying'
                      }
                      className="min-h-[38px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {gradeChapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bài học */}
                  <div className="md:col-span-5">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Tên Bài học cần AI soạn giảng trực tiếp
                    </label>
                    <select
                      value={selectedLessonTitle}
                      onChange={(e) => setSelectedLessonTitle(e.target.value)}
                      disabled={
                        aiGenStatus === 'checking' ||
                        aiGenStatus === 'loading' ||
                        aiGenStatus === 'retrying'
                      }
                      className="min-h-[38px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {activeChapter.lessons.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Yêu cầu trọng tâm & Số lượng Ví dụ / Bài tập + Nút Soạn giảng */}
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-6">
                    <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                      Yêu cầu trọng tâm thêm (tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={aiFocusNote}
                      onChange={(e) => setAiFocusNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && aiGenStatus !== 'loading' && aiGenStatus !== 'retrying') {
                          void handleGenerateAiDirectLesson();
                        }
                      }}
                      disabled={
                        aiGenStatus === 'checking' ||
                        aiGenStatus === 'loading' ||
                        aiGenStatus === 'retrying'
                      }
                      placeholder="VD: Bổ sung bài toán tối ưu thực tế, phân hóa mức Thông hiểu – Vận dụng..."
                      className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] text-[#0F172A] focus:border-[#136F63] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:col-span-3">
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                        Số Ví dụ
                      </label>
                      <select
                        value={aiExampleCount}
                        onChange={(e) => setAiExampleCount(Number(e.target.value))}
                        disabled={
                          aiGenStatus === 'checking' ||
                          aiGenStatus === 'loading' ||
                          aiGenStatus === 'retrying'
                        }
                        className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value={2}>2 Ví dụ</option>
                        <option value={3}>3 Ví dụ</option>
                        <option value={4}>4 Ví dụ</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-300">
                        Số Bài tập
                      </label>
                      <select
                        value={aiExerciseCount}
                        onChange={(e) => setAiExerciseCount(Number(e.target.value))}
                        disabled={
                          aiGenStatus === 'checking' ||
                          aiGenStatus === 'loading' ||
                          aiGenStatus === 'retrying'
                        }
                        className="min-h-[40px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value={3}>3 Bài tập</option>
                        <option value={4}>4 Bài tập</option>
                        <option value={5}>5 Bài tập</option>
                        <option value={6}>6 Bài tập</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={() => void handleGenerateAiDirectLesson()}
                      disabled={
                        aiGenStatus === 'checking' ||
                        aiGenStatus === 'loading' ||
                        aiGenStatus === 'retrying'
                      }
                      className="btn-glossy-3d-active inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {aiGenStatus === 'checking' ||
                      aiGenStatus === 'loading' ||
                      aiGenStatus === 'retrying' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>AI Soạn giảng ngay</span>
                    </button>
                  </div>
                </div>

                {/* Pre-flight Offline Warning Banner */}
                {!isDeviceOnline && aiGenStatus === 'idle' && (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <div className="flex items-start gap-2">
                      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                      <div>
                        <span className="font-bold">Thiết bị đang ở chế độ Ngoại tuyến (Offline): </span>
                        Thầy vui lòng kết nối Internet để dùng AI Soạn giảng Trực tiếp, hoặc mở ngay Kho bài giảng có sẵn.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSourceMode('cloud_app')}
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#0F594F]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Mở Kho bài giảng có sẵn</span>
                    </button>
                  </div>
                )}

                {/* Pre-flight Missing API Key Warning Banner */}
                {isDeviceOnline && apiKeyReady === false && aiGenStatus === 'idle' && (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
                    <div className="flex items-start gap-2">
                      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-300" />
                      <div>
                        <span className="font-bold">Chưa phát hiện Gemini API Key trên hệ thống: </span>
                        Thầy vui lòng thiết lập biến <code className="rounded bg-white/70 px-1 py-0.5 text-[12px] font-bold dark:bg-slate-900">GEMINI_API_KEY</code> trong mục <strong>Settings &gt; Secrets</strong>, hoặc mở Kho bài giảng có sẵn.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSourceMode('cloud_app')}
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[6px] bg-[#136F63] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#0F594F]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Mở Kho bài giảng có sẵn</span>
                    </button>
                  </div>
                )}

                {/* Khung chờ AI đang soạn giảng — Tích hợp nút Dừng & Thử lại ngay trên khung chờ */}
                {(aiGenStatus === 'checking' ||
                  aiGenStatus === 'loading' ||
                  aiGenStatus === 'retrying') && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#136F63] bg-white p-3.5 shadow-2xs dark:border-emerald-700 dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#136F63]/10 text-[#136F63] dark:bg-emerald-950 dark:text-emerald-300">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                      <div>
                        <div className="text-[13.5px] font-bold text-[#0F172A] dark:text-white">
                          {aiGenStatus === 'checking'
                            ? 'Đang kiểm tra kết nối mạng & trạng thái Gemini API...'
                            : aiGenStatus === 'retrying'
                              ? 'Kết nối mạng chập chờn — Đang tự động thử lại (Lần 2/2)...'
                              : `Gemini AI đang soạn giảng chuẩn 3 phần (Structured JSON Schema · Lần ${aiGenAttempt}/2)...`}
                        </div>
                        <div className="text-[12px] text-[#475569] dark:text-slate-400">
                          Đang sinh đồng bộ 3 mảng Lý thuyết · Ví dụ · Bài tập và chuẩn hóa 100% công thức KaTeX ($...$, $$...$$).
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStopAiGeneration}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-rose-300 bg-rose-50 px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                        <span>Dừng</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerateAiDirectLesson()}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[#136F63] bg-emerald-50 px-3 py-1.5 text-[12.5px] font-semibold text-[#136F63] transition-colors hover:bg-[#136F63] hover:text-white dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Khung thông báo lỗi / đã dừng có nút Thử lại & Mở kho bài giảng có sẵn */}
                {(aiGenStatus === 'error' || aiGenStatus === 'cancelled') && aiGenErrorMsg && (
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-[8px] border p-3.5 text-[13px] ${
                      aiGenStatus === 'cancelled'
                        ? 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200'
                        : aiGenErrorType === 'offline'
                          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
                          : 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {aiGenErrorType === 'offline' ? (
                        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                      ) : aiGenErrorType === 'no_api_key' ? (
                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-300" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-300" />
                      )}
                      <div className="leading-relaxed">{aiGenErrorMsg}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleGenerateAiDirectLesson()}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[#136F63] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#136F63] transition-colors hover:bg-[#136F63] hover:text-white dark:bg-slate-900 dark:text-emerald-300"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Thử lại</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAiGenStatus('idle');
                          setAiGenErrorMsg(null);
                          setSourceMode('cloud_app');
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0F594F]"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Mở Kho bài giảng có sẵn</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {statusNotice && (
              <div className="mt-2.5 flex items-center gap-2 rounded-[6px] border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-semibold text-[#136F63] dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{statusNotice}</span>
              </div>
            )}
          </div>

          {/* Khu vực hiển thị nội dung Bài giảng trên bảng tương tác (Cấu trúc 3 phần chuẩn sư phạm) */}
          <SmartboardViewport
            title={
              <span>
                Bài giảng: <MathText text={activeLesson.title} />
              </span>
            }
            subtitle={`Khối ${activeLesson.grade} · ${activeLesson.chapterTitle} · Nguồn: ${activeLesson.authorName}`}
            headerActions={
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Bộ lọc 3 Phần chuẩn sư phạm */}
                {(
                  [
                    { id: 'all', label: 'Tất cả 3 Phần' },
                    {
                      id: 'theory',
                      label: `I. Lý thuyết (${activeLesson.theoryItems.length})`,
                    },
                    {
                      id: 'examples',
                      label: `II. Ví dụ (${activeLesson.exampleItems.length})`,
                    },
                    {
                      id: 'exercises',
                      label: `III. Bài tập (${activeLesson.exerciseItems.length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSectionView(tab.id)}
                    className={`min-h-[38px] rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-all ${
                      sectionView === tab.id
                        ? 'bg-[#136F63] text-white shadow-2xs'
                        : 'border border-[#CBD5E1] bg-white text-[#334155] hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setLargeBoardFont((v) => !v)}
                  className={`min-h-[38px] rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    largeBoardFont
                      ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                      : 'border-[#CBD5E1] bg-white text-[#475569] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {largeBoardFont ? 'Chữ lớn Bảng 65–86"' : 'Chữ tiêu chuẩn'}
                </button>
              </div>
            }
            bodyClassName="p-4 sm:p-5 space-y-5 bg-[#F8FAFC] dark:bg-slate-950/60"
          >
            {/* Khung nhúng trực tiếp nếu bài giảng có tệp PDF hoặc Google Drive */}
            {(activeLesson.localPdfUrl || activeLesson.driveEmbedUrl) && (
              <div className="overflow-hidden rounded-[8px] border-2 border-[#136F63] bg-white shadow-sm dark:bg-slate-900">
                <div className="flex items-center justify-between bg-[#136F63] px-4 py-2 text-white">
                  <span className="text-[13px] font-bold">
                    {activeLesson.localPdfUrl
                      ? 'Trình chiếu trực tiếp Tệp PDF từ Máy tính'
                      : 'Trình chiếu trực tiếp Tài liệu từ Google Drive'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLesson((prev) => ({
                        ...prev,
                        localPdfUrl: undefined,
                        driveEmbedUrl: undefined,
                      }))
                    }
                    className="rounded-[6px] bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-white/25"
                  >
                    Đóng khung tài liệu đính kèm
                  </button>
                </div>
                <iframe
                  title="Tài liệu Bài giảng Trình chiếu"
                  src={activeLesson.localPdfUrl || activeLesson.driveEmbedUrl}
                  className="h-[520px] w-full border-0"
                  allow="autoplay"
                />
              </div>
            )}

            {/* PHẦN I: LÝ THUYẾT TRỌNG TÂM */}
            {(sectionView === 'all' || sectionView === 'theory') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between border-b-2 border-[#136F63] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#136F63] text-[13px] font-bold text-white">
                      I
                    </span>
                    <h3 className="text-[16px] font-bold uppercase tracking-tight text-[#136F63] dark:text-emerald-300">
                      I. Lý thuyết trọng tâm (Định nghĩa · Định lý · Công thức KaTeX)
                    </h3>
                  </div>
                  <span className="rounded-[6px] bg-emerald-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#136F63] dark:bg-emerald-950 dark:text-emerald-300">
                    {activeLesson.theoryItems.length} mục lý thuyết
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {activeLesson.theoryItems.map((th) => (
                    <div
                      key={th.id}
                      className="rounded-[8px] border border-[#CBD5E1] bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-[6px] bg-[#E0F2FE] px-2.5 py-0.5 text-[11.5px] font-bold text-[#0369A1] dark:bg-slate-800 dark:text-sky-300">
                            <MathText text={th.tag} />
                          </span>
                          <h4
                            className={`font-bold text-[#0F172A] dark:text-white ${
                              largeBoardFont ? 'text-[17px]' : 'text-[15px]'
                            }`}
                          >
                            <MathText text={th.title} />
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSendTheoryToSmartboard(th)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[6px] border border-[#136F63] bg-emerald-50/70 px-3 py-1 text-[12px] font-semibold text-[#136F63] transition-colors hover:bg-[#136F63] hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          <span>Đưa sang Bảng trắng</span>
                        </button>
                      </div>

                      <ul
                        className={`space-y-2.5 leading-relaxed text-[#1E293B] dark:text-slate-100 ${
                          largeBoardFont ? 'text-[16px]' : 'text-[14px]'
                        }`}
                      >
                        {th.points.map((pt, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-justify dark:border-slate-800 dark:bg-slate-800/50"
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#136F63] text-[12px] font-bold text-white">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <MathText text={pt} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PHẦN II: VÍ DỤ MINH HỌA (KÈM NÚT ẨN/HIỆN LỜI GIẢI TỪNG BƯỚC & ĐƯA SANG BẢNG TRẮNG) */}
            {(sectionView === 'all' || sectionView === 'examples') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between border-b-2 border-[#0369A1] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#0369A1] text-[13px] font-bold text-white">
                      II
                    </span>
                    <h3 className="text-[16px] font-bold uppercase tracking-tight text-[#0369A1] dark:text-sky-300">
                      II. Ví dụ minh họa (Ẩn / Hiện lời giải từng bước trên lớp)
                    </h3>
                  </div>
                  <span className="rounded-[6px] bg-sky-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0369A1] dark:bg-sky-950 dark:text-sky-300">
                    {activeLesson.exampleItems.length} ví dụ mẫu
                  </span>
                </div>

                <div className="space-y-3.5">
                  {activeLesson.exampleItems.map((exm, exmIdx) => {
                    const isSolutionShown = Boolean(revealedExampleMap[exm.id]);
                    const cleanExampleTitle = formatExampleTitle(
                      stripExampleTitlePrefix(exm.title),
                      exmIdx
                    );
                    const cleanConclusion = stripConclusionPrefix(exm.conclusion);
                    return (
                      <div
                        key={exm.id}
                        className="rounded-[8px] border border-[#CBD5E1] bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="rounded-[6px] bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                              {exm.levelBadge}
                            </span>
                            <h4
                              className={`font-bold text-[#0F172A] dark:text-white ${
                                largeBoardFont ? 'text-[17px]' : 'text-[15px]'
                              }`}
                            >
                              <MathText text={cleanExampleTitle} />
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedExampleMap((prev) => ({
                                  ...prev,
                                  [exm.id]: !prev[exm.id],
                                }))
                              }
                              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                                isSolutionShown
                                  ? 'border-amber-600 bg-amber-600 text-white'
                                  : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] hover:border-[#0369A1] hover:text-[#0369A1] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {isSolutionShown ? (
                                <>
                                  <EyeOff className="h-4 w-4" />
                                  <span>Ẩn lời giải từng bước</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4" />
                                  <span>Hiện lời giải từng bước</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendExampleToSmartboard(exm)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F]"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>Đưa sang Bảng trắng</span>
                            </button>
                          </div>
                        </div>

                        {/* Đề bài ví dụ (Canh lề justify) */}
                        <div
                          className={`mt-3 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-justify leading-relaxed text-[#0F172A] dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-100 ${
                            largeBoardFont ? 'text-[16.5px]' : 'text-[14.5px]'
                          }`}
                        >
                          <span className="mr-1.5 font-bold text-[#0369A1] dark:text-sky-300">
                            Đề bài:
                          </span>
                          <MathText
                            text={stripDuplicateHeadingFromStem(exm.problem, cleanExampleTitle)}
                          />
                        </div>

                        {/* Lời giải từng bước (ngắt xuống dòng sau câu dẫn) */}
                        {isSolutionShown && (
                          <div className="mt-3 space-y-2.5 rounded-[8px] border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                            <div className="text-[13px] font-bold uppercase tracking-wide text-[#136F63] dark:text-emerald-300">
                              LỜI GIẢI CHI TIẾT TỪNG BƯỚC
                            </div>
                            {normalizeSolutionSteps(exm.steps).map((st, idx) => (
                              <div
                                key={idx}
                                className={`rounded-[6px] border border-white bg-white p-3 text-justify leading-relaxed text-[#1E293B] shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 ${
                                  largeBoardFont ? 'text-[16px]' : 'text-[14px]'
                                }`}
                              >
                                <span className="font-bold text-[#136F63] dark:text-emerald-300">
                                  {st.label}
                                </span>{' '}
                                <MathText text={st.body} />
                              </div>
                            ))}
                            {cleanConclusion && (
                              <div
                                className={`rounded-[6px] border border-rose-200 bg-rose-50/80 px-3.5 py-2 font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 ${
                                  largeBoardFont ? 'text-[16px]' : 'text-[14px]'
                                }`}
                              >
                                <span className="mr-1.5">Đáp số / Kết luận:</span>
                                <MathText text={stripAnswerPrefix(cleanConclusion)} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PHẦN III: BÀI TẬP VẬN DỤNG (CÓ NÚT ĐƯA SANG BẢNG TRẮNG ĐỂ GIẢI TRỰC TIẾP) */}
            {(sectionView === 'all' || sectionView === 'exercises') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between border-b-2 border-amber-600 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-amber-600 text-[13px] font-bold text-white">
                      III
                    </span>
                    <h3 className="text-[16px] font-bold uppercase tracking-tight text-amber-800 dark:text-amber-300">
                      III. Bài tập vận dụng (Đưa nhanh sang Bảng trắng giải trực tiếp)
                    </h3>
                  </div>
                  <span className="rounded-[6px] bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    {activeLesson.exerciseItems.length} bài tập luyện tập
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {activeLesson.exerciseItems.map((exc) => {
                    const isRevealed = Boolean(revealedExerciseMap[exc.id]);
                    return (
                      <div
                        key={exc.id}
                        className="rounded-[8px] border border-[#CBD5E1] bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="rounded-[6px] bg-[#136F63] px-2.5 py-0.5 text-[12px] font-bold text-white">
                              {exc.code}
                            </span>
                            <span className="rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 text-[11.5px] font-semibold text-[#475569] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {exc.levelBadge}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedExerciseMap((prev) => ({
                                  ...prev,
                                  [exc.id]: !prev[exc.id],
                                }))
                              }
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1.5 text-[12.5px] font-semibold text-[#334155] transition-colors hover:border-[#136F63] hover:text-[#136F63] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {isRevealed ? (
                                <>
                                  <EyeOff className="h-4 w-4" />
                                  <span>Ẩn đáp án &amp; lời giải</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4" />
                                  <span>Xem đáp án &amp; lời giải</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendExerciseToSmartboard(exc)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] bg-[#136F63] px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0F594F]"
                            >
                              <PenTool className="h-3.5 w-3.5" />
                              <span>Đưa sang Bảng trắng</span>
                            </button>
                          </div>
                        </div>

                        {/* Nội dung câu hỏi canh lề justify */}
                        <div
                          className={`mt-3 text-justify leading-relaxed text-[#0F172A] dark:text-slate-100 ${
                            largeBoardFont ? 'text-[16.5px]' : 'text-[14.5px]'
                          }`}
                        >
                          <MathText text={exc.stem} />
                        </div>

                        {/* Phương án trắc nghiệm nếu có */}
                        {exc.options && (
                          <div
                            className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 ${
                              largeBoardFont ? 'text-[15.5px]' : 'text-[13.5px]'
                            }`}
                          >
                            {exc.options.map((opt, idx) => {
                              const { letter, text: cleanOpt } = formatMcqOptionDisplay(opt, idx);
                              return (
                                <div
                                  key={idx}
                                  className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 font-medium text-[#1E293B] dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                                >
                                  <span className="mr-1.5 font-bold text-[#136F63] dark:text-emerald-300">
                                    {letter}.
                                  </span>
                                  <MathText text={cleanOpt} />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Lời giải từng bước -> Đáp số / Kết luận đặt cuối cùng */}
                        {isRevealed && (
                          <div className="mt-3 space-y-2 rounded-[8px] border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                            <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#136F63] dark:text-emerald-300">
                              <ListChecks className="h-4 w-4" />
                              <span>LỜI GIẢI CHI TIẾT</span>
                            </div>
                            <div
                              className={`space-y-1.5 text-justify leading-relaxed text-[#1E293B] dark:text-slate-200 ${
                                largeBoardFont ? 'text-[15.5px]' : 'text-[13.5px]'
                              }`}
                            >
                              {normalizeSolutionSteps(exc.solutionSteps).map((step, sIdx) => (
                                <div key={sIdx} className="rounded-[6px] bg-white p-2.5 dark:bg-slate-900">
                                  <span className="font-bold text-[#136F63] dark:text-emerald-300">
                                    {step.label}
                                  </span>{' '}
                                  <MathText text={step.body} />
                                </div>
                              ))}
                            </div>
                            {exc.answer && (
                              <div
                                className={`rounded-[6px] border border-rose-200 bg-rose-50/80 px-3.5 py-2 font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 ${
                                  largeBoardFont ? 'text-[15.5px]' : 'text-[13.5px]'
                                }`}
                              >
                                <span className="mr-1.5">Đáp số / Kết luận:</span>
                                <MathText text={stripAnswerPrefix(exc.answer)} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </SmartboardViewport>
        </div>
      )}
    </div>
  );
};
