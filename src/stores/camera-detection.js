/**
 * 모델: 이미지 소스(스트림 | 단순 이미지) + 검출 상태
 * setup / game 양쪽에서 공유. 뷰는 이 모델에 맞게 렌더링.
 */
import { createStore } from 'zustand/vanilla';

const store = createStore((set, get) => ({
  // --- 이미지 소스 ---
  /** 'stream' | 'still' | null (stream 있으면 stream, stillImage 있으면 still) */
  stream: null,
  /** 정지 이미지: { url, width, height } */
  stillImage: null,
  /** 오버레이용 소스 크기 (비디오 메타데이터 또는 정지 이미지 크기) */
  sourceWidth: 0,
  sourceHeight: 0,

  // --- 카메라 설정 (스트림 시에만 의미 있음) ---
  facingMode: 'environment',
  zoom: 1,
  zoomCapabilities: { min: 1, max: 1, step: 0 },

  // --- 검출 상태 ---
  detectionModel: null,
  detectionRunning: false,
  predictions: [],
  segmentMasks: [],
  /** 선택된 오브젝트 클래스 (bbox 하이라이트용) */
  selectedClass: null,

  // --- 소스 설정 ---
  setStream: (stream) => {
    const prev = get().stream;
    if (prev && prev !== stream && typeof prev.getTracks === 'function') {
      prev.getTracks().forEach((t) => t.stop());
    }
    set({
      stream: stream || null,
      stillImage: null,
      sourceWidth: 0,
      sourceHeight: 0,
    });
  },

  setStillImage: (url, width, height) => {
    const prev = get().stream;
    if (prev && typeof prev.getTracks === 'function') {
      prev.getTracks().forEach((t) => t.stop());
    }
    set({
      stream: null,
      stillImage: url != null ? { url, width: width || 0, height: height || 0 } : null,
      sourceWidth: width || 0,
      sourceHeight: height || 0,
    });
  },

  setSourceSize: (width, height) => set({ sourceWidth: width || 0, sourceHeight: height || 0 }),

  setFacingMode: (facingMode) => set({ facingMode }),
  setZoom: (zoom) => set({ zoom }),
  setZoomCapabilities: (zoomCapabilities) => set({ zoomCapabilities }),

  // --- 검출 상태 설정 ---
  setDetectionModel: (model) => set({ detectionModel: model }),
  setDetectionRunning: (running) => set({ detectionRunning: running }),
  setPredictions: (predictions) => set({ predictions: predictions || [] }),
  setSegmentMasks: (masks) => set({ segmentMasks: masks || [] }),
  setSelectedClass: (cls) => set({ selectedClass: cls ?? null }),

  /** 소스 타입: 'stream' | 'still' | null */
  getSourceType: () => {
    const s = get();
    if (s.stream) return 'stream';
    if (s.stillImage) return 'still';
    return null;
  },

  stopStream: () => {
    const { stream } = get();
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((t) => t.stop());
    }
    set({ stream: null, sourceWidth: 0, sourceHeight: 0 });
  },

  stopDetection: () => set({ detectionRunning: false }),

  /** 화면 이탈 시: 스트림 정지, 검출 중지. 모델·정지 이미지는 유지 가능 */
  cleanup: () => {
    get().stopStream();
    set({ detectionRunning: false, predictions: [], segmentMasks: [] });
  },
}));

export const cameraDetectionStore = store;
export const useCameraDetectionStore = store;
