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
    const interval = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setOpencvLoaded(true);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
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

  if (!opencvLoaded) return <div style={{padding: 20}}>Loading OpenCV...</div>;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h1>Timelapse Filter (Web)</h1>

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
        <div style={{textAlign: 'center', marginTop: 50}}>
          <h3>Processing...</h3>
          <div style={{width: '100%', background: '#eee', height: 20, borderRadius: 10, overflow: 'hidden'}}>
            <div style={{width: `${progress}%`, background: '#007bff', height: '100%', transition: 'width 0.2s'}}></div>
          </div>
          <p>{progress}%</p>
        </div>
      )}

      {resultUrl && (
        <div style={{textAlign: 'center'}}>
          <h3>Complete!</h3>
          <video src={resultUrl} controls style={{maxWidth: '100%'}} />
          <br/><br/>
          <a href={resultUrl} download="processed_timelapse.mp4">
            <button style={{padding: '10px 20px', fontSize: 16, background: '#28a745', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer'}}>
              Download Video
            </button>
          </a>
          <br/><br/>
          <button onClick={() => { setFile(null); setResultUrl(null); }} style={{background: '#6c757d', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 5, cursor: 'pointer'}}>
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
