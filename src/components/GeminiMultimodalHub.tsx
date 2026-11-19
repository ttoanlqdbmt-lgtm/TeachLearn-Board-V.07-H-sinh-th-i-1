import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Music,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Square,
  Upload,
  Wand2,
} from 'lucide-react';
import { MathText } from './MathText';
import { SmartboardViewport } from './SmartboardViewport';
import { MasterDataStore } from '../types/eduplan';
import { resolveActiveTeachingContext } from '../utils/masterDataDb';
import { tactile3dClass } from '../utils/uiStyles';

interface GroundingLink {
  title: string;
  uri: string;
  sourceType: 'web' | 'maps';
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  modelUsed?: string;
  groundingLinks?: GroundingLink[];
}

type StudioTab = 'chat_grounding' | 'image_studio' | 'video_studio' | 'voice_music_studio';

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const GeminiMultimodalHub: React.FC<{ masterData?: MasterDataStore }> = ({ masterData }) => {
  const ctx = resolveActiveTeachingContext(masterData);
  const [activeTab, setActiveTab] = useState<StudioTab>('chat_grounding');

  // --- TAB 1: Multi-Model Chat + Google Search & Google Maps Grounding ---
  const [selectedModel, setSelectedModel] = useState<string>('gemini-4-hydrogen');
  const [useSearchGrounding, setUseSearchGrounding] = useState<boolean>(false);
  const [useMapsGrounding, setUseMapsGrounding] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>({
    latitude: 12.6667, // Buôn Ma Thuột, Đắk Lắk default
    longitude: 108.05,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: `Kính chào ${ctx.teacherHonorific}! Tôi là Trợ lý Đa phương thức TeachLearn Edu (${ctx.schoolName} · Năm học ${ctx.schoolYearLabel}). Thầy/Cô có thể chọn mô hình Gemini, bật **Tra cứu Google Search** hoặc **Dữ liệu Địa điểm Google Maps**, tạo ảnh minh họa STEM, dựng video bài giảng và đàm thoại giọng nói trực tiếp ngay tại đây.`,
      modelUsed: 'gemini-4-hydrogen',
    },
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const quickPrompts = [
    'Lập khung phân phối 12 tiết ôn tập trọng tâm Toán 12 theo QĐ 2422',
    'Gợi ý bài toán thực tế về cực trị hàm phân thức bậc 2 trên bậc 1',
    'Tra cứu thông tin kỳ thi Tốt nghiệp THPT môn Toán cấu trúc mới nhất',
    'Tìm các nhà sách và trung tâm thiết bị giáo dục gần TP. Buôn Ma Thuột, Đắk Lắk',
  ];

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
        });
      },
      () => {
        // Keep Buôn Ma Thuột coordinates on deny
      }
    );
  };

  const sendMessage = async (textToSend?: string) => {
    const content = (textToSend ?? input).trim();
    if (!content || chatLoading) return;
    setMessages((prev) => [...prev, { role: 'user', text: content }]);
    if (!textToSend) setInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messages,
          context: `Trợ lý Giáo viên Toán THPT (${ctx.schoolName}) — QĐ 2422 & CV 5512`,
          model: selectedModel,
          useSearchGrounding,
          useMapsGrounding,
          userLocation: useMapsGrounding && userCoords ? userCoords : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phản hồi AI');
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.reply,
          modelUsed: data.modelUsed || selectedModel,
          groundingLinks: Array.isArray(data.groundingLinks) ? data.groundingLinks : [],
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể kết nối AI';
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Lưu ý kết nối: ${msg}. Hãy kiểm tra GEMINI_API_KEY hoặc chuyển về mô hình tiêu chuẩn gemini-4-hydrogen.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // --- TAB 2: Create & Edit Images ---
  const [imgPrompt, setImgPrompt] = useState(
    'Hình minh họa 3D trực quan khối chóp tứ giác đều S.ABCD đặt trên mặt phẳng tọa độ Oxyz, phong cách sách giáo khoa hiện đại, nền sáng rõ nét'
  );
  const [imgModel, setImgModel] = useState<'gemini-3.1-flash-lite-image' | 'gemini-nano-banana-2.1'>(
    'gemini-3.1-flash-lite-image'
  );
  const [imgAspect, setImgAspect] = useState<'1:1' | '16:9' | '4:3'>('1:1');
  const [sourceImgBase64, setSourceImgBase64] = useState<string | null>(null);
  const [sourceImgMime, setSourceImgMime] = useState<string>('image/png');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [generatedImgCaption, setGeneratedImgCaption] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const handleUploadSourceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceImgMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceImgBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunImageStudio = async () => {
    if (!imgPrompt.trim() || imgLoading) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch('/api/ai/image-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          imageBase64: sourceImgBase64 || undefined,
          mimeType: sourceImgMime,
          aspectRatio: imgAspect,
          model: imgModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tạo/chỉnh sửa hình ảnh');
      setGeneratedImgUrl(data.imageUrl);
      setGeneratedImgCaption(data.caption || '');
    } catch (err: unknown) {
      setImgError(err instanceof Error ? err.message : 'Lỗi xử lý hình ảnh AI');
    } finally {
      setImgLoading(false);
    }
  };

  // --- TAB 3: Video Generation & Photo Animation (Omni Flash) ---
  const [videoMode, setVideoMode] = useState<'text_to_video' | 'image_to_video'>('text_to_video');
  const [videoPrompt, setVideoPrompt] = useState(
    'Mô phỏng chuyển động mặt phẳng cắt khối nón tròn xoay tạo ra đường elip và parabol trong phòng thí nghiệm STEM hiện đại'
  );
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '6s' | '10s'>('6s');
  const [videoFrameBase64, setVideoFrameBase64] = useState<string | null>(null);
  const [videoFrameMime, setVideoFrameMime] = useState<string>('image/png');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleUploadVideoFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFrameMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setVideoFrameBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunVideoStudio = async () => {
    if (!videoPrompt.trim() || videoLoading) return;
    if (videoMode === 'image_to_video' && !videoFrameBase64) {
      setVideoError('Vui lòng tải lên hình ảnh gốc để tạo chuyển động (Animate Image into Video).');
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    try {
      const res = await fetch('/api/ai/video-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          imageBase64: videoMode === 'image_to_video' ? videoFrameBase64 : undefined,
          mimeType: videoFrameMime,
          aspectRatio: videoAspect,
          duration: videoDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo video AI');
      setGeneratedVideoUrl(data.videoDataUrl);
    } catch (err: unknown) {
      setVideoError(err instanceof Error ? err.message : 'Lỗi tạo video');
    } finally {
      setVideoLoading(false);
    }
  };

  // --- TAB 4A: Audio Transcription (gemini-3.5-transcribe) ---
  const [isRecordingTranscribe, setIsRecordingTranscribe] = useState(false);
  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcribeCopied, setTranscribeCopied] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startTranscribeRecording = async () => {
    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await sendAudioBlobForTranscription(blob, recorder.mimeType || 'audio/webm');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingTranscribe(true);
    } catch (err: unknown) {
      setTranscribeError(
        err instanceof Error ? err.message : 'Không thể truy cập Microphone trên trình duyệt.'
      );
    }
  };

  const stopTranscribeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingTranscribe(false);
  };

  const sendAudioBlobForTranscription = async (blob: Blob, mimeType: string) => {
    setTranscribeLoading(true);
    setTranscribeError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Read error'));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi chép lời âm thanh');
      setTranscriptText(data.transcript || '');
    } catch (err: unknown) {
      setTranscribeError(err instanceof Error ? err.message : 'Không thể chép lời');
    } finally {
      setTranscribeLoading(false);
    }
  };

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await sendAudioBlobForTranscription(file, file.type || 'audio/mp3');
  };

  // --- TAB 4B: Live Voice Conversation (gemini-3.8-live via WebSocket) ---
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveVoiceName, setLiveVoiceName] = useState<'Zephyr' | 'Puck' | 'Kore' | 'Charon' | 'Fenrir'>('Zephyr');
  const [liveLogs, setLiveLogs] = useState<{ speaker: 'user' | 'ai'; text: string }[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const liveWsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const stopLiveVoiceSession = () => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    if (liveWsRef.current) {
      liveWsRef.current.close();
      liveWsRef.current = null;
    }
    nextStartTimeRef.current = 0;
    setLiveConnected(false);
    setLiveConnecting(false);
  };

  useEffect(() => {
    return () => {
      stopLiveVoiceSession();
    };
  }, []);

  const schedulePlayPcm24k = (base64Pcm: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;
    const binary = window.atob(base64Pcm);
    const byteLength = binary.length;
    const int16 = new Int16Array(Math.floor(byteLength / 2));
    const view = new DataView(new ArrayBuffer(byteLength));
    for (let i = 0; i < byteLength; i++) {
      view.setUint8(i, binary.charCodeAt(i));
    }
    for (let i = 0; i < int16.length; i++) {
      int16[i] = view.getInt16(i * 2, true);
    }
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const audioBuffer = outCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
  };

  const startLiveVoiceSession = async () => {
    if (liveConnected || liveConnecting) return;
    setLiveError(null);
    setLiveConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${window.location.host}/api/live-voice?voice=${encodeURIComponent(liveVoiceName)}`
      );
      liveWsRef.current = ws;

      ws.onopen = () => {
        const source = inCtx.createMediaStreamSource(stream);
        const processor = inCtx.createScriptProcessor(4096, 1, 1);
        scriptNodeRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (liveWsRef.current?.readyState === WebSocket.OPEN) {
            const channelData = e.inputBuffer.getChannelData(0);
            const pcmB64 = floatTo16BitPCMBase64(channelData);
            liveWsRef.current.send(JSON.stringify({ audio: pcmB64 }));
          }
        };

        source.connect(processor);
        processor.connect(inCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.status === 'connected') {
            setLiveConnected(true);
            setLiveConnecting(false);
          }
          if (msg.audio) {
            schedulePlayPcm24k(msg.audio);
          }
          if (msg.interrupted) {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          }
          if (msg.inputTranscript) {
            setLiveLogs((prev) => [...prev.slice(-14), { speaker: 'user', text: msg.inputTranscript }]);
          }
          if (msg.outputTranscript) {
            setLiveLogs((prev) => [...prev.slice(-14), { speaker: 'ai', text: msg.outputTranscript }]);
          }
          if (msg.error) {
            setLiveError(msg.error);
            stopLiveVoiceSession();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setLiveError('Không thể kết nối WebSocket với Gemini Live API.');
        stopLiveVoiceSession();
      };

      ws.onclose = () => {
        stopLiveVoiceSession();
      };
    } catch (err: unknown) {
      setLiveError(err instanceof Error ? err.message : 'Không thể bật Microphone');
      stopLiveVoiceSession();
    }
  };

  // --- TAB 4C: Music Generation (Lyria 3) ---
  const [musicPrompt, setMusicPrompt] = useState(
    'Giai điệu piano và đàn dây nhẹ nhàng, truyền cảm hứng tập trung giải Toán và tự học trong lớp (30 giây)'
  );
  const [musicModel, setMusicModel] = useState<'lyria-3-clip-preview' | 'lyria-3-pro-preview'>(
    'lyria-3-clip-preview'
  );
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [musicLyrics, setMusicLyrics] = useState<string>('');
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicError(null);
    try {
      const res = await fetch('/api/ai/music-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: musicPrompt,
          model: musicModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi sáng tác nhạc Lyria');
      const binary = window.atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
      if (musicAudioUrl) URL.revokeObjectURL(musicAudioUrl);
      const url = URL.createObjectURL(blob);
      setMusicAudioUrl(url);
      setMusicLyrics(data.lyrics || '');
    } catch (err: unknown) {
      setMusicError(err instanceof Error ? err.message : 'Lỗi tạo nhạc AI');
    } finally {
      setMusicLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Studio Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('chat_grounding')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${tactile3dClass(
              activeTab === 'chat_grounding'
            )}`}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Chat Chuyên môn &amp; Tra cứu Thực tế</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('image_studio')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${tactile3dClass(
              activeTab === 'image_studio'
            )}`}
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span>Tạo &amp; Sửa Ảnh STEM</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video_studio')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${tactile3dClass(
              activeTab === 'video_studio'
            )}`}
          >
            <Film className="h-4 w-4 shrink-0" />
            <span>Dựng Video &amp; Hoạt ảnh</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('voice_music_studio')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${tactile3dClass(
              activeTab === 'voice_music_studio'
            )}`}
          >
            <AudioLines className="h-4 w-4 shrink-0" />
            <span>Giọng nói Live, Chép lời &amp; Nhạc Lyria</span>
          </button>
        </div>

        <span className="hidden rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1] xl:inline-block dark:bg-slate-800 dark:text-slate-200">
          Gemini Multimodal Studio · SGK Kết nối tri thức
        </span>
      </div>

      {/* TAB 1: CHATBOT + GOOGLE SEARCH + GOOGLE MAPS GROUNDING */}
      {activeTab === 'chat_grounding' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-4">
            {/* Model & Grounding Controls */}
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Cấu hình Mô hình &amp; Dữ liệu Thực tế
              </h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                    Mô hình Gemini Chatbot:
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="gemini-4-hydrogen">gemini-4-hydrogen (Đa phương thức &amp; Chuẩn)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Phản hồi tức thì)</option>
                    <option value="gemini-4-argon">gemini-4-argon (Suy luận Toán chuyên sâu)</option>
                    <option value="gemini-4-carbon">gemini-4-carbon (Phân tích phức tạp)</option>
                  </select>
                </div>

                <div className="space-y-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-[12px] font-semibold text-[#1E293B] dark:text-slate-200">
                    Kết nối Dữ liệu Trực tiếp (Grounding):
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px] font-medium text-[#334155] dark:text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-[#136F63]" />
                      Dữ liệu Google Search (Web mới nhất)
                    </span>
                    <input
                      type="checkbox"
                      checked={useSearchGrounding}
                      onChange={(e) => setUseSearchGrounding(e.target.checked)}
                      className="h-4 w-4 accent-[#136F63]"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px] font-medium text-[#334155] dark:text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#15803D]" />
                      Dữ liệu Địa điểm Google Maps
                    </span>
                    <input
                      type="checkbox"
                      checked={useMapsGrounding}
                      onChange={(e) => setUseMapsGrounding(e.target.checked)}
                      className="h-4 w-4 accent-[#136F63]"
                    />
                  </label>

                  {useMapsGrounding && (
                    <div className="mt-1 flex items-center justify-between rounded-[8px] border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[12px] text-[#64748B] dark:bg-slate-800 dark:text-slate-300">
                      <span>
                        Tọa độ: {userCoords?.latitude}, {userCoords?.longitude}
                      </span>
                      <button
                        type="button"
                        onClick={handleLocateMe}
                        className="font-semibold text-[#136F63] hover:underline"
                      >
                        Lấy vị trí hiện tại
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Khung QĐ 2422 (12 tiết chuẩn hóa)
              </h3>
              <div className="mt-2.5 space-y-2 text-[13.5px] text-[#334155] dark:text-slate-200">
                <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:bg-slate-800/50">
                  <div className="font-semibold text-[#136F63]">Tiết 1–4: Hàm số &amp; Tối ưu thực tế</div>
                  <div className="mt-0.5 text-[12px] text-[#64748B]">Đơn điệu, cực trị, GTLN-GTNN, tiệm cận phân thức 2/1.</div>
                </div>
                <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:bg-slate-800/50">
                  <div className="font-semibold text-[#136F63]">Tiết 5–8: Nguyên hàm, Tích phân &amp; Oxyz</div>
                  <div className="mt-0.5 text-[12px] text-[#64748B]">Thể tích tròn xoay, mặt phẳng, đường thẳng &amp; mặt cầu.</div>
                </div>
                <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 dark:bg-slate-800/50">
                  <div className="font-semibold text-[#136F63]">Tiết 9–12: Thống kê &amp; Xác suất Bayes</div>
                  <div className="mt-0.5 text-[12px] text-[#64748B]">Tứ phân vị ghép nhóm, công thức xác suất toàn phần, luyện đề 0107.</div>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">Gợi ý hỏi nhanh</h3>
              <div className="mt-2.5 space-y-2">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(p)}
                    className="min-h-[42px] w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:border-[#136F63] hover:bg-[#F8FAFC] dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-100"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <SmartboardViewport
              title={
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#136F63]" />
                  <span>Hội thoại Trợ lý Chuyên môn Toán THPT</span>
                </span>
              }
              headerActions={
                <div className="flex flex-wrap items-center gap-1.5">
                  {useSearchGrounding && (
                    <span className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1]">
                      Google Search BẬT
                    </span>
                  )}
                  {useMapsGrounding && (
                    <span className="rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-0.5 text-[12px] font-semibold text-[#15803D]">
                      Google Maps BẬT
                    </span>
                  )}
                  <span className="rounded-[8px] border border-[#CBD5E1] bg-white px-2 py-0.5 text-[12px] font-medium text-[#64748B] dark:bg-slate-800 dark:text-slate-300">
                    {useSearchGrounding || useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel}
                  </span>
                </div>
              }
              disableInnerScroll
              className="h-[560px] sm:h-[640px]"
              bodyClassName="flex h-full flex-col"
            >
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[86%] rounded-[8px] px-4 py-3 text-[13.5px] leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-[#136F63] text-white'
                            : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">
                          <MathText text={m.text} />
                        </div>

                        {m.groundingLinks && m.groundingLinks.length > 0 && (
                          <div className="mt-3 border-t border-[#E2E8F0] pt-2 dark:border-slate-700">
                            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-300">
                              Nguồn trích dẫn xác thực (Google Search / Maps):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.groundingLinks.map((lnk, lIdx) => (
                                <a
                                  key={lIdx}
                                  href={lnk.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE]/60 px-2.5 py-1 text-[12px] font-medium text-[#0369A1] transition-colors hover:bg-[#E0F2FE] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  {lnk.sourceType === 'maps' ? (
                                    <MapPin className="h-3 w-3 text-[#15803D]" />
                                  ) : (
                                    <Globe className="h-3 w-3 text-[#0369A1]" />
                                  )}
                                  <span className="max-w-[220px] truncate">{lnk.title}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2 text-[12px] font-medium text-[#136F63]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang phân tích chuyên môn &amp; tra cứu dữ liệu...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex gap-2 border-t border-[#E2E8F0] p-3 dark:border-slate-800"
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập câu hỏi Toán, bài toán thực tế hoặc yêu cầu tra cứu Google Search / Maps..."
                    className="min-h-[48px] flex-1 rounded-[8px] border border-[#CBD5E1] px-3 py-2 text-[14px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !input.trim()}
                    aria-label="Gửi câu hỏi"
                    className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-[8px] bg-[#136F63] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#0F594F] disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </SmartboardViewport>
          </div>
        </div>
      )}

      {/* TAB 2: IMAGE CREATION & EDITING STUDIO */}
      {activeTab === 'image_studio' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Tạo mới &amp; Chỉnh sửa Ảnh Minh họa STEM
              </h3>
              <span className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1]">
                Interactions API
              </span>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Mô hình Xử lý Ảnh:
              </label>
              <select
                value={imgModel}
                onChange={(e) => setImgModel(e.target.value as any)}
                className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="gemini-3.1-flash-lite-image">
                  gemini-3.1-flash-lite-image (Mặc định · Tạo &amp; Sửa ảnh nhanh)
                </option>
                <option value="gemini-nano-banana-2.1">
                  gemini-nano-banana-2.1 (Nano Banana 2.1 · Độ chi tiết cao)
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Tỷ lệ khung hình:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['1:1', '16:9', '4:3'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setImgAspect(ratio)}
                    className={`rounded-[8px] py-2 text-[13.5px] font-medium ${tactile3dClass(imgAspect === ratio)}`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Ảnh gốc để chỉnh sửa (Tùy chọn — bỏ trống nếu muốn tạo ảnh mới):
              </label>
              <div className="flex items-center gap-2">
                <label className="btn-glossy-3d-inactive inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium">
                  <Upload className="h-3.5 w-3.5 text-[#136F63]" />
                  <span>Tải ảnh lên để chỉnh sửa</span>
                  <input type="file" accept="image/*" onChange={handleUploadSourceImage} className="hidden" />
                </label>
                {sourceImgBase64 && (
                  <button
                    type="button"
                    onClick={() => setSourceImgBase64(null)}
                    className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-2.5 py-1.5 text-[12px] font-semibold text-[#B91C1C] hover:bg-red-100"
                  >
                    Xóa ảnh gốc
                  </button>
                )}
              </div>
              {sourceImgBase64 && (
                <img
                  src={sourceImgBase64}
                  alt="Ảnh gốc"
                  className="mt-2 h-28 rounded-[8px] border border-[#E2E8F0] object-contain p-1"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Mô tả hình ảnh cần tạo hoặc yêu cầu chỉnh sửa:
              </label>
              <textarea
                rows={4}
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="Ví dụ: Vẽ hình minh họa bài toán thực tế cổng chào hình parabol hoặc thêm chú thích trục tọa độ..."
                className="w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[14px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleRunImageStudio}
              disabled={imgLoading || !imgPrompt.trim()}
              className="btn-glossy-3d-active flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {imgLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang xử lý hình ảnh bằng AI...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  <span>{sourceImgBase64 ? 'Chỉnh sửa Ảnh với AI' : 'Tạo Ảnh Minh họa Mới'}</span>
                </>
              )}
            </button>

            {imgError && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-[12px] font-semibold text-[#B91C1C]">
                {imgError}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            {generatedImgUrl ? (
              <div className="w-full space-y-3 text-center">
                <img
                  src={generatedImgUrl}
                  alt="Generated STEM Illustration"
                  className="mx-auto max-h-[430px] rounded-[8px] border border-[#E2E8F0] object-contain shadow-xs"
                />
                {generatedImgCaption && (
                  <p className="text-[12px] text-[#64748B] dark:text-slate-300">{generatedImgCaption}</p>
                )}
                <div className="flex justify-center gap-2">
                  <a
                    href={generatedImgUrl}
                    download={`MinhHoa_STEM_${Date.now()}.png`}
                    className="btn-glossy-3d-active inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13.5px] font-medium text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Tải Ảnh PNG Về Máy</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSourceImgBase64(generatedImgUrl)}
                    className="btn-glossy-3d-inactive inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-[#136F63]" />
                    <span>Dùng làm ảnh gốc để sửa tiếp</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md space-y-2 py-16 text-center text-[#64748B]">
                <ImageIcon className="mx-auto h-12 w-12 text-[#136F63]/50" />
                <div className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-200">
                  Khung xem trước Ảnh Minh họa Toán &amp; STEM
                </div>
                <p className="text-[13.5px] leading-relaxed">
                  Nhập mô tả bài toán thực tế (cổng parabol, hình chóp, mặt cầu, lát cắt elip...) hoặc tải ảnh lên để chỉnh sửa trực tiếp.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: VIDEO GENERATION & PHOTO ANIMATION STUDIO */}
      {activeTab === 'video_studio' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                Dựng Video Bài giảng &amp; Tạo Chuyển động Ảnh
              </h3>
              <span className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1]">
                gemini-omni-1.2-flash
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVideoMode('text_to_video')}
                className={`rounded-[8px] py-2.5 text-[13.5px] font-medium ${tactile3dClass(
                  videoMode === 'text_to_video'
                )}`}
              >
                Tạo Video từ Văn bản
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('image_to_video')}
                className={`rounded-[8px] py-2.5 text-[13.5px] font-medium ${tactile3dClass(
                  videoMode === 'image_to_video'
                )}`}
              >
                Tạo Video từ Ảnh tĩnh
              </button>
            </div>

            {videoMode === 'image_to_video' && (
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                  Chọn hình ảnh khởi đầu (Starting Frame):
                </label>
                <label className="btn-glossy-3d-inactive inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium">
                  <Upload className="h-3.5 w-3.5 text-[#136F63]" />
                  <span>Tải ảnh lên để tạo chuyển động</span>
                  <input type="file" accept="image/*" onChange={handleUploadVideoFrame} className="hidden" />
                </label>
                {videoFrameBase64 && (
                  <img
                    src={videoFrameBase64}
                    alt="Khung hình đầu"
                    className="mt-2 h-28 rounded-[8px] border border-[#E2E8F0] object-contain p-1"
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                  Khung hình (Aspect Ratio):
                </label>
                <select
                  value={videoAspect}
                  onChange={(e) => setVideoAspect(e.target.value as '16:9' | '9:16')}
                  className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="16:9">16:9 (Ngang · Trình chiếu Slide)</option>
                  <option value="9:16">9:16 (Dọc · Thiết bị di động)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                  Thời lượng:
                </label>
                <select
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value as any)}
                  className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="5s">5 giây</option>
                  <option value="6s">6 giây</option>
                  <option value="10s">10 giây</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Kịch bản chuyển động / Mô tả video:
              </label>
              <textarea
                rows={4}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Nhập mô tả cảnh quay hoặc chuyển động hình học..."
                className="w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[14px] text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleRunVideoStudio}
              disabled={videoLoading || !videoPrompt.trim()}
              className="btn-glossy-3d-active flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {videoLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang kết xuất Video Omni Flash...</span>
                </>
              ) : (
                <>
                  <Film className="h-4 w-4" />
                  <span>
                    {videoMode === 'image_to_video'
                      ? 'Tạo Hoạt ảnh Video từ Hình'
                      : 'Tạo Video Minh họa từ Văn bản'}
                  </span>
                </>
              )}
            </button>

            {videoError && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-[12px] font-semibold text-[#B91C1C]">
                {videoError}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            {generatedVideoUrl ? (
              <div className="w-full space-y-3 text-center">
                <video
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="mx-auto max-h-[420px] rounded-[8px] border border-[#E2E8F0] shadow-xs"
                />
                <a
                  href={generatedVideoUrl}
                  download={`Video_STEM_${Date.now()}.mp4`}
                  className="btn-glossy-3d-active inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13.5px] font-medium text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Tải Video MP4</span>
                </a>
              </div>
            ) : (
              <div className="max-w-md space-y-2 py-16 text-center text-[#64748B]">
                <Film className="mx-auto h-12 w-12 text-[#136F63]/50" />
                <div className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-200">
                  Khung phát Video Bài giảng &amp; Hoạt ảnh (16:9 / 9:16)
                </div>
                <p className="text-[13.5px] leading-relaxed">
                  Hỗ trợ sinh video trực tiếp từ kịch bản văn bản hoặc biến ảnh chụp đồ thị/hình học tĩnh thành video chuyển động trực quan.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LIVE VOICE CONVERSATION + AUDIO TRANSCRIPTION + LYRIA MUSIC */}
      {activeTab === 'voice_music_studio' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* 4A: Live Voice Conversation (gemini-3.8-live) */}
          <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                1. Đàm thoại Giọng nói Live
              </h3>
              <span className="rounded-[8px] border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-0.5 text-[12px] font-semibold text-[#15803D]">
                gemini-3.8-live
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-[#64748B] dark:text-slate-300">
              Trò chuyện hai chiều thời gian thực độ trễ thấp với Trợ lý Chuyên môn Toán (âm thanh PCM 16kHz thu trực tiếp và phát lại mượt ở 24kHz).
            </p>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Chọn giọng đọc AI:
              </label>
              <select
                value={liveVoiceName}
                onChange={(e) => setLiveVoiceName(e.target.value as any)}
                disabled={liveConnected || liveConnecting}
                className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Zephyr">Zephyr (Tự nhiên · Rõ ràng)</option>
                <option value="Kore">Kore (Ấm áp · Sư phạm)</option>
                <option value="Puck">Puck (Năng động)</option>
                <option value="Charon">Charon (Trầm tĩnh)</option>
                <option value="Fenrir">Fenrir (Mạnh mẽ)</option>
              </select>
            </div>

            {!liveConnected ? (
              <button
                type="button"
                onClick={startLiveVoiceSession}
                disabled={liveConnecting}
                className="btn-glossy-3d-active flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-[14px] font-semibold text-white"
              >
                {liveConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang kết nối phiên Live...</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-4 w-4" />
                    <span>Bắt đầu Đàm thoại Trực tiếp</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLiveVoiceSession}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-2.5 text-[14px] font-semibold text-[#B91C1C] transition-colors hover:bg-red-100"
              >
                <PhoneOff className="h-4 w-4" />
                <span>Kết thúc Cuộc gọi Live</span>
              </button>
            )}

            {liveError && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-2.5 text-[12px] font-semibold text-[#B91C1C]">
                {liveError}
              </div>
            )}

            <div className="h-48 space-y-2 overflow-y-auto rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[12px] dark:border-slate-800 dark:bg-slate-800/60">
              {liveLogs.length === 0 ? (
                <div className="py-12 text-center text-[#64748B]">
                  {liveConnected
                    ? 'Đang lắng nghe qua Microphone... Hãy nói câu hỏi của Thầy/Cô!'
                    : 'Nhấn "Bắt đầu Đàm thoại Trực tiếp" để trao đổi bằng giọng nói.'}
                </div>
              ) : (
                liveLogs.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-[8px] px-2.5 py-1.5 ${
                      item.speaker === 'user'
                        ? 'border border-[#BAE6FD] bg-[#E0F2FE] font-medium text-[#0369A1]'
                        : 'border border-[#E2E8F0] bg-white text-[#334155]'
                    }`}
                  >
                    <span className="font-semibold">
                      {item.speaker === 'user' ? 'Giáo viên: ' : 'AI Live: '}
                    </span>
                    {item.text}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 4B: Audio Transcription (gemini-3.5-transcribe) */}
          <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                2. Chép lời Giọng nói (Transcribe)
              </h3>
              <span className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-0.5 text-[12px] font-semibold text-[#0369A1]">
                gemini-3.5-transcribe
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-[#64748B] dark:text-slate-300">
              Ghi âm lời đọc đề bài Toán, nhận xét học sinh hoặc tải tệp âm thanh lên để chuyển thành văn bản chuẩn.
            </p>

            <div className="flex flex-wrap gap-2">
              {!isRecordingTranscribe ? (
                <button
                  type="button"
                  onClick={startTranscribeRecording}
                  disabled={transcribeLoading}
                  className="btn-glossy-3d-active inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3.5 py-2.5 text-[13.5px] font-medium text-white"
                >
                  <Mic className="h-4 w-4" />
                  <span>Ghi âm từ Mic</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopTranscribeRecording}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] px-3.5 py-2.5 text-[13.5px] font-semibold text-[#B91C1C]"
                >
                  <Square className="h-4 w-4" />
                  <span>Dừng &amp; Chép lời</span>
                </button>
              )}

              <label className="btn-glossy-3d-inactive inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[8px] px-3.5 py-2.5 text-[13.5px] font-medium">
                <Upload className="h-4 w-4 text-[#136F63]" />
                <span>Tải file Audio</span>
                <input type="file" accept="audio/*" onChange={handleUploadAudioFile} className="hidden" />
              </label>
            </div>

            {transcribeLoading && (
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#136F63]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang nhận diện giọng nói bằng gemini-3.5-transcribe...
              </div>
            )}

            {transcribeError && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-2.5 text-[12px] font-semibold text-[#B91C1C]">
                {transcribeError}
              </div>
            )}

            <textarea
              rows={6}
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder="Văn bản được chép lời từ giọng nói sẽ hiển thị tại đây..."
              className="w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[13.5px] leading-relaxed text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <button
              type="button"
              disabled={!transcriptText.trim()}
              onClick={() => {
                navigator.clipboard.writeText(transcriptText);
                setTranscribeCopied(true);
                setTimeout(() => setTranscribeCopied(false), 2000);
              }}
              className="btn-glossy-3d-inactive inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] py-2 text-[13.5px] font-medium disabled:opacity-50"
            >
              {transcribeCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#15803D]" />
                  <span>Đã sao chép văn bản!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[#136F63]" />
                  <span>Sao chép văn bản chép lời</span>
                </>
              )}
            </button>
          </div>

          {/* 4C: Music Generation (Lyria 3) */}
          <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                3. Sáng tác Nhạc Lớp học (Lyria 3)
              </h3>
              <span className="rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7] px-2.5 py-0.5 text-[12px] font-semibold text-[#B45309]">
                Lyria Audio
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-[#64748B] dark:text-slate-300">
              Tạo nhạc nền không lời cho giờ tự học giải Toán, nhạc khởi động đầu giờ hoặc nhạc hiệu trò chơi lớp học.
            </p>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Mô hình Âm nhạc:
              </label>
              <select
                value={musicModel}
                onChange={(e) => setMusicModel(e.target.value as any)}
                className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] font-medium text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="lyria-3-clip-preview">lyria-3-clip-preview (Đoạn nhạc 30 giây)</option>
                <option value="lyria-3-pro-preview">lyria-3-pro-preview (Bản nhạc đầy đủ)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#334155] dark:text-slate-200">
                Mô tả phong cách nhạc:
              </label>
              <textarea
                rows={3}
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                className="w-full rounded-[8px] border border-[#CBD5E1] p-3 text-[13.5px] leading-relaxed text-[#0F172A] focus:border-[#136F63] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateMusic}
              disabled={musicLoading || !musicPrompt.trim()}
              className="btn-glossy-3d-active flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {musicLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang hòa âm với Lyria 3...</span>
                </>
              ) : (
                <>
                  <Music className="h-4 w-4" />
                  <span>Tạo Nhạc nền Lớp học</span>
                </>
              )}
            </button>

            {musicError && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-2.5 text-[12px] font-semibold text-[#B91C1C]">
                {musicError}
              </div>
            )}

            {musicAudioUrl && (
              <div className="space-y-2 rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <audio src={musicAudioUrl} controls className="w-full" />
                {musicLyrics && (
                  <div className="max-h-24 overflow-y-auto text-[12px] text-[#64748B]">
                    {musicLyrics}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
