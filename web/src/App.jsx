import React, { useState, useEffect } from 'react';
import VideoUploader from './components/VideoUploader';
import Configurator from './components/Configurator';
import { processVideo } from './utils/processor';

function App() {
  const [file, setFile] = useState(null);
  const [config, setConfig] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [opencvLoaded, setOpencvLoaded] = useState(false);

  useEffect(() => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      setOpencvLoaded(true);
      return;
    }

    const loadOpenCV = () => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.11.0/opencv.js';
      script.async = true;
      script.onload = () => {
        // Poll for cv.Mat to ensure WASM/ASM is fully initialized
        const checkCv = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(checkCv);
            setOpencvLoaded(true);
            console.log('OpenCV Fully Initialized');
          }
        }, 100);
      };
      script.onerror = () => {
        console.error('Error loading OpenCV script');
      };
      document.body.appendChild(script);
    };

    loadOpenCV();
  }, []);

  const handleStartProcessing = async (configuration) => {
    setConfig(configuration);
    setProcessing(true);
    setProgress(0);
    setResultUrl(null);

    try {
      const blob = await processVideo(file, configuration, (p) => setProgress(p));
      const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
      setResultUrl(url);
    } catch (e) {
      alert("Error processing video: " + e.message);
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  if (!opencvLoaded) {
    return (
      <div className="loading-screen">
        <h2 style={{border: 'none'}}>INITIALIZING SYSTEM</h2>
        <div className="progress-track" style={{width: '300px', border: '2px solid black'}}>
            <div className="progress-fill" style={{width: '100%', background: 'black', animation: 'indeterminate 2s infinite linear'}}></div>
        </div>
        <p style={{marginTop: '10px', fontWeight: 'bold'}}>LOADING OPENCV...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>Timelapse Filter</h1>

      {!file && (
        <VideoUploader onFileSelect={setFile} />
      )}

      {file && !processing && !resultUrl && (
        <Configurator
          file={file}
          onStart={handleStartProcessing}
          onCancel={() => setFile(null)}
        />
      )}

      {processing && (
        <div className="progress-container">
          <h3>PROCESSING</h3>
          <div className="progress-track">
            <div className="progress-fill" style={{width: `${progress}%`}}></div>
          </div>
          <p style={{textAlign: 'right', fontWeight: 'bold'}}>{progress}%</p>
        </div>
      )}

      {resultUrl && (
        <div className="result-container">
          <h3>COMPLETED</h3>
          <video src={resultUrl} controls />
          <div className="mt-3">
            <a href={resultUrl} download="processed_timelapse.mp4">
                <button className="btn btn-primary">
                DOWNLOAD VIDEO
                </button>
            </a>
          </div>
          <div className="mt-3">
            <button onClick={() => { setFile(null); setResultUrl(null); }} className="btn btn-secondary">
                RESET SYSTEM
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
