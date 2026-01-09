import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  DrawingUtils
} from '@mediapipe/tasks-vision';

export class VisionService {
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;

  async initialize() {
    // 1. Define sources
    const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
    const LOCAL_WASM_PATH = './wasm';

    // 2. Determine which source to use
    let wasmSource = CDN_WASM_PATH;

    try {
      // Try to detect local WASM file via a HEAD request
      // We check for the JS file because checking the folder might return 403 or 404 depending on server config
      const response = await fetch(`${LOCAL_WASM_PATH}/vision_wasm_internal.js`, { method: 'HEAD' });
      if (response.ok) {
        console.log('✅ Local Mediapipe WASM found. Using offline mode.');
        wasmSource = LOCAL_WASM_PATH;
      } else {
        console.log('Tb Local WASM not found. Using CDN fallback.');
      }
    } catch (e) {
      console.log('Tb WASM check failed. Using CDN fallback.');
    }

    // 3. Initialize FilesetResolver
    const vision = await FilesetResolver.forVisionTasks(wasmSource);

    // 4. Create Landmarkers
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2
    });

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }

  detect(video: HTMLVideoElement) {
    if (!this.handLandmarker || !this.faceLandmarker) return null;

    let startTimeMs = performance.now();
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      
      const handResults = this.handLandmarker.detectForVideo(video, startTimeMs);
      const faceResults = this.faceLandmarker.detectForVideo(video, startTimeMs);

      return {
        hands: handResults,
        faces: faceResults
      };
    }
    return null;
  }
}

export const visionService = new VisionService();