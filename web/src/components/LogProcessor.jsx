import React, { useState, useMemo, useCallback } from 'react';
import { parseLogs, extractEvents, FEATURES } from '../utils/klipperLog';
import { buildFcpxml } from '../utils/fcpxml';
import VideoTrimmer from './VideoTrimmer';

const fmtDur = (s) => {
  if (s == null) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0
    ? `${h}h${String(m).padStart(2, '0')}m`
    : `${m}m${String(sec).padStart(2, '0')}s`;
};

const fmtDate = (d) =>
  d
    ? d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function LogProcessor({ onBack }) {
  const [stage, setStage] = useState('upload'); // upload | prints | configure | done
  const [parsed, setParsed] = useState(null);
  const [fileNames, setFileNames] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Configuration
  const [featureId, setFeatureId] = useState('toolchange');
  const [customRegex, setCustomRegex] = useState('');
  const [customGroup, setCustomGroup] = useState('0');
  const [scale, setScale] = useState(15);
  const [fps, setFps] = useState(30);
  const [mode, setMode] = useState('markers'); // markers | cuts
  const [videoName, setVideoName] = useState('timelapse.mp4');
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('markers.fcpxml');

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError(null);
    try {
      const entries = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() }))
      );
      const result = parseLogs(entries);
      setParsed(result);
      setFileNames(files.map((f) => f.name));
      if (!result.prints.length) {
        setError(
          'No prints found in these logs. Make sure you uploaded real klippy.log files (they contain "Starting SD card print" lines).'
        );
        return;
      }
      setStage('prints');
    } catch (e) {
      console.error(e);
      setError('Failed to read logs: ' + e.message);
    }
  };

  const feature = useMemo(() => {
    const base = FEATURES[featureId];
    if (featureId === 'custom') {
      return { ...base, regex: customRegex, group: parseInt(customGroup, 10) || 0 };
    }
    return base;
  }, [featureId, customRegex, customGroup]);

  const events = useMemo(() => {
    if (!parsed || !selected) return [];
    return extractEvents(parsed, selected, feature);
  }, [parsed, selected, feature]);

  const selectPrint = (p) => {
    setSelected(p);
    setVideoName((p.filename || 'timelapse').replace(/\.gcode$/i, '') + '.mp4');
    setStage('configure');
  };

  const generate = useCallback(() => {
    if (!selected) return;
    const xml = buildFcpxml({
      printName: selected.filename,
      events,
      scale: Number(scale) || 1,
      fps: Number(fps) || 30,
      mode,
      videoName: videoName || 'timelapse.mp4',
    });
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const base = (selected.filename || 'print').replace(/\.gcode$/i, '');
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setDownloadName(`${base}_${mode}.fcpxml`);
    setStage('done');
  }, [selected, events, scale, fps, mode, videoName]);

  const reset = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setStage('prints');
  };

  // ---- Render ----------------------------------------------------------

  if (stage === 'upload') {
    return (
      <div>
        <h3>PRINTER LOG → DAVINCI</h3>
        <div className="uploader">
          <input
            type="file"
            accept=".log,.log.1,.txt,text/plain"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
            id="log-upload"
          />
          <label htmlFor="log-upload" style={{ cursor: 'pointer', display: 'block' }}>
            <span className="uploader-icon">🗒️</span>
            <br />
            <h3>KLIPPER LOGS</h3>
            <p style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>
              Select one or more klippy.log files (.log, .log.1 …)
            </p>
            <div
              style={{
                marginTop: '20px',
                border: '1px solid black',
                padding: '10px',
                display: 'inline-block',
              }}
            >
              SELECT LOG FILES
            </div>
          </label>
        </div>
        <p style={{ fontSize: '0.8rem', marginTop: '15px', opacity: 0.7 }}>
          Logs are rotated at 10&nbsp;MB — upload all the parts that cover your
          print and they'll be stitched together. Everything runs locally in your
          browser.
        </p>
        {error && <p className="log-error">{error}</p>}
        <button onClick={onBack} className="btn btn-secondary mt-3">
          ← MODE SELECT
        </button>
      </div>
    );
  }

  if (stage === 'prints') {
    return (
      <div>
        <h3>SELECT PRINT</h3>
        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
          Parsed {fileNames.length} file(s). Only prints whose start AND end are
          inside the logs can be processed.
        </p>
        <div className="print-list">
          {parsed.prints.map((p, i) => {
            const disabled = !p.complete;
            return (
              <button
                key={i}
                className={`print-row ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && selectPrint(p)}
                disabled={disabled}
                title={
                  disabled
                    ? 'This print is not fully contained in the loaded logs'
                    : 'Process this print'
                }
              >
                <span className="print-name">{p.filename}</span>
                <span className="print-meta">
                  <span className="print-time">{fmtDate(p.startDate)}</span>
                  <span className="print-dur">{fmtDur(p.durationSec)}</span>
                  <span
                    className={`print-badge ${
                      p.complete ? (p.aborted ? 'warn' : 'ok') : 'bad'
                    }`}
                  >
                    {p.complete ? (p.aborted ? 'ABORTED' : 'COMPLETE') : 'PARTIAL'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3" style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setStage('upload')} className="btn btn-secondary">
            ← LOGS
          </button>
          <button onClick={onBack} className="btn btn-secondary">
            MODE SELECT
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'configure') {
    const f = FEATURES[featureId];
    return (
      <div>
        <h3>CONFIGURE EXPORT</h3>
        <div className="cfg-print-head">
          <strong>{selected.filename}</strong>
          <span>
            {fmtDate(selected.startDate)} · {fmtDur(selected.durationSec)}
            {selected.aborted ? ' · aborted' : ''}
          </span>
        </div>

        <div className="controls-group" style={{ marginTop: '20px' }}>
          {/* Feature */}
          <div className="form-group">
            <label>Feature to mark</label>
            <select
              value={featureId}
              onChange={(e) => setFeatureId(e.target.value)}
              className="log-select"
            >
              {Object.values(FEATURES).map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.name}
                </option>
              ))}
            </select>
            <p className="field-hint">{f.hint}</p>
            {featureId === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  className="log-input"
                  style={{ flex: 2 }}
                  placeholder="e.g. CURRENT_LAYER=(\d+)"
                  value={customRegex}
                  onChange={(e) => setCustomRegex(e.target.value)}
                />
                <input
                  className="log-input"
                  style={{ flex: 1 }}
                  type="number"
                  min="0"
                  title="Regex capture group to use as the label (0 = whole match)"
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Time scale */}
          <div className="form-group">
            <label>
              Timelapse speed (video is real&nbsp;time&nbsp;÷&nbsp;scale)
              <span>{scale}x</span>
            </label>
            <div className="chip-row">
              {[15, 30].map((s) => (
                <button
                  key={s}
                  className={`chip ${Number(scale) === s ? 'active' : ''}`}
                  onClick={() => setScale(s)}
                >
                  {s}x
                </button>
              ))}
              <input
                className="log-input"
                type="number"
                min="0.1"
                step="0.1"
                style={{ width: '90px' }}
                value={scale}
                onChange={(e) => setScale(e.target.value)}
              />
            </div>
          </div>

          {/* Output mode */}
          <div className="form-group">
            <label>Output</label>
            <div className="chip-row">
              <button
                className={`chip ${mode === 'markers' ? 'active' : ''}`}
                onClick={() => setMode('markers')}
              >
                MARKERS
              </button>
              <button
                className={`chip ${mode === 'cuts' ? 'active' : ''}`}
                onClick={() => setMode('cuts')}
              >
                CUTS (RAZOR)
              </button>
            </div>
            <p className="field-hint">
              {mode === 'markers'
                ? 'One clip with a marker at every event. Nudge the clip or markers in DaVinci to sync.'
                : 'The clip is split into a separate segment at every event so you can keep/trim each one.'}
            </p>
          </div>

          {/* Advanced */}
          <div className="form-group">
            <label>Video file name (for relink in DaVinci)</label>
            <input
              className="log-input"
              value={videoName}
              onChange={(e) => setVideoName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>
              Timeline frame rate
              <span>{fps} fps</span>
            </label>
            <div className="chip-row">
              {[24, 25, 30, 60].map((v) => (
                <button
                  key={v}
                  className={`chip ${Number(fps) === v ? 'active' : ''}`}
                  onClick={() => setFps(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Event summary */}
          <div className="event-summary">
            <strong>{events.length}</strong> event(s) detected
            {events.length > 0 && (
              <span>
                {' '}
                · first at +{fmtDur(events[0].offsetSec)} → video{' '}
                {(events[0].offsetSec / (Number(scale) || 1)).toFixed(1)}s
              </span>
            )}
            {events.length > 0 && (
              <div className="event-preview">
                {events.slice(0, 6).map((e, i) => (
                  <span key={i} className="event-chip">
                    {fmtDur(e.offsetSec)} {e.label}
                  </span>
                ))}
                {events.length > 6 && (
                  <span className="event-chip more">+{events.length - 6}</span>
                )}
              </div>
            )}
            {events.length === 0 && (
              <p className="field-hint" style={{ marginTop: '6px' }}>
                No matching events in this print. Try another feature or a custom
                pattern.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setStage('prints')} className="btn btn-secondary">
              ← BACK
            </button>
            <button
              onClick={() => setStage('preview')}
              className="btn btn-secondary"
              disabled={events.length === 0}
              style={{ flex: 1, minWidth: '160px' }}
            >
              PREVIEW &amp; TRIM ▶
            </button>
            <button
              onClick={generate}
              className="btn btn-primary"
              disabled={events.length === 0}
              style={{ flex: 1, minWidth: '160px' }}
            >
              EXPORT FCPXML
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'preview') {
    return (
      <VideoTrimmer
        events={events}
        scale={Number(scale) || 1}
        printName={selected.filename}
        onBack={() => setStage('configure')}
      />
    );
  }

  // done
  return (
    <div className="result-container">
      <h3>EXPORT READY</h3>
      <p>
        {events.length} {mode === 'cuts' ? 'cuts' : 'markers'} for{' '}
        <strong>{selected.filename}</strong> at {scale}x.
      </p>
      <div className="mt-3">
        <a href={downloadUrl} download={downloadName}>
          <button className="btn btn-primary">DOWNLOAD {downloadName}</button>
        </a>
      </div>
      <ol className="howto">
        <li>In DaVinci Resolve: <em>File → Import → Timeline…</em> and pick this .fcpxml.</li>
        <li>Relink the offline clip to your phone's timelapse video.</li>
        <li>Slide the clip (or the markers) along the timeline to line up event #1, then fine-tune.</li>
      </ol>
      <div className="mt-3" style={{ display: 'flex', gap: '10px' }}>
        <button onClick={reset} className="btn btn-secondary">
          ANOTHER PRINT
        </button>
        <button onClick={onBack} className="btn btn-secondary">
          MODE SELECT
        </button>
      </div>
    </div>
  );
}

export default LogProcessor;
