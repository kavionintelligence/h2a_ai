import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import type { CaptureAssessment } from '@h2a/contracts';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const LIVE_WIDTH = 224;
const LIVE_HEIGHT = 224;
const LIVE_FRAMES = 10;
const ARCFACE_SIZE = 112;
const ARCFACE_TARGET = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
const LEFT_EYE = [33, 133];
const RIGHT_EYE = [362, 263];
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let landmarkerPromise: Promise<FaceLandmarker> | undefined;
let faceSessionPromise: Promise<ort.InferenceSession> | undefined;
let livenessSessionPromise: Promise<ort.InferenceSession> | undefined;

export type CaptureProgress = { step: string; current: number; total: number };
export type BiometricCapture = { assessment: CaptureAssessment; samples: Array<Array<0 | 1>> };
export type LiveCaptureTelemetry = { faceCount: number; distanceCm?: number; qualityScore?: number };

export class BiometricCaptureError extends Error {
  public constructor(public readonly reasonCode: 'CAMERA_UNAVAILABLE' | 'FACE_NOT_FOUND' | 'MULTIPLE_FACES' | 'MODEL_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'BiometricCaptureError';
  }
}

export async function prepareBiometricModels(requireLiveness = true): Promise<void> {
  ort.env.wasm.wasmPaths = assetUrl('biometric/ort/');
  ort.env.wasm.numThreads = 1;
  await Promise.all([getLandmarker(), getFaceSession(), ...(requireLiveness ? [getLivenessSession()] : [])]);
}

export async function inspectBiometricFrame(video: HTMLVideoElement): Promise<LiveCaptureTelemetry> {
  if (!video.srcObject || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return { faceCount: 0 };
  const landmarker = await getLandmarker();
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || FRAME_WIDTH;
  canvas.height = video.videoHeight || FRAME_HEIGHT;
  drawVideoFrame(video, canvas);
  const faces = landmarker.detectForVideo(video, performance.now()).faceLandmarks;
  if (faces.length !== 1) return { faceCount: faces.length };
  const landmarks = faces[0];
  const quality = assessImageQuality(canvas, getFaceBox(landmarks, canvas.width, canvas.height));
  return { faceCount: 1, distanceCm: estimateDistanceCm(landmarks, canvas.width), qualityScore: quality.score };
}

export async function captureBiometric(
  video: HTMLVideoElement,
  sampleCount: number,
  onProgress: (progress: CaptureProgress) => void,
  requireLiveness = true
): Promise<BiometricCapture> {
  if (!video.srcObject || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new BiometricCaptureError('CAMERA_UNAVAILABLE', 'The camera is not ready.');
  }
  await prepareBiometricModels(requireLiveness);
  const landmarker = await getLandmarker();
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || FRAME_WIDTH;
  canvas.height = video.videoHeight || FRAME_HEIGHT;
  const frames: Float32Array[] = [];
  const embeddings: number[][] = [];
  const qualities: ImageQuality[] = [];
  const distances: number[] = [];
  let landmarks: NormalizedLandmark[] | undefined;
  const captureFrames = Math.max(LIVE_FRAMES, sampleCount);

  for (let index = 0; index < captureFrames; index += 1) {
    onProgress({ step: sampleCount > LIVE_FRAMES ? 'Enrollment capture set' : requireLiveness ? 'Liveness sequence' : 'Face verification capture', current: index + 1, total: captureFrames });
    drawVideoFrame(video, canvas);
    const faces = landmarker.detectForVideo(video, performance.now()).faceLandmarks;
    if (faces.length === 0) throw new BiometricCaptureError('FACE_NOT_FOUND', 'Keep one face centered inside the guide.');
    if (faces.length > 1) throw new BiometricCaptureError('MULTIPLE_FACES', 'Only one person can be present during proof.');
    landmarks = faces[0];
    const box = getFaceBox(landmarks, canvas.width, canvas.height);
    const quality = assessImageQuality(canvas, box);
    qualities.push(quality);
    distances.push(estimateDistanceCm(landmarks, canvas.width));
    frames.push(faceCropToChw(canvas, box));
    if (embeddings.length < sampleCount) {
      embeddings.push(await getArcFaceEmbedding(canvas, landmarks));
    }
    await delay(90);
  }
  onProgress({ step: requireLiveness ? 'Anti-spoof inference' : 'Liveness bypassed for demo', current: captureFrames, total: captureFrames });
  const livenessScore = requireLiveness ? await runLiveness(frames) : 0;
  return {
    assessment: {
      faceCount: 1,
      qualityScore: average(qualities.map((quality) => quality.score)),
      brightnessScore: average(qualities.map((quality) => quality.brightness)),
      sharpnessScore: average(qualities.map((quality) => quality.sharpness)),
      distanceCm: average(distances),
      livenessScore,
      capturedAt: new Date().toISOString()
    },
    samples: embeddings.map(embeddingToBits)
  };
}

export function embeddingToBits(embedding: number[]): Array<0 | 1> {
  if (embedding.length !== 512) throw new Error('ArcFace returned an invalid embedding length.');
  const bits: Array<0 | 1> = [];
  for (const value of embedding) {
    const quantized = Math.max(0, Math.min(255, Math.round(((value + 1) / 2) * 255)));
    for (let bit = 7; bit >= 0; bit -= 1) bits.push(((quantized >> bit) & 1) as 0 | 1);
  }
  return bits;
}

async function getLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= FilesetResolver.forVisionTasks(assetUrl('biometric/mediapipe')).then((vision) => FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: assetUrl('biometric/models/face_landmarker.task'), delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65
  })).catch((error: unknown) => {
    landmarkerPromise = undefined;
    throw new BiometricCaptureError('MODEL_UNAVAILABLE', messageOf(error));
  });
  return landmarkerPromise;
}

async function getFaceSession(): Promise<ort.InferenceSession> {
  faceSessionPromise ??= ort.InferenceSession.create(assetUrl('biometric/models/face.onnx'), {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all'
  }).catch((error: unknown) => {
    faceSessionPromise = undefined;
    throw new BiometricCaptureError('MODEL_UNAVAILABLE', `ArcFace could not load: ${messageOf(error)}`);
  });
  return faceSessionPromise;
}

async function getLivenessSession(): Promise<ort.InferenceSession> {
  livenessSessionPromise ??= ort.InferenceSession.create(assetUrl('biometric/models/antispoofing_ep50.onnx'), {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all'
  }).catch((error: unknown) => {
    livenessSessionPromise = undefined;
    throw new BiometricCaptureError('MODEL_UNAVAILABLE', `Liveness model could not load: ${messageOf(error)}`);
  });
  return livenessSessionPromise;
}

async function getArcFaceEmbedding(source: HTMLCanvasElement, landmarks: NormalizedLandmark[]): Promise<number[]> {
  const matrix = estimateSimilarity(extractFivePoints(landmarks, source.width, source.height), ARCFACE_TARGET);
  if (!matrix) throw new BiometricCaptureError('FACE_NOT_FOUND', 'Face alignment could not be established.');
  const aligned = document.createElement('canvas');
  aligned.width = ARCFACE_SIZE;
  aligned.height = ARCFACE_SIZE;
  const context = requiredContext(aligned);
  context.setTransform(matrix[0], matrix[3], matrix[1], matrix[4], matrix[2], matrix[5]);
  context.drawImage(source, 0, 0);
  context.resetTransform();
  const pixels = context.getImageData(0, 0, ARCFACE_SIZE, ARCFACE_SIZE).data;
  const plane = ARCFACE_SIZE * ARCFACE_SIZE;
  const values = new Float32Array(plane * 3);
  for (let index = 0; index < plane; index += 1) {
    values[index] = (pixels[index * 4] - 127.5) / 128;
    values[plane + index] = (pixels[index * 4 + 1] - 127.5) / 128;
    values[plane * 2 + index] = (pixels[index * 4 + 2] - 127.5) / 128;
  }
  const session = await getFaceSession();
  const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', values, [1, 3, 112, 112]) });
  const raw = Array.from(output[session.outputNames[0]].data as Float32Array);
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / Math.max(norm, 1e-10));
}

async function runLiveness(frames: Float32Array[]): Promise<number> {
  const session = await getLivenessSession();
  const metadata = session.inputMetadata[0];
  const dimensions = metadata.isTensor ? metadata.shape.map(Number) : [];
  const frameCount = getFrameCount(dimensions);
  const selected = frames.slice(-frameCount);
  while (selected.length < frameCount) selected.push(selected[selected.length - 1]);
  const pixels = LIVE_WIDTH * LIVE_HEIGHT;
  const isChannelsFirst = dimensions.length === 5 && dimensions[1] === 3;
  const values = new Float32Array(frameCount * 3 * pixels);
  if (isChannelsFirst) {
    for (let t = 0; t < frameCount; t += 1) for (let channel = 0; channel < 3; channel += 1) {
      values.set(selected[t].subarray(channel * pixels, (channel + 1) * pixels), (channel * frameCount + t) * pixels);
    }
  } else selected.forEach((frame, index) => values.set(frame, index * frame.length));
  const shape = isChannelsFirst ? [1, 3, frameCount, LIVE_HEIGHT, LIVE_WIDTH] : [1, frameCount, 3, LIVE_HEIGHT, LIVE_WIDTH];
  const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', values, shape) });
  const logits = Array.from(output[session.outputNames[0]].data as Float32Array);
  const max = Math.max(...logits);
  const exponents = logits.map((value) => Math.exp(value - max));
  return exponents[0] / exponents.reduce((sum, value) => sum + value, 0);
}

function faceCropToChw(source: HTMLCanvasElement, box: FaceBox): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = LIVE_WIDTH;
  canvas.height = LIVE_HEIGHT;
  const context = requiredContext(canvas);
  const pad = box.width * 0.2;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(source.width - x, box.width + pad * 2);
  const height = Math.min(source.height - y, box.height + pad * 2);
  context.drawImage(source, x, y, width, height, 0, 0, LIVE_WIDTH, LIVE_HEIGHT);
  const data = context.getImageData(0, 0, LIVE_WIDTH, LIVE_HEIGHT).data;
  const pixels = LIVE_WIDTH * LIVE_HEIGHT;
  const result = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) for (let channel = 0; channel < 3; channel += 1) {
    result[channel * pixels + index] = (data[index * 4 + channel] / 255 - MEAN[channel]) / STD[channel];
  }
  return result;
}

type FaceBox = { x: number; y: number; width: number; height: number };
function getFaceBox(points: NormalizedLandmark[], width: number, height: number): FaceBox {
  const xs = points.map((point) => point.x * width);
  const ys = points.map((point) => point.y * height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

type ImageQuality = { score: number; brightness: number; sharpness: number };
function assessImageQuality(canvas: HTMLCanvasElement, box: FaceBox): ImageQuality {
  const context = requiredContext(canvas);
  const sample = context.getImageData(Math.max(0, Math.floor(box.x)), Math.max(0, Math.floor(box.y)), Math.max(1, Math.min(canvas.width - box.x, Math.floor(box.width))), Math.max(1, Math.min(canvas.height - box.y, Math.floor(box.height))));
  let luminance = 0;
  let luminanceSquared = 0;
  const count = sample.data.length / 4;
  for (let index = 0; index < sample.data.length; index += 4) {
    const value = 0.299 * sample.data[index] + 0.587 * sample.data[index + 1] + 0.114 * sample.data[index + 2];
    luminance += value;
    luminanceSquared += value * value;
  }
  const mean = luminance / count;
  const contrast = Math.sqrt(Math.max(0, luminanceSquared / count - mean * mean));
  const exposure = 1 - Math.min(1, Math.abs(mean - 128) / 128);
  const sharpness = Math.min(1, contrast / 52);
  return { score: Math.max(0, Math.min(1, exposure * 0.55 + sharpness * 0.45)), brightness: exposure, sharpness };
}

function estimateDistanceCm(points: NormalizedLandmark[], frameWidth: number): number {
  const left = midpoint(points, LEFT_EYE);
  const right = midpoint(points, RIGHT_EYE);
  const eyePixels = Math.hypot(left[0] - right[0], left[1] - right[1]) * frameWidth;
  const focalPixels = frameWidth / (2 * Math.tan(Math.PI / 6));
  return Math.max(1, Math.min(500, (6.3 * focalPixels) / Math.max(eyePixels, 1)));
}

function extractFivePoints(points: NormalizedLandmark[], width: number, height: number): number[][] {
  const pixel = (index: number) => [points[index].x * width, points[index].y * height];
  const left = averagePoint(pixel(LEFT_EYE[0]), pixel(LEFT_EYE[1]));
  const right = averagePoint(pixel(RIGHT_EYE[0]), pixel(RIGHT_EYE[1]));
  const result = [left, right, pixel(4), pixel(57), pixel(287)];
  if (result[0][0] > result[1][0]) return [result[1], result[0], result[2], result[4], result[3]];
  return result;
}

function estimateSimilarity(source: number[][], target: number[][]): number[] | null {
  const count = source.length;
  let square = 0, product = 0, cross = 0, sx = 0, sy = 0, txs = 0, tys = 0;
  for (let index = 0; index < count; index += 1) {
    const [x, y] = source[index]; const [targetX, targetY] = target[index];
    square += x * x + y * y; product += x * targetX + y * targetY; cross += x * targetY - y * targetX;
    sx += x; sy += y; txs += targetX; tys += targetY;
  }
  const denominator = square * count - sx * sx - sy * sy;
  if (Math.abs(denominator) < 1e-10) return null;
  const a = (product * count - sx * txs - sy * tys) / denominator;
  const b = (cross * count - sx * tys + sy * txs) / denominator;
  return [a, -b, (txs - a * sx + b * sy) / count, b, a, (tys - a * sy - b * sx) / count];
}

function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): void { requiredContext(canvas).drawImage(video, 0, 0, canvas.width, canvas.height); }
function requiredContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D { const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas is unavailable.'); return context; }
function getFrameCount(dimensions: number[]): number { return dimensions.length === 5 ? Math.max(1, dimensions[1] === 3 ? dimensions[2] : dimensions[1]) : LIVE_FRAMES; }
function midpoint(points: NormalizedLandmark[], indexes: number[]): number[] { return averagePoint([points[indexes[0]].x, points[indexes[0]].y], [points[indexes[1]].x, points[indexes[1]].y]); }
function averagePoint(a: number[], b: number[]): number[] { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
function assetUrl(path: string): string { return new URL(path, document.baseURI).href; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
