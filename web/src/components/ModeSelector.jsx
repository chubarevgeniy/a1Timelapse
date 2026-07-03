import React from 'react';

// Home screen: pick which tool to use.
function ModeSelector({ onSelect }) {
  return (
    <div className="mode-selector">
      <button className="mode-card" onClick={() => onSelect('filter')}>
        <span className="mode-card-icon">🎞️</span>
        <h3>TIMELAPSE FILTER</h3>
        <p>
          Clean up a printer timelapse video by keeping only the frames where
          the print head is parked in a target position.
        </p>
        <span className="mode-card-go">OPEN →</span>
      </button>

      <button className="mode-card" onClick={() => onSelect('log')}>
        <span className="mode-card-icon">🖨️</span>
        <h3>PRINTER LOG → DAVINCI</h3>
        <p>
          Parse Klipper logs, pick a print, and export an FCPXML with markers or
          cuts for DaVinci Resolve at every layer/toolchange event.
        </p>
        <span className="mode-card-go">OPEN →</span>
      </button>
    </div>
  );
}

export default ModeSelector;
