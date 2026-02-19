import React, { useState, useEffect, useRef } from 'react';

function Configurator({ file, onStart, onCancel }) {
  const [roi, setRoi] = useState(null); // [top, bottom, left, right]
  const [color, setColor] = useState([0, 255, 0]);
  const [colorTol, setColorTol] = useState(0.2);
  const [radius, setRadius] = useState(20);
  const [radiusTol, setRadiusTol] = useState(0.2);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (file) {
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        setVideoLoaded(true);
        // Draw first frame
        video.currentTime = 0;
        // Wait for seek
        setTimeout(() => {
          draw(video);
        }, 500);
      };
    }
    return () => {
      if (video.src) URL.revokeObjectURL(video.src);
    }
  }, [file]);

  const draw = (video) => {
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

    if (roi) {
      const [top, bottom, left, right] = roi;
      ctx.strokeStyle = 'red'; // Keep red for high visibility against video
      ctx.lineWidth = 2;
      ctx.strokeRect(left * scale, top * scale, (right - left) * scale, (bottom - top) * scale);
    }
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Get pixel color
    const ctx = canvas.getContext('2d');
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    setColor([pixel[0], pixel[1], pixel[2]]);
  };

  const handleStart = () => {
    // Default ROI if null
    const video = videoRef.current;
    const finalRoi = roi || [0, video.videoHeight, 0, video.videoWidth];

    onStart({
      roi: finalRoi,
      color: color, // RGB
      colorTol,
      radius,
      radiusTol
    });
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
                onClick={handleCanvasClick}
                className="canvas-preview"
                />
                {!videoLoaded && <p style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '5px'}}>LOADING SOURCE...</p>}
            </div>
            <p style={{fontSize: '0.8rem', marginTop: '10px', opacity: 0.7}}>CLICK IMAGE TO PICK COLOR TARGET</p>
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
