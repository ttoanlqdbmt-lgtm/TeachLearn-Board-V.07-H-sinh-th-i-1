import React from 'react';
import { DiagramKind } from '../types/eduplan';
import { buildDiagramSvgSpec } from '../utils/diagramSvg';

interface ExamDiagramProps {
  kind: DiagramKind;
  layer: 'stem' | 'sol';
}

export const ExamDiagram: React.FC<ExamDiagramProps> = ({ kind, layer }) => {
  if (kind === 'stat_table_12') {
    const groups = ['[30; 50)', '[50; 70)', '[70; 90)', '[90; 110)', '[110; 130)'];
    const freqs = [6, 10, 12, 8, 4];
    return (
      <div className="my-3 flex flex-col items-center">
        <div className="w-full max-w-[15.5cm] overflow-x-auto">
          <table className="w-full border-collapse border border-black text-[12pt] tabular-nums">
            <tbody>
              <tr>
                <td className="w-[3.8cm] border border-black bg-[#F1F5F9] px-2 py-1.5 font-bold text-[#0F172A]">
                  Thời gian (phút)
                </td>
                {groups.map((g) => (
                  <td key={g} className="border border-black px-2 py-1.5 text-center font-medium text-black">
                    {g}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="w-[3.8cm] border border-black bg-[#F1F5F9] px-2 py-1.5 font-bold text-[#0F172A]">
                  Số học sinh
                </td>
                {freqs.map((f, idx) => (
                  <td
                    key={idx}
                    className={`border border-black px-2 py-1.5 text-center text-black ${
                      layer === 'sol' && idx === 2 ? 'bg-[#FEE2E2] font-bold text-[#B91C1C]' : ''
                    }`}
                  >
                    {f}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const spec = buildDiagramSvgSpec(kind, layer, false);
  if (!spec) return null;

  return (
    <div className="my-3 flex flex-col items-center">
      <div
        className="w-full flex justify-center [&>svg]:h-auto [&>svg]:max-w-full"
        style={{ maxWidth: `${spec.width}px` }}
        dangerouslySetInnerHTML={{ __html: spec.svg }}
      />
      {layer === 'sol' && spec.solCaption && (
        <div
          className="mt-1.5 w-full rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-1.5 text-center text-[10.5pt] font-semibold text-[#B91C1C]"
          style={{ maxWidth: `${spec.width}px` }}
        >
          {spec.solCaption}
        </div>
      )}
    </div>
  );
};
