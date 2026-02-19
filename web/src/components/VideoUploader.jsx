import React from 'react';

function VideoUploader({ onFileSelect }) {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="uploader">
      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        style={{display: 'none'}}
        id="file-upload"
      />
      <label htmlFor="file-upload" style={{cursor: 'pointer', display: 'block'}}>
        <span className="uploader-icon">📹</span>
        <br/>
        <h3>INPUT SOURCE</h3>
        <p style={{textTransform: 'uppercase', fontSize: '0.8rem'}}>Supported Formats: MP4, WEBM</p>
        <div style={{marginTop: '20px', border: '1px solid black', padding: '10px', display: 'inline-block'}}>
            SELECT FILE
        </div>
      </label>
    </div>
  );
}

export default VideoUploader;
