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
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      setOpencvLoaded(true);
      return;
    }

    const loadOpenCV = async () => {
      try {
        const response = await fetch('https://docs.opencv.org/4.11.0/opencv.js');
        if (!response.ok) throw new Error('Failed to load OpenCV');

        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          if (total) {
            setLoadingProgress(Math.round((loaded / total) * 100));
          }
        }

        const blob = new Blob(chunks, { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
          setOpencvLoaded(true);
          URL.revokeObjectURL(url);
          console.log('OpenCV Loaded via Blob');
        };
        script.onerror = () => {
            console.error('Error loading OpenCV script');
        };
        document.body.appendChild(script);

      } catch (err) {
        console.error('Error fetching OpenCV:', err);
        // Fallback to normal script tag if fetch fails (e.g. CORS)
        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.11.0/opencv.js';
        script.async = true;
        script.onload = () => setOpencvLoaded(true);
        document.body.appendChild(script);
      }
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
            <div className="progress-fill" style={{width: `${loadingProgress}%`, background: 'black'}}></div>
        </div>
        <p style={{marginTop: '10px', fontWeight: 'bold'}}>LOADING OPENCV... {loadingProgress}%</p>
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
