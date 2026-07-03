// Generate an FCPXML (Final Cut Pro X XML) file for DaVinci Resolve from a set
// of printer events.
//
// The phone films a linear timelapse sped up by `scale` (e.g. 15x/30x), so an
// event that happened `offsetSec` of real seconds after the print started lands
// at `offsetSec / scale` seconds on the video timeline. We quantise that to the
// timeline frame rate so the values are frame-accurate (FCPXML requires rational
// times that are whole multiples of the frame duration).
//
// Two output styles:
//   markers -> one clip with a marker at every event (nudge clip or markers in
//              DaVinci to sync, then use them as cut/keep references).
//   cuts    -> the clip is razored into a separate segment at every event, so
//              each segment can be trimmed/kept independently.

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Rational time string in frames, e.g. 150 frames @30 -> "150/30s".
const t = (frames, fps) => `${Math.round(frames)}/${fps}s`;

/**
 * @param {object} opts
 *   printName      display name for the project/clip
 *   events         [{ offsetSec, label }]  (real-time offsets from print start)
 *   scale          timelapse speed factor (real / video), e.g. 15
 *   fps            timeline frame rate (integer), e.g. 30
 *   mode           'markers' | 'cuts'
 *   videoName      media file name to reference (relinked in DaVinci)
 *   width, height  timeline resolution (cosmetic; default 1920x1080)
 *   tailSec        extra video seconds kept after the last event (default 5)
 * @returns {string} FCPXML document
 */
export function buildFcpxml(opts) {
  const {
    printName = 'Print',
    events = [],
    scale = 15,
    fps = 30,
    mode = 'markers',
    videoName = 'timelapse.mp4',
    width = 1920,
    height = 1080,
    tailSec = 5,
  } = opts;

  const safeScale = scale > 0 ? scale : 1;

  // Map events -> timeline frames, ordered & de-duplicated on frame.
  const frames = [];
  const seen = new Set();
  for (const e of [...events].sort((a, b) => a.offsetSec - b.offsetSec)) {
    const f = Math.round((e.offsetSec / safeScale) * fps);
    if (seen.has(f)) continue; // avoid zero-length segments / stacked markers
    seen.add(f);
    frames.push({ f, label: e.label });
  }

  const lastFrame = frames.length ? frames[frames.length - 1].f : 0;
  const totalFrames = lastFrame + Math.max(1, Math.round(tailSec * fps));
  const totalStr = t(totalFrames, fps);
  const frameDur = `1/${fps}s`;
  const name = xmlEscape(printName);

  const header =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE fcpxml>\n` +
    `<fcpxml version="1.9">\n` +
    `  <resources>\n` +
    `    <format id="r1" name="FFVideoFormat${fps}p" frameDuration="${frameDur}" width="${width}" height="${height}"/>\n` +
    `    <asset id="a1" name="${xmlEscape(videoName)}" start="0s" duration="${totalStr}" hasVideo="1" format="r1" videoSources="1">\n` +
    `      <media-rep kind="original-media" src="file://localhost/${xmlEscape(encodeURI(videoName))}"/>\n` +
    `    </asset>\n` +
    `  </resources>\n` +
    `  <library>\n` +
    `    <event name="Klipper Timelapse">\n` +
    `      <project name="${name}">\n` +
    `        <sequence format="r1" duration="${totalStr}" tcStart="0s" tcFormat="NDF">\n` +
    `          <spine>\n`;

  let spine = '';
  if (mode === 'cuts' && frames.length) {
    // Boundaries at 0, each event frame, and the end.
    const bounds = [0, ...frames.map((x) => x.f).filter((f) => f > 0), totalFrames];
    for (let i = 0; i < bounds.length - 1; i++) {
      const f0 = bounds[i];
      const f1 = bounds[i + 1];
      if (f1 <= f0) continue;
      const seg = frames.find((x) => x.f === f0);
      const segName = xmlEscape(seg ? `${printName} · ${seg.label}` : printName);
      spine +=
        `            <asset-clip ref="a1" lane="0" offset="${t(f0, fps)}" ` +
        `name="${segName}" start="${t(f0, fps)}" duration="${t(f1 - f0, fps)}" format="r1"/>\n`;
    }
  } else {
    // Single clip carrying all markers.
    const markers = frames
      .map(
        (x) =>
          `              <marker start="${t(x.f, fps)}" duration="${frameDur}" ` +
          `value="${xmlEscape(x.label)}"/>\n`
      )
      .join('');
    spine +=
      `            <asset-clip ref="a1" offset="0s" name="${name}" ` +
      `start="0s" duration="${totalStr}" format="r1">\n` +
      markers +
      `            </asset-clip>\n`;
  }

  const footer =
    `          </spine>\n` +
    `        </sequence>\n` +
    `      </project>\n` +
    `    </event>\n` +
    `  </library>\n` +
    `</fcpxml>\n`;

  return header + spine + footer;
}
