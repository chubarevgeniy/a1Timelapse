import * as Mp4Muxer from 'mp4-muxer';

// Grab specific frames out of a video (at a list of timestamps) and mux them,
// in order, into a new MP4. Used by the "preview & trim in browser" step of the
// printer-log mode to turn a linear phone timelapse into a per-event edit.
//
// No OpenCV here — this is a pure decode → draw → encode pass, so it works in
// the log mode without the vision engine.

const createCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
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
    video.preload = 'auto';
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load video element'));
  });

const seekTo = (video, t) =>
  new Promise((resolve) => {
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

/**
 * @param {File}   file            the phone timelapse video
 * @param {number[]} positionsSec  video-time seconds to grab a frame at (the
 *                                 head of each event, already offset-corrected)
 * @param {object} opts
 *   framesPerEvent  how many consecutive source frames to keep per position (>=1)
 *   srcFps          assumed source frame rate, used to step to the next frame
 *   outFps          output frame rate (default 30)
 * @param {function} onProgress    called with 0..100
 * @returns {Promise<ArrayBuffer>} the encoded MP4
 */
export const renderFramesVideo = async (file, positionsSec, opts = {}, onProgress) => {
  const framesPerEvent = Math.max(1, Math.floor(opts.framesPerEvent || 1));
  const srcFps = opts.srcFps > 0 ? opts.srcFps : 30;
  const outFps = opts.outFps > 0 ? opts.outFps : 30;
  const srcStep = 1 / srcFps;

  const srcUrl = URL.createObjectURL(file);
  const video = await loadVideo(srcUrl);
  const w = video.videoWidth;
  const h = video.videoHeight;
  const duration = video.duration;

  // Expand each position into framesPerEvent consecutive grab times, dropping
  // anything outside the clip.
  const grabTimes = [];
  for (const p of positionsSec) {
    for (let j = 0; j < framesPerEvent; j++) {
      const t = p + j * srcStep;
      if (t >= 0 && t <= duration) grabTimes.push(t);
    }
  }

  if (!grabTimes.length) {
    URL.revokeObjectURL(srcUrl);
    throw new Error('No frames fall inside the video with the current offset.');
  }

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
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
    width: w,
    height: h,
    bitrate: 4_000_000,
    framerate: outFps,
  });

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  try {
    for (let k = 0; k < grabTimes.length; k++) {
      if (videoEncoder.state === 'closed') {
        throw encoderError || new Error('VideoEncoder closed unexpectedly');
      }
      await seekTo(video, grabTimes[k]);
      ctx.drawImage(video, 0, 0, w, h);

      const timestamp = k * (1_000_000 / outFps);
      const frame = new VideoFrame(canvas, { timestamp, duration: 1_000_000 / outFps });
      try {
        videoEncoder.encode(frame, { keyFrame: k % 30 === 0 });
      } finally {
        frame.close();
      }
      if (onProgress) {
        onProgress(Math.min(99, Math.round(((k + 1) / grabTimes.length) * 99)));
      }
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();
    if (onProgress) onProgress(100);
    return muxer.target.buffer;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    video.src = '';
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(srcUrl);
  }
};
