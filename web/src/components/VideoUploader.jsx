import React from 'react';

function VideoUploader({ onFileSelect }) {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div style={{
      border: '2px dashed #ccc',
      padding: 50,
      textAlign: 'center',
      borderRadius: 10,
      background: '#f9f9f9',
      cursor: 'pointer'
    }}>
      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        style={{display: 'none'}}
        id="file-upload"
      />
      <label htmlFor="file-upload" style={{cursor: 'pointer', display: 'block'}}>
        <span style={{fontSize: 50}}>📹</span>
        <br/>
        <h3>Select Video File</h3>
        <p>Supports MP4, WebM, etc.</p>
      </label>
    </div>
  );
}

export default VideoUploader;
