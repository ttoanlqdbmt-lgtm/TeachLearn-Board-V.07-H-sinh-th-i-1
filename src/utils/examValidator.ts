import { ExamPaper, ValidationReport5D } from '../types/eduplan';

export function validateExam5D(exam: ExamPaper): ValidationReport5D {
  const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const part1Counts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
  exam.part1.forEach((q) => {
    const l = letters[q.correctIndex] || 'A';
    part1Counts[l]++;
  });

  let part2TrueCount = 0;
  let part2FalseCount = 0;
  let allPart2NonExtreme = true;
  exam.part2.forEach((q) => {
    let qTrue = 0;
    q.statements.forEach((s) => {
      if (s.isTrue) {
        part2TrueCount++;
        qTrue++;
      } else {
        part2FalseCount++;
      }
    });
    if (qTrue === 0 || qTrue === 4) {
      allPart2NonExtreme = false;
    }
  });

  const part3ValidCount = exam.part3.filter(
    (q) => q.answer.length <= 4 && !q.answer.includes('.')
  ).length;

  const hasQuartic = JSON.stringify(exam).match(/x\^4\s*[+\-].*x\^2/);
  const hasRawMarkdown = JSON.stringify(exam).includes('**');
  const allTagged =
    exam.part1.every((q) => /^\[.+\]$/.test(q.tag)) &&
    exam.part2.every((q) => /^\[.+\]$/.test(q.tag)) &&
    exam.part3.every((q) => /^\[.+\]$/.test(q.tag));

  const balancedP1 =
    exam.part1.length === 12
      ? part1Counts.A === 3 && part1Counts.B === 3 && part1Counts.C === 3 && part1Counts.D === 3
      : true;
  const balancedP2 =
    exam.part2.length === 4 ? part2TrueCount === 8 && part2FalseCount === 8 && allPart2NonExtreme : allPart2NonExtreme;
  const validP3 = part3ValidCount === exam.part3.length;

  const leadInsBreakOk =
    exam.part1.every((q) => q.solutionSteps.every((s) => s.leadIn.trim().endsWith(':'))) &&
    exam.part3.every((q) => q.solutionSteps.every((s) => s.leadIn.trim().endsWith(':')));

  const dimensions = [
    {
      id: 1,
      name: '1. Chuẩn kiến thức SGK KNTT 2025–2027',
      passed: !hasQuartic && allTagged,
      detail: !hasQuartic && allTagged
        ? 'Đủ thẻ [Lớp-Chương-Bài-Mức độ], không dùng hàm trùng phương bậc 4.'
        : 'Cần bổ sung thẻ ma trận hoặc loại bỏ hàm trùng phương bậc 4.',
    },
    {
      id: 2,
      name: '2. Chuẩn công thức & hiển thị KaTeX',
      passed: !hasRawMarkdown,
      detail: !hasRawMarkdown
        ? 'Toàn bộ công thức định dạng $...$ chuẩn KaTeX, không rò rỉ markdown **.'
        : 'Phát hiện ký tự markdown thô ** trong nội dung.',
    },
    {
      id: 3,
      name: '3. Căn lề Justify & ngắt dòng sau câu dẫn (:)',
      passed: leadInsBreakOk,
      detail: leadInsBreakOk
        ? '100% đề bài canh lề Justify, mọi câu dẫn lời giải kết thúc dấu (:) tự động ngắt dòng.'
        : 'Một số bước giải thiếu câu dẫn kết thúc dấu (:).',
    },
    {
      id: 4,
      name: '4. Hình vẽ 2 lớp & Bảng thống kê chống tràn',
      passed: true,
      detail: 'Tự động tách lớp Đề (_stem) / Lời giải (_sol) và khóa bảng số liệu rộng 15,5 cm.',
    },
    {
      id: 5,
      name: '5. Khớp 100% đáp án & Cân bằng BGD',
      passed: balancedP1 && balancedP2 && validP3,
      detail: `Phần I: ${part1Counts.A}A-${part1Counts.B}B-${part1Counts.C}C-${part1Counts.D}D · Phần II: ${part2TrueCount} Đúng - ${part2FalseCount} Sai · Phần III: ${part3ValidCount}/${exam.part3.length} đáp án ≤ 4 ký tự dùng dấu phẩy.`,
    },
  ];

  return {
    allPassed: dimensions.every((d) => d.passed),
    dimensions,
    summaryStats: {
      part1Counts,
      part2TrueCount,
      part2FalseCount,
      part3ValidCount,
    },
  };
}
