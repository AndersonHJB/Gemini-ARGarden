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
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

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