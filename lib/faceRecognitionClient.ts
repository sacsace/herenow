"use client";

import { FACE_DESCRIPTOR_LENGTH } from "@/lib/faceMatch";

export type FaceApiModule = typeof import("@vladmandic/face-api");

let faceApiMod: FaceApiModule | null = null;
let modelsReady = false;
let loadPromise: Promise<void> | null = null;
let activeBackend: "webgl" | "wasm" | "cpu" | null = null;

export function getActiveFaceBackend(): "webgl" | "wasm" | "cpu" | null {
  return activeBackend;
}

/**
 * iOS / iPadOS Safari WebKit 감지.
 * iOS WebKit은 WebGL을 "지원"하지만 fp16 텍스처 정밀도가 낮아
 * tinyFaceDetector의 descriptor 가 잘못 추출되는 알려진 이슈가 있다.
 * 이 환경에서는 WebGL을 건너뛰고 WASM을 우선 사용한다.
 *
 * 참고: iOS의 Chrome(CriOS)/Firefox(FxiOS)/Edge(EdgiOS)/모든 인앱 WebView 도
 * 내부적으로 WebKit이므로 동일하게 처리한다.
 */
function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ 는 데스크톱 모드에서 MacIntel 로 위장 — touch points 로 식별
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return navigator.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * 다양한 환경에서 안정적으로 동작하도록 백엔드를 선택한다.
 *
 * - iOS WebKit (Safari 등): WASM → CPU (WebGL 정밀도 이슈 회피)
 * - 기타 환경:               WebGL → WASM → CPU
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsReady) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const tf = await import("@tensorflow/tfjs-core");

    let backendOk = false;
    const preferWasm = isIosWebKit();

    // 1) WebGL — iOS WebKit 이 아닐 때만 시도
    if (!preferWasm) {
      try {
        await import("@tensorflow/tfjs-backend-webgl");
        await tf.setBackend("webgl");
        await tf.ready();
        activeBackend = "webgl";
        backendOk = true;
      } catch (e) {
        console.warn("[face] WebGL backend unavailable, will try WASM", e);
      }
    }

    // 2) WASM 폴백 (iOS Safari 1순위 / 그 외 2순위)
    if (!backendOk) {
      try {
        const wasm = await import("@tensorflow/tfjs-backend-wasm");
        // CDN에서 WASM 바이너리 로드 — 번들에 .wasm을 끼워넣지 않아도 됨
        wasm.setWasmPaths(
          "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/"
        );
        await tf.setBackend("wasm");
        await tf.ready();
        activeBackend = "wasm";
        backendOk = true;
      } catch (e) {
        console.warn("[face] WASM backend unavailable, will try CPU", e);
      }
    }

    // 3) CPU 최후 폴백
    if (!backendOk) {
      try {
        await tf.setBackend("cpu");
        await tf.ready();
        activeBackend = "cpu";
        backendOk = true;
      } catch (e) {
        console.error("[face] CPU backend also failed", e);
        loadPromise = null;
        throw new Error("FACE_BACKEND_UNAVAILABLE");
      }
    }

    if (!backendOk) {
      loadPromise = null;
      throw new Error("FACE_BACKEND_UNAVAILABLE");
    }

    faceApiMod = await import("@vladmandic/face-api");
    const modelPath = "/models";
    try {
      await Promise.all([
        faceApiMod.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceApiMod.nets.faceLandmark68TinyNet.loadFromUri(modelPath),
        faceApiMod.nets.faceRecognitionNet.loadFromUri(modelPath),
      ]);
    } catch (e) {
      loadPromise = null;
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`FACE_MODELS_FAILED:${detail}`);
    }
    modelsReady = true;
    console.info(`[face] ready on backend=${activeBackend}`);
  })();

  return loadPromise;
}

function getFaceApi(): FaceApiModule {
  if (!faceApiMod || !modelsReady) {
    throw new Error("Face models not loaded");
  }
  return faceApiMod;
}

/** 비디오/이미지에서 단일 얼굴 descriptor 추출 */
export async function extractFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  await loadFaceModels();
  const faceapi = getFaceApi();
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
  const result = await faceapi
    .detectSingleFace(input, opts)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!result?.descriptor || result.descriptor.length !== FACE_DESCRIPTOR_LENGTH) {
    return null;
  }
  return result.descriptor;
}

export function descriptorToArray(d: Float32Array): number[] {
  return Array.from(d);
}
