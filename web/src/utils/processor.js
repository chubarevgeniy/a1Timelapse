import * as Mp4Muxer from 'mp4-muxer';

export const processVideo = async (file, config, onProgress) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!window.cv || !window.cv.Mat) {
        reject(new Error("OpenCV not loaded yet."));
        return;
      }

      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      await new Promise((r) => {
        video.onloadedmetadata = () => r();
      });

      const { videoWidth, videoHeight, duration } = video;

      let canvas, ctx;
      if (typeof OffscreenCanvas !== 'undefined') {
          canvas = new OffscreenCanvas(videoWidth, videoHeight);
      } else {
          canvas = document.createElement('canvas');
          canvas.width = videoWidth;
          canvas.height = videoHeight;
      }
      ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Setup Muxer & Encoder
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: videoWidth,
          height: videoHeight
        },
        fastStart: 'in-memory',
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
            console.error(e);
            reject(e);
        },
      });

      videoEncoder.configure({
        codec: 'avc1.4d002a',
        width: videoWidth,
        height: videoHeight,
        bitrate: 2_000_000,
        framerate: 30,
      });

      const cv = window.cv;

      // Calculate color bounds
      const colorMat = new cv.Mat(1, 1, cv.CV_8UC3);
      colorMat.data.set([config.color[0], config.color[1], config.color[2]]);
      const hsvColorMat = new cv.Mat();
      cv.cvtColor(colorMat, hsvColorMat, cv.COLOR_RGB2HSV);
      const hsvColor = hsvColorMat.data;

      const deltaH = 180 * config.colorTol;
      const deltaSV = 255 * config.colorTol;

      // Lower/Upper bounds as arrays
      const lowerBound = [
          Math.max(0, hsvColor[0] - deltaH),
          Math.max(0, hsvColor[1] - deltaSV),
          Math.max(0, hsvColor[2] - deltaSV),
          0
      ];
      const upperBound = [
          Math.min(180, hsvColor[0] + deltaH),
          Math.min(255, hsvColor[1] + deltaSV),
          Math.min(255, hsvColor[2] + deltaSV),
          255
      ];

      colorMat.delete(); hsvColorMat.delete();

      // Pre-calculate ROI and Threshold Mats
      // ROI: [top, bottom, left, right]
      const roiTop = Math.max(0, Math.floor(config.roi[0]));
      const roiBottom = Math.min(videoHeight, Math.floor(config.roi[1]));
      const roiLeft = Math.max(0, Math.floor(config.roi[2]));
      const roiRight = Math.min(videoWidth, Math.floor(config.roi[3]));
      const roiW = roiRight - roiLeft;
      const roiH = roiBottom - roiTop;

      let lowMat = null;
      let highMat = null;
      let roiMask = null;
      let contours = null;
      let hierarchy = null;

      if (roiW > 0 && roiH > 0) {
          lowMat = new cv.Mat(roiH, roiW, cv.CV_8UC3);
          lowMat.setTo(new cv.Scalar(...lowerBound));

          highMat = new cv.Mat(roiH, roiW, cv.CV_8UC3);
          highMat.setTo(new cv.Scalar(...upperBound));

          roiMask = new cv.Mat();
          contours = new cv.MatVector();
          hierarchy = new cv.Mat();
      }

      let currentTime = 0;
      let outputFrameCount = 0;
      const fps = 15; // Analysis FPS
      const step = 1/fps;

      const processFrame = async () => {
        try {
            if (videoEncoder.state === "closed") {
                reject(new Error("VideoEncoder closed unexpectedly"));
                return;
            }

            if (currentTime >= duration) {
                await videoEncoder.flush();
                muxer.finalize();

                if (lowMat) lowMat.delete();
                if (highMat) highMat.delete();
                if (roiMask) roiMask.delete();
                if (contours) contours.delete();
                if (hierarchy) hierarchy.delete();

                resolve(muxer.target.buffer);
                return;
            }

            video.currentTime = currentTime;

            await new Promise(r => {
                const handler = () => {
                    video.removeEventListener('seeked', handler);
                    r();
                };
                video.addEventListener('seeked', handler);
                if (video.readyState >= 3) {
                    video.removeEventListener('seeked', handler);
                    r();
                }
            });

            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

            let found = false;

            if (roiW > 0 && roiH > 0) {
                const imgData = ctx.getImageData(roiLeft, roiTop, roiW, roiH);
                const roiMat = cv.matFromImageData(imgData); // RGBA

                const roiRgb = new cv.Mat();
                cv.cvtColor(roiMat, roiRgb, cv.COLOR_RGBA2RGB); // RGB

                const roiHsv = new cv.Mat();
                cv.cvtColor(roiRgb, roiHsv, cv.COLOR_RGB2HSV); // HSV

                cv.inRange(roiHsv, lowMat, highMat, roiMask);

                cv.findContours(roiMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                for (let i = 0; i < contours.size(); ++i) {
                    const cnt = contours.get(i);
                    const circle = cv.minEnclosingCircle(cnt);

                    if (circle.radius < 1) { cnt.delete(); continue; }

                    const area = cv.contourArea(cnt);
                    const circleArea = Math.PI * circle.radius * circle.radius;
                    const circularity = circleArea > 0 ? area / circleArea : 0;

                    if (Math.abs(circle.radius - config.radius) <= config.radius * config.radiusTol && circularity > 0.2) {
                        found = true;
                    }
                    cnt.delete();
                    if (found) break;
                }

                roiMat.delete(); roiRgb.delete(); roiHsv.delete();
            }

            if (found) {
                const bitmap = await createImageBitmap(canvas);
                const timestamp = outputFrameCount * (1000000 / 30);
                const frame = new VideoFrame(bitmap, { timestamp: timestamp, duration: 1000000/30 });

                try {
                    videoEncoder.encode(frame, { keyFrame: outputFrameCount % 30 === 0 });
                } finally {
                    frame.close();
                }
                outputFrameCount++;
            }

            if (onProgress) {
                onProgress(Math.min(100, Math.round((currentTime / duration) * 100)));
            }

            currentTime += step;
            setTimeout(processFrame, 0);
        } catch (e) {
            reject(e);
        }
      };

      processFrame();

    } catch (e) {
      reject(e);
    }
  });
};
