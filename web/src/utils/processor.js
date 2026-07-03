import * as Mp4Muxer from 'mp4-muxer';
import { loadOpenCV } from './opencv';

// Number of video decoders / detection workers to run in parallel.
// The dominant cost per frame is seeking + decoding a single <video> element,
// so overlapping several of them is where the speedup comes from. OpenCV.js is
// single-threaded, but its synchronous work happily interleaves with the async
// seek waits of the other workers.
const DEFAULT_CONCURRENCY = 4;

const getConcurrency = (config) => {
  if (config && Number.isInteger(config.concurrency) && config.concurrency > 0) {
    return config.concurrency;
  }
  const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(DEFAULT_CONCURRENCY, hw));
};

const createCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const loadVideo = (src) =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load video element'));
  });

const seekTo = (video, t) =>
  new Promise((resolve) => {
    // Already positioned on this frame (can happen when consecutive requests
    // round to the same time): a 'seeked' event would never fire, so resolve.
    if (Math.abs(video.currentTime - t) < 1e-6 && video.readyState >= 2) {
      resolve();
      return;
    }
    const handler = () => {
      video.removeEventListener('seeked', handler);
      resolve();
    };
    video.addEventListener('seeked', handler);
    video.currentTime = t;
  });

export const processVideo = async (file, config, onProgress) => {
  const cv = await loadOpenCV();
  if (!cv || !cv.Mat) {
    throw new Error('OpenCV not loaded yet.');
  }

  const srcUrl = URL.createObjectURL(file);

  // Master video element, used to read metadata and to encode the output pass.
  const masterVideo = await loadVideo(srcUrl);
  const videoWidth = masterVideo.videoWidth;
  const videoHeight = masterVideo.videoHeight;
  const duration = masterVideo.duration;

  // --- Detector configuration (shared, read-only) --------------------------
  const colorMat = new cv.Mat(1, 1, cv.CV_8UC3);
  colorMat.data.set([config.color[0], config.color[1], config.color[2]]);
  const hsvColorMat = new cv.Mat();
  cv.cvtColor(colorMat, hsvColorMat, cv.COLOR_RGB2HSV);
  const hsvColor = hsvColorMat.data;

  const deltaH = 180 * config.colorTol;
  const deltaSV = 255 * config.colorTol;

  const lowerBound = [
    Math.max(0, hsvColor[0] - deltaH),
    Math.max(0, hsvColor[1] - deltaSV),
    Math.max(0, hsvColor[2] - deltaSV),
    0,
  ];
  const upperBound = [
    Math.min(180, hsvColor[0] + deltaH),
    Math.min(255, hsvColor[1] + deltaSV),
    Math.min(255, hsvColor[2] + deltaSV),
    255,
  ];

  colorMat.delete();
  hsvColorMat.delete();

  // ROI: [top, bottom, left, right]
  const roiTop = Math.max(0, Math.floor(config.roi[0]));
  const roiBottom = Math.min(videoHeight, Math.floor(config.roi[1]));
  const roiLeft = Math.max(0, Math.floor(config.roi[2]));
  const roiRight = Math.min(videoWidth, Math.floor(config.roi[3]));
  const roiW = roiRight - roiLeft;
  const roiH = roiBottom - roiTop;
  const hasRoi = roiW > 0 && roiH > 0;

  // Analysis timestamps. 60 FPS emulates frame-by-frame processing so we don't
  // skip frames in standard videos (matches the previous behaviour).
  const fps = 60;
  const step = 1 / fps;
  const times = [];
  for (let t = 0; t < duration; t += step) {
    times.push(t);
  }
  const totalFrames = times.length;

  // Per-frame detection result. Filled by the parallel workers below.
  const found = new Array(totalFrames).fill(false);

  // Build per-worker OpenCV scratch buffers. Each worker runs its cv.* calls
  // synchronously, but because workers interleave at await points they must not
  // share mutable Mats.
  const makeScratch = () => {
    const lowMat = new cv.Mat(roiH, roiW, cv.CV_8UC3);
    lowMat.setTo(new cv.Scalar(...lowerBound));
    const highMat = new cv.Mat(roiH, roiW, cv.CV_8UC3);
    highMat.setTo(new cv.Scalar(...upperBound));
    return {
      lowMat,
      highMat,
      roiMask: new cv.Mat(),
      contours: new cv.MatVector(),
      hierarchy: new cv.Mat(),
    };
  };

  const detectFound = (ctx, scratch) => {
    const imgData = ctx.getImageData(roiLeft, roiTop, roiW, roiH);
    const roiMat = cv.matFromImageData(imgData); // RGBA
    const roiRgb = new cv.Mat();
    cv.cvtColor(roiMat, roiRgb, cv.COLOR_RGBA2RGB);
    const roiHsv = new cv.Mat();
    cv.cvtColor(roiRgb, roiHsv, cv.COLOR_RGB2HSV);

    cv.inRange(roiHsv, scratch.lowMat, scratch.highMat, scratch.roiMask);
    cv.findContours(scratch.roiMask, scratch.contours, scratch.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let isFound = false;
    for (let i = 0; i < scratch.contours.size(); ++i) {
      const cnt = scratch.contours.get(i);
      const circle = cv.minEnclosingCircle(cnt);
      if (circle.radius < 1) {
        cnt.delete();
        continue;
      }
      const area = cv.contourArea(cnt);
      const circleArea = Math.PI * circle.radius * circle.radius;
      const circularity = circleArea > 0 ? area / circleArea : 0;
      if (Math.abs(circle.radius - config.radius) <= config.radius * config.radiusTol && circularity > 0.2) {
        isFound = true;
      }
      cnt.delete();
      if (isFound) break;
    }

    roiMat.delete();
    roiRgb.delete();
    roiHsv.delete();
    return isFound;
  };

  // --- Pass 1: parallel detection -----------------------------------------
  let nextIndex = 0;
  let detectedCount = 0;
  const concurrency = Math.min(getConcurrency(config), totalFrames || 1);

  const runWorker = async () => {
    const video = await loadVideo(srcUrl);
    const canvas = createCanvas(videoWidth, videoHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scratch = hasRoi ? makeScratch() : null;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const i = nextIndex++;
        if (i >= totalFrames) break;

        await seekTo(video, times[i]);
        ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

        found[i] = scratch ? detectFound(ctx, scratch) : false;

        detectedCount++;
        if (onProgress && detectedCount % 5 === 0) {
          // Detection takes the bulk of the time; reserve the last 5% for encode.
          onProgress(Math.min(95, Math.round((detectedCount / totalFrames) * 95)));
        }
      }
    } finally {
      if (scratch) {
        scratch.lowMat.delete();
        scratch.highMat.delete();
        scratch.roiMask.delete();
        scratch.contours.delete();
        scratch.hierarchy.delete();
      }
      video.src = '';
      video.removeAttribute('src');
      video.load();
    }
  };

  if (totalFrames > 0) {
    await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  }

  // --- Grouping: collapse each run of matches to its middle frame ----------
  // Preserves the original "средний кадр" rule: for a contiguous run of matched
  // frames [a..b] emit frame a + floor((b - a + 1) / 2).
  const middleFrames = [];
  let runStart = -1;
  for (let i = 0; i < totalFrames; i++) {
    if (found[i]) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const len = i - runStart;
      middleFrames.push(runStart + Math.floor(len / 2));
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = totalFrames - runStart;
    middleFrames.push(runStart + Math.floor(len / 2));
  }

  // --- Pass 2: encode the selected frames in order -------------------------
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: videoWidth, height: videoHeight },
    fastStart: 'in-memory',
  });

  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
      console.error(e);
    },
  });
  videoEncoder.configure({
    codec: 'avc1.4d002a',
    width: videoWidth,
    height: videoHeight,
    bitrate: 2_000_000,
    framerate: 30,
  });

  const outCanvas = createCanvas(videoWidth, videoHeight);
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  try {
    for (let k = 0; k < middleFrames.length; k++) {
      if (videoEncoder.state === 'closed') {
        throw encoderError || new Error('VideoEncoder closed unexpectedly');
      }

      await seekTo(masterVideo, times[middleFrames[k]]);
      outCtx.drawImage(masterVideo, 0, 0, videoWidth, videoHeight);

      const timestamp = k * (1000000 / 30);
      const frame = new VideoFrame(outCanvas, { timestamp, duration: 1000000 / 30 });
      try {
        videoEncoder.encode(frame, { keyFrame: k % 30 === 0 });
      } finally {
        frame.close();
      }

      if (onProgress) {
        onProgress(Math.min(100, 95 + Math.round(((k + 1) / Math.max(1, middleFrames.length)) * 5)));
      }
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();

    if (onProgress) onProgress(100);
    return muxer.target.buffer;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    masterVideo.src = '';
    masterVideo.removeAttribute('src');
    masterVideo.load();
    URL.revokeObjectURL(srcUrl);
  }
};
