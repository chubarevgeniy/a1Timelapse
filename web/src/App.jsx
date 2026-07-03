import React, { useState, useEffect } from 'react';
import VideoUploader from './components/VideoUploader';
import Configurator from './components/Configurator';
import ModeSelector from './components/ModeSelector';
import LogProcessor from './components/LogProcessor';
import { processVideo } from './utils/processor';
import { loadOpenCV } from './utils/opencv';

function App() {
  const [mode, setMode] = useState(null); // null (home) | 'filter' | 'log'
  const [file, setFile] = useState(null);
  const [config, setConfig] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [opencvLoaded, setOpencvLoaded] = useState(false);

  // Load OpenCV in the background — only the Timelapse Filter mode needs it, so
  // it must not block the home screen or the log-processing mode.
  useEffect(() => {
    let cancelled = false;
    loadOpenCV()
      .then(() => {
        if (cancelled) return;
        setOpencvLoaded(true);
        console.log('OpenCV Fully Initialized');
      })
      .catch((e) => {
        console.error('Error loading OpenCV', e);
      });
    return () => {
      cancelled = true;
    };
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

  const goHome = () => {
    setMode(null);
    setFile(null);
    setResultUrl(null);
    setProcessing(false);
  };

  // Home screen
  if (mode === null) {
    return (
      <div className="app-container">
        <h1>3D Print Studio</h1>
        <ModeSelector onSelect={setMode} />
      </div>
    );
  }

  // Printer log -> DaVinci mode (no OpenCV needed)
  if (mode === 'log') {
    return (
      <div className="app-container">
        <h1>3D Print Studio</h1>
        <LogProcessor onBack={goHome} />
      </div>
    );
  }

  // Timelapse Filter mode
  return (
    <div className="app-container">
      <h1>Timelapse Filter</h1>

      {!opencvLoaded && !resultUrl && (
        <div className="opencv-loading">
          <span className="spinner-dot" /> LOADING OPENCV ENGINE…
        </div>
      )}

      {!file && (
        <VideoUploader onFileSelect={setFile} />
      )}

      {file && !processing && !resultUrl && (
        <Configurator
          file={file}
          onStart={handleStartProcessing}
          onCancel={() => setFile(null)}
          opencvLoaded={opencvLoaded}
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

      {!file && !processing && (
        <button onClick={goHome} className="btn btn-secondary mt-3">
          ← MODE SELECT
        </button>
      )}
    </div>
  );
}

export default App;
