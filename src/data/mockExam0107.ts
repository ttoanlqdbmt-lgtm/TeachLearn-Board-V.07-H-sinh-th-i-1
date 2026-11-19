import { ExamPaper } from '../types/eduplan';
import { KNTT_MATH_CURRICULUM } from './curriculumKNTT';

export const MOCK_EXAM_0107: ExamPaper = {
  id: 'exam-0107-ck1-2027',
  department: 'SỞ GD&ĐT ĐẮK LẮK',
  schoolName: 'TRƯỜNG THPT LÊ QUÝ ĐÔN',
  author: 'Biên soạn: Thầy giáo Lê Trọng Toàn',
  sourceRepo: 'Kho nguồn: Tài liệu toán 2026',
  examTitle: 'ĐỀ KIỂM TRA CHƯƠNG I — TOÁN 12',
  subject: 'Toán',
  durationMinutes: 90,
  examCode: '0107',
  grade: '12',
  part1: [
    {
      id: 'p1_1',
      number: 1,
      tag: '[12-C1-B1-NB]',
      stem: 'Cho hàm số $y = f(x)$ có bảng biến thiên như hình vẽ dưới đây. Hàm số đã cho nghịch biến trên khoảng nào sau đây?',
      options: [
        '$(1; 3)$.',
        '$(-\\infty; 1)$.',
        '$(3; +\\infty)$.',
        '$(1; 5)$.',
      ],
      correctIndex: 0, // A
      diagram: 'bbt_cubic',
      solutionSteps: [
        {
          title: 'Bước 1: Quan sát dấu của đạo hàm trên bảng biến thiên',
          leadIn: "Dựa vào bảng biến thiên, xét dấu của $f'(x)$:",
          math: "Ta thấy $f'(x) < 0$ với mọi $x \\in (1; 3)$ và mũi tên của $f(x)$ đi xuống từ $5$ về $1$.",
        },
        {
          title: 'Bước 2: Kết luận khoảng nghịch biến',
          leadIn: 'Theo định lý về tính đơn điệu của hàm số:',
          math: 'Hàm số đã cho nghịch biến trên khoảng $(1; 3)$.',
        },
      ],
    },
    {
      id: 'p1_2',
      number: 2,
      tag: '[12-C1-B1-NB]',
      stem: 'Điểm cực đại của đồ thị hàm số $y = x^3 - 3x + 2$ có tọa độ là',
      options: ['$(1; 0)$.', '$(-1; 4)$.', '$(0; 2)$.', '$(4; -1)$.'],
      correctIndex: 1, // B
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm và giải phương trình tìm điểm tới hạn',
          leadIn: 'Ta có tập xác định $D = \\mathbb{R}$ và đạo hàm:',
          math: "$y' = 3x^2 - 3 = 0 \\Leftrightarrow x = 1$ hoặc $x = -1$.",
        },
        {
          title: 'Bước 2: Xác định điểm cực đại của đồ thị hàm số',
          leadIn: "Tính đạo hàm cấp hai $y'' = 6x$ để phân loại cực trị:",
          math: "Vì $y''(-1) = -6 < 0$ nên $x_{\\text{CĐ}} = -1$ và $y_{\\text{CĐ}} = (-1)^3 - 3(-1) + 2 = 4$. Vậy điểm cực đại của đồ thị là $(-1; 4)$.",
        },
      ],
    },
    {
      id: 'p1_3',
      number: 3,
      tag: '[12-C1-B2-NB]',
      stem: 'Giá trị lớn nhất của hàm số $f(x) = x^3 - 3x^2 - 9x + 1$ trên đoạn $[0; 4]$ bằng',
      options: ['$-26$.', '$-19$.', '$5$.', '$1$.'],
      correctIndex: 3, // D
      solutionSteps: [
        {
          title: 'Bước 1: Tìm các điểm tới hạn trên đoạn [0; 4]',
          leadIn: "Tính đạo hàm $f'(x)$ và giải phương trình $f'(x) = 0$:",
          math: "$f'(x) = 3x^2 - 6x - 9 = 0 \\Leftrightarrow x = 3 \\in [0; 4]$ (loại $x = -1 \\notin [0; 4]$).",
        },
        {
          title: 'Bước 2: So sánh giá trị hàm số tại các điểm đầu mút và điểm tới hạn',
          leadIn: 'Tính các giá trị của $f(x)$:',
          math: '$f(0) = 1$; $f(3) = -26$; $f(4) = -19$. Vậy $\\max\\limits_{[0; 4]} f(x) = f(0) = 1$.',
        },
      ],
    },
    {
      id: 'p1_4',
      number: 4,
      tag: '[12-C1-B3-NB]',
      stem: 'Cho hàm số $y = \\dfrac{ax + b}{cx + d}$ ($c \\ne 0, ad - bc \\ne 0$) có bảng biến thiên như hình vẽ dưới đây. Đường tiệm cận đứng và đường tiệm cận ngang của đồ thị hàm số đã cho có phương trình lần lượt là',
      options: [
        '$x = 2$ và $y = 1$.',
        '$x = -1$ và $y = 2$.',
        '$x = 1$ và $y = 2$.',
        '$x = 1$ và $y = -2$.',
      ],
      correctIndex: 2, // C
      diagram: 'bbt_rational',
      solutionSteps: [
        {
          title: 'Bước 1: Xác định đường tiệm cận đứng từ bảng biến thiên',
          leadIn: 'Xét giới hạn một bên của hàm số tại $x = 1$:',
          math: '$\\lim\\limits_{x \\to 1^-} y = -\\infty$ và $\\lim\\limits_{x \\to 1^+} y = +\\infty$ nên đường thẳng $x = 1$ là tiệm cận đứng.',
        },
        {
          title: 'Bước 2: Xác định đường tiệm cận ngang từ bảng biến thiên',
          leadIn: 'Xét giới hạn của hàm số khi $x \\to \\pm\\infty$:',
          math: '$\\lim\\limits_{x \\to -\\infty} y = 2$ và $\\lim\\limits_{x \\to +\\infty} y = 2$ nên đường thẳng $y = 2$ là tiệm cận ngang.',
        },
      ],
    },
    {
      id: 'p1_5',
      number: 5,
      tag: '[12-C1-B3-TH]',
      stem: 'Đường tiệm cận xiên của đồ thị hàm số $y = \\dfrac{x^2 + 2x - 3}{x + 1}$ có phương trình là',
      options: ['$y = x + 1$.', '$y = x - 1$.', '$y = x + 2$.', '$y = 2x + 1$.'],
      correctIndex: 0, // A
      solutionSteps: [
        {
          title: 'Bước 1: Chia đa thức tử cho mẫu thức',
          leadIn: 'Biến đổi biểu thức hàm số về dạng phần nguyên cộng phân thức tối giản:',
          math: '$y = \\dfrac{(x + 1)^2 - 4}{x + 1} = x + 1 - \\dfrac{4}{x + 1}$.',
        },
        {
          title: 'Bước 2: Xét giới hạn khi x tiến ra vô cực',
          leadIn: 'Ta tính hiệu giữa $y$ và $x + 1$:',
          math: '$\\lim\\limits_{x \\to \\pm\\infty} [y - (x + 1)] = \\lim\\limits_{x \\to \\pm\\infty} \\dfrac{-4}{x + 1} = 0$. Vậy đường tiệm cận xiên là $y = x + 1$.',
        },
      ],
    },
    {
      id: 'p1_6',
      number: 6,
      tag: '[12-C1-B4-NB]',
      stem: 'Tâm đối xứng của đồ thị hàm số bậc ba $y = x^3 - 3x^2 + 4$ là điểm nào sau đây?',
      options: ['$I(-1; 0)$.', '$I(1; 2)$.', '$I(2; 0)$.', '$I(1; -2)$.'],
      correctIndex: 1, // B
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm cấp một và đạo hàm cấp hai',
          leadIn: 'Ta lần lượt lấy đạo hàm của hàm số đã cho:',
          math: "$y' = 3x^2 - 6x$ và $y'' = 6x - 6$.",
        },
        {
          title: 'Bước 2: Tìm hoành độ và tung độ điểm uốn',
          leadIn: "Giải phương trình $y'' = 0$ để tìm hoành độ tâm đối xứng:",
          math: '$6x - 6 = 0 \\Leftrightarrow x = 1 \\Rightarrow y(1) = 1^3 - 3\\cdot 1^2 + 4 = 2$. Vậy tâm đối xứng là $I(1; 2)$.',
        },
      ],
    },
    {
      id: 'p1_7',
      number: 7,
      tag: '[12-C1-B1-TH]',
      stem: 'Số điểm cực trị của hàm số $y = \\dfrac{x^2 - 2x + 5}{x - 1}$ là',
      options: ['$0$.', '$1$.', '$2$.', '$3$.'],
      correctIndex: 2, // C
      solutionSteps: [
        {
          title: 'Bước 1: Tìm tập xác định và tính đạo hàm',
          leadIn: 'Tập xác định $D = \\mathbb{R} \\setminus \\{1\\}$. Tách hàm số để tính đạo hàm:',
          math: "$y = x - 1 + \\dfrac{4}{x - 1} \\Rightarrow y' = 1 - \\dfrac{4}{(x - 1)^2}$.",
        },
        {
          title: 'Bước 2: Giải phương trình đạo hàm bằng 0',
          leadIn: "Xét phương trình $y' = 0$ trên $D$:",
          math: "$(x - 1)^2 = 4 \\Leftrightarrow x = 3$ hoặc $x = -1$. Vì $y'$ đổi dấu qua hai nghiệm đơn này nên hàm số có $2$ điểm cực trị.",
        },
      ],
    },
    {
      id: 'p1_8',
      number: 8,
      tag: '[12-C1-B2-TH]',
      stem: 'Giá trị nhỏ nhất của hàm số $y = x + \\dfrac{9}{x}$ trên khoảng $(0; +\\infty)$ bằng',
      options: ['$3$.', '$9$.', '$12$.', '$6$.'],
      correctIndex: 3, // D
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm và tìm điểm tới hạn trên (0; +∞)',
          leadIn: "Tính đạo hàm $y'$ với $x > 0$:",
          math: "$y' = 1 - \\dfrac{9}{x^2} = 0 \\Leftrightarrow x^2 = 9 \\Leftrightarrow x = 3$ (do $x > 0$).",
        },
        {
          title: 'Bước 2: Lập luận tìm giá trị nhỏ nhất',
          leadIn: "Vì $y'$ đổi dấu từ âm sang dương khi đi qua $x = 3$ trên $(0; +\\infty)$:",
          math: '$\\min\\limits_{(0; +\\infty)} y = y(3) = 3 + \\dfrac{9}{3} = 6$.',
        },
      ],
    },
    {
      id: 'p1_9',
      number: 9,
      tag: '[12-C1-B4-TH]',
      stem: 'Đồ thị hàm số $y = \\dfrac{2x - 1}{x + 1}$ cắt trục tung và trục hoành lần lượt tại hai điểm $A$ và $B$. Diện tích tam giác $OAB$ (với $O$ là gốc tọa độ) bằng',
      options: ['$\\dfrac{1}{2}$.', '$\\dfrac{1}{4}$.', '$1$.', '$2$.'],
      correctIndex: 1, // B
      solutionSteps: [
        {
          title: 'Bước 1: Tìm tọa độ giao điểm A và B với hai trục tọa độ',
          leadIn: 'Lần lượt cho $x = 0$ và $y = 0$:',
          math: 'Giao điểm với $Oy$: $x = 0 \\Rightarrow y = -1 \\Rightarrow A(0; -1)$, suy ra $OA = 1$. Giao điểm với $Ox$: $y = 0 \\Rightarrow x = \\dfrac{1}{2} \\Rightarrow B\\left(\\dfrac{1}{2}; 0\\right)$, suy ra $OB = \\dfrac{1}{2}$.',
        },
        {
          title: 'Bước 2: Tính diện tích tam giác vuông OAB',
          leadIn: 'Vì tam giác $OAB$ vuông tại $O$:',
          math: '$S_{\\triangle OAB} = \\dfrac{1}{2} OA \\cdot OB = \\dfrac{1}{2} \\cdot 1 \\cdot \\dfrac{1}{2} = \\dfrac{1}{4}$.',
        },
      ],
    },
    {
      id: 'p1_10',
      number: 10,
      tag: '[12-C1-B1-VD]',
      stem: 'Có bao nhiêu giá trị nguyên của tham số $m \\in [-10; 10]$ để hàm số $y = x^3 - 3x^2 + mx + 5$ đồng biến trên $\\mathbb{R}$?',
      options: ['$7$.', '$9$.', '$8$.', '$10$.'],
      correctIndex: 2, // C
      solutionSteps: [
        {
          title: 'Bước 1: Thiết lập điều kiện đồng biến trên R của hàm bậc ba',
          leadIn: "Tính đạo hàm $y'$ và đặt điều kiện không âm trên $\\mathbb{R}$:",
          math: "$y' = 3x^2 - 6x + m \\ge 0,\\ \\forall x \\in \\mathbb{R} \\Leftrightarrow \\Delta' = (-3)^2 - 3m \\le 0 \\Leftrightarrow 9 - 3m \\le 0 \\Leftrightarrow m \\ge 3$.",
        },
        {
          title: 'Bước 2: Đếm số giá trị nguyên của m trong đoạn [-10; 10]',
          leadIn: 'Kết hợp điều kiện $m \\in \\mathbb{Z}$ và $m \\in [-10; 10]$:',
          math: '$m \\in \\{3; 4; 5; 6; 7; 8; 9; 10\\}$, có tất cả $8$ giá trị nguyên thỏa mãn.',
        },
      ],
    },
    {
      id: 'p1_11',
      number: 11,
      tag: '[12-C1-B5-VD]',
      stem: 'Một chất điểm chuyển động thẳng theo phương trình $s(t) = -t^3 + 6t^2 + 9t$ (trong đó $t \\ge 0$ tính bằng giây, $s$ tính bằng mét). Vận tốc tức thời của chất điểm đạt giá trị lớn nhất tại thời điểm $t$ bằng bao nhiêu giây?',
      options: ['$2\\text{ s}$.', '$3\\text{ s}$.', '$4\\text{ s}$.', '$1\\text{ s}$.'],
      correctIndex: 0, // A
      solutionSteps: [
        {
          title: 'Bước 1: Xác định hàm vận tốc tức thời v(t)',
          leadIn: 'Vận tốc tức thời là đạo hàm của quãng đường theo thời gian:',
          math: "$v(t) = s'(t) = -3t^2 + 12t + 9$ với $t \\ge 0$.",
        },
        {
          title: 'Bước 2: Tìm thời điểm vận tốc đạt cực đại',
          leadIn: "Tính đạo hàm $v'(t)$ và giải phương trình $v'(t) = 0$:",
          math: "$v'(t) = -6t + 12 = 0 \\Leftrightarrow t = 2\\text{ s}$. Vì $v''(2) = -6 < 0$ nên vận tốc đạt cực đại tại $t = 2\\text{ s}$.",
        },
      ],
    },
    {
      id: 'p1_12',
      number: 12,
      tag: '[12-C1-B5-TH]',
      stem: 'Khảo sát thời gian tự học $t$ (đơn vị: phút) mỗi ngày của $40$ học sinh khối 12 thu được bảng số liệu ghép nhóm dưới đây. Đặt $x = \\dfrac{t}{10} \\in [3; 13]$ là chỉ số thời gian, hiệu quả ôn tập được mô hình hóa bởi $H(x) = -x^3 + 12x^2 - 21x + 50$. Giá trị lớn nhất của $H(x)$ trên $[3; 13]$ (đạt được tại giá trị $t$ thuộc nhóm có tần số lớn nhất $[70; 90)$) bằng',
      options: ['$68$.', '$120$.', '$136$.', '$148$.'],
      correctIndex: 3, // D
      diagram: 'stat_table_12',
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm của hàm hiệu quả H(x) trên [3; 13]',
          leadIn: 'Ta tính đạo hàm $H\'(x)$ và tìm các điểm tới hạn:',
          math: "$H'(x) = -3x^2 + 24x - 21 = -3(x - 1)(x - 7) = 0 \\Leftrightarrow x = 7 \\in [3; 13]$ (loại $x = 1$).",
        },
        {
          title: 'Bước 2: Tính và so sánh giá trị để tìm GTLN',
          leadIn: 'Tính giá trị $H(x)$ tại $x = 3$, $x = 7$ (ứng với $t = 70 \\in [70; 90)$) và $x = 13$:',
          math: '$H(3) = 68$; $H(7) = 148$; $H(13) = -392$. Vậy $\\max\\limits_{[3; 13]} H(x) = 148$.',
        },
      ],
    },
  ],
  part2: [
    {
      id: 'p2_1',
      number: 1,
      tag: '[12-C1-B4-TH]',
      stem: 'Cho hàm số bậc ba $y = f(x) = x^3 - 3x^2 + 2$ có đồ thị $(C)$ như hình vẽ minh họa bên dưới.',
      diagram: 'cubic_graph_p2',
      statements: [
        {
          label: 'a',
          text: "Hàm số có đạo hàm $f'(x) = 3x^2 - 6x$, đạt cực đại tại điểm $x = 0$ ($y_{\\text{CĐ}} = 2$) và đạt cực tiểu tại điểm $x = 2$ ($y_{\\text{CT}} = -2$).",
          isTrue: true,
          stepTitle: 'Bước 1: Xét ý a)',
          leadIn: 'Tính đạo hàm và tìm điểm cực trị:',
          explanation: "$f'(x) = 3x^2 - 6x = 0 \\Leftrightarrow x = 0$ hoặc $x = 2$. Qua $x = 0$, $f'(x)$ đổi dấu từ $+$ sang $-$ nên $y_{\\text{CĐ}} = f(0) = 2$; qua $x = 2$, $f'(x)$ đổi dấu từ $-$ sang $+$ nên $y_{\\text{CT}} = f(2) = -2$.",
        },
        {
          label: 'b',
          text: 'Tâm đối xứng của đồ thị $(C)$ là điểm uốn $I(1; 0)$ nằm trên trục hoành $Ox$.',
          isTrue: true,
          stepTitle: 'Bước 2: Xét ý b)',
          leadIn: 'Tính đạo hàm cấp hai tìm điểm uốn:',
          explanation: "$f''(x) = 6x - 6 = 0 \\Leftrightarrow x = 1 \\Rightarrow f(1) = 0$. Do đó tâm đối xứng của $(C)$ là điểm $I(1; 0) \\in Ox$.",
        },
        {
          label: 'c',
          text: 'Giá trị lớn nhất của hàm số $f(x)$ trên đoạn $[-1; 2]$ bằng $4$.',
          isTrue: false,
          stepTitle: 'Bước 3: Xét ý c)',
          leadIn: 'So sánh giá trị hàm số tại các điểm đầu mút và điểm tới hạn trên $[-1; 2]$:',
          explanation: 'Ta có $f(-1) = -2$; $f(0) = 2$; $f(2) = -2$. Suy ra $\\max\\limits_{[-1; 2]} f(x) = f(0) = 2 \\ne 4$.',
        },
        {
          label: 'd',
          text: 'Đường thẳng đi qua hai điểm cực trị của đồ thị hàm số $(C)$ có phương trình là $y = -2x + 1$.',
          isTrue: false,
          stepTitle: 'Bước 4: Xét ý d)',
          leadIn: 'Lập phương trình đường thẳng qua hai điểm cực trị $A(0; 2)$ và $B(2; -2)$:',
          explanation: 'Hệ số góc $k = \\dfrac{-2 - 2}{2 - 0} = -2$ nên phương trình đường thẳng là $y = -2x + 2 \\ne -2x + 1$.',
        },
      ],
    },
    {
      id: 'p2_2',
      number: 2,
      tag: '[12-C1-B3-VD]',
      stem: 'Cho hàm số $y = f(x) = \\dfrac{-x^2 + x - 1}{x + 1}$ có đồ thị $(C)$ như hình vẽ bên dưới.',
      diagram: 'rational_oblique_p2',
      statements: [
        {
          label: 'a',
          text: 'Hàm số đã cho có tập xác định là $D = \\mathbb{R} \\setminus \\{-1\\}$ và có hai điểm cực trị.',
          isTrue: true,
          stepTitle: 'Bước 1: Xét ý a)',
          leadIn: 'Tìm tập xác định và giải phương trình đạo hàm bằng $0$:',
          explanation: "Điều kiện $x + 1 \\ne 0 \\Leftrightarrow x \\ne -1$. Ta có $y = -x + 2 - \\dfrac{3}{x + 1} \\Rightarrow y' = -1 + \\dfrac{3}{(x + 1)^2} = 0 \\Leftrightarrow (x + 1)^2 = 3$, phương trình có hai nghiệm phân biệt nên hàm số có hai điểm cực trị.",
        },
        {
          label: 'b',
          text: 'Đường tiệm cận xiên của đồ thị $(C)$ có phương trình là $y = -x + 2$.',
          isTrue: true,
          stepTitle: 'Bước 2: Xét ý b)',
          leadIn: 'Xét giới hạn tại vô cực:',
          explanation: 'Vì $\\lim\\limits_{x \\to \\pm\\infty} [f(x) - (-x + 2)] = \\lim\\limits_{x \\to \\pm\\infty} \\dfrac{-3}{x + 1} = 0$ nên đường thẳng $y = -x + 2$ là tiệm cận xiên của $(C)$.',
        },
        {
          label: 'c',
          text: 'Tâm đối xứng của đồ thị $(C)$ là điểm $I(-1; 1)$.',
          isTrue: false,
          stepTitle: 'Bước 3: Xét ý c)',
          leadIn: 'Xác định giao điểm của hai đường tiệm cận:',
          explanation: 'Giao điểm của tiệm cận đứng $x = -1$ và tiệm cận xiên $y = -x + 2$ là $I(-1; 3) \\ne (-1; 1)$.',
        },
        {
          label: 'd',
          text: 'Giá trị lớn nhất của hàm số $f(x)$ trên đoạn $[0; 2]$ bằng $1$.',
          isTrue: false,
          stepTitle: 'Bước 4: Xét ý d)',
          leadIn: 'Tính giá trị cực đại trên đoạn $[0; 2]$:',
          explanation: "Đạo hàm $f'(x) = 0$ tại $x = -1 + \\sqrt{3} \\approx 0,73 \\in [0; 2]$ cho $f(-1 + \\sqrt{3}) = 3 - 2\\sqrt{3} \\approx -0,46 < 0$. Do đó $\\max\\limits_{[0; 2]} f(x) \\ne 1$.",
        },
      ],
    },
    {
      id: 'p2_3',
      number: 3,
      tag: '[12-C1-B5-VD]',
      stem: 'Trong hệ thống truyền dẫn cáp quang ghép kênh theo bước sóng (WDM), khi kích hoạt $x$ kênh bước sóng đồng thời (với $1 \\le x \\le 15$), do suy hao công suất tại bộ ghép quang nên tốc độ truyền dẫn hiệu dụng $R(x)$ (đơn vị: Gbps) được mô hình hóa bởi hàm phân thức $R(x) = \\dfrac{-x^2 + 26x + 31}{x + 2}$. Xét tính đúng sai của các mệnh đề sau:',
      statements: [
        {
          label: 'a',
          text: 'Khi kích hoạt $x = 1$ kênh bước sóng thì tốc độ truyền dẫn hiệu dụng đạt $\\dfrac{56}{3}$ (Gbps).',
          isTrue: true,
          stepTitle: 'Bước 1: Xét mệnh đề a)',
          leadIn: 'Thay $x = 1$ vào hàm số $R(x)$:',
          explanation: '$R(1) = \\dfrac{-1 + 26 + 31}{1 + 2} = \\dfrac{56}{3}$ (Gbps).',
        },
        {
          label: 'b',
          text: "Đạo hàm của hàm tốc độ truyền dẫn là $R'(x) = -1 + \\dfrac{25}{(x + 2)^2}$.",
          isTrue: true,
          stepTitle: 'Bước 2: Xét mệnh đề b)',
          leadIn: 'Biến đổi tách phần nguyên trước khi đạo hàm:',
          explanation: "Thực hiện phép chia đa thức tử cho mẫu: $R(x) = \\dfrac{-x^2 + 26x + 31}{x + 2} = -(x - 28) - \\dfrac{25}{x + 2} = -x + 28 - \\dfrac{25}{x + 2}$. Lấy đạo hàm hai vế ta được $R'(x) = -1 + \\dfrac{25}{(x + 2)^2}$.",
        },
        {
          label: 'c',
          text: 'Tốc độ truyền dẫn hiệu dụng $R(x)$ luôn tăng dần trên toàn bộ đoạn $[1; 15]$.',
          isTrue: false,
          stepTitle: 'Bước 3: Xét mệnh đề c)',
          leadIn: "Xét dấu $R'(x)$ trên khoảng $(3; 15)$:",
          explanation: "Với $x \\in (3; 15)$ ta có $x + 2 > 5 \\Rightarrow R'(x) < 0$ nên tốc độ truyền dẫn giảm dần khi $x > 3$.",
        },
        {
          label: 'd',
          text: 'Tốc độ truyền dẫn hiệu dụng đạt giá trị lớn nhất bằng $22$ (Gbps) khi kích hoạt đúng $x = 3$ kênh bước sóng.',
          isTrue: false,
          stepTitle: 'Bước 4: Xét mệnh đề d)',
          leadIn: 'Tìm cực đại của $R(x)$ trên $[1; 15]$:',
          explanation: "Giải $R'(x) = 0$ trên $[1; 15]$ được $x = 3$ và $\\max\\limits_{[1; 15]} R(x) = R(3) = 20 \\ne 22$ (Gbps).",
        },
      ],
    },
    {
      id: 'p2_4',
      number: 4,
      tag: '[12-C1-B1-VD]',
      stem: 'Cho hàm số phân thức hữu tỉ $y = \\dfrac{x^2 + mx + 1}{x + 1}$ (với $m$ là tham số thực). Xét tính đúng sai của các mệnh đề sau:',
      statements: [
        {
          label: 'a',
          text: 'Khi $m = 3$, đồ thị hàm số có đường tiệm cận đứng là $x = 1$.',
          isTrue: false,
          stepTitle: 'Bước 1: Xét ý a)',
          leadIn: 'Thay $m = 3$ và tìm nghiệm của mẫu thức:',
          explanation: 'Với $m = 3$, hàm số là $y = \\dfrac{x^2 + 3x + 1}{x + 1}$. Nghiệm mẫu $x + 1 = 0 \\Leftrightarrow x = -1$ (không là nghiệm tử), nên tiệm cận đứng là $x = -1 \\ne 1$.',
        },
        {
          label: 'b',
          text: 'Khi $m = 0$, hàm số đạt cực tiểu tại điểm $x = -1 + \\sqrt{2}$.',
          isTrue: true,
          stepTitle: 'Bước 2: Xét ý b)',
          leadIn: 'Xét hàm số khi $m = 0$ và tính đạo hàm:',
          explanation: "Ta có $y = x - 1 + \\dfrac{2}{x + 1} \\Rightarrow y' = 1 - \\dfrac{2}{(x + 1)^2} = 0 \\Leftrightarrow x = -1 \\pm \\sqrt{2}$. Với $y'' = \\dfrac{4}{(x + 1)^3}$, tại $x = -1 + \\sqrt{2}$ có $y'' > 0$ nên hàm số đạt cực tiểu tại $x = -1 + \\sqrt{2}$.",
        },
        {
          label: 'c',
          text: 'Khi $m = 2$, đồ thị hàm số nhận đường thẳng $x = -1$ làm tiệm cận đứng.',
          isTrue: false,
          stepTitle: 'Bước 3: Xét ý c)',
          leadIn: 'Rút gọn biểu thức hàm số khi $m = 2$:',
          explanation: 'Khi $m = 2$, $y = \\dfrac{(x + 1)^2}{x + 1} = x + 1$ (với $x \\ne -1$), do đó $\\lim\\limits_{x \\to -1} y = 0$ hữu hạn nên đồ thị không có tiệm cận đứng.',
        },
        {
          label: 'd',
          text: 'Khi $m = 1$, hàm số đồng biến trên khoảng $(0; +\\infty)$.',
          isTrue: true,
          stepTitle: 'Bước 4: Xét ý d)',
          leadIn: "Tính đạo hàm $y'$ khi $m = 1$ trên khoảng $(0; +\\infty)$:",
          explanation: "Khi $m = 1$, ta có $y = \\dfrac{x^2 + x + 1}{x + 1} = x + \\dfrac{1}{x + 1} \\Rightarrow y' = 1 - \\dfrac{1}{(x + 1)^2}$. Với mọi $x > 0$ thì $(x + 1)^2 > 1 \\Rightarrow y' > 0$, nên hàm số đồng biến trên khoảng $(0; +\\infty)$.",
        },
      ],
    },
  ],
  part3: [
    {
      id: 'p3_1',
      number: 1,
      tag: '[12-C1-B5-VD]',
      stem: 'Một cơ sở kinh doanh đặc sản hạt điều rang muối tại Đắk Lắk nhận thấy khi định giá bán ở mức $x$ trăm nghìn đồng/hộp (với $1 < x < 15$) thì hàm lợi nhuận thu được mỗi tuần (tính bằng triệu đồng) được mô hình hóa bởi hàm số $P(x) = -x^3 + 12x^2 + 60x - 80$. Để hàm lợi nhuận hàng tuần đạt cực đại thì cơ sở cần định giá bán mỗi hộp là bao nhiêu trăm nghìn đồng?',
      answer: '10',
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm và tìm điểm tới hạn của hàm lợi nhuận',
          leadIn: 'Xét hàm số $P(x) = -x^3 + 12x^2 + 60x - 80$ trên $(1; 15)$:',
          math: "$P'(x) = -3x^2 + 24x + 60 = -3(x - 10)(x + 2) = 0 \\Leftrightarrow x = 10 \\in (1; 15)$.",
        },
        {
          title: 'Bước 2: Kết luận giá bán tối ưu',
          leadIn: "Khi đi qua $x = 10$, đạo hàm $P'(x)$ đổi dấu từ dương sang âm:",
          math: 'Hàm lợi nhuận đạt cực đại tại $x = 10$ (trăm nghìn đồng/hộp), với $P(10) = 720$ triệu đồng.',
        },
      ],
    },
    {
      id: 'p3_2',
      number: 2,
      tag: '[12-C1-B5-VDC]',
      stem: 'Cho một tấm nhôm phẳng có dạng nửa hình tròn đường kính $AB = 12\\text{ cm}$ (bán kính $R = 6\\text{ cm}$). Người ta muốn cắt từ tấm nhôm đó ra một tấm biển trang trí hình thang cân $ABCD$ nội tiếp trong nửa đường tròn nhận đường kính $AB$ làm đáy lớn (tham khảo hình vẽ). Tính diện tích lớn nhất (đơn vị: $\\text{cm}^2$, làm tròn kết quả đến hàng phần chục) của hình thang cân $ABCD$.',
      answer: '46,8',
      diagram: 'semicircle_trapezoid',
      solutionSteps: [
        {
          title: 'Bước 1: Đặt ẩn và xác định chiều cao CH',
          leadIn: 'Gọi $O$ là tâm nửa đường tròn, $H$ là hình chiếu của $C$ lên $AB$ và đặt $OH = x$ ($0 < x < 6$):',
          math: 'Đáy nhỏ $CD = 2x$ và chiều cao $CH = \\sqrt{36 - x^2}$.',
        },
        {
          title: 'Bước 2: Xác định hàm số S(x) và tìm diện tích lớn nhất',
          leadIn: 'Diện tích hình thang cân là $S(x) = \\dfrac{(AB + CD) \\cdot CH}{2} = (6 + x)\\sqrt{36 - x^2}$:',
          math: "$S'(x) = \\dfrac{-2x^2 - 6x + 36}{\\sqrt{36 - x^2}} = 0 \\Leftrightarrow x = 3$ (do $x > 0$). Vậy $S_{\\max} = S(3) = 27\\sqrt{3} \\approx 46,8\\text{ cm}^2$.",
        },
      ],
    },
    {
      id: 'p3_3',
      number: 3,
      tag: '[12-C1-B5-VD]',
      stem: 'Từ một tấm nhôm hình vuông có cạnh bằng $18\\text{ cm}$, người ta cắt bỏ ở bốn góc bốn hình vuông bằng nhau có cạnh $x\\text{ cm}$ (với $0 < x < 9$) rồi gập các mép lên theo đường nét đứt như hình vẽ để tạo thành một chiếc hộp hình hộp chữ nhật không nắp. Tính thể tích lớn nhất (đơn vị: $\\text{cm}^3$) của chiếc hộp tạo thành.',
      answer: '432',
      diagram: 'open_box_cutout',
      solutionSteps: [
        {
          title: 'Bước 1: Biểu diễn thể tích V(x) của chiếc hộp theo x',
          leadIn: 'Đáy hộp là hình vuông cạnh $18 - 2x$ (cm) và chiều cao là $x$ (cm):',
          math: 'Thể tích chiếc hộp là $V(x) = x(18 - 2x)^2$ với $x \\in (0; 9)$.',
        },
        {
          title: 'Bước 2: Tìm điểm cực đại của V(x) trên khoảng (0; 9)',
          leadIn: "Tính đạo hàm $V'(x)$ và giải phương trình $V'(x) = 0$:",
          math: "$V'(x) = (18 - 2x)(18 - 6x) = 0 \\Leftrightarrow x = 3 \\in (0; 9)$. Khi đó $V_{\\max} = V(3) = 3 \\cdot 12^2 = 432\\text{ cm}^3$.",
        },
      ],
    },
    {
      id: 'p3_4',
      number: 4,
      tag: '[12-C1-B2-VD]',
      stem: 'Gọi $M$ và $m$ lần lượt là giá trị lớn nhất và giá trị nhỏ nhất của hàm số $y = \\dfrac{x^2 + 3}{x + 1}$ trên đoạn $[0; 2]$. Tính giá trị của hiệu $M - m$.',
      answer: '1',
      solutionSteps: [
        {
          title: 'Bước 1: Tính đạo hàm và tìm điểm tới hạn trên đoạn [0; 2]',
          leadIn: 'Hàm số liên tục trên $[0; 2]$ và có đạo hàm:',
          math: "$y' = \\dfrac{2x(x + 1) - (x^2 + 3)}{(x + 1)^2} = \\dfrac{x^2 + 2x - 3}{(x + 1)^2} = 0 \\Leftrightarrow x = 1 \\in [0; 2]$ (loại $x = -3$).",
        },
        {
          title: 'Bước 2: Tính giá trị hàm số và hiệu M - m',
          leadIn: 'Ta tính giá trị tại $x = 0$, $x = 1$ và $x = 2$:',
          math: '$y(0) = 3$; $y(1) = 2$; $y(2) = \\dfrac{7}{3}$. Do đó $M = 3$, $m = 2$ và $M - m = 1$.',
        },
      ],
    },
    {
      id: 'p3_5',
      number: 5,
      tag: '[12-C1-B3-VD]',
      stem: 'Biết đồ thị hàm số $y = \\dfrac{2x^2 - 3x + 5}{x - 2}$ có đường tiệm cận xiên là đường thẳng $y = ax + b$. Giá trị của tổng $a + b$ bằng bao nhiêu?',
      answer: '3',
      solutionSteps: [
        {
          title: 'Bước 1: Thực hiện phép chia đa thức tử cho mẫu',
          leadIn: 'Viết lại hàm số bằng cách tách phần nguyên:',
          math: '$y = \\dfrac{(2x + 1)(x - 2) + 7}{x - 2} = 2x + 1 + \\dfrac{7}{x - 2}$.',
        },
        {
          title: 'Bước 2: Xác định hệ số tiệm cận xiên và tính tổng a + b',
          leadIn: 'Vì $\\lim\\limits_{x \\to \\pm\\infty} \\dfrac{7}{x - 2} = 0$ nên tiệm cận xiên là $y = 2x + 1$:',
          math: 'Suy ra $a = 2, b = 1$ và $a + b = 2 + 1 = 3$.',
        },
      ],
    },
    {
      id: 'p3_6',
      number: 6,
      tag: '[12-C1-B4-VD]',
      stem: 'Khoảng cách giữa hai điểm cực trị của đồ thị hàm số $y = x^3 - 3x^2 + 2$ bằng bao nhiêu? (Làm tròn kết quả đến hàng phần chục)',
      answer: '4,5',
      solutionSteps: [
        {
          title: 'Bước 1: Tìm tọa độ hai điểm cực trị của đồ thị',
          leadIn: 'Giải phương trình đạo hàm bằng $0$:',
          math: "$y' = 3x^2 - 6x = 0 \\Leftrightarrow x = 0$ hoặc $x = 2$. Suy ra hai điểm cực trị là $A(0; 2)$ và $B(2; -2)$.",
        },
        {
          title: 'Bước 2: Tính khoảng cách AB giữa hai điểm cực trị',
          leadIn: 'Áp dụng công thức tính độ dài đoạn thẳng trong mặt phẳng $Oxy$:',
          math: '$AB = \\sqrt{(2 - 0)^2 + (-2 - 2)^2} = \\sqrt{4 + 16} = \\sqrt{20} \\approx 4,5$.',
        },
      ],
    },
  ],
};

/**
 * Tạo bộ đề đồng bộ ngay lập tức theo Khối lớp - Chương - Bài học đang chọn trên UI.
 * Lớp 12 Chương I sử dụng trọn vẹn đề chuẩn 22 câu MOCK_EXAM_0107.
 * Các khối lớp/chương khác trả về bộ đề mẫu chuẩn hóa 100% đúng thẻ [Lớp-Chương-Bài-Mức độ] & kiến thức SGK KNTT.
 */
export function buildSyncedMockExam(
  grade: '10' | '11' | '12',
  chapterId: string,
  lessonTitle?: string
): ExamPaper {
  if (chapterId === '12-c1') {
    return {
      ...MOCK_EXAM_0107,
      examTitle: lessonTitle
        ? `PHIẾU HỌC TẬP LỚP 12 — ${lessonTitle.split(':')[0].toUpperCase()}`
        : MOCK_EXAM_0107.examTitle,
    };
  }

  const chapter = KNTT_MATH_CURRICULUM.find((c) => c.id === chapterId);
  const chapNum = chapterId.split('-')[1]?.toUpperCase() || 'C1';
  const lessonMatch = (lessonTitle || chapter?.lessons[0] || 'Bài 1').match(/Bài\s*(\d+)/i);
  const bCode = lessonMatch ? `B${lessonMatch[1]}` : 'B1';
  const shortChap = chapter?.title || 'Chuyên đề SGK KNTT';
  const shortLesson = lessonTitle || chapter?.lessons[0] || '';

  if (grade === '10') {
    return {
      ...MOCK_EXAM_0107,
      id: `sync-${chapterId}`,
      grade: '10',
      examCode: '1007',
      examTitle: `ĐỀ ÔN TẬP TOÁN 10 — ${shortChap.split(':')[0].toUpperCase()}`,
      part1: [
        {
          id: 'p1_1',
          number: 1,
          tag: `[10-${chapNum}-${bCode}-NB]`,
          stem: `(${shortLesson}) Trong các phát biểu sau, phát biểu nào là một mệnh đề toán học đúng?`,
          options: [
            '$\\pi$ là một số vô tỉ.',
            'Hôm nay trời đẹp quá!',
            '$x + 3 > 5$.',
            '$2 + 2 = 5$.',
          ],
          correctIndex: 0,
          solutionSteps: [
            {
              title: 'Bước 1: Xác định câu khẳng định có tính đúng - sai rõ ràng',
              leadIn: 'Theo định nghĩa mệnh đề toán học:',
              math: 'Phát biểu "$\\pi$ là một số vô tỉ" có giá trị chân lý Đúng.',
            },
            {
              title: 'Bước 2: Kết luận',
              leadIn: 'Đối chiếu các phương án đã cho:',
              math: 'Chọn phương án A.',
            },
          ],
        },
        {
          id: 'p1_2',
          number: 2,
          tag: `[10-${chapNum}-${bCode}-NB]`,
          stem: 'Cho hai tập hợp $A = \\{1; 2; 3; 5\\}$ và $B = \\{2; 4; 5; 6\\}$. Tập hợp $A \\cap B$ là',
          options: ['$\\{1; 2; 3; 4; 5; 6\\}$.', '$\\{2; 5\\}$.', '$\\{1; 3\\}$.', '$\\{4; 6\\}$.'],
          correctIndex: 1,
          solutionSteps: [
            {
              title: 'Bước 1: Liệt kê các phần tử chung của hai tập hợp',
              leadIn: 'Giao của $A$ và $B$ gồm các phần tử thuộc cả $A$ và $B$:',
              math: '$A \\cap B = \\{2; 5\\}$.',
            },
          ],
        },
        {
          id: 'p1_3',
          number: 3,
          tag: `[10-${chapNum}-${bCode}-TH]`,
          stem: 'Cặp số $(x; y)$ nào sau đây là một nghiệm của bất phương trình bậc nhất hai ẩn $2x - 3y + 1 \\le 0$?',
          options: ['$(0; 0)$.', '$(2; 1)$.', '$(1; 0)$.', '$(1; 2)$.'],
          correctIndex: 3,
          solutionSteps: [
            {
              title: 'Bước 1: Thay từng cặp tọa độ vào vế trái bất phương trình',
              leadIn: 'Kiểm tra cặp số $(1; 2)$:',
              math: '$2(1) - 3(2) + 1 = -3 \\le 0$ (thỏa mãn).',
            },
          ],
        },
        {
          id: 'p1_4',
          number: 4,
          tag: `[10-${chapNum}-${bCode}-VD]`,
          stem: 'Cho tam giác $ABC$ có $AB = 5$, $AC = 8$ và $\\widehat{A} = 60^\\circ$. Độ dài cạnh $BC$ bằng',
          options: ['$5$.', '$6$.', '$7$.', '$9$.'],
          correctIndex: 2,
          solutionSteps: [
            {
              title: 'Bước 1: Áp dụng định lý côsin trong tam giác ABC',
              leadIn: 'Ta tính $BC^2$ theo hai cạnh và góc xen giữa:',
              math: '$BC^2 = 5^2 + 8^2 - 2\\cdot 5\\cdot 8\\cdot\\cos 60^\\circ = 25 + 64 - 40 = 49 \\Rightarrow BC = 7$.',
            },
          ],
        },
      ],
      part2: [
        {
          id: 'p2_1',
          number: 1,
          tag: `[10-${chapNum}-${bCode}-TH]`,
          stem: `(${shortChap}) Cho hệ bất phương trình bậc nhất hai ẩn $\\begin{cases} x + y \\le 6 \\\\ 2x + y \\le 8 \\\\ x \\ge 0,\\ y \\ge 0 \\end{cases}$ và biểu thức $F(x; y) = 3x + 2y$.`,
          statements: [
            {
              label: 'a',
              text: 'Điểm $O(0; 0)$ thuộc miền nghiệm của hệ bất phương trình đã cho.',
              isTrue: true,
              stepTitle: 'Bước 1: Xét ý a)',
              leadIn: 'Thay $(0; 0)$ vào các bất phương trình:',
              explanation: '$0 + 0 \\le 6$, $0 + 0 \\le 8$, $0 \\ge 0$ đều đúng.',
            },
            {
              label: 'b',
              text: 'Điểm $A(2; 4)$ là một đỉnh của miền tứ giác nghiệm.',
              isTrue: true,
              stepTitle: 'Bước 2: Xét ý b)',
              leadIn: 'Giải hệ giao điểm của $x + y = 6$ và $2x + y = 8$:',
              explanation: 'Ta thu được $x = 2, y = 4$, thỏa mãn toàn bộ hệ.',
            },
            {
              label: 'c',
              text: 'Điểm $M(5; 1)$ thuộc miền nghiệm của hệ.',
              isTrue: false,
              stepTitle: 'Bước 3: Xét ý c)',
              leadIn: 'Kiểm tra điều kiện $2x + y \\le 8$ tại $M(5; 1)$:',
              explanation: '$2(5) + 1 = 11 > 8$ nên $M$ không thuộc miền nghiệm.',
            },
            {
              label: 'd',
              text: 'Giá trị lớn nhất của $F(x; y)$ trên miền nghiệm bằng $12$.',
              isTrue: false,
              stepTitle: 'Bước 4: Xét ý d)',
              leadIn: 'Tính giá trị $F$ tại đỉnh $A(2; 4)$:',
              explanation: '$F(2; 4) = 3(2) + 2(4) = 14 > 12$.',
            },
          ],
        },
      ],
      part3: [
        {
          id: 'p3_1',
          number: 1,
          tag: `[10-${chapNum}-${bCode}-VD]`,
          stem: 'Một hợp tác xã tại Buôn Ma Thuột cần thuê xe tải $A$ và $B$ chở ít nhất $18$ tấn cà phê và $10$ tấn tiêu ($3x+2y \\ge 18$, $x+2y \\ge 10$, $x+y \\le 9$). Biết chi phí $F(x; y) = 25x + 20y$ (triệu đồng). Chi phí thuê nhỏ nhất bằng bao nhiêu triệu đồng?',
          answer: '160',
          solutionSteps: [
            {
              title: 'Bước 1: Xác định tọa độ các đỉnh miền nghiệm',
              leadIn: 'Các đỉnh của tam giác nghiệm là $A(4; 3), B(0; 9), C(8; 1)$:',
              math: '$F(4; 3) = 160$; $F(0; 9) = 180$; $F(8; 1) = 220$.',
            },
            {
              title: 'Bước 2: Kết luận giá trị nhỏ nhất',
              leadIn: 'So sánh các giá trị tại đỉnh:',
              math: 'Chi phí thuê xe nhỏ nhất là $160$ triệu đồng.',
            },
          ],
        },
      ],
    };
  }

  if (grade === '11') {
    return {
      ...MOCK_EXAM_0107,
      id: `sync-${chapterId}`,
      grade: '11',
      examCode: '1107',
      examTitle: `ĐỀ ÔN TẬP TOÁN 11 — ${shortChap.split(':')[0].toUpperCase()}`,
      part1: [
        {
          id: 'p1_1',
          number: 1,
          tag: `[11-${chapNum}-${bCode}-NB]`,
          stem: `(${shortLesson}) Tập nghiệm của phương trình lượng giác $\\cos x = 0$ là`,
          options: [
            '$S = \\left\\{\\dfrac{\\pi}{2} + k\\pi \\mid k \\in \\mathbb{Z}\\right\\}$.',
            '$S = \\{k\\pi \\mid k \\in \\mathbb{Z}\\}$.',
            '$S = \\left\\{\\dfrac{\\pi}{2} + k2\\pi \\mid k \\in \\mathbb{Z}\\right\\}$.',
            '$S = \\{k2\\pi \\mid k \\in \\mathbb{Z}\\}$.',
          ],
          correctIndex: 0,
          solutionSteps: [
            {
              title: 'Bước 1: Áp dụng công thức nghiệm cơ bản',
              leadIn: 'Theo SGK Toán 11 KNTT:',
              math: '$\\cos x = 0 \\Leftrightarrow x = \\dfrac{\\pi}{2} + k\\pi\\ (k \\in \\mathbb{Z})$.',
            },
          ],
        },
        {
          id: 'p1_2',
          number: 2,
          tag: `[11-${chapNum}-${bCode}-NB]`,
          stem: 'Nghiệm của phương trình $\\log_2(3x - 1) = 3$ là',
          options: ['$x = 2$.', '$x = 3$.', '$x = \\dfrac{8}{3}$.', '$x = \\dfrac{10}{3}$.'],
          correctIndex: 1,
          solutionSteps: [
            {
              title: 'Bước 1: Đặt điều kiện và giải phương trình lôgarit',
              leadIn: 'Với $x > \\dfrac{1}{3}$, ta có:',
              math: '$3x - 1 = 2^3 = 8 \\Leftrightarrow x = 3$ (thỏa mãn).',
            },
          ],
        },
        {
          id: 'p1_3',
          number: 3,
          tag: `[11-${chapNum}-${bCode}-TH]`,
          stem: 'Cho cấp số cộng $(u_n)$ với $u_1 = 3$ và công sai $d = 4$. Giá trị của $u_5$ bằng',
          options: ['$15$.', '$23$.', '$19$.', '$16$.'],
          correctIndex: 2,
          solutionSteps: [
            {
              title: 'Bước 1: Áp dụng công thức số hạng tổng quát',
              leadIn: 'Ta có $u_n = u_1 + (n - 1)d$:',
              math: '$u_5 = 3 + 4\\cdot 4 = 19$.',
            },
          ],
        },
        {
          id: 'p1_4',
          number: 4,
          tag: `[11-${chapNum}-${bCode}-NB]`,
          stem: 'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình chữ nhật và $SA \\perp (ABCD)$ (xem hình vẽ). Đường thẳng $CD$ vuông góc với mặt phẳng nào sau đây?',
          options: ['$(SAC)$.', '$(SBD)$.', '$(SBC)$.', '$(SAD)$.'],
          correctIndex: 3,
          diagram: 'pyramid_rect',
          solutionSteps: [
            {
              title: 'Bước 1: Chỉ ra hai đường thẳng cắt nhau cùng vuông góc với CD',
              leadIn: 'Do $ABCD$ là hình chữ nhật và $SA \\perp (ABCD)$:',
              math: '$CD \\perp AD$ và $CD \\perp SA \\Rightarrow CD \\perp (SAD)$.',
            },
          ],
        },
      ],
      part2: [
        {
          id: 'p2_1',
          number: 1,
          tag: `[11-${chapNum}-${bCode}-TH]`,
          stem: `(${shortChap}) Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình chữ nhật tâm $O$, $AB = 3, AD = 4$, $SA \\perp (ABCD)$ và $SA = 6$.`,
          diagram: 'pyramid_rect',
          statements: [
            {
              label: 'a',
              text: 'Đường thẳng $BC$ vuông góc với mặt phẳng $(SAB)$.',
              isTrue: true,
              stepTitle: 'Bước 1: Xét ý a)',
              leadIn: 'Kiểm tra quan hệ vuông góc của $BC$:',
              explanation: '$BC \\perp AB$ và $BC \\perp SA \\Rightarrow BC \\perp (SAB)$.',
            },
            {
              label: 'b',
              text: 'Thể tích khối chóp $S.ABCD$ bằng $24$.',
              isTrue: true,
              stepTitle: 'Bước 2: Xét ý b)',
              leadIn: 'Áp dụng công thức thể tích khối chóp:',
              explanation: '$V = \\dfrac{1}{3} SA \\cdot S_{ABCD} = \\dfrac{1}{3} \\cdot 6 \\cdot 12 = 24$.',
            },
            {
              label: 'c',
              text: 'Góc giữa đường thẳng $SC$ và mặt phẳng $(ABCD)$ là góc $\\widehat{CSA}$.',
              isTrue: false,
              stepTitle: 'Bước 3: Xét ý c)',
              leadIn: 'Xác định hình chiếu của $SC$ lên $(ABCD)$:',
              explanation: 'Hình chiếu là $AC$ nên góc là $\\widehat{SCA} \\ne \\widehat{CSA}$.',
            },
            {
              label: 'd',
              text: 'Khoảng cách từ $S$ đến mặt phẳng $(ABCD)$ bằng $5$.',
              isTrue: false,
              stepTitle: 'Bước 4: Xét ý d)',
              leadIn: 'Vì $SA \\perp (ABCD)$:',
              explanation: '$d(S, (ABCD)) = SA = 6 \\ne 5$.',
            },
          ],
        },
      ],
      part3: [
        {
          id: 'p3_1',
          number: 1,
          tag: `[11-${chapNum}-${bCode}-VD]`,
          stem: 'Cho hình chóp $S.ABCD$ có đáy là hình vuông cạnh $3$, $H$ là trung điểm $AB$, $SH \\perp (ABCD)$ và $SH = 4$. Khoảng cách giữa $AB$ và $SC$ bằng bao nhiêu?',
          answer: '2,4',
          solutionSteps: [
            {
              title: 'Bước 1: Quy khoảng cách về chân đường cao H',
              leadIn: 'Vì $AB \\parallel (SCD)$:',
              math: '$d(AB, SC) = d(H, (SCD)) = \\dfrac{SH\\cdot HK}{\\sqrt{SH^2 + HK^2}} = \\dfrac{4\\cdot 3}{5} = 2,4$.',
            },
          ],
        },
      ],
    };
  }

  // Grade 12 Chapters II - VI: sync tags & primary sample questions with the chosen chapter!
  if (chapterId === '12-c2' || chapterId === '12-c5') {
    return {
      ...MOCK_EXAM_0107,
      id: `sync-${chapterId}`,
      grade: '12',
      examCode: '1205',
      examTitle: `ĐỀ ÔN TẬP TOÁN 12 — ${shortChap.split(':')[0].toUpperCase()}`,
      part1: MOCK_EXAM_0107.part1.slice(0, 4).map((q, i) => ({
        ...q,
        tag: `[12-${chapNum}-${bCode}-${i < 2 ? 'NB' : 'TH'}]`,
        diagram: undefined,
        stem:
          i === 0
            ? `(${shortLesson}) Trong không gian $Oxyz$, mặt phẳng đi qua điểm $A(2; -1; 3)$ và nhận $\\vec{n} = (3; 2; -1)$ làm vectơ pháp tuyến có phương trình là`
            : i === 1
            ? `Trong không gian $Oxyz$, cho $\\vec{u} = (1; -2; 3)$ và $\\vec{v} = (2; 1; 0)$. Tích vô hướng $\\vec{u} \\cdot \\vec{v}$ bằng`
            : i === 2
            ? `Trong không gian $Oxyz$, mặt cầu tâm $I(1; -2; 3)$ bán kính $R = 4$ có phương trình là`
            : `Trong không gian $Oxyz$, khoảng cách từ điểm $M(1; 2; -1)$ đến mặt phẳng $(P): 2x - 2y + z + 3 = 0$ bằng`,
        options:
          i === 0
            ? ['$3x + 2y - z - 1 = 0$.', '$3x + 2y - z + 1 = 0$.', '$2x - y + 3z - 1 = 0$.', '$3x - 2y - z = 0$.']
            : i === 1
            ? ['$4$.', '$0$.', '$-4$.', '$2$.']
            : i === 2
            ? [
                '$(x + 1)^2 + (y - 2)^2 + (z + 3)^2 = 16$.',
                '$(x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 4$.',
                '$(x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 16$.',
                '$(x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 8$.',
              ]
            : ['$1$.', '$2$.', '$3$.', '$\\dfrac{2}{3}$.'],
        correctIndex: i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 2 : 3,
      })),
      part2: MOCK_EXAM_0107.part2.slice(0, 2).map((q, i) => ({
        ...q,
        tag: `[12-${chapNum}-${bCode}-${i === 0 ? 'TH' : 'VD'}]`,
      })),
      part3: MOCK_EXAM_0107.part3.slice(0, 2).map((q) => ({
        ...q,
        tag: `[12-${chapNum}-${bCode}-VD]`,
      })),
    };
  }

  if (chapterId === '12-c3') {
    return {
      ...MOCK_EXAM_0107,
      id: `sync-${chapterId}`,
      grade: '12',
      examCode: '1203',
      examTitle: `ĐỀ ÔN TẬP TOÁN 12 — ${shortChap.split(':')[0].toUpperCase()}`,
      part1: [
        {
          ...MOCK_EXAM_0107.part1[11],
          id: 'c3_p1_1',
          number: 1,
          tag: `[12-C3-${bCode}-TH]`,
          stem: `(${shortLesson}) Khảo sát thời gian tự học môn Toán mỗi ngày (phút) của $40$ học sinh khối 12 thu được mẫu số liệu ghép nhóm dưới đây. Tứ phân vị thứ ba $Q_3$ bằng`,
          options: ['$95$.', '$92,5$.', '$97,5$.', '$85$.'],
          correctIndex: 0,
          diagram: 'stat_table_12',
          solutionSteps: [
            {
              title: 'Bước 1: Xác định nhóm chứa tứ phân vị thứ ba',
              leadIn: 'Cỡ mẫu $n = 40$, ta tính $\\dfrac{3n}{4} = 30$:',
              math: '$cf_3 = 28 < 30 \\le cf_4 = 36$ nên nhóm chứa $Q_3$ là $[90; 110)$.',
            },
            {
              title: 'Bước 2: Áp dụng công thức tính Q3',
              leadIn: 'Thay số vào công thức tứ phân vị ghép nhóm:',
              math: '$Q_3 = 90 + \\dfrac{30 - 28}{8} \\cdot (110 - 90) = 95$.',
            },
          ],
        },
        ...MOCK_EXAM_0107.part1.slice(0, 3).map((q, idx) => ({
          ...q,
          number: idx + 2,
          tag: `[12-C3-${bCode}-NB]`,
        })),
      ],
      part2: MOCK_EXAM_0107.part2.slice(0, 2).map((q) => ({
        ...q,
        tag: `[12-C3-${bCode}-VD]`,
      })),
      part3: MOCK_EXAM_0107.part3.slice(0, 2).map((q) => ({
        ...q,
        tag: `[12-C3-${bCode}-VD]`,
      })),
    };
  }

  // 12-c4 or 12-c6
  return {
    ...MOCK_EXAM_0107,
    id: `sync-${chapterId}`,
    grade: '12',
    examCode: chapterId === '12-c4' ? '1204' : '1206',
    examTitle: `ĐỀ ÔN TẬP TOÁN 12 — ${shortChap.split(':')[0].toUpperCase()}`,
    part1: MOCK_EXAM_0107.part1.map((q, idx) => ({
      ...q,
      tag: `[12-${chapNum}-${bCode}-${idx < 6 ? 'NB' : idx < 10 ? 'TH' : 'VD'}]`,
    })),
    part2: MOCK_EXAM_0107.part2.map((q) => ({
      ...q,
      tag: `[12-${chapNum}-${bCode}-VD]`,
    })),
    part3: MOCK_EXAM_0107.part3.map((q) => ({
      ...q,
      tag: `[12-${chapNum}-${bCode}-VD]`,
    })),
  };
}
