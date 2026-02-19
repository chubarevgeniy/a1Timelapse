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

  const [isColorPicking, setIsColorPicking] = useState(false);
  const [tempColor, setTempColor] = useState(null);
  const [magnifier, setMagnifier] = useState({ visible: false, x: 0, y: 0, content: null });

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

  const getClampedCoordinates = (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rawX = (clientX - rect.left) * scaleX;
      const rawY = (clientY - rect.top) * scaleY;

      return {
          x: Math.min(Math.max(0, rawX), canvas.width),
          y: Math.min(Math.max(0, rawY), canvas.height),
          clientX,
          clientY
      };
  };

  const updateMagnifier = (x, y, canvas) => {
      const ctx = canvas.getContext('2d');
      // Get 10x10 area around cursor
      const sx = Math.max(0, Math.min(canvas.width - 10, x - 5));
      const sy = Math.max(0, Math.min(canvas.height - 10, y - 5));

      try {
          const pixelData = ctx.getImageData(sx, sy, 10, 10);

          // Create a temp canvas to convert to data URL
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 10;
          tempCanvas.height = 10;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.putImageData(pixelData, 0, 0);

          setMagnifier(prev => ({
              ...prev,
              content: tempCanvas.toDataURL()
          }));
      } catch (e) {
          console.error("Failed to update magnifier", e);
      }
  };

  const handleGlobalMove = useCallback((e) => {
    if (!isDragging.current || !canvasRef.current) return;
    // Prevent scrolling on touch devices
    if (e.cancelable && e.preventDefault) e.preventDefault();

    const canvas = canvasRef.current;
    const coords = getClampedCoordinates(e, canvas);
    const { x, y, clientX, clientY } = coords;

    // Update Magnifier
    updateMagnifier(x, y, canvas);
    setMagnifier(prev => ({ ...prev, visible: true, x: clientX, y: clientY }));

    if (isColorPicking) {
         const ctx = canvas.getContext('2d');
         // Get color at exact pixel
         try {
             // Use raw coords or clamped? Clamped ensures we are in canvas.
             const p = ctx.getImageData(x, y, 1, 1).data;
             setTempColor([p[0], p[1], p[2]]);
         } catch(err) {}
    } else {
        // Update ROI
         const start = dragStart.current;
         if (!start) return;

         // Convert current canvas coords to video coords
         const video = videoRef.current;
         const scaleX = video.videoWidth / canvas.width;
         const scaleY = video.videoHeight / canvas.height;

         const cTop = Math.min(start.y, y);
         const cBottom = Math.max(start.y, y);
         const cLeft = Math.min(start.x, x);
         const cRight = Math.max(start.x, x);

         setRoi([
             cTop * scaleY,
             cBottom * scaleY,
             cLeft * scaleX,
             cRight * scaleX
         ]);
    }
  }, [isColorPicking]); // getClampedCoordinates and updateMagnifier are constant if defined outside or refs?
  // Actually getClampedCoordinates and updateMagnifier are defined in the component scope.
  // If they rely on props/state they change. They don't seem to rely on state.
  // BUT I did not wrapping them in useCallback.
  // It's safer to include them in dependency array or make them stable.
  // Since they are just helper functions defined in render, they change every render.
  // This causes handleGlobalMove to change every render, re-attaching listeners.
  // It is fine but less efficient.

  const handleGlobalUp = useCallback(() => {
    isDragging.current = false;
    setMagnifier(prev => ({ ...prev, visible: false }));

    window.removeEventListener('mousemove', handleGlobalMove);
    window.removeEventListener('mouseup', handleGlobalUp);
    window.removeEventListener('touchmove', handleGlobalMove);
    window.removeEventListener('touchend', handleGlobalUp);
  }, [handleGlobalMove]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Stop event defaults if possible
    // if (e.cancelable && e.preventDefault) e.preventDefault();
    // ^ Don't prevent default on start always, might block click.
    // But for canvas drawing usually we do.

    isDragging.current = true;

    // We use getClampedCoordinates but since we started IN canvas, it matches.
    const coords = getClampedCoordinates(e, canvas);
    dragStart.current = { x: coords.x, y: coords.y };

    // Initial Magnifier
    updateMagnifier(coords.x, coords.y, canvas);
    setMagnifier({ visible: true, x: coords.clientX, y: coords.clientY, content: null });

    // Attach global listeners
    window.addEventListener('mousemove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);
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
                onPointerDown={handlePointerDown}
                className="canvas-preview"
                style={{ touchAction: 'none' }}
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
                {isColorPicking ? (
                    <div style={{border: '2px solid black', padding: '10px', background: '#fff'}}>
                        <p style={{margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 'bold'}}>DRAG ON VIDEO TO PICK</p>
                        <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
                            <div
                                className="color-preview"
                                style={{
                                    background: tempColor ? `rgb(${tempColor[0]}, ${tempColor[1]}, ${tempColor[2]})` : `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                                }}
                            ></div>
                            <span style={{fontFamily: 'monospace'}}>
                                {tempColor ? `RGB(${tempColor.join(',')})` : '...'}
                            </span>
                        </div>
                        <div style={{display: 'flex', gap: '5px'}}>
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    if(tempColor) setColor(tempColor);
                                    setIsColorPicking(false);
                                    setTempColor(null);
                                }}
                            >
                                CONFIRM
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setIsColorPicking(false);
                                    setTempColor(null);
                                }}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="color-picker-wrapper">
                        <div
                            className="color-preview"
                            style={{ background: `rgb(${color[0]}, ${color[1]}, ${color[2]})`, cursor: 'pointer' }}
                            onClick={() => setIsColorPicking(true)}
                            title="Click to pick from video"
                        ></div>
                        <span style={{fontFamily: 'monospace'}}>RGB({color[0]}, {color[1]}, {color[2]})</span>
                        <button
                            className="btn btn-secondary"
                            style={{width: 'auto', padding: '5px 10px', marginLeft: 'auto', fontSize: '0.7rem'}}
                            onClick={() => setIsColorPicking(true)}
                        >
                            PICK
                        </button>
                    </div>
                )}
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

      {magnifier.visible && (
        <div
            className="magnifier"
            style={{
                left: magnifier.x,
                top: magnifier.y
            }}
        >
            {magnifier.content && <img src={magnifier.content} alt="" style={{width: '100%', height: '100%', imageRendering: 'pixelated'}} />}
            <div className="magnifier-crosshair"></div>
        </div>
      )}
    </div>
  );
}

export default Configurator;
