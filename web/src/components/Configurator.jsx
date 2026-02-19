import React, { useState, useEffect, useRef, useCallback } from 'react';

function Configurator({ file, onStart, onCancel }) {
  const [roi, setRoi] = useState(null); // [top, bottom, left, right]
  const [color, setColor] = useState([0, 255, 0]);
  const [colorTol, setColorTol] = useState(0.2);
  const [radius, setRadius] = useState(20);
  const [radiusTol, setRadiusTol] = useState(0.2);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef(null);

  const draw = useCallback((video) => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');

    // Fit canvas to width
    const w = video.videoWidth;
    const h = video.videoHeight;
    const scale = Math.min(600 / w, 1);
    canvas.width = w * scale;
    canvas.height = h * scale;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / w;
    const scaleY = canvas.height / h;

    if (roi) {
      const [top, bottom, left, right] = roi;
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(left * scaleX, top * scaleY, (right - left) * scaleX, (bottom - top) * scaleY);
    }

    // Draw radius preview
    let cx, cy;
    if (roi) {
        const [top, bottom, left, right] = roi;
        cx = (left + right) / 2;
        cy = (top + bottom) / 2;
    } else {
        cx = w / 2;
        cy = h / 2;
    }

    ctx.beginPath();
    ctx.strokeStyle = 'cyan';
    ctx.lineWidth = 2;
    ctx.arc(cx * scaleX, cy * scaleY, radius * scaleX, 0, 2 * Math.PI);
    ctx.stroke();
  }, [roi, radius]);

  useEffect(() => {
    const video = videoRef.current;
    if (file) {
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        setVideoLoaded(true);
        setDuration(video.duration);
        // Draw first frame
        video.currentTime = 0;
      };

      video.ontimeupdate = () => {
        setCurrentTime(video.currentTime);
      };
    }
    return () => {
      if (video.src) URL.revokeObjectURL(video.src);
    }
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSeeked = () => {
        draw(video);
    };

    video.addEventListener('seeked', handleSeeked);
    return () => video.removeEventListener('seeked', handleSeeked);
  }, [draw]);

  useEffect(() => {
    if (videoLoaded && videoRef.current) {
      draw(videoRef.current);
    }
  }, [draw, videoLoaded]);

  const getCanvasCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // Handle both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDragging.current = true;
    dragStart.current = getCanvasCoordinates(e, canvas);
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    // Prevent scrolling on touch devices while dragging
    if (e.preventDefault) e.preventDefault();

    const canvas = canvasRef.current;
    const currentPos = getCanvasCoordinates(e, canvas);
    const start = dragStart.current;

    // Convert canvas coords to video coords
    const video = videoRef.current;
    const scaleX = video.videoWidth / canvas.width;
    const scaleY = video.videoHeight / canvas.height;

    // Canvas coords
    const cTop = Math.min(start.y, currentPos.y);
    const cBottom = Math.max(start.y, currentPos.y);
    const cLeft = Math.min(start.x, currentPos.x);
    const cRight = Math.max(start.x, currentPos.x);

    // Video coords
    setRoi([
        cTop * scaleY,
        cBottom * scaleY,
        cLeft * scaleX,
        cRight * scaleX
    ]);
  };

  const handleMouseUp = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let currentPos;
    if (e.changedTouches && e.changedTouches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        currentPos = {
            x: (e.changedTouches[0].clientX - rect.left) * scaleX,
            y: (e.changedTouches[0].clientY - rect.top) * scaleY
        };
    } else {
        currentPos = getCanvasCoordinates(e, canvas);
    }

    isDragging.current = false;
    const start = dragStart.current;

    const dist = Math.sqrt(Math.pow(currentPos.x - start.x, 2) + Math.pow(currentPos.y - start.y, 2));

    if (dist < 5) {
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(currentPos.x, currentPos.y, 1, 1).data;
      setColor([pixel[0], pixel[1], pixel[2]]);
    }
  };

  const handleStart = () => {
    const video = videoRef.current;
    const finalRoi = roi || [0, video.videoHeight, 0, video.videoWidth];

    onStart({
      roi: finalRoi,
      color: color,
      colorTol,
      radius,
      radiusTol
    });
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
        videoRef.current.currentTime = time;
    }
  };

  const handleStep = (frames) => {
      if (videoRef.current) {
          // Approx 30fps
          const newTime = Math.min(Math.max(0, videoRef.current.currentTime + (frames * 0.033)), duration);
          videoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
      }
  };

  return (
    <div>
      <video ref={videoRef} style={{display: 'none'}} muted playsInline />
      <h3>SYSTEM CONFIGURATION</h3>

      <div className="configurator-container">
        {/* Left Column: Preview */}
        <div>
            <div className="canvas-wrapper">
                <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={(e) => { if(isDragging.current) handleMouseUp(e); }}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                className="canvas-preview"
                />
                {!videoLoaded && <p style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '5px'}}>LOADING SOURCE...</p>}
            </div>

            {/* Video Controls */}
            {videoLoaded && (
                <div style={{marginTop: '10px', padding: '10px', background: '#f0f0f0', border: '2px solid black'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                        <label style={{fontSize: '0.8rem', fontWeight: 'bold'}}>FRAME SELECTION</label>
                        <span style={{fontSize: '0.8rem', fontFamily: 'monospace'}}>{currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.01"
                        value={currentTime}
                        onChange={handleSeek}
                        style={{width: '100%', marginBottom: '10px'}}
                    />
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        <button onClick={() => handleStep(-1)} className="btn btn-secondary" style={{padding: '5px', fontSize: '0.8rem'}}>
                            &lt; PREV FRAME
                        </button>
                        <button onClick={() => handleStep(1)} className="btn btn-secondary" style={{padding: '5px', fontSize: '0.8rem'}}>
                            NEXT FRAME &gt;
                        </button>
                    </div>
                </div>
            )}

            <p style={{fontSize: '0.8rem', marginTop: '10px', opacity: 0.7}}>CLICK TO PICK COLOR • DRAG TO SELECT ROI</p>
            {roi && <button onClick={() => setRoi(null)} className="btn btn-secondary" style={{marginTop: '5px', padding: '5px', fontSize: '0.8rem'}}>RESET ROI (FULL SCREEN)</button>}
        </div>

        {/* Right Column: Controls */}
        <div className="controls-group">
            <div className="form-group">
                <label>Target Color</label>
                <div className="color-picker-wrapper">
                    <div
                        className="color-preview"
                        style={{ background: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                    ></div>
                    <span style={{fontFamily: 'monospace'}}>RGB({color[0]}, {color[1]}, {color[2]})</span>
                </div>
            </div>

            <div className="form-group">
                <label>
                    Color Tolerance
                    <span>{Math.round(colorTol * 100)}%</span>
                </label>
                <input
                    type="range"
                    min="0.01"
                    max="0.5"
                    step="0.01"
                    value={colorTol}
                    onChange={e => setColorTol(parseFloat(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>
                    Target Radius
                    <span>{radius}px</span>
                </label>
                <input
                    type="range"
                    min="5"
                    max="100"
                    value={radius}
                    onChange={e => setRadius(parseInt(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>
                    Radius Tolerance
                    <span>{Math.round(radiusTol * 100)}%</span>
                </label>
                <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.01"
                    value={radiusTol}
                    onChange={e => setRadiusTol(parseFloat(e.target.value))}
                />
            </div>

            <div style={{marginTop: 'auto', paddingTop: '20px', borderTop: '2px solid black'}}>
                <button onClick={handleStart} className="btn btn-primary">INITIALIZE PROCESS</button>
                <button onClick={onCancel} className="btn btn-secondary mt-3">CANCEL</button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default Configurator;
