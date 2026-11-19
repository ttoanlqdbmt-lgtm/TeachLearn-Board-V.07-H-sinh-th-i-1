import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';
import { WebSocketServer } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));

const PORT = Number(process.env.PORT || 3000);
const MODEL_TEXT = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MATH_EXAM_SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI chuyên sâu hỗ trợ Thầy giáo Lê Trọng Toàn (Tổ Toán – Trường THPT Lê Quý Đôn, Sở GD&ĐT Đắk Lắk) biên soạn đề kiểm tra, phiếu học tập và giáo án môn Toán theo SGK Kết nối tri thức với cuộc sống (GDPT 2018) và chuẩn Đề thi BGD&ĐT 2025–2027.

QUY TẮC BẮT BUỘC KHI SOẠN ĐỀ & GIẢI TOÁN:
1. Dùng cú pháp KaTeX thuần túy trong cặp dấu $...$ (cùng dòng) hoặc $$...$$ (độc lập). TUYỆT ĐỐI KHÔNG dùng \\begin{align*}, \\begin{eqnarray*}, \\begin{equation}, \\[...\\], \\(...\\). Dùng \\frac thay vì \\dfrac/\\tfrac. Không để ký tự markdown ** hoặc tiêu đề thừa.
2. Không sử dụng hàm trùng phương bậc 4 (thay bằng hàm phân thức bậc 2 trên bậc 1 hoặc bậc 3).
3. Phần I (Trắc nghiệm 4 lựa chọn): Cân bằng đáp án chuẩn 3A - 3B - 3C - 3D nếu đủ 12 câu. Trong mảng options chỉ ghi nội dung phương án (KHÔNG ghi kèm ký hiệu A., B., C., D. ở đầu nếu đã tách thành mảng 4 phần tử), mỗi phương án kết thúc bằng dấu chấm (.).
4. Phần II (Đúng/Sai): Mỗi câu có 4 ý a, b, c, d. Tổng số ý đúng và sai cân bằng (8 Đúng - 8 Sai nếu 4 câu; mỗi câu có 1 đến 3 ý đúng).
5. Phần III (Trả lời ngắn): Đáp số tối đa 4 ký tự (tính cả dấu - và dấu phẩy ,). Số thập phân bắt buộc dùng dấu phẩy (,), tuyệt đối không dùng dấu chấm (.).
6. Gắn thẻ phân loại ở đầu câu dạng [Lớp-Chương-Bài-Mức độ], ví dụ [12-C1-B1-NB].
7. LỜI GIẢI CHI TIẾT: Mỗi bước giải chỉ trả về ĐÚNG 1 DÒNG DUY NHẤT theo định dạng chuẩn "Bước 1: [Nội dung giải]", "Bước 2: [Nội dung giải]". TUYỆT ĐỐI KHÔNG tự tách dòng tạo tiêu đề bước riêng phía trên, KHÔNG lặp lại nhãn "Bước 1:", "Bước 2:", và luôn tách riêng trường "dap_so" ở cuối cùng.`;

const SERVER_LATEX_ESCAPE_COLLISION_RE =
  /^(?:frac\b|forall\b|flat\b|fbox\b|tan\b|tanh\b|text\b|textbf\b|textit\b|textrm\b|texttt\b|textsf\b|tfrac\b|mathrm\b|times\b|to\b|triangle\b|theta\b|tau\b|tilde\b|top\b|begin\b|beta\b|bar\b|big\b|Big\b|bigg\b|Bigg\b|binom\b|boxed\b|bullet\b|bot\b|bf\b|bm\b|bold\b|boldsymbol\b|right\b|rightarrow\b|Rightarrow\b|rho\b|rangle\b|rceil\b|rfloor\b|rbrace\b|rbrack\b|rm\b|neq\b|ne\b|not\b|notin\b|nleq\b|ngeq\b|nabla\b|nu\b|ni\b|natural\b)/;

/**
 * Escapes unescaped LaTeX backslashes (`\`) inside JSON string literals BEFORE calling JSON.parse()
 * so mathematical formulas never trigger JSON SyntaxError or corrupt `\frac`, `\tan`, `\beta`, `\neq`.
 */
function escapeRawJsonMathBackslashes(rawJson: string): string {
  const cleaned = rawJson
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let out = '';
  let inString = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
      }
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch === '\\') {
      const next = cleaned[i + 1];
      if (next === undefined) {
        out += '\\\\';
        continue;
      }
      if (next === '\\' || next === '"' || next === '/') {
        out += ch + next;
        i += 1;
        continue;
      }
      const rest = cleaned.slice(i + 1, i + 20);
      if (SERVER_LATEX_ESCAPE_COLLISION_RE.test(rest)) {
        out += '\\\\' + next;
        i += 1;
        continue;
      }
      if (next === 'b' || next === 'f' || next === 'n' || next === 'r' || next === 't') {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(cleaned.slice(i + 2, i + 6))) {
        out += ch + next;
        i += 1;
        continue;
      }
      out += '\\\\' + next;
      i += 1;
      continue;
    }

    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    if (ch === '\u000c') {
      out += '\\\\f';
      continue;
    }
    if (ch === '\u0008') {
      out += '\\\\b';
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }

  return out;
}

function safeParseGeminiJson<T = Record<string, unknown>>(rawText: string, fallback = '{}'): T {
  const source = (rawText || fallback).trim() || fallback;
  const escaped = escapeRawJsonMathBackslashes(source);
  try {
    return JSON.parse(escaped) as T;
  } catch {
    // Secondary fallback: extract outermost JSON object if extra text surrounded it
    const firstBrace = escaped.indexOf('{');
    const lastBrace = escaped.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(escaped.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('Không thể phân tích dữ liệu JSON từ phản hồi của Gemini AI.');
  }
}

const SERVER_VIETNAMESE_PROSE_RE =
  /(?:^|\s)([a-zA-Z]*[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ][a-zA-ZàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]*)/;
const SERVER_MATH_SIGNAL_RE = /(?:\\[a-zA-Z]+|[=<>^_+\-*/]|[0-9]|[a-zA-Z]\s*\()/;

function balanceServerInlineDollars(input: string): string {
  if (!input || !input.includes('$')) return input;
  const blockHolders: string[] = [];
  const escapedHolders: string[] = [];

  let work = input.replace(/\\\$/g, () => {
    const idx = escapedHolders.length;
    escapedHolders.push('\\$');
    return `\uE000ESC${idx}\uE000`;
  });

  const ddMatches = work.match(/\$\$/g);
  if (ddMatches && ddMatches.length % 2 === 1) {
    work = `${work}$$`;
  }

  work = work.replace(/\$\$([\s\S]*?)\$\$/g, (full) => {
    const idx = blockHolders.length;
    blockHolders.push(full);
    return `\uE000BLK${idx}\uE000`;
  });

  const lines = work.split('\n').map((line) => {
    const pos: number[] = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '$') pos.push(i);
    }
    if (pos.length % 2 === 0) return line;
    const lastIdx = pos[pos.length - 1];
    const afterLast = line.slice(lastIdx + 1);
    if (/^[.,;:!?)\s]*$/.test(afterLast)) {
      return line.slice(0, lastIdx) + afterLast;
    }
    if (SERVER_MATH_SIGNAL_RE.test(afterLast)) {
      const withoutTextCmd = afterLast.replace(/\\text\{[^}]*\}/g, (m) => ' '.repeat(m.length));
      const vnMatch = SERVER_VIETNAMESE_PROSE_RE.exec(withoutTextCmd);
      if (vnMatch && vnMatch.index > 0) {
        let cut = vnMatch.index;
        while (cut > 0 && /\s/.test(afterLast[cut - 1])) cut -= 1;
        return `${line.slice(0, lastIdx + 1)}${afterLast.slice(0, cut)}$${afterLast.slice(cut)}`;
      }
      const punctMatch = afterLast.match(/^(.*?)([.,;:!?]+\s*)$/);
      if (punctMatch && punctMatch[1].trim()) {
        return `${line.slice(0, lastIdx + 1)}${punctMatch[1].trimEnd()}$${punctMatch[2]}`;
      }
      return `${line.trimEnd()}$`;
    }
    return line.slice(0, lastIdx) + afterLast;
  });

  let restored = lines.join('\n');
  restored = restored.replace(/\uE000BLK(\d+)\uE000/g, (_m, idxStr: string) => blockHolders[Number(idxStr)] ?? '');
  restored = restored.replace(/\uE000ESC(\d+)\uE000/g, (_m, idxStr: string) => escapedHolders[Number(idxStr)] ?? '\\$');
  return restored;
}

function sanitizeKatexServer(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let out = input
    .replace(/\u000c/g, '\\f')
    .replace(/\u0008/g, '\\b')
    .replace(/\r\n/g, '\n');

  // Repair double-escaped LaTeX commands (\\frac -> \frac, \\overrightarrow -> \overrightarrow)
  out = out.replace(/(?<!\\)\\\\(?=(?:[a-zA-Z]{2,}|[{}(),;!|]))/g, '\\');
  out = out.replace(/(?<!\\)\\\\\[(?![\d.-]+\s*(?:pt|em|ex|mm|cm|px)\])/g, '\\[');
  out = out.replace(/(?<!\\)\\\\\]/g, '\\]');

  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`);
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`);

  out = out.replace(
    /\\begin\{(?:align\*?|eqnarray\*?|flalign\*?|multline\*?)\}([\s\S]*?)\\end\{(?:align\*?|eqnarray\*?|flalign\*?|multline\*?)\}/gi,
    (_m, inner: string) => {
      const cleanedInner = inner
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\nonumber\b/g, '')
        .replace(/\\notag\b/g, '')
        .trim();
      return `$$\\begin{aligned}${cleanedInner}\\end{aligned}$$`;
    }
  );

  out = out.replace(
    /\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/gi,
    (_m, inner: string) => {
      const cleanedInner = inner
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\nonumber\b/g, '')
        .replace(/\\notag\b/g, '')
        .trim();
      return `$$${cleanedInner}$$`;
    }
  );

  out = out.replace(
    /\\begin\{gather\*?\}([\s\S]*?)\\end\{gather\*?\}/gi,
    (_m, inner: string) => `$$\\begin{gathered}${inner.trim()}\\end{gathered}$$`
  );

  out = out
    .replace(/\\(?:d|t)frac(?![a-zA-Z])/g, '\\frac')
    .replace(/\\mbox\{/g, '\\text{')
    .replace(/\\mathbbm\{/g, '\\mathbb{')
    .replace(/\\bm\{/g, '\\boldsymbol{')
    .replace(/\\hdots\b/g, '\\dots')
    .replace(/\\operatorname\*\{/g, '\\operatorname{')
    .replace(/\\nonumber\b/g, '')
    .replace(/\\notag\b/g, '');

  out = out.replace(/\${3,}/g, () => '$$');
  out = balanceServerInlineDollars(out);
  return out.trim();
}

const SERVER_STEP_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Bước|Buoc|Step)\s*\d+\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;
const SERVER_OPTION_PREFIX_RE = /^(?:\s*(?:\*{1,2})?[A-Da-d]\s*[.:]\s*(?:\*{1,2})?\s*)+/;
const SERVER_EXAMPLE_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Ví\s*dụ|Vi\s*du|VD)\s*\d*\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;
const SERVER_CONCLUSION_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Kết\s*luận|Đáp\s*số(?:\s*chuẩn)?|Đáp\s*án(?:\s*đúng)?|Trả\s*lời)\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;
const SERVER_STEM_PREFIX_RE =
  /^(?:\s*(?:\*{1,2})?(?:Ví\s*dụ|Vi\s*du|VD|Bài\s*tập)\s*\d+\s*(?:[:.\-–—]\s*)?(?:\*{1,2})?\s*)+/i;

function cleanDirectStepText(raw: string): string {
  return sanitizeKatexServer(raw)
    .split('\n')
    .map((line) => line.trim().replace(SERVER_STEP_PREFIX_RE, '').trim())
    .filter(Boolean)
    .join(' ');
}

function cleanDirectOptionText(raw: string): string {
  const s = sanitizeKatexServer(raw);
  const stripped = s.replace(SERVER_OPTION_PREFIX_RE, '').trim();
  return stripped || s;
}

function cleanDirectExampleTitle(raw: string): string {
  const s = sanitizeKatexServer(raw);
  const stripped = s.replace(SERVER_EXAMPLE_PREFIX_RE, '').trim();
  return stripped || s;
}

function cleanDirectConclusion(raw: string): string {
  const s = sanitizeKatexServer(raw);
  const stripped = s.replace(SERVER_CONCLUSION_PREFIX_RE, '').trim();
  return stripped || s;
}

function cleanDirectStemPrefix(raw: string): string {
  const s = sanitizeKatexServer(raw);
  const stripped = s.replace(SERVER_STEM_PREFIX_RE, '').trim();
  return stripped || s;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets của hệ thống.' });
    return;
  }

  try {
    const {
      message,
      history = [],
      context = '',
      model = MODEL_TEXT,
      useSearchGrounding = false,
      useMapsGrounding = false,
      userLocation,
    } = req.body as {
      message: string;
      history?: { role: string; text: string }[];
      context?: string;
      model?: string;
      useSearchGrounding?: boolean;
      useMapsGrounding?: boolean;
      userLocation?: { latitude: number; longitude: number };
    };

    const allowedModels = [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-4-carbon',
    ];
    const selectedModel = allowedModels.includes(model) ? model : MODEL_TEXT;
    // When using Google Search or Google Maps grounding, gemini-4-hydrogen is required
    const effectiveModel =
      useSearchGrounding || useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel;

    const transcript = history
      .slice(-8)
      .map((h) => `${h.role === 'user' ? 'Giáo viên' : 'TeachLearn AI'}: ${h.text}`)
      .join('\n');

    const prompt = `${context ? `Ngữ cảnh công việc: ${context}\n` : ''}${transcript ? `Lịch sử hội thoại:\n${transcript}\n` : ''}Yêu cầu hiện tại của Thầy/Cô: ${message}`;

    const tools: Array<Record<string, unknown>> = [];
    if (useSearchGrounding) {
      tools.push({ googleSearch: {} });
    }
    if (useMapsGrounding) {
      tools.push({ googleMaps: {} });
    }

    const config: Record<string, unknown> = {
      systemInstruction:
        'Bạn là Trợ lý Chuyên môn TeachLearn Edu hỗ trợ Thầy giáo Lê Trọng Toàn (Trường THPT Lê Quý Đôn, Đắk Lắk). Am hiểu sâu Quyết định 2422, Công văn 5512, Thông tư 22/2021, Thông tư 02/2025 & CV 3456 về năng lực số và SGK Kết nối tri thức với cuộc sống. Trả lời sư phạm, súc tích, dùng LaTeX chuẩn $...$ cho công thức toán.',
    };

    if (effectiveModel === 'gemini-4-hydrogen') {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    if (tools.length > 0) {
      config.tools = tools;
    }
    if (useMapsGrounding && userLocation && typeof userLocation.latitude === 'number' && typeof userLocation.longitude === 'number') {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: effectiveModel,
      contents: prompt,
      config,
    });

    const groundingLinks: Array<{ title: string; uri: string; sourceType: 'web' | 'maps' }> = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      for (const ch of chunks) {
        const webChunk = (ch as { web?: { uri?: string; title?: string } }).web;
        if (webChunk?.uri) {
          groundingLinks.push({
            title: webChunk.title || webChunk.uri,
            uri: webChunk.uri,
            sourceType: 'web',
          });
        }
        const mapsChunk = (ch as { maps?: { uri?: string; title?: string } }).maps;
        if (mapsChunk?.uri) {
          groundingLinks.push({
            title: mapsChunk.title || 'Địa điểm trên Google Maps',
            uri: mapsChunk.uri,
            sourceType: 'maps',
          });
        }
      }
    }

    res.json({
      reply: response.text || 'Không có phản hồi từ mô hình.',
      modelUsed: effectiveModel,
      groundingLinks,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối Gemini API';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/image-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/png',
      aspectRatio = '1:1',
      model = 'gemini-3.1-flash-lite-image',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      aspectRatio?: string;
      model?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập mô tả hình ảnh cần tạo hoặc chỉnh sửa.' });
      return;
    }

    const chosenModel =
      model === 'gemini-nano-banana-2.1' ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';

    let interaction: any;
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      interaction = await ai.interactions.create({
        model: chosenModel,
        input: [
          {
            type: 'image',
            data: cleanBase64,
            mime_type: mimeType,
          },
          {
            type: 'text',
            text: prompt.trim(),
          },
        ],
      } as any);
    } else {
      interaction = await ai.interactions.create({
        model: chosenModel,
        input: prompt.trim(),
        response_modalities: ['image', 'text'],
        generation_config: {
          image_config: {
            aspect_ratio: aspectRatio,
            image_size: '1K',
          },
        },
      } as any);
    }

    let imageUrl = '';
    let caption = '';

    if (interaction?.output_image?.data) {
      const outMime = interaction.output_image.mime_type || 'image/png';
      imageUrl = `data:${outMime};base64,${interaction.output_image.data}`;
    }

    if (Array.isArray(interaction?.steps)) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          for (const c of step.content) {
            if (c.type === 'image' && c.data && !imageUrl) {
              const outMime = c.mime_type || 'image/png';
              imageUrl = `data:${outMime};base64,${c.data}`;
            }
            if (c.type === 'text' && c.text && !caption) {
              caption = c.text;
            }
          }
        }
      }
    }

    if (!imageUrl) {
      res.status(500).json({
        error: 'Mô hình không trả về dữ liệu hình ảnh. Hãy thử mô tả chi tiết hơn hoặc chọn gemini-3.1-flash-lite-image.',
      });
      return;
    }

    res.json({ imageUrl, caption, modelUsed: chosenModel });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo/chỉnh sửa ảnh AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/video-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/png',
      aspectRatio = '16:9',
      duration = '6s',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      aspectRatio?: '16:9' | '9:16';
      duration?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập kịch bản hoặc mô tả chuyển động video.' });
      return;
    }

    const inputPayload = imageBase64
      ? [
          {
            type: 'image',
            mime_type: mimeType,
            data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64,
          },
          {
            type: 'text',
            text: prompt.trim(),
          },
        ]
      : prompt.trim();

    const interaction: any = await ai.interactions.create(
      {
        model: 'gemini-omni-1.2-flash',
        input: inputPayload,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
          duration: duration || '6s',
          resolution: '720p',
        },
      } as any,
      { timeout: 300000 }
    );

    const videoPart = interaction?.output_video;
    if (!videoPart?.data) {
      res.status(500).json({
        error: 'Không nhận được dữ liệu video từ gemini-omni-1.2-flash (lưu ý mô hình video yêu cầu khóa API trả phí).',
      });
      return;
    }

    const outMime = videoPart.mime_type || 'video/mp4';
    res.json({
      videoDataUrl: `data:${outMime};base64,${videoPart.data}`,
      modelUsed: 'gemini-omni-1.2-flash',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo video AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/music-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/jpeg',
      model = 'lyria-3-clip-preview',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      model?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập mô tả giai điệu hoặc nhạc nền cần tạo.' });
      return;
    }

    const chosenModel =
      model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    const contents = imageBase64
      ? {
          parts: [
            { text: prompt.trim() },
            {
              inlineData: {
                data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64,
                mimeType,
              },
            },
          ],
        }
      : prompt.trim();

    const responseStream = await ai.models.generateContentStream({
      model: chosenModel,
      contents,
      config: {
        responseModalities: [Modality.AUDIO],
      },
    });

    let audioBase64 = '';
    let lyrics = '';
    let outMimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            outMimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      res.status(500).json({
        error: 'Mô hình Lyria không trả về dữ liệu âm thanh (lưu ý Lyria yêu cầu khóa GEMINI_API_KEY có bật quyền truy cập).',
      });
      return;
    }

    res.json({
      audioBase64,
      mimeType: outMimeType,
      lyrics,
      modelUsed: chosenModel,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo nhạc Lyria AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/transcribe', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      audioBase64,
      mimeType = 'audio/webm',
      prompt = 'Hãy chép lời (transcribe) chính xác đoạn âm thanh này sang văn bản tiếng Việt, giữ chuẩn ký hiệu Toán học nếu có.',
    } = req.body as {
      audioBase64: string;
      mimeType?: string;
      prompt?: string;
    };

    if (!audioBase64) {
      res.status(400).json({ error: 'Không có dữ liệu âm thanh để chép lời.' });
      return;
    }

    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const interaction: any = await ai.interactions.create({
      model: 'gemini-3.5-transcribe',
      input: [
        {
          type: 'audio',
          data: cleanBase64,
          mime_type: mimeType,
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    } as any);

    let transcript = interaction?.output_text || '';
    if (!transcript && Array.isArray(interaction?.steps)) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          const txtPart = step.content.find((c: any) => c.type === 'text');
          if (txtPart?.text) {
            transcript = txtPart.text;
            break;
          }
        }
      }
    }

    res.json({ transcript: transcript || 'Không nhận diện được giọng nói trong đoạn ghi âm.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi chép lời âm thanh';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/solve-exercise', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { textPrompt, imageBase64, mimeType = 'image/png', subject = 'Toán' } = req.body as {
      textPrompt?: string;
      imageBase64?: string;
      mimeType?: string;
      subject?: string;
    };

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    const solveExerciseSchema = {
      type: Type.OBJECT,
      properties: {
        recognizedText: {
          type: Type.STRING,
          description: 'Đề bài trích xuất đầy đủ dùng cú pháp KaTeX chuẩn $...$ hoặc $$...$$.',
        },
        steps: {
          type: Type.ARRAY,
          description: 'Các bước giải tuần tự từ Bước 1, Bước 2, ... Mỗi bước là 1 dòng rõ ràng.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Nhãn bước dạng "Bước 1:", "Bước 2:", ...',
              },
              leadIn: {
                type: Type.STRING,
                description: 'Để chuỗi rỗng "" để tránh lặp tiêu đề bước.',
              },
              mathDetail: {
                type: Type.STRING,
                description:
                  'Nội dung phép biến đổi & tính toán của bước trên đúng 1 dòng duy nhất, dùng $...$ / $$...$$, KHÔNG lặp tiền tố "Bước 1:".',
              },
            },
            required: ['title', 'leadIn', 'mathDetail'],
          },
        },
        dap_so: {
          type: Type.STRING,
          description:
            'Đáp số / kết luận cuối cùng đặt riêng (dùng $...$ cho công thức Toán, KHÔNG ghi lặp tiền tố "Đáp số:").',
        },
        finalAnswer: {
          type: Type.STRING,
          description: 'Tóm tắt đáp số cuối cùng (giống dap_so, dùng $...$ cho công thức Toán).',
        },
        diagramHint: {
          type: Type.STRING,
          description: 'Mô tả ngắn hình vẽ/đồ thị nếu bài toán có hình minh họa (hoặc chuỗi rỗng "").',
        },
      },
      required: ['recognizedText', 'steps', 'dap_so', 'finalAnswer', 'diagramHint'],
    };

    parts.push({
      text: `Hãy nhận diện (OCR nếu có ảnh) và giải chi tiết bài tập môn ${subject} sau theo đúng chuẩn sư phạm SGK Kết nối tri thức:\n${textPrompt || 'Giải bài toán trong ảnh đính kèm.'}\n\nQUY TẮC BẮT BUỘC:\n1. Chỉ dùng cú pháp KaTeX thuần túy trong cặp dấu $...$ (cùng dòng) hoặc $$...$$ (độc lập). Tuyệt đối không dùng \\begin{align*}, \\begin{eqnarray*}, \\[...\\], \\(...\\), \\dfrac, \\tfrac.\n2. Trình bày mỗi bước giải trên 1 dòng rõ ràng trong mảng "steps" (không lặp nhãn "Bước 1:" trong mathDetail).\n3. Tách riêng đáp số cuối cùng vào trường "dap_so" và "finalAnswer".`,
    });

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts },
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: solveExerciseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawSolved = safeParseGeminiJson<{
      recognizedText?: string;
      steps?: Array<{ title?: string; leadIn?: string; mathDetail?: string }>;
      dap_so?: string;
      finalAnswer?: string;
      diagramHint?: string;
    }>(response.text || '{}');

    const cleanDapSo = cleanDirectConclusion(rawSolved.dap_so || rawSolved.finalAnswer || '');
    res.json({
      result: {
        recognizedText: sanitizeKatexServer(rawSolved.recognizedText || textPrompt || ''),
        steps: Array.isArray(rawSolved.steps)
          ? rawSolved.steps
              .map((st, idx) => ({
                title: `Bước ${idx + 1}:`,
                leadIn: '',
                mathDetail: cleanDirectStepText(st?.mathDetail || st?.leadIn || st?.title || ''),
              }))
              .filter((st) => Boolean(st.mathDetail))
          : [],
        dap_so: cleanDapSo,
        finalAnswer: cleanDapSo,
        diagramHint: sanitizeKatexServer(rawSolved.diagramHint || ''),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi giải bài tập';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/generate-exam', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      subject = 'Toán',
      grade = '12',
      semester = 'Học kỳ 1',
      topic = 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
      lesson = 'Đường tiệm cận của đồ thị hàm số',
      part1Count = 4,
      part2Count = 2,
      part3Count = 2,
      realWorldRatio = 40,
      includeParamM = true,
    } = req.body as {
      subject?: string;
      grade?: string;
      semester?: string;
      topic?: string;
      lesson?: string;
      part1Count?: number;
      part2Count?: number;
      part3Count?: number;
      realWorldRatio?: number;
      includeParamM?: boolean;
    };

    const prompt = `Hãy biên soạn 1 đề kiểm tra / phiếu học tập môn ${subject} Lớp ${grade} (${semester}), Chương/Chủ đề: "${topic}", Bài: "${lesson}" chuẩn SGK Kết nối tri thức với cuộc sống.
RÀNG BUỘC CHUYÊN MÔN TUYỆT ĐỐI:
1. TOÀN BỘ 100% câu hỏi ở cả 3 Phần phải thuộc đúng Khối Lớp ${grade}, Chương "${topic}" và trọng tâm "${lesson}". TUYỆT ĐỐI KHÔNG trộn câu hỏi của lớp khác hoặc chương khác!
2. Gắn thẻ [Lớp-Chương-Bài-Mức độ] chính xác (ví dụ [${grade}-C1-B1-NB], [${grade}-C1-B2-TH], [${grade}-C1-B3-VD], [${grade}-C1-B5-VDC]).
3. Tuyệt đối KHÔNG sử dụng hàm trùng phương bậc 4 ($ax^4 + bx^2 + c$). Thay bằng hàm bậc 3 hoặc hàm phân thức bậc 2/bậc 1.
4. Nếu Phần I có 12 câu thì đáp án đúng PHẢI cân bằng chính xác 3A - 3B - 3C - 3D.
5. Nếu Phần II có 4 câu (16 ý) thì tổng số ý Đúng - Sai PHẢI cân bằng 8 Đúng - 8 Sai (mỗi câu có 1 đến 3 ý đúng).
6. Phần III: Đáp án <= 4 ký tự, số thập phân bắt buộc dùng dấu phẩy (,), tuyệt đối không dùng dấu chấm (.).
7. Lời giải chi tiết: Mỗi bước chỉ trả về ĐÚNG 1 DÒNG DUY NHẤT theo định dạng chuẩn "Bước 1: [Nội dung giải]", "Bước 2: [Nội dung giải]". Cụ thể đặt "title": "Bước 1:", để trống "leadIn": "", và đặt toàn bộ nội dung biến đổi toán học vào "math" trên 1 dòng (TUYỆT ĐỐI KHÔNG tự tách dòng lặp lại "Bước 1", "Bước 1:", "Bước 2" trong "leadIn" hay "math"). Trong mảng "options" chỉ ghi nội dung phương án, không tự chèn ký hiệu A., B., C., D. ở đầu.

Cấu hình số lượng:
- Phần I (Trắc nghiệm 4 lựa chọn): ${part1Count} câu.
- Phần II (Đúng/Sai 4 ý a,b,c,d): ${part2Count} câu.
- Phần III (Trả lời ngắn): ${part3Count} câu.
- Tỷ lệ bài toán thực tế: ~${realWorldRatio}%.
- ${includeParamM ? 'Có câu hỏi chứa tham số m phân hóa.' : 'Không cần tham số m.'}

Trả về đúng định dạng JSON thuần:
{
  "title": "PHIẾU HỌC TẬP / ĐỀ KIỂM TRA LỚP ${grade} ...",
  "examCode": "0108",
  "part1": [
    {
      "id": "p1_1",
      "tag": "[${grade}-C1-B1-NB]",
      "stem": "Câu dẫn...",
      "options": ["Nội dung phương án 1.", "Nội dung phương án 2.", "Nội dung phương án 3.", "Nội dung phương án 4."],
      "correctIndex": 0,
      "solutionSteps": [
        { "title": "Bước 1:", "leadIn": "", "math": "Nội dung biến đổi LaTeX $...$ trên đúng 1 dòng duy nhất." },
        { "title": "Bước 2:", "leadIn": "", "math": "Suy ra kết quả và kết luận chọn phương án đúng trên 1 dòng." }
      ]
    }
  ],
  "part2": [
    {
      "id": "p2_1",
      "tag": "[${grade}-C1-B2-TH]",
      "stem": "Câu dẫn...",
      "statements": [
        { "label": "a", "text": "...", "isTrue": true, "stepTitle": "Bước 1:", "leadIn": "", "explanation": "Xét ý a): Biến đổi LaTeX $...$ trên 1 dòng." },
        { "label": "b", "text": "...", "isTrue": true, "stepTitle": "Bước 2:", "leadIn": "", "explanation": "Xét ý b): Biến đổi LaTeX $...$ trên 1 dòng." },
        { "label": "c", "text": "...", "isTrue": false, "stepTitle": "Bước 3:", "leadIn": "", "explanation": "Xét ý c): Biến đổi LaTeX $...$ trên 1 dòng." },
        { "label": "d", "text": "...", "isTrue": false, "stepTitle": "Bước 4:", "leadIn": "", "explanation": "Xét ý d): Biến đổi LaTeX $...$ trên 1 dòng." }
      ]
    }
  ],
  "part3": [
    {
      "id": "p3_1",
      "tag": "[${grade}-C1-B5-VD]",
      "stem": "Câu dẫn bài toán trả lời ngắn...",
      "answer": "12,5",
      "solutionSteps": [
        { "title": "Bước 1:", "leadIn": "", "math": "Mô hình hóa và thiết lập biểu thức LaTeX $...$ trên đúng 1 dòng." },
        { "title": "Bước 2:", "leadIn": "", "math": "Tính toán kết quả cuối cùng trên đúng 1 dòng." }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ exam: safeParseGeminiJson(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo đề AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/blueprint-step1', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { sourceText, presetName = 'Đề Tốt nghiệp THPT 2026–2027' } = req.body as {
      sourceText: string;
      presetName?: string;
    };

    const prompt = `Giai đoạn 1 (Trích xuất Blueprint Ma trận & Đặc tả) cho cấu hình "${presetName}".
Phân tích đề gốc sau và xuất JSON ma trận đặc tả chi tiết:
${sourceText}

Trả về JSON:
{
  "examName": "...",
  "subjectGrade": "...",
  "durationMinutes": 90,
  "totalScore": 10,
  "cognitiveBreakdown": { "NB": 40, "TH": 30, "VD": 20, "VDC": 10 },
  "rows": [
    { "questionNo": "Câu 1", "part": "Phần I", "topic": "...", "level": "NB", "skill": "...", "score": 0.25 }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ blueprint: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi trích xuất Blueprint';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/blueprint-step2', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { blueprintJson, presetName = 'Đề tương tự Đẳng cấu' } = req.body as {
      blueprintJson: unknown;
      presetName?: string;
    };

    const prompt = `Giai đoạn 2 (Sinh Đề Đẳng Cấu Zero-Clone 100%) dựa trên Blueprint sau (${presetName}):
${JSON.stringify(blueprintJson)}

Hãy tạo mới hoàn toàn các câu hỏi đẳng cấu (thay đổi ngữ cảnh, số liệu, hàm số khác nhưng giữ đúng mức độ NB/TH/VD/VDC và chuyên đề).
QUY TẮC LỜI GIẢI & PHƯƠNG ÁN: Trong "solution", mỗi bước chỉ trả về đúng 1 dòng duy nhất theo định dạng chuẩn "Bước 1: [Nội dung giải]\\nBước 2: [Nội dung giải]", tuyệt đối không tự tách dòng lặp lại tiêu đề bước. Trong mảng "options" chỉ ghi nội dung phương án (không lặp A., B., C., D.).
Trả về JSON gồm:
{
  "title": "...",
  "questions": [
    { "no": "Câu 1", "tag": "[12-C1-B1-NB]", "part": "Phần I", "stem": "...", "options": ["...", "...", "...", "..."], "answer": "B", "solution": "Bước 1: [Nội dung giải]\\nBước 2: [Nội dung giải và kết luận]" }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ generated: safeParseGeminiJson(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi sinh đề đẳng cấu';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/lesson-plan', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      subject = 'Toán',
      grade = '12',
      lessonTitle = 'Tính đơn điệu và cực trị của hàm số',
      periods = 2,
      track = 'Đại trà (6.5–8.0)',
      includeDigitalCompetency = true,
    } = req.body as {
      subject?: string;
      grade?: string;
      lessonTitle?: string;
      periods?: number;
      track?: string;
      includeDigitalCompetency?: boolean;
    };

    const prompt = `Soạn Kế hoạch bài dạy (Giáo án) chuẩn Công văn 5512 môn ${subject} Lớp ${grade}, Bài: "${lessonTitle}" (${periods} tiết), Đối tượng: ${track}.
${includeDigitalCompetency ? 'Tích hợp Năng lực số theo Thông tư 02/2025 & CV 3456 và định hướng STEM/AI.' : ''}
Trả về JSON:
{
  "header": { "school": "THPT Lê Quý Đôn", "teacher": "Lê Trọng Toàn", "lesson": "${lessonTitle}", "periods": ${periods} },
  "objectives": { "knowledge": "...", "competencies": "...", "qualities": "...", "digitalAi": "..." },
  "activities": [
    { "name": "Hoạt động 1: Khởi động (Mở đầu)", "duration": "10 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 2: Hình thành kiến thức mới", "duration": "30 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 3: Luyện tập", "duration": "30 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 4: Vận dụng", "duration": "20 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ lessonPlan: safeParseGeminiJson(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi soạn giáo án CV 5512';
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// 4. AI SOẠN GIẢNG TRỰC TIẾP — STRUCTURED OUTPUTS (JSON SCHEMA: ly_thuyet, vi_du, bai_tap)
// ============================================================================
app.post('/api/ai/direct-lesson', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({
      code: 'NO_API_KEY',
      error:
        'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets của hệ thống. Vui lòng thiết lập khóa API hoặc mở Kho bài giảng có sẵn.',
    });
    return;
  }

  try {
    const {
      grade = '12',
      chapterTitle = 'Chương I. Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
      lessonTitle = 'Bài 1. Tính đơn điệu và cực trị của hàm số',
      focusNote = '',
      exampleCount = 2,
      exerciseCount = 4,
    } = req.body as {
      grade?: '10' | '11' | '12';
      chapterTitle?: string;
      lessonTitle?: string;
      focusNote?: string;
      exampleCount?: number;
      exerciseCount?: number;
    };

    const safeExamples = Math.min(Math.max(Number(exampleCount) || 2, 1), 4);
    const safeExercises = Math.min(Math.max(Number(exerciseCount) || 4, 2), 6);

    const directLessonSchema = {
      type: Type.OBJECT,
      properties: {
        tieu_de: {
          type: Type.STRING,
          description: 'Tên bài giảng ngắn gọn chuẩn SGK Kết nối tri thức với cuộc sống.',
        },
        ly_thuyet: {
          type: Type.ARRAY,
          description: 'Mảng gồm 2 đến 3 mục lý thuyết trọng tâm.',
          items: {
            type: Type.OBJECT,
            properties: {
              tieu_de: {
                type: Type.STRING,
                description: 'Tiêu đề mục lý thuyết (ví dụ: 1. Định nghĩa và tính chất cơ bản).',
              },
              nhan: {
                type: Type.STRING,
                description: 'Nhãn ngắn (ví dụ: Định lý SGK KNTT, Công thức cần nhớ).',
              },
              noi_dung: {
                type: Type.ARRAY,
                description:
                  'Các ý lý thuyết ngắn gọn dùng $...$ cho công thức cùng dòng và $$...$$ cho công thức độc lập.',
                items: { type: Type.STRING },
              },
            },
            required: ['tieu_de', 'nhan', 'noi_dung'],
          },
        },
        vi_du: {
          type: Type.ARRAY,
          description: `Mảng gồm đúng ${safeExamples} ví dụ minh họa có lời giải từng bước.`,
          items: {
            type: Type.OBJECT,
            properties: {
              tieu_de: {
                type: Type.STRING,
                description:
                  'Tên chủ đề ngắn của ví dụ. TUYỆT ĐỐI KHÔNG ghi tiền tố "Ví dụ 1:", "Ví dụ 2:" ở đầu.',
              },
              muc_do: {
                type: Type.STRING,
                description: 'Mức độ: Nhận biết, Thông hiểu hoặc Vận dụng.',
              },
              de_bai: {
                type: Type.STRING,
                description:
                  'Đề bài rõ ràng, công thức toán bọc trong $...$ hoặc $$...$$. TUYỆT ĐỐI KHÔNG lặp lại tiền tố "Ví dụ 1:" ở đầu đề bài.',
              },
              cac_buoc_giai: {
                type: Type.ARRAY,
                description:
                  'Mỗi phần tử là đúng 1 bước giải trên 1 dòng duy nhất, TUYỆT ĐỐI KHÔNG ghi tiền tố "Bước 1:", "Bước 2:" ở đầu.',
                items: { type: Type.STRING },
              },
              dap_so: {
                type: Type.STRING,
                description:
                  'Đáp số / Kết luận cuối cùng của ví dụ tách riêng (công thức bọc trong $...$, KHÔNG ghi lặp "Đáp số:" hay "Kết luận:").',
              },
              ket_luan: {
                type: Type.STRING,
                description:
                  'Kết luận cuối cùng của ví dụ (đồng nhất với dap_so, KHÔNG ghi lặp chữ "Kết luận:").',
              },
            },
            required: ['tieu_de', 'muc_do', 'de_bai', 'cac_buoc_giai', 'dap_so', 'ket_luan'],
          },
        },
        bai_tap: {
          type: Type.ARRAY,
          description: `Mảng gồm đúng ${safeExercises} bài tập vận dụng (gồm trắc nghiệm 4 lựa chọn và trả lời ngắn).`,
          items: {
            type: Type.OBJECT,
            properties: {
              loai: {
                type: Type.STRING,
                description: 'Chỉ nhận 1 trong 2 giá trị: "trac_nghiem" hoặc "tra_loi_ngan".',
              },
              muc_do: {
                type: Type.STRING,
                description: 'Mức độ: Nhận biết, Thông hiểu hoặc Vận dụng.',
              },
              de_bai: {
                type: Type.STRING,
                description:
                  'Nội dung câu hỏi dùng $...$ cho công thức cùng dòng và $$...$$ cho công thức độc lập. KHÔNG lặp tiền tố "Bài tập 1:" ở đầu.',
              },
              phuong_an: {
                type: Type.ARRAY,
                description:
                  'Nếu loai="trac_nghiem", gồm đúng 4 chuỗi phương án, TUYỆT ĐỐI KHÔNG ghi tiền tố "A.", "B.", "C.", "D.". Nếu loai="tra_loi_ngan", trả về mảng rỗng [].',
                items: { type: Type.STRING },
              },
              dap_so: {
                type: Type.STRING,
                description:
                  'Đáp số chuẩn tách riêng: 1 chữ cái A/B/C/D cho trắc nghiệm, hoặc giá trị ngắn gọn bọc $...$ nếu có ký hiệu toán (số thập phân dùng dấu phẩy).',
              },
              dap_an: {
                type: Type.STRING,
                description:
                  'Đáp án đúng (đồng nhất với dap_so).',
              },
              loi_giai: {
                type: Type.ARRAY,
                description:
                  'Các bước giải chi tiết tuần tự, mỗi phần tử là đúng 1 dòng duy nhất, TUYỆT ĐỐI KHÔNG ghi tiền tố "Bước 1:", "Bước 2:" ở đầu.',
                items: { type: Type.STRING },
              },
            },
            required: ['loai', 'muc_do', 'de_bai', 'phuong_an', 'dap_so', 'dap_an', 'loi_giai'],
          },
        },
      },
      required: ['tieu_de', 'ly_thuyet', 'vi_du', 'bai_tap'],
    };

    const prompt = `Hãy soạn một bài giảng Toán THPT trình chiếu trực tiếp trên Bảng trắng Tương tác (65–86 inch) chuẩn SGK Kết nối tri thức với cuộc sống (GDPT 2018):
- Khối lớp: Lớp ${grade}
- Chương: ${chapterTitle}
- Bài học: ${lessonTitle}
${focusNote.trim() ? `- Yêu cầu trọng tâm bổ sung của giáo viên: ${focusNote.trim()}` : ''}

QUY TẮC BẮT BUỘC VỀ CÚ PHÁP KATEX & CHỐNG LẶP KÝ HIỆU:
1. Chỉ dùng duy nhất cú pháp KaTeX thuần túy trong cặp dấu $...$ (cùng dòng) và $$...$$ (độc lập). Dùng \\frac thay cho \\dfrac/\\tfrac.
2. TUYỆT ĐỐI KHÔNG dùng các môi trường LaTeX không tương thích với KaTeX như \\begin{align*}, \\begin{align}, \\begin{eqnarray*}, \\begin{eqnarray}, \\begin{equation}, \\[...\\], \\(...\\).
3. KHÔNG sử dụng hàm trùng phương bậc 4 ($ax^4 + bx^2 + c$).
4. Trong mảng "vi_du", trường "tieu_de" chỉ ghi tên dạng toán ngắn gọn và trường "de_bai" bắt đầu thẳng vào đề bài (TUYỆT ĐỐI KHÔNG ghi tiền tố "Ví dụ 1:", "Ví dụ 2:").
5. Trong mảng "cac_buoc_giai" và "loi_giai", mỗi phần tử là nội dung phép biến đổi của ĐÚNG 1 BƯỚC trên 1 dòng duy nhất, TUYỆT ĐỐI KHÔNG tự ghi tiền tố "Bước 1:", "Bước 2:".
6. Luôn tách riêng đáp số cuối cùng vào trường "dap_so" (bọc $...$ nếu chứa ký hiệu toán, KHÔNG ghi kèm tiền tố "Đáp số:" hay "Kết luận:").
7. Trong mảng "phuong_an" của câu trắc nghiệm (đúng 4 phương án), chỉ ghi nội dung đáp án, TUYỆT ĐỐI KHÔNG ghi tiền tố "A.", "B.", "C.", "D.".
8. Đáp số câu trả lời ngắn (nếu có) tối đa 4 ký tự, số thập phân dùng dấu phẩy (,).
9. Tạo 2–3 mục "ly_thuyet", ${safeExamples} "vi_du" minh họa, và ${safeExercises} "bai_tap" vận dụng (kết hợp trắc nghiệm 4 lựa chọn và trả lời ngắn thực tế).`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction:
          'Bạn là chuyên gia sư phạm Toán THPT (SGK Kết nối tri thức với cuộc sống). Luôn xuất JSON hợp lệ tuyệt đối theo đúng responseSchema (ly_thuyet, vi_du, bai_tap), công thức Toán tương thích 100% KaTeX chỉ dùng $...$ và $$...$$, tách riêng trường dap_so, không lặp tiền tố Bước 1:, A., Ví dụ 1:.',
        responseMimeType: 'application/json',
        responseSchema: directLessonSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawParsed = safeParseGeminiJson<{
      tieu_de?: string;
      ly_thuyet?: Array<{ tieu_de?: string; nhan?: string; noi_dung?: string[] }>;
      vi_du?: Array<{
        tieu_de?: string;
        muc_do?: string;
        de_bai?: string;
        cac_buoc_giai?: string[];
        dap_so?: string;
        ket_luan?: string;
      }>;
      bai_tap?: Array<{
        loai?: string;
        muc_do?: string;
        de_bai?: string;
        phuong_an?: string[];
        dap_so?: string;
        dap_an?: string;
        loi_giai?: string[];
      }>;
    }>(response.text || '{}');

    // Sanitize KaTeX and strip any redundant prefixes server-side before returning
    const cleanPayload = {
      tieu_de: sanitizeKatexServer(rawParsed.tieu_de || lessonTitle),
      ly_thuyet: Array.isArray(rawParsed.ly_thuyet)
        ? rawParsed.ly_thuyet
            .filter((item) => item && (item.tieu_de || (Array.isArray(item.noi_dung) && item.noi_dung.length > 0)))
            .map((item, idx) => ({
              tieu_de: sanitizeKatexServer(item.tieu_de || `${idx + 1}. Kiến thức trọng tâm`),
              nhan: sanitizeKatexServer(item.nhan || 'Kiến thức SGK KNTT'),
              noi_dung: Array.isArray(item.noi_dung)
                ? item.noi_dung.map((pt) => sanitizeKatexServer(String(pt))).filter(Boolean)
                : [],
            }))
        : [],
      vi_du: Array.isArray(rawParsed.vi_du)
        ? rawParsed.vi_du
            .filter((item) => item && item.de_bai)
            .map((item, idx) => {
              const cleanDapSo = cleanDirectConclusion(item.dap_so || item.ket_luan || '');
              return {
                tieu_de: cleanDirectExampleTitle(item.tieu_de || `Dạng toán trọng tâm ${idx + 1}`),
                muc_do: sanitizeKatexServer(item.muc_do || 'Thông hiểu'),
                de_bai: cleanDirectStemPrefix(item.de_bai || ''),
                cac_buoc_giai: Array.isArray(item.cac_buoc_giai)
                  ? item.cac_buoc_giai.map((st) => cleanDirectStepText(String(st))).filter(Boolean)
                  : [],
                dap_so: cleanDapSo,
                ket_luan: cleanDapSo,
              };
            })
        : [],
      bai_tap: Array.isArray(rawParsed.bai_tap)
        ? rawParsed.bai_tap
            .filter((item) => item && item.de_bai)
            .map((item) => {
              const rawOpts = Array.isArray(item.phuong_an)
                ? item.phuong_an.map((opt) => cleanDirectOptionText(String(opt))).filter(Boolean)
                : [];
              const isMcq =
                (item.loai === 'trac_nghiem' || rawOpts.length === 4) && rawOpts.length >= 4;
              const cleanAns = cleanDirectConclusion(
                item.dap_so || item.dap_an || (isMcq ? 'A' : '0')
              );
              return {
                loai: isMcq ? 'trac_nghiem' : 'tra_loi_ngan',
                muc_do: sanitizeKatexServer(item.muc_do || 'Vận dụng'),
                de_bai: cleanDirectStemPrefix(item.de_bai || ''),
                phuong_an: isMcq ? rawOpts.slice(0, 4) : [],
                dap_so: cleanAns,
                dap_an: cleanAns,
                loi_giai: Array.isArray(item.loi_giai)
                  ? item.loi_giai.map((st) => cleanDirectStepText(String(st))).filter(Boolean)
                  : [],
              };
            })
        : [],
    };

    if (
      cleanPayload.ly_thuyet.length === 0 &&
      cleanPayload.vi_du.length === 0 &&
      cleanPayload.bai_tap.length === 0
    ) {
      res.status(502).json({
        code: 'EMPTY_PAYLOAD',
        error: 'AI trả về dữ liệu bài giảng trống. Vui lòng nhấn Thử lại.',
      });
      return;
    }

    res.json({ lesson: cleanPayload });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối dịch vụ AI Soạn giảng Trực tiếp';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/pdf-auto-solve', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { rawExamText } = req.body as { rawExamText: string };
    const prompt = `Hãy giải nhanh và trích xuất Barem đáp án chuẩn 3 phần (Phần I: 12 câu A/B/C/D; Phần II: 4 câu a,b,c,d Đúng/Sai; Phần III: 6 câu trả lời ngắn tối đa 4 ký tự dùng dấu phẩy) từ nội dung đề sau:\n${rawExamText}\nTrả về JSON: { "part1": ["B","C",...], "part2": [{"a":true,"b":true,"c":false,"d":false}, ...], "part3": ["2,4","218",...] }`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ answerKey: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi giải đề tự động';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/gradebook-remarks', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      className = '12A1',
      semester = 1,
      subject = 'Toán',
      rows = [],
    } = req.body as {
      className?: string;
      semester?: number;
      subject?: string;
      rows?: {
        studentId: string;
        fullName: string;
        tbm: number | null;
        txCount: number;
        gk: number | null;
        ck: number | null;
        teacherNotes?: string;
      }[];
    };

    const prompt = `Bạn là giáo viên bộ môn ${subject} (Trường THPT Lê Quý Đôn, Đắk Lắk) đang viết nhận xét học kỳ ${semester} chuẩn Thông tư 22/2021 & Sổ điểm SMAS 4.0 cho lớp ${className}.
Dựa vào dữ liệu từng học sinh sau, hãy viết lời nhận xét sư phạm súc tích (12–22 từ, tự nhiên, khích lệ, không rập khuôn giống hệt nhau giữa các em, bám sát điểm TBM và ghi chú nếu có):
- Nếu TBM >= 8.0: khen ngợi nắm vững kiến thức, tư duy tốt, phát huy thêm vận dụng cao.
- Nếu 6.5 <= TBM < 8.0: nhận xét có cố gắng, nắm kiến thức cơ bản tốt, cần rèn thêm kỹ năng giải nhanh/tránh sai sót.
- Nếu 5.0 <= TBM < 6.5: nhận xét mức độ đạt yêu cầu, cần chăm chỉ làm thêm bài tập trọng tâm để nâng điểm.
- Nếu TBM < 5.0: nhắc nhở ân cần về việc hổng kiến thức/cần ôn tập lại lý thuyết cơ bản và tăng cường luyện tập.
- Nếu chưa có TBM: nhận xét theo ghi chú hiện có hoặc nhắc bổ sung đủ cột điểm kiểm tra.

Danh sách học sinh:
${JSON.stringify(rows)}

Trả về JSON thuần dạng:
{
  "remarks": [
    { "studentId": "...", "remark": "..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json(JSON.parse(response.text || '{"remarks":[]}'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi gợi ý nhận xét AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/import/drive', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Vui lòng cung cấp đường dẫn Google Drive hoặc Google Docs hợp lệ.' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      res.status(400).json({ error: 'Đường dẫn URL không hợp lệ.' });
      return;
    }

    const allowedHosts = ['docs.google.com', 'drive.google.com'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      res.status(400).json({ error: 'Chỉ hỗ trợ liên kết từ docs.google.com hoặc drive.google.com.' });
      return;
    }

    const docMatch = parsedUrl.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    const fileMatch = parsedUrl.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const idParam = parsedUrl.searchParams.get('id');

    let downloadUrl = '';
    if (docMatch) {
      downloadUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    } else if (fileMatch || idParam) {
      const fid = fileMatch ? fileMatch[1] : idParam;
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fid}`;
    } else {
      res.status(400).json({ error: 'Không nhận diện được mã tệp (ID) trong liên kết Google Drive/Docs.' });
      return;
    }

    const response = await fetch(downloadUrl, { redirect: 'follow' });
    if (!response.ok) {
      res.status(400).json({
        error: 'Không thể tải tệp (tệp có thể đang để chế độ Riêng tư). Hãy bật "Bất kỳ ai có đường liên kết đều có thể xem" hoặc tải tệp .docx lên trực tiếp.',
      });
      return;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const isZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b; // PK (.docx)
    if (isZip) {
      res.json({ kind: 'docx', base64: buf.toString('base64') });
      return;
    }
    const text = buf.toString('utf-8');
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      res.status(400).json({
        error: 'Liên kết yêu cầu đăng nhập hoặc chưa chia sẻ công khai. Thầy vui lòng tải file .docx/.txt từ máy tính hoặc dán nội dung trực tiếp.',
      });
      return;
    }
    res.json({ kind: 'text', text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tải dữ liệu từ Google Drive';
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// SMARTBOARD AI PEN & MATH OCR ENDPOINT (/api/ai/smartboard-ocr)
// ============================================================================
app.post('/api/ai/smartboard-ocr', async (req, res) => {
  const {
    imageBase64,
    mimeType = 'image/png',
    contextText = '',
    action = 'both',
  } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    contextText?: string;
    action?: 'ocr_katex' | 'explain_steps' | 'both';
  };

  const ai = getGeminiClient();
  if (!ai) {
    // Graceful pedagogical fallback if API key is not configured
    const fallbackTex =
      contextText.trim() ||
      '\\int_{0}^{1} (3x^2 - 2x + 1)\\,dx = \\left(x^3 - x^2 + x\\right)\\Big|_{0}^{1} = 1';
    res.json({
      result: {
        katexText: fallbackTex.includes('$') ? fallbackTex : `$$${fallbackTex}$$`,
        recognizedProblem:
          contextText.trim() || 'Nhận diện biểu thức Toán học viết tay trên bảng tương tác',
        steps: [
          {
            title: 'Bước 1:',
            leadIn: '',
            mathDetail: `Chuyển đổi nét viết tay sang công thức chuẩn KaTeX: ${fallbackTex.includes('$') ? fallbackTex : `$${fallbackTex}$`}`,
          },
          {
            title: 'Bước 2:',
            leadIn: '',
            mathDetail: 'Áp dụng quy tắc đạo hàm / nguyên hàm cơ bản SGK Toán THPT: $F(x) = x^3 - x^2 + x + C \\implies F(1) - F(0) = 1$.',
          },
        ],
        finalAnswer: 'Kết quả nhận diện & chuẩn hóa KaTeX hoàn tất.',
      },
    });
    return;
  }

  try {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    const modeInstruction =
      action === 'ocr_katex'
        ? 'Trọng tâm: Nhận diện thật chính xác chữ viết tay và công thức Toán học trong ảnh vùng bảng trắng, chuyển thành chuỗi văn bản tiếng Việt kết hợp công thức chuẩn LaTeX/KaTeX ($...$ hoặc $$...$$).'
        : action === 'explain_steps'
          ? 'Trọng tâm: Nhận diện đề bài / phép tính trong vùng khoanh trên bảng và giải thích nhanh từng bước rõ ràng, dễ hiểu cho học sinh THPT trên màn hình lớn.'
          : 'Trọng tâm: Vừa chuyển chữ/công thức viết tay trong ảnh thành văn bản KaTeX sắc nét, vừa giải thích nhanh từng bước lời giải sư phạm.';

    const ocrSchema = {
      type: Type.OBJECT,
      properties: {
        katexText: {
          type: Type.STRING,
          description:
            'Văn bản và công thức chuẩn KaTeX ($...$ hoặc $$...$$) sắc nét được chuyển đổi từ nét viết tay.',
        },
        recognizedProblem: {
          type: Type.STRING,
          description: 'Tóm tắt đề bài/biểu thức đã nhận diện (dùng $...$ cho công thức Toán).',
        },
        steps: {
          type: Type.ARRAY,
          description: 'Mảng các bước giải tuần tự, mỗi bước trên 1 dòng rõ ràng.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Nhãn dạng "Bước 1:", "Bước 2:", ...' },
              leadIn: { type: Type.STRING, description: 'Chuỗi rỗng "" để không lặp tiêu đề.' },
              mathDetail: {
                type: Type.STRING,
                description: 'Nội dung phép biến đổi của bước trên đúng 1 dòng duy nhất, dùng $...$/$$...$$.',
              },
            },
            required: ['title', 'leadIn', 'mathDetail'],
          },
        },
        dap_so: {
          type: Type.STRING,
          description: 'Đáp số / Kết luận cuối cùng tách riêng (bọc $...$ cho công thức, không ghi lặp "Đáp số:").',
        },
        finalAnswer: {
          type: Type.STRING,
          description: 'Kết luận cuối cùng (đồng nhất với dap_so).',
        },
      },
      required: ['katexText', 'recognizedProblem', 'steps', 'dap_so', 'finalAnswer'],
    };

    parts.push({
      text: `Bạn là Trợ lý Bút AI (AI Pen & Math OCR) trên Bảng Trắng Tương Tác Thông Minh (Smartboard) môn Toán THPT.
${modeInstruction}
${contextText ? `\nNgữ cảnh thẻ câu hỏi / văn bản nằm trong vùng khoanh trên bảng:\n${contextText}\n` : ''}
QUY TẮC BẮT BUỘC:
1. Chỉ dùng cú pháp KaTeX thuần túy trong cặp dấu $...$ hoặc $$...$$. Tuyệt đối không dùng \\begin{align*}, \\begin{eqnarray*}, \\[...\\], \\(...\\), \\dfrac, \\tfrac.
2. Mỗi bước trong mảng "steps" đặt "title": "Bước 1:", "leadIn": "", và toàn bộ phép biến đổi trên 1 dòng duy nhất vào "mathDetail" (không lặp "Bước 1:" trong mathDetail).
3. Tách riêng đáp số cuối cùng vào trường "dap_so" và "finalAnswer".`,
    });

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts },
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: ocrSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawOcr = safeParseGeminiJson<{
      katexText?: string;
      recognizedProblem?: string;
      steps?: Array<{ title?: string; leadIn?: string; mathDetail?: string }>;
      dap_so?: string;
      finalAnswer?: string;
    }>(response.text || '{}');

    const cleanDapSo = cleanDirectConclusion(rawOcr.dap_so || rawOcr.finalAnswer || '');
    res.json({
      result: {
        katexText: sanitizeKatexServer(rawOcr.katexText || ''),
        recognizedProblem: sanitizeKatexServer(rawOcr.recognizedProblem || ''),
        steps: Array.isArray(rawOcr.steps)
          ? rawOcr.steps
              .map((st, idx) => ({
                title: `Bước ${idx + 1}:`,
                leadIn: '',
                mathDetail: cleanDirectStepText(st?.mathDetail || st?.leadIn || st?.title || ''),
              }))
              .filter((st) => Boolean(st.mathDetail))
          : [],
        dap_so: cleanDapSo,
        finalAnswer: cleanDapSo,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi nhận diện Bút AI & Math OCR';
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// REAL-TIME POP QUIZ QR SESSION STORE (/api/pop-quiz/:quizId)
// ============================================================================
interface PopQuizResponseItem {
  id: string;
  studentName: string;
  studentClass?: string;
  choice?: 'A' | 'B' | 'C' | 'D';
  comment?: string;
  submittedAt: string;
}

interface PopQuizSessionState {
  quizId: string;
  questionTitle: string;
  questionStem?: string;
  options: [string, string, string, string];
  correctOption?: 'A' | 'B' | 'C' | 'D';
  isOpen: boolean;
  createdAt: string;
  responses: PopQuizResponseItem[];
}

const popQuizSessions = new Map<string, PopQuizSessionState>();

app.get('/api/pop-quiz/:quizId', (req, res) => {
  const { quizId } = req.params;
  const session = popQuizSessions.get(quizId);
  if (!session) {
    // Return a default active session if student scans QR right away
    const defaultSession: PopQuizSessionState = {
      quizId,
      questionTitle: `Câu hỏi tương tác nhanh #${quizId}`,
      questionStem: 'Quan sát đề bài trên Bảng tương tác Smartboard và chọn đáp án đúng (A, B, C, D) hoặc gửi ý kiến thảo luận.',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
      isOpen: true,
      createdAt: new Date().toISOString(),
      responses: [],
    };
    popQuizSessions.set(quizId, defaultSession);
    res.json({ session: defaultSession });
    return;
  }
  res.json({ session });
});

app.post('/api/pop-quiz/:quizId', (req, res) => {
  const { quizId } = req.params;
  const body = req.body as Partial<PopQuizSessionState>;
  const existing = popQuizSessions.get(quizId);
  const updated: PopQuizSessionState = {
    quizId,
    questionTitle: body.questionTitle ?? existing?.questionTitle ?? `Câu hỏi tương tác #${quizId}`,
    questionStem: body.questionStem ?? existing?.questionStem ?? '',
    options: body.options ?? existing?.options ?? ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
    correctOption: body.correctOption ?? existing?.correctOption,
    isOpen: body.isOpen ?? existing?.isOpen ?? true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    responses: body.responses ?? existing?.responses ?? [],
  };
  popQuizSessions.set(quizId, updated);
  res.json({ session: updated });
});

app.post('/api/pop-quiz/:quizId/respond', (req, res) => {
  const { quizId } = req.params;
  const { studentName, studentClass, choice, comment } = req.body as {
    studentName: string;
    studentClass?: string;
    choice?: 'A' | 'B' | 'C' | 'D';
    comment?: string;
  };
  let session = popQuizSessions.get(quizId);
  if (!session) {
    session = {
      quizId,
      questionTitle: `Câu hỏi tương tác nhanh #${quizId}`,
      questionStem: '',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
      isOpen: true,
      createdAt: new Date().toISOString(),
      responses: [],
    };
    popQuizSessions.set(quizId, session);
  }
  if (!session.isOpen) {
    res.status(400).json({ error: 'Giáo viên đã đóng nhận câu trả lời cho phiên tương tác này.' });
    return;
  }
  const cleanName = (studentName || 'Học sinh').trim();
  const newItem: PopQuizResponseItem = {
    id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentName: cleanName,
    studentClass: studentClass?.trim() || '12A1',
    choice,
    comment: comment?.trim() || undefined,
    submittedAt: new Date().toISOString(),
  };
  // Replace previous choice from same student name if they re-submit choice, or append
  const existingIdx = session.responses.findIndex(
    (r) => r.studentName.toLowerCase() === cleanName.toLowerCase() && choice && r.choice
  );
  if (existingIdx >= 0 && choice) {
    session.responses[existingIdx] = {
      ...session.responses[existingIdx],
      choice,
      comment: comment?.trim() || session.responses[existingIdx].comment,
      submittedAt: newItem.submittedAt,
    };
  } else {
    session.responses.unshift(newItem);
  }
  res.json({ session, response: newItem });
});

async function startServer() {
  const httpServer = http.createServer(app);

  // Live API WebSocket Bridge (/api/live-voice)
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/api/live-voice')) {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    }
  });

  liveWss.on('connection', async (clientWs, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(req.url || '/api/live-voice', `http://${req.headers.host || 'localhost'}`);
    const voiceName = reqUrl.searchParams.get('voice') || 'Zephyr';

    let sessionPromise: Promise<any> | null = null;
    try {
      sessionPromise = ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'Bạn là Trợ lý Giọng nói Chuyên môn Toán THPT TeachLearn Edu hỗ trợ Thầy giáo Lê Trọng Toàn và học sinh Trường THPT Lê Quý Đôn. Trả lời ngắn gọn, rõ ràng, thân thiện bằng tiếng Việt.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ status: 'connected' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            const inText = (message.serverContent as any)?.inputTranscription?.text;
            if (inText) {
              clientWs.send(JSON.stringify({ inputTranscript: inText }));
            }
            const outText = (message.serverContent as any)?.outputTranscription?.text;
            if (outText) {
              clientWs.send(JSON.stringify({ outputTranscript: outText }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Lỗi kết nối Gemini Live API',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      const activeSession = await sessionPromise;

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio) {
            activeSession.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (parsed.text) {
            activeSession.sendRealtimeInput({
              text: parsed.text,
            });
          }
        } catch {
          // ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        try {
          activeSession.close();
        } catch {
          // ignore close error
        }
      });
    } catch (err: unknown) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Không thể khởi tạo phiên Gemini Live',
          })
        );
        clientWs.close();
      }
    }
  });

  app.use('/sw.js', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EduPlan AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
