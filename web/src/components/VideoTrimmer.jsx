import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { renderFramesVideo } from '../utils/videoTrim';

const clampFn = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const fmtT = (s) => (s == null || isNaN(s) ? '--' : `${s.toFixed(3)}s`);

// In-browser preview & trim: load the phone timelapse, align it to the log
// events with a frame-precise offset, then extract the frames.
function VideoTrimmer({ events, scale, printName, onBack }) {
  const [videoFile, setVideoFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [dims, setDims] = useState([0, 0]);
  const [videoReady, setVideoReady] = useState(false);

  const [fps, setFps] = useState(30);
  const [previewTime, setPreviewTime] = useState(0);
  const [offset, setOffset] = useState(0); // seconds added to every event
  const [focused, setFocused] = useState(null); // event index being aligned
  const [framesPerEvent, setFramesPerEvent] = useState(1);

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const safeScale = Number(scale) > 0 ? Number(scale) : 1;
  const frameStep = 1 / (Number(fps) > 0 ? Number(fps) : 30);

  // Video position of each event (before the sync offset).
  const basePos = useMemo(
    () => events.map((e) => e.offsetSec / safeScale),
    [events, safeScale]
  );
  const eventPos = useMemo(() => basePos.map((p) => p + offset), [basePos, offset]);
  const inRangeCount = useMemo(
    () => eventPos.filter((p) => p >= 0 && p <= duration).length,
    [eventPos, duration]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const s = Math.min(600 / w, 1);
    canvas.width = w * s;
    canvas.height = h * s;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }, []);

  // Load the selected video.
  useEffect(() => {
    if (!videoFile) return;
    const v = videoRef.current;
    const url = URL.createObjectURL(videoFile);
    v.src = url;
    const finish = (dur) => {
      setDuration(dur);
      setDims([v.videoWidth, v.videoHeight]);
      setVideoReady(true);
      setPreviewTime(0);
      v.currentTime = 0;
    };
    v.onloadedmetadata = () => {
      // Some containers (notably MediaRecorder-produced WebM) report an
      // Infinity/NaN duration until the file is actually scrubbed. Force the
      // browser to resolve it with the well-known "seek far past the end" trick.
      if (!isFinite(v.duration) || v.duration <= 0) {
        const onUpdate = () => {
          if (isFinite(v.duration) && v.duration > 0) {
            v.removeEventListener('timeupdate', onUpdate);
            finish(v.duration);
          }
        };
        v.addEventListener('timeupdate', onUpdate);
        v.currentTime = 1e7;
      } else {
        finish(v.duration);
      }
    };
    return () => {
      setVideoReady(false);
      URL.revokeObjectURL(url);
    };
  }, [videoFile]);

  // Redraw whenever a seek completes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onSeeked = () => draw();
    v.addEventListener('seeked', onSeeked);
    return () => v.removeEventListener('seeked', onSeeked);
  }, [draw, videoReady]);

  // Drive the video element to the requested preview time.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoReady) return;
    if (Math.abs(v.currentTime - previewTime) > 1e-4) v.currentTime = previewTime;
    else draw();
  }, [previewTime, videoReady, draw]);

  // When aligning a specific event, keep the preview locked to it so nudging the
  // offset shows the frame move live.
  useEffect(() => {
    if (focused == null || basePos[focused] == null) return;
    setPreviewTime(clampFn(basePos[focused] + offset, 0, duration));
  }, [offset, focused, basePos, duration]);

  const scrubTo = (t) => {
    setFocused(null);
    setPreviewTime(clampFn(t, 0, duration));
  };
  const stepPreview = (n) => scrubTo(previewTime + n * frameStep);
  const stepOffset = (n) => setOffset((o) => o + n * frameStep);

  const goEvent = (i) => {
    if (i < 0 || i >= events.length) return;
    setFocused(i);
    setPreviewTime(clampFn(basePos[i] + offset, 0, duration));
  };

  const maxOff = Math.max(30, Math.ceil(duration || 30));

  const render = async () => {
    setError(null);
    setRendering(true);
    setProgress(0);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    try {
      const positions = basePos.map((p) => p + offset);
      const buf = await renderFramesVideo(
        videoFile,
        positions,
        { framesPerEvent: Number(framesPerEvent) || 1, srcFps: Number(fps) || 30 },
        (p) => setProgress(p)
      );
      const url = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
      setResultUrl(url);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setRendering(false);
    }
  };

  // Which event (if any) the preview is currently sitting on.
  const nearEventIdx = useMemo(() => {
    let best = -1;
    let bestD = frameStep * 1.5;
    eventPos.forEach((p, i) => {
      const d = Math.abs(p - previewTime);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, [eventPos, previewTime, frameStep]);

  // Event index used by the prev/next-event buttons.
  const curEvent = focused != null ? focused : nearEventIdx >= 0 ? nearEventIdx : 0;

  if (!videoFile) {
    return (
      <div>
        <h3>PREVIEW &amp; TRIM</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
          Load your phone's timelapse for <strong>{printName}</strong> to align
          it against the {events.length} log event(s) and cut it in the browser.
        </p>
        <div className="uploader">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => e.target.files[0] && setVideoFile(e.target.files[0])}
            style={{ display: 'none' }}
            id="trim-video-upload"
          />
          <label htmlFor="trim-video-upload" style={{ cursor: 'pointer', display: 'block' }}>
            <span className="uploader-icon">📹</span>
            <br />
            <h3>TIMELAPSE VIDEO</h3>
            <p style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>MP4 / WEBM</p>
            <div style={{ marginTop: '20px', border: '1px solid black', padding: '10px', display: 'inline-block' }}>
              SELECT VIDEO
            </div>
          </label>
        </div>
        <button onClick={onBack} className="btn btn-secondary mt-3">← BACK</button>
      </div>
    );
  }

  return (
    <div>
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
      <h3>PREVIEW &amp; TRIM</h3>

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="canvas-preview" style={{ cursor: 'default' }} />
        {!videoReady && (
          <p style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', padding: '5px' }}>
            LOADING VIDEO…
          </p>
        )}
      </div>

      {/* Event ticks timeline */}
      <div className="trim-timeline">
        {eventPos.map((p, i) =>
          p >= 0 && p <= duration ? (
            <button
              key={i}
              className={`trim-tick ${i === focused ? 'focused' : ''} ${i === nearEventIdx ? 'near' : ''}`}
              style={{ left: `${(p / (duration || 1)) * 100}%` }}
              title={`Event ${i + 1}: ${events[i].label} · video ${fmtT(p)}`}
              onClick={() => goEvent(i)}
            />
          ) : null
        )}
      </div>
      <p className="field-hint" style={{ marginTop: '4px' }}>
        {inRangeCount} / {events.length} events land inside the video ·{' '}
        {nearEventIdx >= 0 ? (
          <>on event <strong>#{nearEventIdx + 1}</strong> ({events[nearEventIdx].label})</>
        ) : (
          'between events'
        )}
      </p>

      {/* Slider 1: preview scrub */}
      <div className="trim-control">
        <div className="trim-control-head">
          <label>PREVIEW POSITION</label>
          <span>{fmtT(previewTime)} / {fmtT(duration)}</span>
        </div>
        <input
          type="range" min="0" max={duration || 0} step={frameStep}
          value={previewTime}
          onChange={(e) => scrubTo(parseFloat(e.target.value))}
        />
        <div className="trim-btn-row">
          <button className="btn btn-secondary" onClick={() => stepPreview(-1)}>&lt; PREV FRAME</button>
          <button className="btn btn-secondary" onClick={() => goEvent(curEvent - 1)}>◀ PREV EVENT</button>
          <button className="btn btn-secondary" onClick={() => goEvent(curEvent + 1)}>NEXT EVENT ▶</button>
          <button className="btn btn-secondary" onClick={() => stepPreview(1)}>NEXT FRAME &gt;</button>
        </div>
      </div>

      {/* Slider 2: sync offset */}
      <div className="trim-control">
        <div className="trim-control-head">
          <label>SYNC OFFSET</label>
          <span>{offset >= 0 ? '+' : ''}{offset.toFixed(3)}s · {Math.round(offset / frameStep)} fr</span>
        </div>
        <input
          type="range" min={-maxOff} max={maxOff} step={frameStep}
          value={offset}
          onChange={(e) => setOffset(parseFloat(e.target.value))}
        />
        <div className="trim-btn-row">
          <button className="btn btn-secondary" onClick={() => stepOffset(-1)}>&lt; -1 FRAME</button>
          <button className="btn btn-secondary" onClick={() => setOffset(0)}>RESET</button>
          <button className="btn btn-secondary" onClick={() => stepOffset(1)}>+1 FRAME &gt;</button>
        </div>
        <p className="field-hint">
          Focus event #1, then nudge the offset until the frame matches that event, and the rest lines up.
        </p>
      </div>

      {/* Settings + render */}
      <div className="controls-group" style={{ marginTop: '15px' }}>
        <div className="trim-settings">
          <div className="form-group">
            <label>Frames per event <span>{framesPerEvent}</span></label>
            <input
              className="log-input" type="number" min="1" max="120"
              value={framesPerEvent}
              onChange={(e) => setFramesPerEvent(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Source video fps <span>{fps}</span></label>
            <input
              className="log-input" type="number" min="1" max="240"
              value={fps}
              onChange={(e) => setFps(e.target.value)}
            />
          </div>
        </div>

        {rendering && (
          <div className="progress-container" style={{ marginTop: 0 }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ textAlign: 'right', fontWeight: 'bold' }}>{progress}%</p>
          </div>
        )}

        {error && <p className="log-error">{error}</p>}

        {resultUrl && (
          <div className="result-container">
            <video src={resultUrl} controls />
            <div className="mt-3">
              <a href={resultUrl} download={`${(printName || 'timelapse').replace(/\.gcode$/i, '')}_trimmed.mp4`}>
                <button className="btn btn-primary">DOWNLOAD TRIMMED VIDEO</button>
              </a>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button onClick={onBack} className="btn btn-secondary" disabled={rendering}>← BACK</button>
          <button
            onClick={render}
            className="btn btn-primary"
            disabled={rendering || inRangeCount === 0}
          >
            {rendering ? 'RENDERING…' : `TRIM ${inRangeCount * (Number(framesPerEvent) || 1)} FRAMES`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoTrimmer;
