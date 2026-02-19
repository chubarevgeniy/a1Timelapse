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
      ctx.strokeStyle = 'red';
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
      <h3>Configure</h3>
      <div style={{position: 'relative', width: 'fit-content', margin: '0 auto'}}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{border: '1px solid #ccc', cursor: 'crosshair', maxWidth: '100%'}}
        />
        {!videoLoaded && <p>Loading video...</p>}
      </div>

      <div style={{marginTop: 20}}>
        <div style={{marginBottom: 10}}>
          <label>Selected Color:</label>
          <div style={{
            display: 'inline-block', width: 30, height: 30,
            background: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
            verticalAlign: 'middle', marginLeft: 10, border: '1px solid #ccc'
          }}></div>
          <span style={{marginLeft: 10}}>Click image to pick</span>
        </div>

        <div style={{marginBottom: 10}}>
          <label>Color Tolerance: {colorTol}</label>
          <input type="range" min="0.01" max="0.5" step="0.01" value={colorTol} onChange={e => setColorTol(parseFloat(e.target.value))} style={{width: '100%'}}/>
        </div>

        <div style={{marginBottom: 10}}>
          <label>Target Radius: {radius}</label>
          <input type="range" min="5" max="100" value={radius} onChange={e => setRadius(parseInt(e.target.value))} style={{width: '100%'}}/>
        </div>

        <div style={{marginBottom: 10}}>
          <label>Radius Tolerance: {radiusTol}</label>
          <input type="range" min="0.01" max="1.0" step="0.01" value={radiusTol} onChange={e => setRadiusTol(parseFloat(e.target.value))} style={{width: '100%'}}/>
        </div>

        <div style={{marginTop: 20}}>
          <button onClick={handleStart} style={{width: '100%', padding: 15, background: '#007bff', color: 'white', border: 'none', borderRadius: 5, fontSize: 18}}>Start Processing</button>
          <button onClick={onCancel} style={{width: '100%', padding: 10, marginTop: 10, background: '#ccc', border: 'none', borderRadius: 5}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default Configurator;
