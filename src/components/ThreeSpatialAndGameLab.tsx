import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Pause,
  PenTool,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MathText } from './MathText';
import { tactile3dClass } from '../utils/uiStyles';
import { SmartboardViewport } from './SmartboardViewport';

type ScenePresetId = 'pyramid_sabcd' | 'prism_abc' | 'solid_revolution' | 'oxyz_plane_sphere';

interface ScenePresetMeta {
  id: ScenePresetId;
  title: string;
  gradeBadge: string;
  formulaLatex: string;
  description: string;
  parts: { key: string; label: string; mathDetail: string }[];
}

const SCENE_PRESETS: ScenePresetMeta[] = [
  {
    id: 'pyramid_sabcd',
    title: 'Hình chóp S.ABCD (SA ⊥ đáy) & Khoảng cách',
    gradeBadge: 'Lớp 11 & 12 · Hình không gian',
    formulaLatex:
      '$SA \\perp (ABCD),\\; CD \\perp (SAD),\\; AH \\perp SD \\Rightarrow AH = d(A, (SCD)) = \\dfrac{SA \\cdot AD}{\\sqrt{SA^2 + AD^2}}$',
    description:
      'Mô hình 3D đa thành phần gồm đáy hình chữ nhật ABCD, đường cao SA vuông góc đáy, mặt bên (SAD) trong suốt, đường cao AH hạ từ A lên SD và mặt cầu ngoại tiếp.',
    parts: [
      { key: 'S', label: 'Đỉnh S (Chóp)', mathDetail: 'Đỉnh chóp $S(0; h; 0)$ với $SA = 6$ vuông góc mặt đáy $(ABCD)$.' },
      { key: 'SA', label: 'Đường cao SA ⊥ (ABCD)', mathDetail: 'Trục đường cao $SA \\perp AB, SA \\perp AD \\Rightarrow SA \\perp (ABCD)$.' },
      { key: 'AH', label: 'Đoạn khoảng cách AH ⊥ (SCD)', mathDetail: 'Hạ $AH \\perp SD$ tại $H$. Do $CD \\perp (SAD) \\Rightarrow AH \\perp (SCD)$.' },
      { key: 'BaseABCD', label: 'Đáy chữ nhật ABCD', mathDetail: 'Hình chữ nhật $ABCD$ có $AB = 3, BC = 4 \\Rightarrow S_{ABCD} = 12$.' },
      { key: 'Sphere', label: 'Tâm cầu ngoại tiếp I', mathDetail: 'Tâm mặt cầu ngoại tiếp $I$ là trung điểm của đường chéo $SC$, bán kính $R = \\dfrac{SC}{2}$.' },
    ],
  },
  {
    id: 'prism_abc',
    title: "Lăng trụ tam giác đều ABC.A'B'C'",
    gradeBadge: 'Lớp 11 & 12 · Vectơ trong không gian',
    formulaLatex:
      "$\\overrightarrow{AB'} \\cdot \\overrightarrow{BC} = (\\overrightarrow{AB} + \\overrightarrow{AA'}) \\cdot \\overrightarrow{BC} = a^2 \\cos 120^\\circ = -\\dfrac{a^2}{2}$",
    description:
      "Lăng trụ đứng có đáy ABC là tam giác đều cạnh a = 4, cạnh bên AA' = 6 vuông góc đáy, kèm vectơ đường chéo AB' và thiết diện.",
    parts: [
      { key: 'VecABp', label: "Vectơ đường chéo AB'", mathDetail: "$\\overrightarrow{AB'} = \\overrightarrow{AB} + \\overrightarrow{AA'}$." },
      { key: 'VecBC', label: 'Vectơ cạnh đáy BC', mathDetail: 'Góc giữa $\\overrightarrow{AB}$ và $\\overrightarrow{BC}$ bằng $120^\\circ$.' },
      { key: 'TopPrism', label: "Đáy trên A'B'C'", mathDetail: "Tam giác đều $A'B'C'$ song song và bằng đáy $ABC$." },
      { key: 'CrossSection', label: "Mặt phẳng thiết diện (AB'C)", mathDetail: "Thiết diện tạo bởi mặt phẳng đi qua $A, B', C$." },
    ],
  },
  {
    id: 'solid_revolution',
    title: 'Khối tròn xoay Tích phân (Elip & Đường tròn)',
    gradeBadge: 'Lớp 12 · Ứng dụng Tích phân',
    formulaLatex:
      '$V = \\pi \\int_{-4}^{4} \\left[(25 - x^2) - \\left(12 - \\dfrac{3}{16}x^2\\right)\\right]\\mathrm{d}x = \\dfrac{208\\pi}{3} \\approx 218\\text{ cm}^3$',
    description:
      'Mô phỏng chi tiết máy cơ khí tạo thành khi quay hình phẳng (H) giới hạn bởi đường tròn R = 5 và elip quanh trục hoành Ox.',
    parts: [
      { key: 'OuterShell', label: 'Vỏ cầu ngoài (R = 5)', mathDetail: 'Khối tròn xoay sinh bởi cung tròn $y^2 = 25 - x^2$ trên $[-4; 4]$.' },
      { key: 'InnerEllipsoid', label: 'Lõi Elipsoid rỗng trong', mathDetail: 'Phần khoét rỗng sinh bởi elip $y^2 = 12 - \\dfrac{3}{16}x^2$.' },
      { key: 'SliceDisk', label: 'Thiết diện vành khăn S(x)', mathDetail: 'Mặt cắt vuông góc trục $Ox$ là hình vành khăn có diện tích $S(x) = \\pi(R^2 - r^2)$.' },
    ],
  },
  {
    id: 'oxyz_plane_sphere',
    title: 'Hệ trục Oxyz: Mặt phẳng, Pháp tuyến & Mặt cầu',
    gradeBadge: 'Lớp 12 · Phương pháp tọa độ Oxyz',
    formulaLatex:
      '$(P): 3x + 2y - z - 1 = 0,\\; \\vec{n} = (3; 2; -1),\\; (S): (x - 1)^2 + (y - 1)^2 + (z - 2)^2 = 4$',
    description:
      'Trực quan hóa hệ trục Oxyz, mặt phẳng (P) đi qua A(2;-1;3), vectơ pháp tuyến n vuông góc mặt phẳng và giao tuyến đường tròn với mặt cầu (S).',
    parts: [
      { key: 'PlaneP', label: 'Mặt phẳng (P): 3x + 2y - z - 1 = 0', mathDetail: 'Mặt phẳng đi qua $A(2; -1; 3)$ có VTPT $\\vec{n} = (3; 2; -1)$.' },
      { key: 'NormalVec', label: 'Vectơ pháp tuyến n = (3; 2; -1)', mathDetail: 'Vectơ pháp tuyến vuông góc với mọi đường thẳng nằm trong mặt phẳng $(P)$.' },
      { key: 'SphereS', label: 'Mặt cầu (S) tâm I(1; 1; 2)', mathDetail: 'Khoảng cách từ tâm $I$ đến $(P)$ quyết định bán kính đường tròn giao tuyến.' },
    ],
  },
];

interface GameQuestion {
  id: string;
  preset: ScenePresetId;
  targetPartKey: string;
  prompt: string;
  hint: string;
  options: [string, string, string, string];
  correctIdx: number;
}

const GAME_QUESTIONS: GameQuestion[] = [
  {
    id: 'gq-1',
    preset: 'pyramid_sabcd',
    targetPartKey: 'AH',
    prompt:
      'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình chữ nhật ($AB=3, AD=4$) và $SA \\perp (ABCD), SA=6$. Đoạn thẳng nào trên mô hình 3D biểu diễn khoảng cách từ $A$ đến mặt phẳng $(SCD)$?',
    hint: 'Nhấp chọn đoạn vuông góc màu vàng cam nối từ A lên cạnh SD hoặc chọn đáp án đúng bên dưới!',
    options: [
      'Đoạn AH vuông góc với SD tại H (AH ≈ 3,33)',
      'Đoạn AC nối hai đỉnh đối diện đáy (AC = 5)',
      'Đoạn SB trên mặt bên (SAD)',
      'Đoạn trung tuyến nối từ A đến trung điểm SC',
    ],
    correctIdx: 0,
  },
  {
    id: 'gq-2',
    preset: 'pyramid_sabcd',
    targetPartKey: 'Sphere',
    prompt:
      'Trong hình chóp $S.ABCD$ có $SA \\perp (ABCD)$ và đáy $ABCD$ là hình chữ nhật, tâm $I$ của mặt cầu ngoại tiếp khối chóp nằm ở vị trí nào?',
    hint: 'Các đỉnh B, C, D, A cùng nhìn đường kính SC dưới góc vuông 90°.',
    options: [
      'Trung điểm của cạnh bên SA',
      'Trung điểm của đường chéo không gian SC',
      'Tâm O của hình chữ nhật đáy ABCD',
      'Trọng tâm G của tam giác SAC',
    ],
    correctIdx: 1,
  },
  {
    id: 'gq-3',
    preset: 'prism_abc',
    targetPartKey: 'VecABp',
    prompt:
      "Cho lăng trụ tam giác đều $ABC.A'B'C'$ có cạnh đáy bằng $4$ và cạnh bên $AA' = 6$. Giá trị tích vô hướng $\\overrightarrow{AB'} \\cdot \\overrightarrow{BC}$ bằng bao nhiêu?",
    hint: "Phân tích $\\overrightarrow{AB'} = \\overrightarrow{AB} + \\overrightarrow{AA'}$ và lưu ý $\\overrightarrow{AA'} \\perp \\overrightarrow{BC}$.",
    options: ['16', '8', '-8', '-12'],
    correctIdx: 2,
  },
  {
    id: 'gq-4',
    preset: 'solid_revolution',
    targetPartKey: 'SliceDisk',
    prompt:
      'Chi tiết máy tròn xoay giới hạn bởi đường tròn $x^2 + y^2 = 25$ và elip $\\dfrac{x^2}{64} + \\dfrac{y^2}{12} = 1$ ($x \\in [-4; 4]$) khi quay quanh trục $Ox$ có thể tích gần nhất với giá trị nào?',
    hint: 'Áp dụng công thức $V = \\pi \\int_{-4}^{4} (y_{\\text{tròn}}^2 - y_{\\text{elip}}^2)\\mathrm{d}x$.',
    options: ['218 cm³', '154 cm³', '312 cm³', '109 cm³'],
    correctIdx: 0,
  },
  {
    id: 'gq-5',
    preset: 'oxyz_plane_sphere',
    targetPartKey: 'NormalVec',
    prompt:
      'Trong không gian $Oxyz$, mặt phẳng $(P)$ đi qua $A(2; -1; 3)$ và nhận $\\vec{n} = (3; 2; -1)$ làm vectơ pháp tuyến có phương trình tổng quát là:',
    hint: 'Khai triển $3(x - 2) + 2(y + 1) - 1(z - 3) = 0$.',
    options: [
      '3x + 2y - z + 1 = 0',
      '3x + 2y - z - 1 = 0',
      '2x - y + 3z - 1 = 0',
      '3x - 2y - z - 5 = 0',
    ],
    correctIdx: 1,
  },
];

// Procedural Web Audio Synthesizer for Game Feedback
class MathGameSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playClick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  playCorrect() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t0 = ctx.currentTime + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.11, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  }

  playWrong() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }
}

export const ThreeSpatialAndGameLab: React.FC<{
  initialMode?: 'explore_3d' | 'math_game';
  onSendToSmartboard?: (payload: {
    title: string;
    imageDataUrl?: string;
    solidKind?: 'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane';
  }) => void;
}> = ({ initialMode = 'explore_3d', onSendToSmartboard }) => {
  const [labMode, setLabMode] = useState<'explore_3d' | 'math_game'>(initialMode);
  const [presetId, setPresetId] = useState<ScenePresetId>('pyramid_sabcd');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [wireframeOverlay, setWireframeOverlay] = useState<boolean>(false);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [selectedPartKey, setSelectedPartKey] = useState<string>('AH');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  // Game State Machine: 'title' | 'playing' | 'paused' | 'victory'
  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'victory'>('title');
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    correct: boolean;
    message: string;
  } | null>(null);
  const [muted, setMuted] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const synthRef = useRef<MathGameSynth>(new MathGameSynth());
  const autoRotateRef = useRef<boolean>(autoRotate);
  autoRotateRef.current = autoRotate;
  const explodeRef = useRef<number>(explodeFactor);
  explodeRef.current = explodeFactor;

  const activePreset = SCENE_PRESETS.find((p) => p.id === presetId) || SCENE_PRESETS[0];
  const currentPartInfo =
    activePreset.parts.find((p) => p.key === selectedPartKey) || activePreset.parts[0];
  const currentGameQ = GAME_QUESTIONS[qIndex] || GAME_QUESTIONS[0];

  useEffect(() => {
    synthRef.current.muted = muted;
  }, [muted]);

  // Sync 3D model with current game question when playing
  useEffect(() => {
    if (labMode === 'math_game' && gameState === 'playing') {
      setPresetId(currentGameQ.preset);
      setSelectedPartKey(currentGameQ.targetPartKey);
    }
  }, [labMode, gameState, qIndex, currentGameQ]);

  // Game countdown timer
  useEffect(() => {
    if (labMode !== 'math_game' || gameState !== 'playing') return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setGameState('victory');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [labMode, gameState]);

  const startGame = () => {
    synthRef.current.playClick();
    setScore(0);
    setStreak(0);
    setQIndex(0);
    setTimeLeft(90);
    setFeedbackBanner(null);
    setPresetId(GAME_QUESTIONS[0].preset);
    setSelectedPartKey(GAME_QUESTIONS[0].targetPartKey);
    setGameState('playing');
  };

  const handleAnswerGame = (optionIdx: number) => {
    if (gameState !== 'playing') return;
    const isCorrect = optionIdx === currentGameQ.correctIdx;
    if (isCorrect) {
      synthRef.current.playCorrect();
      const bonus = 100 + streak * 25;
      setScore((s) => s + bonus);
      setStreak((st) => st + 1);
      setFeedbackBanner({
        correct: true,
        message: `Chính xác! +${bonus} điểm (Combo x${streak + 1})`,
      });
    } else {
      synthRef.current.playWrong();
      setStreak(0);
      setFeedbackBanner({
        correct: false,
        message: `Chưa đúng! Đáp án chuẩn: ${currentGameQ.options[currentGameQ.correctIdx]}`,
      });
    }

    window.setTimeout(() => {
      setFeedbackBanner(null);
      if (qIndex + 1 < GAME_QUESTIONS.length) {
        setQIndex((i) => i + 1);
      } else {
        setGameState('victory');
      }
    }, 1400);
  };

  // Three.js WebGL Scene Setup & Lifecycle
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.035);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(6.2, 4.8, 7.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });

    // Software WebGL guard per Three.js skill guidelines
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : '';
    const isSoftwareGl = /SwiftShader|Software|llvmpipe/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.setAttribute('data-interactive-canvas', 'true');
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Procedural studio environment via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Three-point lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(6, 10, 6);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    // Studio Pedestal & Coordinate Grid
    const pedestalGeo = new THREE.CylinderGeometry(4.6, 5.0, 0.18, isSoftwareGl ? 24 : 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.6,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -1.6;
    pedestal.receiveShadow = !isSoftwareGl;
    scene.add(pedestal);

    const grid = new THREE.GridHelper(8, 16, 0x0284c7, 0x1e293b);
    grid.position.y = -1.5;
    scene.add(grid);

    // Metallic Coordinate Axes (Ox, Oy, Oz)
    const axesGroup = new THREE.Group();
    axesGroup.position.set(0, -1.48, 0);
    const buildAxisArrow = (dir: THREE.Vector3, hexColor: number) => {
      const length = 3.8;
      const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, length, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.25,
        metalness: 0.75,
      });
      const rod = new THREE.Mesh(rodGeo, mat);
      const coneGeo = new THREE.ConeGeometry(0.09, 0.26, 14);
      const cone = new THREE.Mesh(coneGeo, mat);
      const holder = new THREE.Group();
      rod.position.y = length / 2;
      cone.position.y = length + 0.1;
      holder.add(rod, cone);
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return holder;
    };
    axesGroup.add(
      buildAxisArrow(new THREE.Vector3(1, 0, 0), 0xef4444), // Ox Red
      buildAxisArrow(new THREE.Vector3(0, 1, 0), 0x10b981), // Oz Up Green
      buildAxisArrow(new THREE.Vector3(0, 0, 1), 0x38bdf8)  // Oy Blue
    );
    scene.add(axesGroup);

    // Composite Model Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    const clickableMeshes: THREE.Object3D[] = [];

    const segs = isSoftwareGl ? 16 : 36;

    const addVertexSphere = (pos: THREE.Vector3, colorHex: number, partKey: string, radius = 0.13) => {
      const geo = new THREE.SphereGeometry(radius, segs, segs);
      const mat = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        roughness: 0.15,
        metalness: 0.2,
        clearcoat: 1.0,
        emissive: partKey === selectedPartKey ? colorHex : 0x000000,
        emissiveIntensity: partKey === selectedPartKey ? 0.45 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { partKey, basePos: pos.clone() };
      modelGroup.add(mesh);
      clickableMeshes.push(mesh);
      return mesh;
    };

    const addRodBetween = (
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      colorHex: number,
      partKey: string,
      radius = 0.045
    ) => {
      const diff = new THREE.Vector3().subVectors(p2, p1);
      const len = diff.length();
      const geo = new THREE.CylinderGeometry(radius, radius, len, 14);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.25,
        metalness: 0.65,
        emissive: partKey === selectedPartKey ? colorHex : 0x000000,
        emissiveIntensity: partKey === selectedPartKey ? 0.4 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
      mesh.userData = { partKey, basePos: mid.clone() };
      modelGroup.add(mesh);
      clickableMeshes.push(mesh);
      return mesh;
    };

    if (presetId === 'pyramid_sabcd') {
      const A = new THREE.Vector3(-1.4, -1.45, -1.1);
      const B = new THREE.Vector3(1.4, -1.45, -1.1);
      const C = new THREE.Vector3(1.4, -1.45, 1.3);
      const D = new THREE.Vector3(-1.4, -1.45, 1.3);
      const S = new THREE.Vector3(-1.4, 1.85, -1.1);

      // Altitude projection H on SD
      const sdVec = new THREE.Vector3().subVectors(D, S);
      const saVec = new THREE.Vector3().subVectors(A, S);
      const tProj = saVec.dot(sdVec) / sdVec.lengthSq();
      const H = new THREE.Vector3().copy(S).addScaledVector(sdVec, tProj);
      const centerI = new THREE.Vector3().addVectors(S, C).multiplyScalar(0.5);

      // Base plate ABCD
      const baseGeo = new THREE.BoxGeometry(2.8, 0.06, 2.4);
      const baseMat = new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        roughness: 0.2,
        metalness: 0.1,
        transmission: 0.45,
        transparent: true,
        opacity: 0.75,
        wireframe: wireframeOverlay,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.set(0, -1.45, 0.1);
      baseMesh.userData = { partKey: 'BaseABCD', basePos: baseMesh.position.clone() };
      modelGroup.add(baseMesh);
      clickableMeshes.push(baseMesh);

      // Edges
      addRodBetween(A, B, 0x94a3b8, 'BaseABCD', 0.035);
      addRodBetween(B, C, 0x94a3b8, 'BaseABCD', 0.035);
      addRodBetween(C, D, 0x94a3b8, 'BaseABCD', 0.035);
      addRodBetween(D, A, 0x94a3b8, 'BaseABCD', 0.035);

      addRodBetween(S, A, 0x38bdf8, 'SA', 0.065);
      addRodBetween(S, B, 0xe2e8f0, 'S', 0.04);
      addRodBetween(S, C, 0xe2e8f0, 'S', 0.04);
      addRodBetween(S, D, 0xe2e8f0, 'S', 0.04);

      // Highlighted altitude AH perpendicular to (SCD)
      addRodBetween(A, H, 0xf59e0b, 'AH', 0.075);

      // Vertices
      addVertexSphere(S, 0x38bdf8, 'S', 0.16);
      addVertexSphere(A, 0xf8fafc, 'SA', 0.12);
      addVertexSphere(B, 0xf8fafc, 'BaseABCD', 0.12);
      addVertexSphere(C, 0xf8fafc, 'BaseABCD', 0.12);
      addVertexSphere(D, 0xf8fafc, 'BaseABCD', 0.12);
      addVertexSphere(H, 0xf59e0b, 'AH', 0.15);
      addVertexSphere(centerI, 0xec4899, 'Sphere', 0.15);

      // Circumscribed translucent sphere
      const radiusR = S.distanceTo(C) * 0.5;
      const sphGeo = new THREE.SphereGeometry(radiusR, segs, segs);
      const sphMat = new THREE.MeshPhysicalMaterial({
        color: 0xec4899,
        roughness: 0.15,
        transmission: 0.82,
        transparent: true,
        opacity: 0.22,
        wireframe: wireframeOverlay,
      });
      const sphMesh = new THREE.Mesh(sphGeo, sphMat);
      sphMesh.position.copy(centerI);
      sphMesh.userData = { partKey: 'Sphere', basePos: centerI.clone() };
      modelGroup.add(sphMesh);
    } else if (presetId === 'prism_abc') {
      const A = new THREE.Vector3(-1.3, -1.4, -0.8);
      const B = new THREE.Vector3(0.1, -1.4, 1.4);
      const C = new THREE.Vector3(1.5, -1.4, -0.7);
      const Ap = A.clone().setY(1.5);
      const Bp = B.clone().setY(1.5);
      const Cp = C.clone().setY(1.5);

      addRodBetween(A, B, 0x94a3b8, 'VecBC', 0.045);
      addRodBetween(B, C, 0x10b981, 'VecBC', 0.07);
      addRodBetween(C, A, 0x94a3b8, 'VecBC', 0.045);

      addRodBetween(Ap, Bp, 0x38bdf8, 'TopPrism', 0.05);
      addRodBetween(Bp, Cp, 0x38bdf8, 'TopPrism', 0.05);
      addRodBetween(Cp, Ap, 0x38bdf8, 'TopPrism', 0.05);

      addRodBetween(A, Ap, 0x64748b, 'TopPrism', 0.04);
      addRodBetween(B, Bp, 0x64748b, 'TopPrism', 0.04);
      addRodBetween(C, Cp, 0x64748b, 'TopPrism', 0.04);

      // Diagonal vector AB'
      addRodBetween(A, Bp, 0xf59e0b, 'VecABp', 0.075);
      addRodBetween(Bp, C, 0xf43f5e, 'CrossSection', 0.055);

      // Cross-section triangle AB'C
      const csGeo = new THREE.BufferGeometry().setFromPoints([A, Bp, C]);
      csGeo.computeVertexNormals();
      const csMat = new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        roughness: 0.25,
        wireframe: wireframeOverlay,
      });
      const csMesh = new THREE.Mesh(csGeo, csMat);
      csMesh.userData = { partKey: 'CrossSection', basePos: new THREE.Vector3(0, 0, 0) };
      modelGroup.add(csMesh);
      clickableMeshes.push(csMesh);

      addVertexSphere(A, 0xf8fafc, 'VecABp', 0.13);
      addVertexSphere(B, 0x10b981, 'VecBC', 0.14);
      addVertexSphere(C, 0x10b981, 'VecBC', 0.14);
      addVertexSphere(Ap, 0x38bdf8, 'TopPrism', 0.13);
      addVertexSphere(Bp, 0xf59e0b, 'VecABp', 0.16);
      addVertexSphere(Cp, 0x38bdf8, 'TopPrism', 0.13);
    } else if (presetId === 'solid_revolution') {
      // Lathe outer sphere band & inner ellipsoid band rotated around X axis
      const outerPts: THREE.Vector2[] = [];
      for (let i = 0; i <= 24; i++) {
        const x = -1.6 + (3.2 * i) / 24;
        const r = Math.sqrt(Math.max(0.05, 4.0 - x * x));
        outerPts.push(new THREE.Vector2(r, x));
      }
      const outerGeo = new THREE.LatheGeometry(outerPts, segs);
      outerGeo.rotateZ(Math.PI / 2);
      const outerMat = new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        roughness: 0.18,
        metalness: 0.2,
        transmission: 0.6,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        wireframe: wireframeOverlay,
      });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.userData = { partKey: 'OuterShell', basePos: new THREE.Vector3(0, 0, 0) };
      modelGroup.add(outerMesh);
      clickableMeshes.push(outerMesh);

      // Inner Ellipsoid core
      const innerGeo = new THREE.SphereGeometry(1.15, segs, segs);
      innerGeo.scale(1.85, 0.95, 0.95);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        roughness: 0.3,
        metalness: 0.55,
        wireframe: wireframeOverlay,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.userData = { partKey: 'InnerEllipsoid', basePos: new THREE.Vector3(0, 0, 0) };
      modelGroup.add(innerMesh);
      clickableMeshes.push(innerMesh);

      // Highlighted washer cross-section disk S(x)
      const ringGeo = new THREE.RingGeometry(1.05, 1.85, segs);
      ringGeo.rotateY(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.2,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0.45, 0, 0);
      ringMesh.userData = { partKey: 'SliceDisk', basePos: new THREE.Vector3(0.45, 0, 0) };
      modelGroup.add(ringMesh);
      clickableMeshes.push(ringMesh);
    } else if (presetId === 'oxyz_plane_sphere') {
      // Plane (P)
      const planeGeo = new THREE.PlaneGeometry(3.8, 3.8, 8, 8);
      const planeMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        roughness: 0.2,
        wireframe: wireframeOverlay,
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.rotation.set(0.45, 0.6, 0.2);
      planeMesh.userData = { partKey: 'PlaneP', basePos: new THREE.Vector3(0, 0, 0) };
      modelGroup.add(planeMesh);
      clickableMeshes.push(planeMesh);

      // Normal vector n
      const originP = new THREE.Vector3(0, 0, 0);
      const normalEnd = new THREE.Vector3(1.5, 1.2, -0.8);
      addRodBetween(originP, normalEnd, 0xf59e0b, 'NormalVec', 0.075);
      addVertexSphere(normalEnd, 0xf59e0b, 'NormalVec', 0.16);

      // Sphere (S) intersecting plane
      const sphGeo = new THREE.SphereGeometry(1.35, segs, segs);
      const sphMat = new THREE.MeshPhysicalMaterial({
        color: 0xa855f7,
        roughness: 0.2,
        metalness: 0.15,
        transmission: 0.55,
        transparent: true,
        opacity: 0.75,
        wireframe: wireframeOverlay,
      });
      const sphMesh = new THREE.Mesh(sphGeo, sphMat);
      sphMesh.position.set(0.5, 0.4, 0.3);
      sphMesh.userData = { partKey: 'SphereS', basePos: new THREE.Vector3(0.5, 0.4, 0.3) };
      modelGroup.add(sphMesh);
      clickableMeshes.push(sphMesh);
    }

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 16;
    controls.target.set(0, 0, 0);

    // Raycaster for clicking 3D sub-parts
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitKey = hits[0].object.userData?.partKey;
        if (hitKey) {
          synthRef.current.playClick();
          setSelectedPartKey(hitKey);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop with software-WebGL double-rAF guard
    let animId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    const stepFrame = () => {
      if (disposed) return;
      const delta = clock.getDelta();
      if (autoRotateRef.current) {
        modelGroup.rotation.y += delta * 0.42;
      }

      // Exploded view interpolation
      const exp = explodeRef.current;
      modelGroup.children.forEach((child) => {
        const basePos: THREE.Vector3 | undefined = child.userData?.basePos;
        if (basePos) {
          const dir = basePos.clone().lengthSq() > 0.001 ? basePos.clone().normalize() : new THREE.Vector3(0, 1, 0);
          child.position.copy(basePos).addScaledVector(dir, exp * 0.85);
        }
      });

      controls.update();
      renderer.render(scene, camera);

      const afterDraw = () => {
        if (!disposed) {
          animId = requestAnimationFrame(stepFrame);
        }
      };

      if (isSoftwareGl) {
        requestAnimationFrame(() => requestAnimationFrame(afterDraw));
      } else {
        afterDraw();
      }
    };

    animId = requestAnimationFrame(stepFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, [presetId, wireframeOverlay, selectedPartKey]);

  return (
    <div className="space-y-4">
      {/* Top Mode & Model Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E2E8F0] bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              synthRef.current.playClick();
              setLabMode('explore_3d');
            }}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-4 py-2 text-[13.5px] font-medium transition-colors ${
              labMode === 'explore_3d'
                ? 'bg-[#136F63] text-white hover:bg-[#0F594F]'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
            }`}
          >
            <Box className="h-4 w-4 shrink-0" />
            <span>Mô hình Không gian 3D Tương tác (Three.js WebGL)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              synthRef.current.playClick();
              setLabMode('math_game');
            }}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-4 py-2 text-[13.5px] font-medium transition-colors ${
              labMode === 'math_game'
                ? 'bg-[#136F63] text-white hover:bg-[#0F594F]'
                : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
            }`}
          >
            <Gamepad2 className="h-4 w-4 shrink-0" />
            <span>Trò chơi Tương tác: Thử thách Đa diện &amp; Oxyz 3D</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSendToSmartboard && (
            <button
              type="button"
              onClick={() => {
                synthRef.current.playClick();
                const canvasEl = mountRef.current?.querySelector('canvas');
                let imageDataUrl: string | undefined;
                try {
                  imageDataUrl = canvasEl?.toDataURL('image/png');
                } catch {
                  imageDataUrl = undefined;
                }
                const solidMap: Record<
                  ScenePresetId,
                  'pyramid_sabcd' | 'prism_abca1b1c1' | 'cylinder_cone' | 'oxyz_plane'
                > = {
                  pyramid_sabcd: 'pyramid_sabcd',
                  prism_abc: 'prism_abca1b1c1',
                  solid_revolution: 'cylinder_cone',
                  oxyz_plane_sphere: 'oxyz_plane',
                };
                onSendToSmartboard({
                  title: `Mô hình 3D: ${activePreset.title}`,
                  imageDataUrl,
                  solidKind: solidMap[presetId],
                });
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-[8px] bg-[#136F63] px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0F594F]"
            >
              <PenTool className="h-4 w-4 shrink-0" />
              <span>Đưa sang Bảng trắng Giảng dạy</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-[#64748B]" />
            ) : (
              <Volume2 className="h-4 w-4 text-[#136F63]" />
            )}
          </button>
        </div>
      </div>

      {/* Main 3D Viewport + Side Inspector / Game Shell */}
      <SmartboardViewport
        title="Không gian Hình học 3D &amp; Trò chơi Tương tác"
        subtitle={activePreset.title}
        bodyClassName="p-3 sm:p-4"
      >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 3D WebGL Viewport Column */}
        <div className="relative flex flex-col overflow-hidden rounded-[8px] border border-slate-800 bg-[#0B1120] shadow-md lg:col-span-8">
          {/* Floating Low-Occlusion HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-[8px] border border-[#136F63]/40 bg-slate-900/85 px-3 py-1.5 text-[12px] font-semibold text-teal-100 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-teal-300" />
              <span>{activePreset.title}</span>
              <span className="rounded-[6px] bg-[#136F63]/40 px-2 py-0.5 text-[11px] text-teal-200">
                {activePreset.gradeBadge}
              </span>
            </div>

            {labMode === 'math_game' && gameState === 'playing' && (
              <div className="pointer-events-auto flex items-center gap-2">
                <div className="rounded-[8px] border border-[#FCD34D]/50 bg-slate-900/85 px-3 py-1.5 text-[12px] font-bold text-[#FEF3C7] backdrop-blur-md tabular-nums">
                  Điểm: {score}
                </div>
                <div className="rounded-[8px] border border-[#86EFAC]/50 bg-slate-900/85 px-3 py-1.5 text-[12px] font-bold text-[#DCFCE7] backdrop-blur-md tabular-nums">
                  Combo: x{streak}
                </div>
                <div className="rounded-[8px] border border-[#FCA5A5]/50 bg-slate-900/85 px-3 py-1.5 text-[12px] font-bold text-[#FEE2E2] backdrop-blur-md tabular-nums">
                  ⏱ {timeLeft}s
                </div>
                <button
                  type="button"
                  onClick={() => setGameState('paused')}
                  className="rounded-[8px] border border-white/20 bg-slate-900/85 p-1.5 text-white hover:bg-slate-800"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Three.js Canvas Mount */}
          <div ref={mountRef} className="h-[440px] w-full cursor-grab active:cursor-grabbing sm:h-[500px]" />

          {/* Game State Overlays (Title / Paused / Victory) */}
          {labMode === 'math_game' && gameState === 'title' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center backdrop-blur-sm">
              <div className="max-w-md space-y-4 rounded-[8px] border border-[#136F63]/50 bg-slate-900/95 p-6 shadow-2xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[8px] bg-[#136F63]/25 text-teal-300">
                  <Gamepad2 className="h-8 w-8" />
                </div>
                <h3 className="text-[18px] font-semibold text-white">
                  Thử Thách Khám Phá Đa Diện &amp; Tọa Độ Oxyz 3D
                </h3>
                <p className="text-[13.5px] leading-relaxed text-slate-300">
                  Xoay mô hình 3D trực tiếp bằng chuột/cảm ứng, quan sát các đường cao, thiết diện, mặt cầu ngoại tiếp và trả lời nhanh 5 câu hỏi trọng tâm SGK Kết nối tri thức trong 90 giây!
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#0F594F]"
                >
                  <Play className="h-4 w-4" />
                  <span>Bắt đầu Chơi Ngay</span>
                </button>
              </div>
            </div>
          )}

          {labMode === 'math_game' && gameState === 'paused' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center backdrop-blur-sm">
              <div className="max-w-sm space-y-4 rounded-[8px] border border-[#136F63]/50 bg-slate-900 p-6">
                <h4 className="text-[16px] font-semibold text-white">Đang Tạm Dừng Trò Chơi</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGameState('playing')}
                    className="flex-1 rounded-[8px] bg-[#136F63] py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#0F594F]"
                  >
                    Tiếp tục
                  </button>
                  <button
                    type="button"
                    onClick={startGame}
                    className="flex-1 rounded-[8px] border border-[#CBD5E1] bg-white py-2.5 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  >
                    Chơi lại từ đầu
                  </button>
                </div>
              </div>
            </div>
          )}

          {labMode === 'math_game' && gameState === 'victory' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 p-6 text-center backdrop-blur-sm">
              <div className="max-w-md space-y-4 rounded-[8px] border border-[#FCD34D]/50 bg-slate-900 p-6 shadow-2xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[8px] bg-amber-500/20 text-amber-300">
                  <Trophy className="h-8 w-8" />
                </div>
                <h3 className="text-[18px] font-semibold text-white">Hoàn Thành Thử Thách 3D!</h3>
                <div className="grid grid-cols-2 gap-3 rounded-[8px] bg-slate-800/90 p-3 text-[12px]">
                  <div>
                    <div className="text-slate-400">Tổng điểm đạt được</div>
                    <div className="mt-0.5 text-[18px] font-bold text-amber-300 tabular-nums">
                      {score} điểm
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Thời gian còn dư</div>
                    <div className="mt-0.5 text-[18px] font-bold text-emerald-300 tabular-nums">
                      {timeLeft} giây
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startGame}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#136F63] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#0F594F]"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Chơi Lại Lượt Mới</span>
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Bottom Control Dock (per Three.js skill guidelines) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center px-3">
            <div className="pointer-events-auto rounded-[8px] border border-white/15 bg-slate-900/85 px-3.5 py-2 text-[12px] text-slate-200 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-teal-300">
                  Điều khiển Camera 3D (Kéo chuột để xoay · Cuộn để phóng to)
                </span>
                <button
                  type="button"
                  onClick={() => setDockCollapsed((c) => !c)}
                  className="inline-flex items-center gap-1 rounded-[8px] bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                >
                  {dockCollapsed ? (
                    <>
                      <span>Mở rộng</span>
                      <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <span>Thu gọn</span>
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>

              {!dockCollapsed && (
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/10 pt-2">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={autoRotate}
                      onChange={(e) => setAutoRotate(e.target.checked)}
                      className="accent-[#136F63]"
                    />
                    <span>Tự động xoay quanh trục</span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={wireframeOverlay}
                      onChange={(e) => setWireframeOverlay(e.target.checked)}
                      className="accent-[#136F63]"
                    />
                    <span>Lưới khung dây (Wireframe)</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <span>Tách khối (Explode):</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={explodeFactor}
                      onChange={(e) => setExplodeFactor(Number(e.target.value))}
                      className="w-24 accent-[#136F63]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Inspector (in Explore Mode) or Active Quiz Card (in Game Mode) */}
        <div className="space-y-4 lg:col-span-4">
          {labMode === 'explore_3d' ? (
            <>
              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-[15px] font-semibold text-[#1E293B] dark:text-slate-100">
                  Danh mục Mô hình 3D Chuẩn SGK KNTT
                </h3>
                <div className="mt-2.5 space-y-2">
                  {SCENE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        synthRef.current.playClick();
                        setPresetId(p.id);
                        setSelectedPartKey(p.parts[0].key);
                      }}
                      className={`w-full rounded-[8px] px-3.5 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
                        presetId === p.id
                          ? 'bg-[#136F63] text-white'
                          : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="font-semibold">{p.title}</div>
                      <div className={`mt-0.5 text-[12px] ${presetId === p.id ? 'text-teal-100' : 'text-[#64748B]'}`}>
                        {p.gradeBadge}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <h4 className="text-[13px] font-semibold uppercase tracking-wide text-[#136F63]">
                  Công thức &amp; Quan hệ Hình học Trọng tâm
                </h4>
                <div className="mt-2 rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE]/60 p-3 text-[13.5px] leading-relaxed text-[#0369A1] dark:bg-slate-800 dark:text-slate-100">
                  <MathText text={activePreset.formulaLatex} />
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#334155] dark:text-slate-300">
                  {activePreset.description}
                </p>

                <div className="mt-3 border-t border-[#E2E8F0] pt-3 dark:border-slate-800">
                  <div className="mb-1.5 text-[12px] font-semibold text-[#1E293B] dark:text-slate-200">
                    Các thành phần trên mô hình (Nhấp để làm nổi bật):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activePreset.parts.map((pt) => (
                      <button
                        key={pt.key}
                        type="button"
                        onClick={() => {
                          synthRef.current.playClick();
                          setSelectedPartKey(pt.key);
                        }}
                        className={`rounded-[8px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                          selectedPartKey === pt.key
                            ? 'bg-[#136F63] text-white'
                            : 'border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>

                  {currentPartInfo && (
                    <div className="mt-2.5 rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7]/60 p-3 text-[13px] text-[#334155] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      <div className="font-semibold text-[#B45309] dark:text-amber-300">
                        Đang chọn: {currentPartInfo.label}
                      </div>
                      <div className="mt-1">
                        <MathText text={currentPartInfo.mathDetail} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4 rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="rounded-[8px] border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-[12px] font-semibold text-[#0369A1]">
                  Câu hỏi {qIndex + 1} / {GAME_QUESTIONS.length}
                </span>
                <span className="text-[12px] font-medium text-[#64748B]">
                  Mục tiêu 3D: {currentGameQ.targetPartKey}
                </span>
              </div>

              <div className="rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-[14px] leading-relaxed text-[#0F172A] dark:bg-slate-800 dark:text-white">
                <MathText text={currentGameQ.prompt} />
              </div>

              <div className="rounded-[8px] border border-[#FCD34D] bg-[#FEF3C7]/60 p-2.5 text-[12px] text-[#B45309] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <span className="font-semibold">Gợi ý trực quan 3D: </span>
                <MathText text={currentGameQ.hint} />
              </div>

              {feedbackBanner && (
                <div
                  className={`rounded-[8px] border p-3 text-[13px] font-semibold ${
                    feedbackBanner.correct
                      ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                      : 'border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C]'
                  }`}
                >
                  {feedbackBanner.message}
                </div>
              )}

              <div className="space-y-2">
                {currentGameQ.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={gameState !== 'playing' || Boolean(feedbackBanner)}
                    onClick={() => handleAnswerGame(idx)}
                    className="flex min-h-[48px] w-full items-center gap-2.5 rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-3 text-left text-[13.5px] font-medium text-[#334155] transition-colors hover:border-[#136F63] hover:bg-[#F8FAFC] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#BAE6FD] bg-[#E0F2FE] text-[12px] font-bold text-[#0369A1]">
                      {['A', 'B', 'C', 'D'][idx]}
                    </span>
                    <span className="flex-1">
                      <MathText text={opt} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </SmartboardViewport>
    </div>
  );
};
