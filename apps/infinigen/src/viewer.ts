import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { AnimalPoseRelationState } from './animal-state';
import type { InfinigenSpeechMode } from './args';
import { formatVoiceStatus } from './voice-status';
import { readGamepadControls, readXrControllerAxes } from './viewer-controls';
import type {
  InfinigenAnimalActivity,
  InfinigenAnimalPoseRow,
  InfinigenInstanceEvent,
  InfinigenMaterial,
  InfinigenStreamEvent,
  InfinigenTerrainEvent,
  InfinigenWaterEvent,
  Rgba,
  Vec3
} from './protocol';

type PointerState = {
  readonly id: number;
  readonly startPitch: number;
  readonly startX: number;
  readonly startY: number;
  readonly startYaw: number;
};

type AnimalRig = {
  readonly body: Object3D;
  readonly head: Object3D;
  readonly legs: readonly Object3D[];
  readonly root: Group;
  readonly tail: Object3D;
};

type AnimalRuntime = {
  activity: InfinigenAnimalActivity;
  readonly currentPosition: Vector3;
  readonly currentRotation: Vector3;
  readonly id: string;
  readonly rig: AnimalRig;
  readonly targetPosition: Vector3;
  readonly targetRotation: Vector3;
  phase: number;
  speed: number;
  tick: number;
  updatedAt: number;
};

type KeyboardInput = {
  readonly backward: boolean;
  readonly forward: boolean;
  readonly left: boolean;
  readonly right: boolean;
};

type CullableObject = {
  readonly distance: number;
  readonly kind: InfinigenInstanceEvent['kind'];
  readonly object: Object3D;
};

type SpeechRecognitionConstructor = {
  new (): SpeechRecognitionLike;
  available?: (options: { langs: readonly string[]; processLocally: boolean }) => Promise<unknown>;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  processLocally?: boolean;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionResultEventLike = Event & {
  readonly resultIndex?: number;
  readonly results?: {
    readonly length: number;
    readonly [index: number]: {
      readonly 0?: {
        readonly transcript?: string;
      };
      readonly isFinal?: boolean;
    };
  };
};

const colorFromRgba = (rgba: Rgba): Color => new Color(rgba[0], rgba[1], rgba[2]);
const vectorFromVec3 = (input: Vec3): Vector3 => new Vector3(input[0], input[1], input[2]);

export class InfinigenViewer {
  readonly #animals = new Map<string, AnimalRuntime>();
  readonly #animalPoseState = new AnimalPoseRelationState();
  readonly #camera: PerspectiveCamera;
  readonly #canvas: HTMLCanvasElement;
  readonly #captions: HTMLElement;
  readonly #controls: HTMLElement;
  readonly #hud: HTMLElement;
  readonly #keyboard: Record<keyof KeyboardInput, boolean> = {
    backward: false,
    forward: false,
    left: false,
    right: false
  };
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #streamed = new Group();
  readonly #target = new Vector3(0, 0.8, 0);
  readonly #temporary = new Object3D();
  readonly #viewerLocalPosition = new Vector3();
  readonly #viewerWorldPosition = new Vector3();
  readonly #visibilityBudget: CullableObject[] = [];
  #distance = 25;
  #frameMs = 0;
  readonly #frameMsSamples: number[] = [];
  #fps = 0;
  #frameCount = 0;
  #glowInstances: InstancedMesh | undefined;
  #instanceCount = 0;
  #levelAnimation = 0;
  #lastFrameAt = performance.now();
  #lastStatsAt = performance.now();
  #lastVisibilityAt = 0;
  #gamepadConnected = false;
  #micAudioContext: AudioContext | undefined;
  #micAnalyser: AnalyserNode | undefined;
  #micLevelBuffer: Uint8Array<ArrayBuffer> | undefined;
  #message = 'loading';
  #micStream: MediaStream | undefined;
  #networkBytesPerSecond = 0;
  #pitch = -0.36;
  #pointer: PointerState | undefined;
  #poseRowsSinceStats = 0;
  #progress: number | undefined;
  #seed = '';
  #speechMode: InfinigenSpeechMode = 'local';
  #speechRecognition: SpeechRecognitionLike | undefined;
  #streamEventsSinceStats = 0;
  #voiceEnabled = false;
  #lastVoiceAt = 0;
  #lastVoiceText = '';
  #worldScale = 1;
  #xrButton: HTMLElement | undefined;
  #xrSnapTurnArmed = true;
  #yaw = 0.72;

  constructor(root: HTMLElement) {
    this.#canvas = document.createElement('canvas');
    this.#hud = document.createElement('section');
    this.#controls = document.createElement('section');
    this.#captions = document.createElement('section');
    this.#hud.className = 'hud';
    this.#hud.setAttribute('aria-live', 'polite');
    this.#controls.className = 'headsetControls';
    this.#controls.setAttribute('aria-label', 'headset controls');
    this.#captions.className = 'captions';
    this.#captions.setAttribute('aria-live', 'polite');
    root.replaceChildren(this.#canvas, this.#hud, this.#controls, this.#captions);

    this.#renderer = new WebGLRenderer({
      antialias: true,
      canvas: this.#canvas,
      powerPreference: 'high-performance'
    });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.xr.enabled = true;
    this.#renderer.xr.setReferenceSpaceType('local-floor');
    this.#renderer.xr.setFramebufferScaleFactor(0.85);

    this.#camera = new PerspectiveCamera(48, 1, 0.05, 80000);
    this.#scene.add(this.#streamed);
    this.#installLighting();
    this.#installControls();
    this.#installHeadsetControls(root);
    this.#resize();
    this.#updateCamera();
    window.addEventListener('resize', this.#resize);
    window.addEventListener('gamepadconnected', this.#handleGamepadChange);
    window.addEventListener('gamepaddisconnected', this.#handleGamepadChange);
    this.#renderer.setAnimationLoop(this.#render);
  }

  apply(event: InfinigenStreamEvent): void {
    this.#streamEventsSinceStats += 1;

    switch (event.type) {
      case 'done':
        this.#setHud('stream complete', 1);
        break;
      case 'instance':
        this.#addInstance(event);
        this.#setHud(event.kind, undefined);
        break;
      case 'relationPatch':
        void this.#applyRelationPatch(event.rows);
        break;
      case 'reset':
        this.#reset();
        this.#seed = event.seed;
        this.#camera.position.copy(vectorFromVec3(event.camera.position));
        this.#target.copy(vectorFromVec3(event.camera.target));
        this.#distance = Math.max(8, this.#camera.position.distanceTo(this.#target));
        this.#syncOrbitFromCamera();
        this.#setHud('stream opened', 0);
        break;
      case 'status':
        this.#setHud(event.message, event.progress);
        break;
      case 'terrain':
        this.#streamed.add(createTerrain(event));
        break;
      case 'water':
        this.#streamed.add(createWater(event));
        break;
    }
  }

  dispose(): void {
    this.#renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.#resize);
    window.removeEventListener('keydown', this.#handleKeyDown);
    window.removeEventListener('keyup', this.#handleKeyUp);
    window.removeEventListener('gamepadconnected', this.#handleGamepadChange);
    window.removeEventListener('gamepaddisconnected', this.#handleGamepadChange);
    this.#releaseMic();
    this.#xrButton?.remove();
    this.#renderer.dispose();
  }

  streamError(error: unknown): void {
    this.#setHud(error instanceof Error ? error.message : 'stream error', undefined);
  }

  setNetworkThroughput(bytesPerSecond: number): void {
    this.#networkBytesPerSecond = bytesPerSecond;
    this.#refreshHud();
  }

  setSpeechMode(mode: InfinigenSpeechMode | undefined): void {
    this.#speechMode = mode ?? 'local';
  }

  readonly #resize = (): void => {
    const { clientHeight, clientWidth } = this.#canvas;
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);

    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
  };

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (this.#setKeyboardInput(event.code, true)) {
      event.preventDefault();
    }
  };

  readonly #handleKeyUp = (event: KeyboardEvent): void => {
    if (this.#setKeyboardInput(event.code, false)) {
      event.preventDefault();
    }
  };

  readonly #handleGamepadChange = (): void => {
    this.#refreshGamepadStatus();
    this.#refreshHud();
  };

  #setKeyboardInput(code: string, active: boolean): boolean {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.#keyboard.forward = active;
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.#keyboard.backward = active;
        return true;
      case 'ArrowLeft':
      case 'KeyA':
        this.#keyboard.left = active;
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.#keyboard.right = active;
        return true;
      default:
        return false;
    }
  }

  #installLighting(): void {
    this.#scene.background = new Color(0.05, 0.055, 0.052);
    this.#scene.add(new AmbientLight(0xfff3dc, 0.34));
    this.#scene.add(new HemisphereLight(0xa8d8ff, 0x22301f, 1.2));

    const sun = new DirectionalLight(0xffe0a8, 3);
    sun.position.set(-18, 28, 14);
    this.#scene.add(sun);
  }

  #installControls(): void {
    this.#canvas.addEventListener('pointerdown', (event) => {
      this.#pointer = {
        id: event.pointerId,
        startPitch: this.#pitch,
        startX: event.clientX,
        startY: event.clientY,
        startYaw: this.#yaw
      };
      this.#canvas.setPointerCapture(event.pointerId);
    });

    this.#canvas.addEventListener('pointermove', (event) => {
      if (this.#pointer === undefined || this.#pointer.id !== event.pointerId) {
        return;
      }

      const dx = event.clientX - this.#pointer.startX;
      const dy = event.clientY - this.#pointer.startY;
      this.#yaw = this.#pointer.startYaw - dx * 0.006;
      this.#pitch = MathUtils.clamp(this.#pointer.startPitch - dy * 0.004, -1.15, 0.32);
      this.#updateCamera();
    });

    this.#canvas.addEventListener('pointerup', (event) => {
      if (this.#pointer?.id === event.pointerId) {
        this.#pointer = undefined;
      }
    });

    this.#canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.#distance = MathUtils.clamp(this.#distance * Math.exp(event.deltaY * 0.0012), 2, 10000);
        this.#updateCamera();
      },
      { passive: false }
    );

    window.addEventListener('keydown', this.#handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.#handleKeyUp, { passive: false });
  }

  #installVrButton(): HTMLElement {
    this.#xrButton = VRButton.createButton(this.#renderer, {
      domOverlay: { root: document.body },
      optionalFeatures: ['bounded-floor', 'local-floor', 'dom-overlay']
    });
    this.#xrButton.classList.add('vr-button');
    relabelVrButton(this.#xrButton);
    return this.#xrButton;
  }

  #installHeadsetControls(root: HTMLElement): void {
    const vrButton = this.#installVrButton();
    const holdSpeakButton = document.createElement('button');
    const resetButton = document.createElement('button');

    holdSpeakButton.type = 'button';
    resetButton.type = 'button';

    holdSpeakButton.addEventListener('pointerdown', (event) => {
      holdSpeakButton.setPointerCapture(event.pointerId);
      void this.#holdToSpeak(holdSpeakButton);
    });
    holdSpeakButton.addEventListener('pointerup', () => this.#releaseHoldToSpeak(holdSpeakButton));
    holdSpeakButton.addEventListener('pointercancel', () => this.#releaseHoldToSpeak(holdSpeakButton));
    holdSpeakButton.addEventListener('lostpointercapture', () => this.#releaseHoldToSpeak(holdSpeakButton));
    resetButton.addEventListener('click', () => this.#resetView());

    holdSpeakButton.className = 'speakButton';
    holdSpeakButton.innerHTML = '<span>🎙️ hold speak</span><span class="micMeter" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
    resetButton.textContent = '↺ reset';
    this.#controls.replaceChildren(vrButton, holdSpeakButton, resetButton);
    root.appendChild(this.#controls);
  }

  async #holdToSpeak(button: HTMLButtonElement): Promise<void> {
    if (!('mediaDevices' in navigator) || navigator.mediaDevices.getUserMedia === undefined) {
      this.#setHud('mic unavailable', undefined);
      return;
    }

    button.querySelector('span')?.replaceChildren('🎙️ listening');
    button.setAttribute('aria-pressed', 'true');

    try {
      this.#micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.#startMicMeter(button, this.#micStream);
      void this.#startLocalTranscription();
      this.#setHud('mic open local only', undefined);
    } catch (error) {
      this.#setHud(error instanceof Error ? error.message : 'mic denied', undefined);
      this.#releaseHoldToSpeak(button);
    }
  }

  #releaseHoldToSpeak(button: HTMLButtonElement): void {
    this.#releaseMic();
    button.querySelector('span')?.replaceChildren('🎙️ hold speak');
    button.setAttribute('aria-pressed', 'false');
    updateMicMeter(button, 0);
  }

  #releaseMic(): void {
    const recognition = this.#speechRecognition;
    this.#speechRecognition = undefined;
    recognition?.abort();

    if (this.#levelAnimation !== 0) {
      cancelAnimationFrame(this.#levelAnimation);
      this.#levelAnimation = 0;
    }

    this.#micStream?.getTracks().forEach((track) => track.stop());
    this.#micStream = undefined;
    void this.#micAudioContext?.close();
    this.#micAudioContext = undefined;
    this.#micAnalyser = undefined;
    this.#micLevelBuffer = undefined;
    this.#setCaption('');
  }

  #startMicMeter(button: HTMLButtonElement, stream: MediaStream): void {
    this.#micAudioContext = new AudioContext();
    this.#micAnalyser = this.#micAudioContext.createAnalyser();
    this.#micAnalyser.fftSize = 256;
    this.#micLevelBuffer = new Uint8Array(new ArrayBuffer(this.#micAnalyser.frequencyBinCount));
    this.#micAudioContext.createMediaStreamSource(stream).connect(this.#micAnalyser);

    const tick = (): void => {
      if (this.#micAnalyser === undefined || this.#micLevelBuffer === undefined) {
        return;
      }

      this.#micAnalyser.getByteTimeDomainData(this.#micLevelBuffer);
      const level = micLevel(this.#micLevelBuffer);
      updateMicMeter(button, level);
      this.#updateNoiseCaption(level);
      this.#levelAnimation = requestAnimationFrame(tick);
    };

    tick();
  }

  async #startLocalTranscription(): Promise<void> {
    const SpeechRecognition = speechRecognitionConstructor();

    if (SpeechRecognition === undefined) {
      this.#setCaption('[local transcript unavailable]');
      return;
    }

    const recognition = new SpeechRecognition();

    if (this.#speechMode === 'local' && 'processLocally' in recognition) {
      recognition.processLocally = true;
    } else if (this.#speechMode === 'local') {
      this.#setCaption('[local transcript unavailable]');
      return;
    } else if ('processLocally' in recognition) {
      recognition.processLocally = false;
    }

    const language = this.#speechMode === 'local'
      ? await localSpeechLanguage(SpeechRecognition)
      : browserSpeechLanguage();

    if (language === undefined || this.#micStream === undefined) {
      this.#setCaption(this.#speechMode === 'local' ? '[local transcript unavailable]' : '[browser transcript unavailable]');
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('result', (event) => {
      const transcript = transcriptFromSpeechEvent(event);

      if (transcript !== undefined) {
        this.#setCaption(transcript);
      }
    });
    recognition.addEventListener('error', (event) => {
      const error = speechRecognitionError(event);

      if (error === 'language-not-supported' || error === 'service-not-allowed' || error === 'not-allowed') {
        if (this.#speechRecognition === recognition) {
          this.#speechRecognition = undefined;
        }

        recognition.abort();
        this.#setCaption(this.#speechMode === 'local' ? '[local transcript unavailable]' : '[browser transcript unavailable]');
        return;
      }

      this.#setCaption(`[${error}]`);
    });
    recognition.addEventListener('end', () => {
      if (this.#speechRecognition === recognition && this.#micStream !== undefined) {
        try {
          recognition.start();
        } catch {
          this.#setCaption('[local speech paused]');
        }
      }
    });

    this.#speechRecognition = recognition;

    try {
      recognition.start();
      this.#setCaption(this.#speechMode === 'local' ? '[listening locally]' : '[listening in browser]');
    } catch {
      this.#speechRecognition = undefined;
      this.#setCaption(this.#speechMode === 'local' ? '[local transcript unavailable]' : '[browser transcript unavailable]');
    }
  }

  #setCaption(text: string): void {
    if (this.#captions.textContent !== text) {
      this.#captions.textContent = text;
    }
  }

  #updateNoiseCaption(level: number): void {
    if (this.#speechRecognition !== undefined) {
      return;
    }

    const label = level > 0.16 ? '[speech]' : level > 0.055 ? '[rustling]' : '';

    const caption = this.#captions.textContent ?? '';

    if (label !== '' || caption.startsWith('[local speech') || caption.startsWith('[local transcript')) {
      this.#setCaption(label);
    }
  }

  #reset(): void {
    this.#animals.clear();
    this.#animalPoseState.reset();
    this.#visibilityBudget.length = 0;
    this.#instanceCount = 0;
    this.#glowInstances = undefined;
    this.#worldScale = 1;
    this.#streamed.position.set(0, 0, 0);
    this.#streamed.rotation.set(0, 0, 0);
    this.#streamed.scale.setScalar(this.#worldScale);

    for (const child of [...this.#streamed.children]) {
      this.#streamed.remove(child);
      disposeObject(child);
    }

    this.#streamed.add(createSkyDome());
  }

  #syncOrbitFromCamera(): void {
    const offset = this.#camera.position.clone().sub(this.#target);
    this.#yaw = Math.atan2(offset.x, offset.z);
    this.#pitch = Math.asin(MathUtils.clamp(offset.y / Math.max(offset.length(), 0.001), -1, 1));
    this.#updateCamera();
  }

  #updateCamera(): void {
    const horizontal = Math.cos(this.#pitch) * this.#distance;
    this.#camera.position.set(
      this.#target.x + Math.sin(this.#yaw) * horizontal,
      this.#target.y + Math.sin(this.#pitch) * this.#distance,
      this.#target.z + Math.cos(this.#yaw) * horizontal
    );
    this.#camera.lookAt(this.#target);
  }

  #addInstance(event: InfinigenInstanceEvent): void {
    this.#instanceCount += 1;

    if (event.kind === 'animal') {
      this.#addAnimal(event);
      return;
    }

    if (event.kind === 'glow') {
      this.#addGlow(event);
      return;
    }

    const object = createInstanceObject(event);
    object.position.set(...event.position);
    object.rotation.set(...event.rotation);
    object.scale.set(...event.scale);
    this.#trackVisibility(event.kind, object);
    this.#streamed.add(object);
  }

  #addAnimal(event: InfinigenInstanceEvent): void {
    const rig = createAnimal(event.material);
    const position = vectorFromVec3(event.position);
    const rotation = vectorFromVec3(event.rotation);

    rig.root.position.copy(position);
    rig.root.rotation.set(...event.rotation);
    rig.root.scale.set(...event.scale);
    this.#animals.set(event.id, {
      activity: 'explore',
      currentPosition: position.clone(),
      currentRotation: rotation.clone(),
      id: event.id,
      phase: hashPhase(event.id),
      rig,
      speed: 0,
      targetPosition: position.clone(),
      targetRotation: rotation.clone(),
      tick: 0,
      updatedAt: performance.now()
    });
    this.#trackVisibility(event.kind, rig.root);
    this.#streamed.add(rig.root);
  }

  #trackVisibility(kind: InfinigenInstanceEvent['kind'], object: Object3D): void {
    const distance = visibilityDistanceFor(kind);

    if (distance !== undefined) {
      this.#visibilityBudget.push({ distance, kind, object });
    }
  }

  #addGlow(event: InfinigenInstanceEvent): void {
    if (this.#glowInstances === undefined) {
      this.#glowInstances = new InstancedMesh(new SphereGeometry(0.08, 10, 8), new MeshStandardMaterial({
        color: new Color(0.34, 0.95, 0.88),
        emissive: new Color(0.2, 0.85, 0.78),
        emissiveIntensity: 1.4,
        roughness: 0.35
      }), 512);
      this.#glowInstances.count = 0;
      this.#glowInstances.instanceMatrix.setUsage(DynamicDrawUsage);
      this.#streamed.add(this.#glowInstances);
    }

    const index = this.#glowInstances.count;

    if (index >= 512) {
      return;
    }

    this.#temporary.position.set(...event.position);
    this.#temporary.rotation.set(...event.rotation);
    this.#temporary.scale.set(...event.scale);
    this.#temporary.updateMatrix();
    this.#glowInstances.setMatrixAt(index, this.#temporary.matrix);
    this.#glowInstances.count = index + 1;
    this.#glowInstances.instanceMatrix.needsUpdate = true;
  }

  async #applyRelationPatch(rows: readonly InfinigenAnimalPoseRow[]): Promise<void> {
    this.#poseRowsSinceStats += rows.length;
    const result = await this.#animalPoseState.patch(rows);

    for (const row of result.rows) {
      this.#applyAnimalPose(row);
    }
  }

  #applyAnimalPose(row: InfinigenAnimalPoseRow): void {
    const animal = this.#animals.get(row.entityId);

    if (animal === undefined || row.tick < animal.tick) {
      return;
    }

    animal.targetPosition.set(row.x, row.y, row.z);
    animal.targetRotation.set(row.rx, row.ry, row.rz);
    animal.activity = row.activity ?? 'explore';
    animal.phase = row.gaitPhase;
    animal.speed = row.speed;
    animal.tick = row.tick;
    animal.updatedAt = performance.now();
  }

  #setHud(message: string, progress: number | undefined): void {
    this.#message = message;
    this.#progress = progress;
    this.#refreshHud();
    this.#announce(false);
  }

  #refreshHud(): void {
    this.#hud.replaceChildren(
      hudValue(this.#inputStatus()),
      hudMetric('net', formatBytesPerSecond(this.#networkBytesPerSecond)),
      hudMetric('grid', grid10(this.#viewerGridPosition()))
    );
  }

  #inputStatus(): string {
    return this.#gamepadConnected ? '🎮 ✅' : '🎮 ❌';
  }

  #viewerGridPosition(): Vector3 {
    if (this.#renderer.xr.isPresenting) {
      return this.#streamed.position.clone().multiplyScalar(-1 / Math.max(this.#worldScale, 0.001));
    }

    return this.#target;
  }

  #voiceSnapshot(): ReturnType<typeof formatVoiceStatus> extends string ? Parameters<typeof formatVoiceStatus>[0] : never {
    return {
      fps: this.#fps,
      instanceCount: this.#instanceCount,
      message: this.#message,
      progress: this.#progress,
      scale: this.#worldScale,
      seed: this.#seed
    };
  }

  #announce(force: boolean): void {
    if (!this.#voiceEnabled && !force) {
      return;
    }

    const text = formatVoiceStatus(this.#voiceSnapshot());
    const now = performance.now();

    if (!force && (text === this.#lastVoiceText || now - this.#lastVoiceAt < 2500)) {
      return;
    }

    this.#speak(text, force);
  }

  #speak(text: string, force: boolean): void {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      this.#message = 'speech unavailable';
      this.#refreshHud();
      return;
    }

    if (force) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
    this.#lastVoiceAt = performance.now();
    this.#lastVoiceText = text;
  }

  #resetView(): void {
    this.#target.set(0, 0.8, 0);
    this.#distance = 25;
    this.#pitch = -0.36;
    this.#yaw = 0.72;
    this.#worldScale = 1;
    this.#streamed.position.set(0, 0, 0);
    this.#streamed.rotation.set(0, 0, 0);
    this.#streamed.scale.setScalar(this.#worldScale);
    this.#updateCamera();
    this.#refreshHud();
    this.#announce(true);
  }

  #render = (now = performance.now()): void => {
    const dt = Math.min(0.05, (now - this.#lastFrameAt) / 1000);
    this.#frameMs = dt * 1000;
    pushBounded(this.#frameMsSamples, this.#frameMs, 36);
    this.#lastFrameAt = now;
    this.#frameCount += 1;

    if (now - this.#lastStatsAt >= 500) {
      const statsWindowMs = now - this.#lastStatsAt;
      this.#fps = Math.round((this.#frameCount * 1000) / statsWindowMs);
      this.#frameCount = 0;
      this.#streamEventsSinceStats = 0;
      this.#poseRowsSinceStats = 0;
      this.#lastStatsAt = now;
      this.#refreshGamepadStatus();
      this.#refreshHud();
    }

    this.#applyKeyboard(dt);
    this.#applyGamepad(dt);
    this.#updateAnimalAnimations(dt, now);
    this.#updateVisibilityBudget(now);
    if (!this.#renderer.xr.isPresenting) {
      this.#streamed.rotation.y += dt * 0.018;
    }
    this.#renderer.render(this.#scene, this.#camera);
  };

  #applyKeyboard(dt: number): void {
    if (this.#renderer.xr.isPresenting) {
      return;
    }

    const x = Number(this.#keyboard.right) - Number(this.#keyboard.left);
    const y = Number(this.#keyboard.backward) - Number(this.#keyboard.forward);

    if (x === 0 && y === 0) {
      return;
    }

    this.#moveOrbitTarget(x, y, dt, 0.48);
    this.#updateCamera();
  }

  #applyGamepad(dt: number): void {
    if (this.#renderer.xr.isPresenting) {
      const session = this.#renderer.xr.getSession();
      const controllerAxes = session === null ? undefined : readXrControllerAxes(session.inputSources);

      if (controllerAxes?.hasInput === true) {
        this.#applyXrGamepad(dt, controllerAxes.left.x, controllerAxes.left.y, controllerAxes.right.x, controllerAxes.right.y);
        return;
      }
    }

    const controls = readGamepadControls(navigator.getGamepads?.() ?? []);
    this.#gamepadConnected = controls.connected;

    if (!controls.connected) {
      return;
    }

    const leftX = controls.left.x;
    const leftY = controls.left.y;
    const rightX = controls.right.x;
    const rightY = controls.right.y;
    const zoom = controls.zoom;

    if (this.#renderer.xr.isPresenting) {
      this.#applyXrGamepad(dt, leftX, leftY, rightX, rightY + zoom);
      return;
    }

    if (leftX !== 0 || leftY !== 0) {
      this.#moveOrbitTarget(leftX, leftY, dt, 0.36);
    }

    if (rightX !== 0) {
      this.#yaw -= rightX * 1.8 * dt;
    }

    if (rightY !== 0 || zoom !== 0) {
      this.#distance = MathUtils.clamp(this.#distance + (rightY - zoom) * Math.max(8, this.#distance) * dt, 2, 10000);
    }

    if (leftX !== 0 || leftY !== 0 || rightX !== 0 || rightY !== 0 || zoom !== 0) {
      this.#updateCamera();
    }
  }

  #refreshGamepadStatus(): void {
    const hasXrInput = this.#renderer.xr.isPresenting && hasXrGamepad(this.#renderer.xr.getSession());
    this.#gamepadConnected = hasXrInput || readGamepadControls(navigator.getGamepads?.() ?? []).connected;
  }

  #moveOrbitTarget(x: number, y: number, dt: number, speedMultiplier: number): void {
    const speed = Math.max(4, this.#distance * speedMultiplier);
    const forward = new Vector3(-Math.sin(this.#yaw), 0, -Math.cos(this.#yaw));
    const right = new Vector3(Math.cos(this.#yaw), 0, -Math.sin(this.#yaw));
    this.#target.addScaledVector(forward, -y * speed * dt);
    this.#target.addScaledVector(right, x * speed * dt);
  }

  #applyXrGamepad(dt: number, leftX: number, leftY: number, rightX: number, rightY: number): void {
    if (leftX !== 0 || leftY !== 0) {
      const speed = 8 * MathUtils.clamp(Math.sqrt(this.#worldScale), 0.18, 2.2);
      const forward = new Vector3();
      this.#camera.getWorldDirection(forward);
      forward.y = 0;

      if (forward.lengthSq() < 0.001) {
        forward.set(0, 0, -1);
      } else {
        forward.normalize();
      }

      const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
      this.#streamed.position.addScaledVector(forward, leftY * speed * dt);
      this.#streamed.position.addScaledVector(right, -leftX * speed * dt);
    }

    if (Math.abs(rightX) < 0.24) {
      this.#xrSnapTurnArmed = true;
    } else if (this.#xrSnapTurnArmed && Math.abs(rightX) > 0.68) {
      this.#streamed.rotation.y -= Math.sign(rightX) * (Math.PI / 8);
      this.#xrSnapTurnArmed = false;
    }

    if (rightY !== 0) {
      this.#worldScale = MathUtils.clamp(this.#worldScale * Math.exp(-rightY * dt * 1.6), 0.001, 12);
      this.#streamed.scale.setScalar(this.#worldScale);
    }
  }

  #updateAnimalAnimations(dt: number, now: number): void {
    const blend = 1 - Math.exp(-dt * 9);

    for (const animal of this.#animals.values()) {
      animal.currentPosition.lerp(animal.targetPosition, blend);
      animal.currentRotation.lerp(animal.targetRotation, blend);
      animal.rig.root.position.copy(animal.currentPosition);
      animal.rig.root.rotation.set(animal.currentRotation.x, animal.currentRotation.y, animal.currentRotation.z);

      const stale = MathUtils.clamp((now - animal.updatedAt) / 2400, 0, 1);
      const speed = MathUtils.clamp(animal.speed, 0.2, 7);
      const phase = animal.phase + ((now - animal.updatedAt) / 1000) * speed * 3.2;
      const stride = Math.sin(phase) * 0.34 * (1 - stale * 0.72);
      const lift = Math.max(0, Math.sin(phase * 2)) * 0.045 * (1 - stale);
      const headDip = activityHeadDip(animal.activity);
      const rest = animal.activity === 'rest' ? 0.32 : 0;
      const watch = animal.activity === 'watch' ? 0.16 : 0;

      animal.rig.body.position.y = 0.72 + lift - rest;
      animal.rig.body.rotation.z = Math.sin(phase * 0.5) * 0.045;
      animal.rig.head.position.x = 0.78 + headDip * 0.14;
      animal.rig.head.position.y = 0.9 + lift * 0.45 - headDip + watch - rest * 0.35;
      animal.rig.tail.rotation.z = Math.PI / 2 + Math.sin(phase * 1.4) * (animal.activity === 'social' ? 0.38 : 0.22);

      animal.rig.legs.forEach((leg, index) => {
        leg.rotation.z = (index % 2 === 0 ? stride : -stride) * (0.55 + speed * 0.08) * (1 - rest * 0.8);
        leg.position.y = 0.3 - rest * 0.35;
      });
    }
  }

  #updateVisibilityBudget(now: number): void {
    if (now - this.#lastVisibilityAt < 240) {
      return;
    }

    this.#lastVisibilityAt = now;
    this.#camera.updateWorldMatrix(true, false);
    this.#streamed.updateWorldMatrix(true, false);
    this.#camera.getWorldPosition(this.#viewerWorldPosition);
    this.#viewerLocalPosition.copy(this.#viewerWorldPosition);
    this.#streamed.worldToLocal(this.#viewerLocalPosition);

    for (const item of this.#visibilityBudget) {
      const distance = item.object.visible ? item.distance * 1.12 : item.distance;
      const visible = item.object.position.distanceToSquared(this.#viewerLocalPosition) <= distance * distance;
      item.object.visible = visible;
    }
  }
}

function relabelVrButton(button: HTMLElement): void {
  const update = (): void => {
    switch (button.textContent) {
      case 'ENTER VR':
        button.textContent = '🥽 ENTER VR';
        break;
      case 'EXIT VR':
        button.textContent = '🥽 EXIT VR';
        break;
      case 'VR NOT SUPPORTED':
      case 'VR NOT DETECTED':
        button.textContent = '🥽 VR NOT DETECTED';
        break;
      case 'VR NOT ALLOWED':
        button.textContent = '🥽 VR NOT ALLOWED';
        break;
    }
  };

  update();
  new MutationObserver(update).observe(button, {
    characterData: true,
    childList: true,
    subtree: true
  });
}

function micLevel(samples: ArrayLike<number>): number {
  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 128;
    const centered = sample - 128;
    sum += centered * centered;
  }

  return Math.min(1, Math.sqrt(sum / samples.length) / 48);
}

function updateMicMeter(button: HTMLButtonElement, level: number): void {
  const bars = [...button.querySelectorAll<HTMLElement>('.micMeter i')];

  bars.forEach((bar, index) => {
    const threshold = (index + 1) / bars.length;
    const height = 20 + Math.min(80, Math.max(0, (level - threshold + 0.25) * 240));
    bar.style.height = `${height}%`;
    bar.style.opacity = level >= threshold - 0.2 ? '1' : '0.38';
  });
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const scope = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

async function localSpeechLanguage(SpeechRecognition: SpeechRecognitionConstructor): Promise<string | undefined> {
  if (SpeechRecognition.available === undefined) {
    return undefined;
  }

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
    'en-NZ',
    'en-US',
    'en'
  ].filter((language): language is string => typeof language === 'string' && language.length > 0);

  for (const language of [...new Set(candidates)]) {
    try {
      const availability = await SpeechRecognition.available({ langs: [language], processLocally: true });

      if (availability === 'available') {
        return language;
      }
    } catch {
      // Keep local speech opt-in strict: unsupported availability checks fall back to the mic meter.
    }
  }

  return undefined;
}

function browserSpeechLanguage(): string | undefined {
  return navigator.languages?.find((language) => language.startsWith('en')) ?? navigator.language ?? 'en-NZ';
}

function transcriptFromSpeechEvent(event: Event): string | undefined {
  const speechEvent = event as SpeechRecognitionResultEventLike;
  const results = speechEvent.results;

  if (results === undefined) {
    return undefined;
  }

  const parts: string[] = [];

  for (let index = speechEvent.resultIndex ?? 0; index < results.length; index += 1) {
    const result = results[index];
    const transcript = result?.[0]?.transcript?.trim();

    if (transcript !== undefined && transcript.length > 0) {
      parts.push(result?.isFinal === true ? transcript : `${transcript} …`);
    }
  }

  return parts.length === 0 ? undefined : parts.join(' ');
}

function speechRecognitionError(event: Event): string {
  const error = (event as Event & { readonly error?: unknown }).error;
  return typeof error === 'string' && error.length > 0 ? error : 'speech error';
}

function hudMetric(label: string, value: string): HTMLElement {
  const element = document.createElement('span');
  const labelElement = document.createElement('b');
  const valueElement = document.createElement('span');

  element.className = 'hudMetric';
  labelElement.textContent = label;
  valueElement.textContent = value;
  element.replaceChildren(labelElement, valueElement);
  return element;
}

function hudValue(value: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'hudValue';
  element.textContent = value;
  return element;
}

function formatBytesPerSecond(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  }

  if (bytesPerSecond >= 1024) {
    return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  }

  return `${Math.round(bytesPerSecond)} B/s`;
}

function activityHeadDip(activity: InfinigenAnimalActivity): number {
  switch (activity) {
    case 'drink':
      return 0.44;
    case 'graze':
      return 0.34;
    case 'rest':
      return 0.18;
    case 'explore':
    case 'social':
    case 'watch':
      return 0;
  }
}

function grid10(position: Vector3): string {
  return `${gridPart(position.x)} ${gridPart(position.z)}`;
}

function gridPart(value: number): string {
  const normalized = MathUtils.clamp(Math.round(value) + 50000, 0, 99999);
  return normalized.toString().padStart(5, '0');
}

function hasXrGamepad(session: XRSession | null): boolean {
  if (session === null) {
    return false;
  }

  for (const inputSource of session.inputSources) {
    if (inputSource.gamepad !== undefined && inputSource.gamepad !== null) {
      return true;
    }
  }

  return false;
}

function pushBounded(values: number[], value: number, limit: number): void {
  values.push(value);

  if (values.length > limit) {
    values.splice(0, values.length - limit);
  }
}

function hashPhase(id: string): number {
  let hash = 2166136261;

  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function visibilityDistanceFor(kind: InfinigenInstanceEvent['kind']): number | undefined {
  switch (kind) {
    case 'animal':
      return 260;
    case 'basalt':
      return 520;
    case 'building':
      return 820;
    case 'cedar':
      return 420;
    case 'crystal':
      return 320;
    case 'fern':
      return 180;
    case 'glow':
      return undefined;
    case 'house':
      return 700;
    case 'road':
      return 950;
  }
}

function createTerrain(event: InfinigenTerrainEvent): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const halfSize = event.size / 2;
  const materialColor = colorFromRgba(event.material.color);
  const biomeColor = biomeColors(event.biome);
  const high = new Color(0xd8d0aa);
  const low = biomeColor.low;
  const mid = biomeColor.mid;
  const peak = biomeColor.high;

  for (let row = 0; row < event.rows; row += 1) {
    for (let column = 0; column < event.columns; column += 1) {
      const x = (column / (event.columns - 1)) * event.size - halfSize;
      const z = (row / (event.rows - 1)) * event.size - halfSize;
      const y = event.samples[row * event.columns + column] ?? 0;
      positions.push(x + (event.position?.[0] ?? 0), y + (event.position?.[1] ?? 0), z + (event.position?.[2] ?? 0));

      const shade = low.clone()
        .lerp(mid, MathUtils.clamp((y + 2) / 5, 0, 1))
        .lerp(materialColor, 0.34)
        .lerp(peak, MathUtils.clamp((y - 3) / 5, 0, 1))
        .lerp(high, Math.max(0, y - 6) / 8);
      colors.push(shade.r, shade.g, shade.b);
    }
  }

  for (let row = 0; row < event.rows - 1; row += 1) {
    for (let column = 0; column < event.columns - 1; column += 1) {
      const a = row * event.columns + column;
      const b = a + 1;
      const c = a + event.columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: 0xffffff,
      roughness: event.material.roughness ?? 0.92,
      vertexColors: true
    })
  );
}

function biomeColors(biome: InfinigenTerrainEvent['biome']): { readonly high: Color; readonly low: Color; readonly mid: Color } {
  switch (biome) {
    case 'alpine':
      return { high: new Color(0xe4e1cf), low: new Color(0x303936), mid: new Color(0x7d8b78) };
    case 'basalt':
      return { high: new Color(0x8d8878), low: new Color(0x171a18), mid: new Color(0x3f433c) };
    case 'coast':
      return { high: new Color(0xe4d9a8), low: new Color(0x24322d), mid: new Color(0x6f8a59) };
    case 'fern':
      return { high: new Color(0xb5c77b), low: new Color(0x14281e), mid: new Color(0x2f6338) };
    case 'tussock':
      return { high: new Color(0xc9b978), low: new Color(0x293018), mid: new Color(0x77743c) };
    case 'wetland':
      return { high: new Color(0x88a87c), low: new Color(0x142b2c), mid: new Color(0x396966) };
    case undefined:
      return { high: new Color(0xd8d0aa), low: new Color(0x263222), mid: new Color(0x516d3e) };
  }
}

function createWater(event: InfinigenWaterEvent): Mesh {
  const water = new Mesh(
    new CircleGeometry(event.radius, 96),
    new MeshPhysicalMaterial({
      color: colorFromRgba(event.color),
      metalness: 0,
      opacity: event.opacity,
      roughness: 0.08,
      side: DoubleSide,
      transparent: true,
      transmission: 0.12
    })
  );
  water.position.y = event.y;
  water.rotation.x = -Math.PI / 2;
  return water;
}

function createSkyDome(): Mesh {
  const sky = new Mesh(
    new SphereGeometry(12000, 32, 16),
    new MeshStandardMaterial({
      color: 0x27312f,
      emissive: 0x141b1a,
      roughness: 1,
      side: DoubleSide
    })
  );
  return sky;
}

function createInstanceObject(event: InfinigenInstanceEvent): Object3D {
  switch (event.kind) {
    case 'animal':
      return createAnimal(event.material).root;
    case 'basalt':
      return new Mesh(new ConeGeometry(0.7, 3.6, 7), materialFromEvent(event.material));
    case 'building':
      return createBuildingFootprint(event.material);
    case 'cedar':
      return createCedar(event.material);
    case 'crystal':
      return new Mesh(new IcosahedronGeometry(0.62, 1), materialFromEvent(event.material));
    case 'fern':
      return createFern(event.material);
    case 'glow':
      return new Mesh(new SphereGeometry(0.1, 8, 6), materialFromEvent(event.material));
    case 'house':
      return createHouse(event.material);
    case 'landmark':
      return createLandmark(event.material);
    case 'road':
      return createRoad(event.material);
  }
}

function createAnimal(material: InfinigenMaterial): AnimalRig {
  const group = new Group();
  const bodyMaterial = materialFromEvent(material);
  const darkMaterial = new MeshStandardMaterial({ color: 0x1d1712, roughness: 0.9 });
  const body = new Mesh(new SphereGeometry(0.58, 10, 8), bodyMaterial);
  body.scale.set(1.35, 0.68, 0.72);
  body.position.y = 0.72;

  const head = new Mesh(new SphereGeometry(0.3, 8, 6), bodyMaterial);
  head.position.set(0.78, 0.9, 0);

  const tail = new Mesh(new ConeGeometry(0.12, 0.5, 6), darkMaterial);
  tail.position.set(-0.84, 0.78, 0);
  tail.rotation.z = Math.PI / 2;

  const legs: Object3D[] = [];

  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.22, 0.22]) {
      const leg = new Mesh(new CylinderGeometry(0.045, 0.065, 0.7, 6), darkMaterial);
      leg.position.set(x, 0.3, z);
      legs.push(leg);
      group.add(leg);
    }
  }

  group.add(body, head, tail);
  return { body, head, legs, root: group, tail };
}

function createCedar(material: InfinigenMaterial): Group {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.16, 0.25, 1.7, 8),
    new MeshStandardMaterial({ color: 0x6b4a2d, roughness: 0.88 })
  );
  trunk.position.y = 0.85;

  const crown = new Mesh(
    new ConeGeometry(0.92, 2.2, 10),
    materialFromEvent(material)
  );
  crown.position.y = 2.2;

  group.add(trunk, crown);
  return group;
}

function createHouse(material: InfinigenMaterial): Group {
  const group = new Group();
  const exterior = materialFromEvent(material);
  const interior = new MeshStandardMaterial({ color: 0xb7aa8c, roughness: 0.92 });
  const dark = new MeshStandardMaterial({ color: 0x2d241d, roughness: 0.9 });
  const roof = new MeshStandardMaterial({ color: 0x3b3030, roughness: 0.86 });

  const floor = new Mesh(new BoxGeometry(1.15, 0.08, 1.05), interior);
  floor.position.y = 0.04;

  const backWall = new Mesh(new BoxGeometry(1.15, 0.85, 0.08), exterior);
  backWall.position.set(0, 0.48, -0.52);

  const leftWall = new Mesh(new BoxGeometry(0.08, 0.85, 1.05), exterior);
  leftWall.position.set(-0.58, 0.48, 0);

  const rightWall = new Mesh(new BoxGeometry(0.08, 0.85, 1.05), exterior);
  rightWall.position.set(0.58, 0.48, 0);

  const roofSlab = new Mesh(new BoxGeometry(1.32, 0.12, 1.22), roof);
  roofSlab.position.y = 0.96;
  roofSlab.rotation.z = 0.08;

  const table = new Mesh(new BoxGeometry(0.28, 0.16, 0.2), dark);
  table.position.set(-0.18, 0.23, -0.16);

  const bed = new Mesh(new BoxGeometry(0.36, 0.12, 0.52), interior);
  bed.position.set(0.28, 0.18, 0.15);

  const doorway = new Mesh(new BoxGeometry(0.28, 0.48, 0.05), dark);
  doorway.position.set(0, 0.28, 0.54);

  group.add(floor, backWall, leftWall, rightWall, roofSlab, table, bed, doorway);
  return group;
}

function createLandmark(material: InfinigenMaterial): Group {
  const group = new Group();
  const stone = materialFromEvent(material);
  const dark = new MeshStandardMaterial({ color: 0x181715, roughness: 0.96 });
  const lichen = new MeshStandardMaterial({ color: 0x6f8e57, roughness: 0.98 });
  const glass = new MeshPhysicalMaterial({
    color: 0x78d6d2,
    emissive: 0x1b5b58,
    emissiveIntensity: 0.7,
    metalness: 0,
    opacity: 0.72,
    roughness: 0.08,
    transparent: true,
    transmission: 0.1
  });

  const base = new Mesh(new CylinderGeometry(1.4, 2.2, 0.82, 9), stone);
  base.position.y = 0.41;

  const archLeft = new Mesh(new BoxGeometry(0.42, 3.4, 0.72), stone);
  archLeft.position.set(-0.88, 2.05, 0);
  archLeft.rotation.z = -0.08;

  const archRight = new Mesh(new BoxGeometry(0.42, 3.4, 0.72), stone);
  archRight.position.set(0.88, 2.05, 0);
  archRight.rotation.z = 0.08;

  const lintel = new Mesh(new BoxGeometry(2.2, 0.52, 0.8), stone);
  lintel.position.set(0, 3.52, 0);
  lintel.rotation.z = 0.04;

  const innerShadow = new Mesh(new BoxGeometry(1.12, 1.8, 0.08), dark);
  innerShadow.position.set(0, 2.35, -0.36);

  const crystal = new Mesh(new IcosahedronGeometry(0.54, 2), glass);
  crystal.position.set(0, 2.18, 0.02);
  crystal.scale.set(0.8, 1.42, 0.8);

  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2;
    const marker = new Mesh(new BoxGeometry(0.16, 0.08, 0.46), lichen);
    marker.position.set(Math.cos(angle) * 1.56, 0.86 + (index % 3) * 0.34, Math.sin(angle) * 1.56);
    marker.rotation.y = -angle;
    marker.rotation.z = 0.12 - (index % 2) * 0.24;
    group.add(marker);
  }

  group.add(base, archLeft, archRight, lintel, innerShadow, crystal);
  return group;
}

function createRoad(material: InfinigenMaterial): Mesh {
  const road = new Mesh(new BoxGeometry(1, 1, 1), materialFromEvent(material));
  road.position.y = 0.02;
  return road;
}

function createBuildingFootprint(material: InfinigenMaterial): Group {
  const group = new Group();
  const body = new Mesh(new BoxGeometry(1, 1, 1), materialFromEvent(material));
  const roof = new Mesh(new BoxGeometry(1.04, 0.08, 1.04), new MeshStandardMaterial({
    color: 0x4a4640,
    roughness: 0.88
  }));

  body.position.y = 0.5;
  roof.position.y = 1.04;
  group.add(body, roof);
  return group;
}

function createFern(material: InfinigenMaterial): Points {
  const geometry = new BufferGeometry();
  const positions: number[] = [];

  for (let index = 0; index < 48; index += 1) {
    const angle = index * 2.399;
    const radius = 0.16 + (index % 12) * 0.045;
    positions.push(Math.cos(angle) * radius, 0.04 + (index % 5) * 0.055, Math.sin(angle) * radius);
  }

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: colorFromRgba(material.color),
      size: 0.075,
      sizeAttenuation: true
    })
  );
}

function materialFromEvent(material: InfinigenMaterial): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: colorFromRgba(material.color),
    emissive: material.emissive === undefined ? new Color(0, 0, 0) : colorFromRgba(material.emissive),
    emissiveIntensity: material.emissive === undefined ? 0 : 0.9,
    metalness: material.metalness ?? 0,
    roughness: material.roughness ?? 0.72
  });
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh || child instanceof Points || child instanceof InstancedMesh) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material.dispose();
        }
      } else {
        child.material.dispose();
      }
    }
  });
}
