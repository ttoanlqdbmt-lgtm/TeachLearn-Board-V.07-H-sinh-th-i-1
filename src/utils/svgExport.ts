import { saveAs } from 'file-saver';

export type ExportBgMode = 'white' | 'transparent';

function prepareSerializedSvg(svgEl: SVGSVGElement, bgMode: ExportBgMode): {
  svgString: string;
  width: number;
  height: number;
} {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const viewBox = svgEl.getAttribute('viewBox');
  let width = svgEl.clientWidth || 720;
  let height = svgEl.clientHeight || 420;

  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // Control background rect tagged with data-export-bg
  const bgRect = clone.querySelector('[data-export-bg="true"]');
  if (bgRect) {
    if (bgMode === 'transparent') {
      bgRect.setAttribute('fill', 'none');
    } else {
      bgRect.setAttribute('fill', '#ffffff');
    }
  } else if (bgMode === 'white') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', '#ffffff');
    clone.insertBefore(rect, clone.firstChild);
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  return { svgString, width, height };
}

export function downloadSvgElement(
  svgEl: SVGSVGElement | null,
  filename: string,
  bgMode: ExportBgMode
) {
  if (!svgEl) return;
  const { svgString } = prepareSerializedSvg(svgEl, bgMode);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  saveAs(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`);
}

async function renderSvgToPngBlob(
  svgEl: SVGSVGElement,
  bgMode: ExportBgMode,
  scale = 3
): Promise<Blob> {
  const { svgString, width, height } = prepareSerializedSvg(svgEl, bgMode);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể chuyển SVG sang PNG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không khởi tạo được Canvas xuất ảnh.');

    ctx.scale(scale, scale);
    if (bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
    );
    if (!pngBlob) throw new Error('Không tạo được tệp PNG.');
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadSvgAsPng(
  svgEl: SVGSVGElement | null,
  filename: string,
  bgMode: ExportBgMode
) {
  if (!svgEl) return;
  const blob = await renderSvgToPngBlob(svgEl, bgMode, 3);
  saveAs(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
}

export async function copySvgAsPngToClipboard(
  svgEl: SVGSVGElement | null,
  bgMode: ExportBgMode
): Promise<'copied' | 'downloaded'> {
  if (!svgEl) throw new Error('Chưa có hình để sao chép.');
  const blob = await renderSvgToPngBlob(svgEl, bgMode, 3);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Fallback if iframe blocks clipboard image write
      saveAs(blob, 'HinhAnh_TeachLearnEdu.png');
      return 'downloaded';
    }
  }
  saveAs(blob, 'HinhAnh_TeachLearnEdu.png');
  return 'downloaded';
}
