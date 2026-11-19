import {
  CurriculumRow,
  ExamSubmission,
  LegalDocument,
  OnlineExamRoom,
  StudentRecord,
  SubjectDirectoryItem,
} from '../types/eduplan';

export interface KNTTChapter {
  id: string;
  grade: '10' | '11' | '12';
  semester: 'Học kỳ 1' | 'Học kỳ 2';
  title: string;
  lessons: string[];
}

export const KNTT_MATH_CURRICULUM: KNTTChapter[] = [
  // ==================== LỚP 10 (9 CHƯƠNG - 27 BÀI) ====================
  {
    id: '10-c1',
    grade: '10',
    semester: 'Học kỳ 1',
    title: 'Chương I: Mệnh đề và tập hợp',
    lessons: [
      'Bài 1: Mệnh đề',
      'Bài 2: Tập hợp và các phép toán trên tập hợp',
    ],
  },
  {
    id: '10-c2',
    grade: '10',
    semester: 'Học kỳ 1',
    title: 'Chương II: Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    lessons: [
      'Bài 3: Bất phương trình bậc nhất hai ẩn',
      'Bài 4: Hệ bất phương trình bậc nhất hai ẩn',
    ],
  },
  {
    id: '10-c3',
    grade: '10',
    semester: 'Học kỳ 1',
    title: 'Chương III: Hệ thức lượng trong tam giác',
    lessons: [
      'Bài 5: Giá trị lượng giác của một góc từ 0° đến 180°',
      'Bài 6: Hệ thức lượng trong tam giác',
    ],
  },
  {
    id: '10-c4',
    grade: '10',
    semester: 'Học kỳ 1',
    title: 'Chương IV: Vectơ',
    lessons: [
      'Bài 7: Các khái niệm mở đầu về vectơ',
      'Bài 8: Tổng và hiệu của hai vectơ',
      'Bài 9: Tích của một vectơ với một số',
      'Bài 10: Vectơ trong mặt phẳng tọa độ',
      'Bài 11: Tích vô hướng của hai vectơ',
    ],
  },
  {
    id: '10-c5',
    grade: '10',
    semester: 'Học kỳ 1',
    title: 'Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm',
    lessons: [
      'Bài 12: Số gần đúng và sai số',
      'Bài 13: Các số đặc trưng đo xu thế trung tâm',
      'Bài 14: Các số đặc trưng đo độ phân tán',
    ],
  },
  {
    id: '10-c6',
    grade: '10',
    semester: 'Học kỳ 2',
    title: 'Chương VI: Hàm số, đồ thị và ứng dụng',
    lessons: [
      'Bài 15: Hàm số',
      'Bài 16: Hàm số bậc hai',
      'Bài 17: Dấu của tam thức bậc hai',
      'Bài 18: Phương trình quy về phương trình bậc hai',
    ],
  },
  {
    id: '10-c7',
    grade: '10',
    semester: 'Học kỳ 2',
    title: 'Chương VII: Phương pháp tọa độ trong mặt phẳng',
    lessons: [
      'Bài 19: Phương trình đường thẳng',
      'Bài 20: Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách',
      'Bài 21: Đường tròn trong mặt phẳng tọa độ',
      'Bài 22: Ba đường conic',
    ],
  },
  {
    id: '10-c8',
    grade: '10',
    semester: 'Học kỳ 2',
    title: 'Chương VIII: Đại số tổ hợp',
    lessons: [
      'Bài 23: Quy tắc đếm',
      'Bài 24: Hoán vị, chỉnh hợp và tổ hợp',
      'Bài 25: Nhị thức Newton',
    ],
  },
  {
    id: '10-c9',
    grade: '10',
    semester: 'Học kỳ 2',
    title: 'Chương IX: Tính xác suất theo định nghĩa cổ điển',
    lessons: [
      'Bài 26: Biến cố và định nghĩa cổ điển của xác suất',
      'Bài 27: Thực hành tính xác suất theo định nghĩa cổ điển',
    ],
  },

  // ==================== LỚP 11 (9 CHƯƠNG - 33 BÀI) ====================
  {
    id: '11-c1',
    grade: '11',
    semester: 'Học kỳ 1',
    title: 'Chương I: Hàm số lượng giác và phương trình lượng giác',
    lessons: [
      'Bài 1: Giá trị lượng giác của góc lượng giác',
      'Bài 2: Công thức lượng giác',
      'Bài 3: Hàm số lượng giác',
      'Bài 4: Phương trình lượng giác cơ bản',
    ],
  },
  {
    id: '11-c2',
    grade: '11',
    semester: 'Học kỳ 1',
    title: 'Chương II: Dãy số. Cấp số cộng và cấp số nhân',
    lessons: [
      'Bài 5: Dãy số',
      'Bài 6: Cấp số cộng',
      'Bài 7: Cấp số nhân',
    ],
  },
  {
    id: '11-c3',
    grade: '11',
    semester: 'Học kỳ 1',
    title: 'Chương III: Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm',
    lessons: [
      'Bài 8: Mẫu số liệu ghép nhóm',
      'Bài 9: Các số đặc trưng đo xu thế trung tâm',
    ],
  },
  {
    id: '11-c4',
    grade: '11',
    semester: 'Học kỳ 1',
    title: 'Chương IV: Quan hệ song song trong không gian',
    lessons: [
      'Bài 10: Đường thẳng và mặt phẳng trong không gian',
      'Bài 11: Hai đường thẳng song song',
      'Bài 12: Đường thẳng và mặt phẳng song song',
      'Bài 13: Hai mặt phẳng song song',
      'Bài 14: Phép chiếu song song',
    ],
  },
  {
    id: '11-c5',
    grade: '11',
    semester: 'Học kỳ 1',
    title: 'Chương V: Giới hạn. Hàm số liên tục',
    lessons: [
      'Bài 15: Giới hạn của dãy số',
      'Bài 16: Giới hạn của hàm số',
      'Bài 17: Hàm số liên tục',
    ],
  },
  {
    id: '11-c6',
    grade: '11',
    semester: 'Học kỳ 2',
    title: 'Chương VI: Hàm số mũ và hàm số lôgarit',
    lessons: [
      'Bài 18: Lũy thừa với số mũ thực',
      'Bài 19: Lôgarit',
      'Bài 20: Hàm số mũ và hàm số lôgarit',
      'Bài 21: Phương trình, bất phương trình mũ và lôgarit',
    ],
  },
  {
    id: '11-c7',
    grade: '11',
    semester: 'Học kỳ 2',
    title: 'Chương VII: Quan hệ vuông góc trong không gian',
    lessons: [
      'Bài 22: Hai đường thẳng vuông góc',
      'Bài 23: Đường thẳng vuông góc với mặt phẳng',
      'Bài 24: Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng',
      'Bài 25: Hai mặt phẳng vuông góc',
      'Bài 26: Khoảng cách',
      'Bài 27: Thể tích',
    ],
  },
  {
    id: '11-c8',
    grade: '11',
    semester: 'Học kỳ 2',
    title: 'Chương VIII: Các quy tắc tính xác suất',
    lessons: [
      'Bài 28: Biến cố hợp, biến cố giao, biến cố độc lập',
      'Bài 29: Công thức cộng xác suất',
      'Bài 30: Công thức nhân xác suất cho hai biến cố độc lập',
    ],
  },
  {
    id: '11-c9',
    grade: '11',
    semester: 'Học kỳ 2',
    title: 'Chương IX: Đạo hàm',
    lessons: [
      'Bài 31: Định nghĩa và ý nghĩa của đạo hàm',
      'Bài 32: Các quy tắc tính đạo hàm',
      'Bài 33: Đạo hàm cấp hai',
    ],
  },

  // ==================== LỚP 12 (6 CHƯƠNG - 19 BÀI) ====================
  {
    id: '12-c1',
    grade: '12',
    semester: 'Học kỳ 1',
    title: 'Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    lessons: [
      'Bài 1: Tính đơn điệu và cực trị của hàm số',
      'Bài 2: Giá trị lớn nhất và giá trị nhỏ nhất của hàm số',
      'Bài 3: Đường tiệm cận của đồ thị hàm số',
      'Bài 4: Khảo sát sự biến thiên và vẽ đồ thị của hàm số',
      'Bài 5: Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn',
    ],
  },
  {
    id: '12-c2',
    grade: '12',
    semester: 'Học kỳ 1',
    title: 'Chương II: Vectơ và hệ trục tọa độ trong không gian',
    lessons: [
      'Bài 6: Vectơ trong không gian',
      'Bài 7: Hệ trục tọa độ trong không gian',
      'Bài 8: Biểu thức tọa độ của các phép toán vectơ',
    ],
  },
  {
    id: '12-c3',
    grade: '12',
    semester: 'Học kỳ 1',
    title: 'Chương III: Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm',
    lessons: [
      'Bài 9: Khoảng biến thiên và khoảng tứ phân vị',
      'Bài 10: Phương sai và độ lệch chuẩn',
    ],
  },
  {
    id: '12-c4',
    grade: '12',
    semester: 'Học kỳ 2',
    title: 'Chương IV: Nguyên hàm và tích phân',
    lessons: [
      'Bài 11: Nguyên hàm',
      'Bài 12: Tích phân',
      'Bài 13: Ứng dụng hình học của tích phân',
    ],
  },
  {
    id: '12-c5',
    grade: '12',
    semester: 'Học kỳ 2',
    title: 'Chương V: Phương pháp tọa độ trong không gian',
    lessons: [
      'Bài 14: Phương trình mặt phẳng',
      'Bài 15: Phương trình đường thẳng trong không gian',
      'Bài 16: Công thức tính góc trong không gian',
      'Bài 17: Phương trình mặt cầu',
    ],
  },
  {
    id: '12-c6',
    grade: '12',
    semester: 'Học kỳ 2',
    title: 'Chương VI: Xác suất có điều kiện',
    lessons: [
      'Bài 18: Xác suất có điều kiện',
      'Bài 19: Công thức xác suất toàn phần và công thức Bayes',
    ],
  },
];

export const SUBJECTS_29: SubjectDirectoryItem[] = [
  { id: 'toan', name: 'Toán học', group: 'Khoa học Tự nhiên', enabled: true },
  { id: 'vat-ly', name: 'Vật lý', group: 'Khoa học Tự nhiên', enabled: true },
  { id: 'hoa-hoc', name: 'Hóa học', group: 'Khoa học Tự nhiên', enabled: true },
  { id: 'sinh-hoc', name: 'Sinh học', group: 'Khoa học Tự nhiên', enabled: true },
  { id: 'tieng-anh', name: 'Tiếng Anh', group: 'Ngoại ngữ', enabled: true },
  { id: 'ngu-van', name: 'Ngữ văn', group: 'Khoa học Xã hội', enabled: true },
  { id: 'lich-su', name: 'Lịch sử', group: 'Khoa học Xã hội', enabled: true },
  { id: 'dia-ly', name: 'Địa lý', group: 'Khoa học Xã hội', enabled: true },
  { id: 'gdktpl', name: 'Giáo dục Kinh tế & Pháp luật', group: 'Khoa học Xã hội', enabled: true },
  { id: 'tin-hoc', name: 'Tin học', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'cong-nghe-cn', name: 'Công nghệ Công nghiệp', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'cong-nghe-nn', name: 'Công nghệ Nông nghiệp', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'gdtc', name: 'Giáo dục Thể chất', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'gdqpan', name: 'Giáo dục Quốc phòng & An ninh', group: 'Khoa học Xã hội', enabled: true },
  { id: 'hdtn', name: 'Hoạt động Trải nghiệm, Hướng nghiệp', group: 'Khoa học Xã hội', enabled: true },
  { id: 'gd-dia-phuong', name: 'Giáo dục Địa phương (Đắk Lắk)', group: 'Khoa học Xã hội', enabled: true },
  { id: 'am-nhac', name: 'Âm nhạc', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'my-thuat', name: 'Mỹ thuật', group: 'Nghệ thuật & Công nghệ', enabled: true },
  { id: 'tieng-phap', name: 'Tiếng Pháp', group: 'Ngoại ngữ', enabled: false },
  { id: 'tieng-nhat', name: 'Tiếng Nhật', group: 'Ngoại ngữ', enabled: false },
  { id: 'tieng-han', name: 'Tiếng Hàn', group: 'Ngoại ngữ', enabled: false },
  { id: 'tieng-trung', name: 'Tiếng Trung', group: 'Ngoại ngữ', enabled: false },
  { id: 'tieng-duc', name: 'Tiếng Đức', group: 'Ngoại ngữ', enabled: false },
  { id: 'tieng-nga', name: 'Tiếng Nga', group: 'Ngoại ngữ', enabled: false },
  { id: 'khtn', name: 'Khoa học Tự nhiên (THCS)', group: 'Khoa học Tự nhiên', enabled: false },
  { id: 'lsdl', name: 'Lịch sử & Địa lý (THCS)', group: 'Khoa học Xã hội', enabled: false },
  { id: 'gdcd', name: 'Giáo dục Công dân (THCS)', group: 'Khoa học Xã hội', enabled: false },
  { id: 'chuyen-de-toan', name: 'Chuyên đề học tập Toán 10-11-12', group: 'Khoa học Tự nhiên', enabled: true },
  { id: 'stem-robotics', name: 'Giáo dục STEM & Robotics THPT', group: 'Nghệ thuật & Công nghệ', enabled: true },
];

export const SAMPLE_CURRICULUM_ROWS: CurriculumRow[] = [
  {
    stt: 1,
    grade: '12',
    chapter: 'Chương I',
    lesson: 'Bài 1: Tính đơn điệu và cực trị của hàm số',
    periods: 4,
    objectives: 'Nhận biết tính đồng biến, nghịch biến, cực trị qua đạo hàm và bảng biến thiên; tìm cực trị hàm bậc 3 và phân thức.',
    digitalCompetency: '1.1.NC1a: Khai thác GeoGebra vẽ đồ thị khảo sát dấu đạo hàm (TT 02/2025 & CV 3456).',
    aiCompetency: '10.AI.1: Đối chiếu bước biến đổi đạo hàm bằng trợ lý AI.',
    stemIntegration: 'Có (Tối ưu hóa hình học)',
  },
  {
    stt: 2,
    grade: '12',
    chapter: 'Chương I',
    lesson: 'Bài 2: Giá trị lớn nhất và giá trị nhỏ nhất của hàm số',
    periods: 3,
    objectives: 'Tìm GTLN, GTNN trên đoạn $[a; b]$ và khoảng; giải quyết bài toán tối ưu chi phí, lợi nhuận thực tiễn.',
    digitalCompetency: '1.2.NC1b: Dùng bảng tính & Casio fx-580VN X (Mode 8 Table) kiểm tra cực trị.',
    aiCompetency: '10.AI.2: Tạo dữ liệu thực tiễn địa phương bằng AI.',
    stemIntegration: 'Có (Thiết kế hộp thể tích cực đại)',
  },
  {
    stt: 3,
    grade: '12',
    chapter: 'Chương I',
    lesson: 'Bài 3: Đường tiệm cận của đồ thị hàm số',
    periods: 3,
    objectives: 'Xác định tiệm cận đứng, tiệm cận ngang và tiệm cận xiên của hàm phân thức bậc 2 trên bậc 1.',
    digitalCompetency: '2.1.NC1a: Trực quan hóa giới hạn vô cực trên Canvas tương tác.',
    aiCompetency: '10.AI.2: Phân tích hành vi tiệm cận mô hình truyền dẫn.',
    stemIntegration: 'Không',
  },
  {
    stt: 4,
    grade: '12',
    chapter: 'Chương II',
    lesson: 'Bài 6–8: Vectơ và hệ trục tọa độ Oxyz',
    periods: 6,
    objectives: 'Thực hiện phép toán tọa độ vectơ, tích vô hướng, tính góc và độ dài trong không gian Oxyz.',
    digitalCompetency: '3.1.NC1a: Mô phỏng mô hình 3D Oxyz trong không gian số.',
    aiCompetency: '10.AI.3: Định vị tọa độ UAV/cảm biến 3D.',
    stemIntegration: 'Có (Định vị không gian 3D)',
  },
  {
    stt: 5,
    grade: '12',
    chapter: 'Chương III',
    lesson: 'Bài 9–10: Khoảng tứ phân vị, phương sai và độ lệch chuẩn mẫu ghép nhóm',
    periods: 4,
    objectives: 'Tính được $Q_1, Q_2, Q_3, \\Delta_Q, s^2, s$ cho mẫu số liệu ghép nhóm; đánh giá mức độ phân tán dữ liệu thực tế.',
    digitalCompetency: '3.2.NC1b: Xử lý bảng thống kê ghép nhóm bằng Excel/Google Sheets.',
    aiCompetency: '10.AI.4: Phân tích xu hướng điểm thi học sinh.',
    stemIntegration: 'Có (Thống kê giáo dục)',
  },
];

export const REVIEW_105_LESSONS_12 = Array.from({ length: 35 }, (_, i) => {
  const topics = [
    'Tính đơn điệu hàm đa thức & phân thức',
    'Cực trị hàm bậc 3 và hàm phân thức bậc 2/1',
    'Giá trị lớn nhất - nhỏ nhất trên đoạn',
    'Đường tiệm cận đứng, ngang, xiên',
    'Khảo sát đồ thị & tương giao chứa tham số m',
    'Bài toán tối ưu thực tiễn (chi phí, diện tích)',
    'Vectơ và các phép toán trong không gian Oxyz',
    'Tọa độ điểm, vectơ & tích vô hướng Oxyz',
    'Khoảng biến thiên & khoảng tứ phân vị ghép nhóm',
    'Phương sai và độ lệch chuẩn mẫu ghép nhóm',
    'Nguyên hàm các hàm số sơ cấp',
    'Phương pháp đổi biến & tích phân xác định',
    'Ứng dụng tích phân tính diện tích hình phẳng',
    'Ứng dụng tích phân tính thể tích khối tròn xoay',
    'Phương trình mặt phẳng trong không gian Oxyz',
    'Phương trình đường thẳng & góc trong Oxyz',
    'Khoảng cách điểm, đường thẳng, mặt phẳng',
    'Phương trình mặt cầu & vị trí tương đối',
    'Xác suất có điều kiện & sơ đồ hình cây',
    'Công thức xác suất toàn phần và Bayes',
  ];
  const title = topics[i % topics.length];
  return {
    id: i + 1,
    code: `CĐ-${String(i + 1).padStart(2, '0')}`,
    title: `Bài ${i + 1}: ${title}`,
    periods: 3,
    periodRange: `Tiết ${i * 3 + 1} – ${i * 3 + 3}`,
    chapter: i < 10 ? 'Giải tích Hàm số' : i < 18 ? 'Thống kê & Oxyz' : i < 27 ? 'Nguyên hàm – Tích phân' : 'Xác suất & Tổng ôn',
  };
});

export interface ReviewTopic28 {
  id: number;
  grade: '10' | '11' | '12';
  title: string;
  weight: string;
  keyFormulas: string[];
  casioTip: string;
}

export const REVIEW_28_TOPICS: ReviewTopic28[] = [
  {
    id: 1,
    grade: '10',
    title: 'Mệnh đề, tập hợp & Hệ BPT bậc nhất 2 ẩn (Tối ưu tuyến tính)',
    weight: '10% (Lớp 10)',
    keyFormulas: ['$F(x; y) = ax + by$ đạt GTLN/GTNN tại các đỉnh miền đa giác nghiệm.'],
    casioTip: 'Casio fx-580VN X: Dùng MENU 9 -> 1 (Simul Equation) tìm nhanh tọa độ các đỉnh giao điểm.',
  },
  {
    id: 2,
    grade: '10',
    title: 'Hệ thức lượng trong tam giác & Tổ hợp – Xác suất cổ điển',
    weight: '10% (Lớp 10)',
    keyFormulas: ['$a^2 = b^2 + c^2 - 2bc\\cos A$', '$P(A) = \\dfrac{n(A)}{n(\\Omega)}$'],
    casioTip: 'Dùng phím SHIFT + ÷ (nCr) và SHIFT + × (nPr) tính nhanh tổ hợp/chỉnh hợp.',
  },
  {
    id: 3,
    grade: '11',
    title: 'Phương trình lượng giác & Cấp số cộng, Cấp số nhân',
    weight: '20% (Lớp 11)',
    keyFormulas: ['$u_n = u_1 + (n-1)d$', '$S_n = \\dfrac{u_1(1-q^n)}{1-q}$'],
    casioTip: 'Chuyển đơn vị Radian: SHIFT + MENU + 2 + 2. Thử nghiệm bằng phím CALC.',
  },
  {
    id: 4,
    grade: '11',
    title: 'Hàm số mũ – Lôgarit & Phương trình, BPT mũ lôgarit',
    weight: '20% (Lớp 11)',
    keyFormulas: ['$\\log_a(bc) = \\log_a b + \\log_a c$', '$a^{f(x)} > b \\Leftrightarrow f(x) > \\log_a b\\ (a > 1)$'],
    casioTip: 'Gán $x = \\text{đáp án}$ rồi bấm CALC để kiểm tra nghiệm chính xác trong 3 giây.',
  },
  {
    id: 5,
    grade: '11',
    title: 'Quan hệ vuông góc, Góc và Khoảng cách trong không gian',
    weight: '20% (Lớp 11)',
    keyFormulas: ['$V = \\dfrac{1}{3} S_{\\text{đáy}} \\cdot h$', '$\\dfrac{1}{d^2} = \\dfrac{1}{a^2} + \\dfrac{1}{b^2}$'],
    casioTip: 'Gắn hệ trục $Oxyz$ vào các đỉnh vuông góc để dùng tích có hướng MENU 5 (Vector).',
  },
  {
    id: 6,
    grade: '12',
    title: 'Tính đơn điệu, Cực trị & Tiệm cận (Bậc 3 & Phân thức 2/1)',
    weight: '70% (Lớp 12)',
    keyFormulas: ["$y' = 0$ đổi dấu qua $x_0$", 'Tiệm cận xiên $y = ax + b$ với $\\lim [f(x) - (ax+b)] = 0$'],
    casioTip: 'Dùng MENU 8 (Table) quét Start -5, End 5, Step 0.5 tìm khoảng tăng giảm & cực trị.',
  },
  {
    id: 7,
    grade: '12',
    title: 'Nguyên hàm – Tích phân & Ứng dụng Diện tích, Thể tích',
    weight: '70% (Lớp 12)',
    keyFormulas: ['$S = \\int_a^b |f(x) - g(x)|\\,\\mathrm{d}x$', '$V = \\pi \\int_a^b f^2(x)\\,\\mathrm{d}x$'],
    casioTip: 'Bấm phím tích phân $\\int_a^b$ trực tiếp trên fx-580VN X và đối chiếu với $F(b) - F(a)$.',
  },
  {
    id: 8,
    grade: '12',
    title: 'Phương pháp tọa độ Oxyz & Xác suất có điều kiện (Bayes)',
    weight: '70% (Lớp 12)',
    keyFormulas: ['$d(M, (P)) = \\dfrac{|Ax_0 + By_0 + Cz_0 + D|}{\\sqrt{A^2+B^2+C^2}}$', '$P(A|B) = \\dfrac{P(A)P(B|A)}{P(B)}$'],
    casioTip: 'Dùng MENU 5 nhập Vectơ A, B và OPTN -> Cross Product / Dot Product tính nhanh pháp tuyến.',
  },
];

export const INITIAL_STUDENTS_12A1: StudentRecord[] = [
  { id: 'hs-01', fullName: 'Nguyễn Minh Anh', dob: '14/03/2009', studentPhone: '0912345601', parentName: 'Nguyễn Văn Hùng', parentPhone: '0987654101', role: 'Lớp trưởng', seatRow: 0, seatCol: 0, pinned: true, conductScore: 98 },
  { id: 'hs-02', fullName: 'Trần Gia Bảo', dob: '22/07/2009', studentPhone: '0912345602', parentName: 'Trần Thị Mai', parentPhone: '0987654102', role: 'Bí thư', seatRow: 0, seatCol: 1, pinned: false, conductScore: 95 },
  { id: 'hs-03', fullName: 'Lê Hoàng Cẩm Tú', dob: '05/11/2009', studentPhone: '0912345603', parentName: 'Lê Văn Thành', parentPhone: '0987654103', role: 'Lớp phó HT', seatRow: 0, seatCol: 2, pinned: false, conductScore: 97 },
  { id: 'hs-04', fullName: 'Phạm Quốc Đạt', dob: '19/01/2009', studentPhone: '0912345604', parentName: 'Phạm Thị Lan', parentPhone: '0987654104', role: 'Tổ trưởng 1', seatRow: 0, seatCol: 3, pinned: false, conductScore: 92 },
  { id: 'hs-05', fullName: 'Hoàng Ngọc Diệp', dob: '08/05/2009', studentPhone: '0912345605', parentName: 'Hoàng Văn Nam', parentPhone: '0987654105', role: 'Thành viên', seatRow: 1, seatCol: 0, pinned: false, conductScore: 94 },
  { id: 'hs-06', fullName: 'Võ Đức Duy', dob: '30/09/2009', studentPhone: '0912345606', parentName: 'Võ Thị Hoa', parentPhone: '0987654106', role: 'Thành viên', seatRow: 1, seatCol: 1, pinned: false, conductScore: 89 },
  { id: 'hs-07', fullName: 'Đặng Khánh Hà', dob: '12/02/2009', studentPhone: '0912345607', parentName: 'Đặng Minh Tuấn', parentPhone: '0987654107', role: 'Tổ trưởng 2', seatRow: 1, seatCol: 2, pinned: false, conductScore: 96 },
  { id: 'hs-08', fullName: 'Bùi Trung Hiếu', dob: '27/06/2009', studentPhone: '0912345608', parentName: 'Bùi Thị Hạnh', parentPhone: '0987654108', role: 'Thành viên', seatRow: 1, seatCol: 3, pinned: false, conductScore: 91 },
  { id: 'hs-09', fullName: 'Đỗ Thảo Linh', dob: '03/08/2009', studentPhone: '0912345609', parentName: 'Đỗ Văn Long', parentPhone: '0987654109', role: 'Thành viên', seatRow: 2, seatCol: 0, pinned: false, conductScore: 93 },
  { id: 'hs-10', fullName: 'Hồ Nhật Minh', dob: '16/10/2009', studentPhone: '0912345610', parentName: 'Hồ Thị Thu', parentPhone: '0987654110', role: 'Tổ trưởng 3', seatRow: 2, seatCol: 1, pinned: false, conductScore: 94 },
  { id: 'hs-11', fullName: 'Ngô Phương Nghi', dob: '21/04/2009', studentPhone: '0912345611', parentName: 'Ngô Quốc Khánh', parentPhone: '0987654111', role: 'Thành viên', seatRow: 2, seatCol: 2, pinned: false, conductScore: 90 },
  { id: 'hs-12', fullName: 'Dương Tấn Phát', dob: '09/12/2009', studentPhone: '0912345612', parentName: 'Dương Thị Mỹ', parentPhone: '0987654112', role: 'Thành viên', seatRow: 2, seatCol: 3, pinned: false, conductScore: 88 },
  { id: 'hs-13', fullName: 'Lý Quỳnh Như', dob: '15/06/2009', studentPhone: '0912345613', parentName: 'Lý Văn Sơn', parentPhone: '0987654113', role: 'Tổ trưởng 4', seatRow: 3, seatCol: 0, pinned: false, conductScore: 96 },
  { id: 'hs-14', fullName: 'Trương Anh Quân', dob: '02/01/2009', studentPhone: '0912345614', parentName: 'Trương Thị Nga', parentPhone: '0987654114', role: 'Thành viên', seatRow: 3, seatCol: 1, pinned: false, conductScore: 91 },
  { id: 'hs-15', fullName: 'Mai Thanh Thảo', dob: '18/08/2009', studentPhone: '0912345615', parentName: 'Mai Văn Dũng', parentPhone: '0987654115', role: 'Thủ quỹ', seatRow: 3, seatCol: 2, pinned: true, conductScore: 99 },
  { id: 'hs-16', fullName: 'Phan Hữu Thịnh', dob: '25/05/2009', studentPhone: '0912345616', parentName: 'Phan Thị Bình', parentPhone: '0987654116', role: 'Thành viên', seatRow: 3, seatCol: 3, pinned: false, conductScore: 92 },
];

export const INITIAL_EXAM_ROOMS: OnlineExamRoom[] = [
  {
    id: 'room-0107',
    pinCode: '842027',
    title: 'Kiểm tra Cuối kì I Toán 12 — Mã đề 0107',
    subject: 'Toán',
    durationMinutes: 90,
    examCodesCount: 4,
    antiCheat: true,
    loginMode: 'quick_name',
    status: 'active',
    answerKey: {
      part1: ['A', 'B', 'D', 'C', 'A', 'B', 'C', 'D', 'B', 'C', 'A', 'D'],
      part2: [
        { a: true, b: true, c: false, d: false },
        { a: true, b: true, c: false, d: false },
        { a: true, b: true, c: false, d: false },
        { a: false, b: true, c: false, d: true },
      ],
      part3: ['10', '46,8', '432', '1', '3', '4,5'],
    },
    createdAt: '2026-11-14T08:00:00Z',
  },
];

export const INITIAL_SUBMISSIONS: ExamSubmission[] = [
  { id: 'sub-1', roomId: 'room-0107', studentName: 'Nguyễn Minh Anh', studentClass: '12A1', score: 9.5, tabSwitches: 0, submittedAt: '2026-11-14T09:15:00Z' },
  { id: 'sub-2', roomId: 'room-0107', studentName: 'Trần Gia Bảo', studentClass: '12A1', score: 8.75, tabSwitches: 0, submittedAt: '2026-11-14T09:18:00Z' },
  { id: 'sub-3', roomId: 'room-0107', studentName: 'Lê Hoàng Cẩm Tú', studentClass: '12A1', score: 9.0, tabSwitches: 0, submittedAt: '2026-11-14T09:20:00Z' },
  { id: 'sub-4', roomId: 'room-0107', studentName: 'Phạm Quốc Đạt', studentClass: '12A1', score: 7.5, tabSwitches: 1, submittedAt: '2026-11-14T09:22:00Z' },
  { id: 'sub-5', roomId: 'room-0107', studentName: 'Hoàng Ngọc Diệp', studentClass: '12A1', score: 8.25, tabSwitches: 0, submittedAt: '2026-11-14T09:24:00Z' },
  { id: 'sub-6', roomId: 'room-0107', studentName: 'Võ Đức Duy', studentClass: '12A1', score: 6.25, tabSwitches: 2, submittedAt: '2026-11-14T09:25:00Z' },
  { id: 'sub-7', roomId: 'room-0107', studentName: 'Đặng Khánh Hà', studentClass: '12A1', score: 8.5, tabSwitches: 0, submittedAt: '2026-11-14T09:26:00Z' },
  { id: 'sub-8', roomId: 'room-0107', studentName: 'Bùi Trung Hiếu', studentClass: '12A1', score: 7.0, tabSwitches: 0, submittedAt: '2026-11-14T09:27:00Z' },
  { id: 'sub-9', roomId: 'room-0107', studentName: 'Mai Thanh Thảo', studentClass: '12A1', score: 9.25, tabSwitches: 0, submittedAt: '2026-11-14T09:28:00Z' },
  { id: 'sub-10', roomId: 'room-0107', studentName: 'Dương Tấn Phát', studentClass: '12A1', score: 5.5, tabSwitches: 1, submittedAt: '2026-11-14T09:29:00Z' },
];

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'doc-15-2026',
    code: '15/2026/TT-BGDĐT',
    title: 'Ban hành Điều lệ trường tiểu học, trường THCS, trường THPT và trường phổ thông có nhiều cấp học',
    issuedDate: '24/03/2026',
    category: 'Thông tư',
    summary: 'Đã tích hợp điều 32, điều 33 thuộc Chương V về Nhiệm vụ và quyền của học sinh. Văn bản mới nhất áp dụng từ năm học 2026–2027.',
    keyPoints: [
      'Cập nhật quy chuẩn hồ sơ điện tử của giáo viên bộ môn và giáo viên chủ nhiệm.',
      'Quy định cụ thể quyền và nghĩa vụ học sinh trong môi trường học tập số.',
      'Chuẩn hóa cơ cấu tổ chuyên môn và sinh hoạt chuyên môn theo hướng nghiên cứu bài học.',
    ],
  },
  {
    id: 'doc-22-2021',
    code: '22/2021/TT-BGDĐT',
    title: 'Quy định về đánh giá học sinh trung học cơ sở và học sinh trung học phổ thông',
    issuedDate: '20/07/2021',
    category: 'Thông tư',
    summary: 'Hướng dẫn chi tiết cách đánh giá, xếp loại học sinh THPT theo mức độ Đạt/Chưa đạt và xếp loại Tốt, Khá, Đạt, Chưa đạt.',
    keyPoints: [
      'Đánh giá thường xuyên qua hỏi đáp, phiếu học tập, dự án STEM và kiểm tra trực tuyến.',
      'Điểm trung bình môn học kỳ ĐBMhk = (Tổng ĐĐGtx + 2×ĐĐGgk + 3×ĐĐGck) / (Số ĐĐGtx + 5).',
      'Xếp loại học lực theo 4 mức: Tốt, Khá, Đạt, Chưa đạt.',
    ],
  },
  {
    id: 'doc-5512-2020',
    code: '5512/BGDĐT-GDTrH',
    title: 'Xây dựng và tổ chức thực hiện kế hoạch giáo dục của nhà trường',
    issuedDate: '18/12/2020',
    category: 'Công văn',
    summary: 'Chuẩn hóa mẫu Kế hoạch giáo dục môn học (Phụ lục I) và Kế hoạch bài dạy 4 hoạt động (Phụ lục IV).',
    keyPoints: [
      'Hoạt động 1: Xác định vấn đề/nhiệm vụ học tập (Mở đầu).',
      'Hoạt động 2: Hình thành kiến thức mới/giải quyết vấn đề.',
      'Hoạt động 3: Luyện tập; Hoạt động 4: Vận dụng thực tiễn.',
    ],
  },
  {
    id: 'doc-3456-2025',
    code: '3456/BGDĐT-GDPT',
    title: 'Hướng dẫn triển khai thực hiện khung năng lực số cho học sinh phổ thông (kèm TT 02/2025)',
    issuedDate: '17/04/2025',
    category: 'Công văn',
    summary: 'Tích hợp Năng lực số và Năng lực AI vào kế hoạch dạy học các môn THPT theo Chương trình GDPT 2018.',
    keyPoints: [
      'Gắn mã chỉ báo năng lực số (1.1.NC1a, 2.1.NC1a, 3.2.NC1b...) vào từng bài học trong PPCT.',
      'Khuyến khích sử dụng phần mềm mô phỏng Toán học (GeoGebra, Casio, Python/Canvas).',
      'Định hướng học sinh sử dụng AI có trách nhiệm để tự kiểm tra và phản biện lời giải.',
    ],
  },
];
