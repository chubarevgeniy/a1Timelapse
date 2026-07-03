// Parser for Klipper (klippy.log) files.
//
// Klipper logs each line with a wall-clock time-of-day prefix ("HH:MM:SS.mmm:")
// which resets every midnight and can jump around on reboots / NTP syncs. The
// only clock that is globally monotonic and continuous (even across the several
// rotated files a long session produces) is the reactor time reported by the
// periodic "Stats <seconds>:" lines. We therefore reconstruct a single
// monotonic timeline for every line by anchoring it to the nearest Stats line,
// and use that as the master clock for everything (print pairing, event
// offsets). Absolute wall-clock dates are only used for display.

const LINE_RE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3}):(.*)$/;
const STATS_RE = /^Stats (\d+(?:\.\d+)?):/;
const START_RE = /^Starting SD card print, file: (.*), position \d+/;
const EXITING_RE = /^Exiting SD card print, lines=(\d+)/;
const ROLLOVER_RE = /(?:Log rollover at|Start printer at) (.+?)(?:\s*\(|\s*={3,}|$)/;

const HALF_DAY = 43200; // seconds
const FULL_DAY = 86400;

// Built-in feature detectors. Each returns a label (string) when a runtime line
// (text after the timestamp prefix) matches, or null otherwise.
export const FEATURES = {
  toolchange: {
    id: 'toolchange',
    name: 'Print-head change (toolchange)',
    hint: 'Fires on every extruder/tool activation — the "смена печатной головы" event.',
    detect: (text) => {
      const m = /^Activating extruder (\S+)/.exec(text);
      return m ? `→ ${m[1]}` : null;
    },
  },
  park: {
    id: 'park',
    name: 'Head park',
    hint: 'Fires when a head is parked before a toolchange.',
    detect: (text) => {
      const m = /^park (\S+) !!!/.exec(text);
      return m ? `park ${m[1]}` : null;
    },
  },
  pick: {
    id: 'pick',
    name: 'Head pick',
    hint: 'Fires when a head is picked up for a toolchange.',
    detect: (text) => {
      const m = /^pick (\S+) !!!/.exec(text);
      return m ? `pick ${m[1]}` : null;
    },
  },
  timelapse: {
    id: 'timelapse',
    name: 'Timelapse frame (custom marker)',
    hint: 'Fires on the "TIMELAPSE_LOG_FRAME" marker you add next to TIMELAPSE_TAKE_FRAME in OrcaSlicer (see "How to log every timelapse frame" below). It lands at the stable parked snapshot on every layer, so keeping only these frames drops the up/down bed jitter from the toolchange.',
    detect: (text) => {
      // The firmware doesn't log layer changes, but it does log any command it
      // doesn't recognise ("Unknown command:\"X\""). A throwaway command added
      // after TIMELAPSE_TAKE_FRAME therefore becomes a per-frame marker.
      const m = /^Unknown command:"TIMELAPSE_LOG_FRAME"/.exec(text);
      return m ? 'frame' : null;
    },
  },
  custom: {
    id: 'custom',
    name: 'Custom pattern (regex)',
    hint: 'Layer changes are NOT written to this firmware\'s klippy.log. If you add a macro that logs them (or want any other line), match it here with a regular expression.',
    detect: null, // handled specially with a user-supplied RegExp
  },
};

function wrapToNearest(delta) {
  // Bring a time-of-day delta into (-HALF_DAY, HALF_DAY] so a Stats line and a
  // nearby event (which are always <~2 s apart in reality) resolve to the true
  // sub-minute offset regardless of midnight wraps or clock jumps between them.
  while (delta > HALF_DAY) delta -= FULL_DAY;
  while (delta <= -HALF_DAY) delta += FULL_DAY;
  return delta;
}

function parseRolloverDate(text) {
  // e.g. "Fri Jul  3 14:34:06 2026" -> Date
  const m = ROLLOVER_RE.exec(text);
  if (!m) return null;
  const d = new Date(m[1].trim());
  return isNaN(d.getTime()) ? null : d;
}

function basename(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

// Parse a single file's text into an array of line records.
function parseFile(name, text) {
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  let rolloverDate = null;
  let firstStatsMono = Infinity;

  for (const raw of rawLines) {
    const m = LINE_RE.exec(raw);
    if (!m) {
      // Non-timestamped line (config block, banners…). Still scan for the
      // rollover/start banner so we can label prints with a real date.
      if (rolloverDate === null) {
        const d = parseRolloverDate(raw);
        if (d) rolloverDate = d;
      }
      continue;
    }
    const wallSod =
      (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const body = m[5];
    if (rolloverDate === null) {
      const d = parseRolloverDate(body);
      if (d) rolloverDate = d;
    }
    let mono = null;
    const sm = STATS_RE.exec(body);
    if (sm) {
      mono = parseFloat(sm[1]);
      if (mono < firstStatsMono) firstStatsMono = mono;
    }
    lines.push({ wallSod, body, mono });
  }

  return {
    name,
    rolloverDate,
    firstStatsMono: firstStatsMono === Infinity ? null : firstStatsMono,
    lines,
  };
}

// Merge parsed files into one chronologically-ordered stream and assign a
// continuous monotonic time to every line.
function buildTimeline(files) {
  // Order files by their first monotonic Stats value (globally continuous),
  // falling back to rollover date if a file has no Stats.
  const ordered = [...files].sort((a, b) => {
    if (a.firstStatsMono != null && b.firstStatsMono != null)
      return a.firstStatsMono - b.firstStatsMono;
    const ad = a.rolloverDate ? a.rolloverDate.getTime() : 0;
    const bd = b.rolloverDate ? b.rolloverDate.getTime() : 0;
    return ad - bd;
  });

  const stream = []; // { wallSod, body, mono|null, fileIndex }
  const firstIdxOfFile = []; // stream index of each file's first line
  ordered.forEach((f, fileIndex) => {
    firstIdxOfFile[fileIndex] = stream.length;
    for (const ln of f.lines) stream.push({ ...ln, fileIndex });
  });

  // Collect Stats anchors (index into stream + mono).
  const anchorIdx = [];
  const anchorMono = [];
  const anchorWall = [];
  stream.forEach((ln, i) => {
    if (ln.mono != null) {
      anchorIdx.push(i);
      anchorMono.push(ln.mono);
      anchorWall.push(ln.wallSod);
    }
  });

  // Assign monotonic time to every line via the nearest Stats anchor.
  const nAnchors = anchorIdx.length;
  for (let i = 0; i < stream.length; i++) {
    const ln = stream[i];
    if (ln.mono != null) {
      ln.t = ln.mono;
      continue;
    }
    if (nAnchors === 0) {
      ln.t = ln.wallSod; // degenerate: no Stats at all
      continue;
    }
    // Binary search for insertion point of i in anchorIdx.
    let lo = 0,
      hi = nAnchors - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchorIdx[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    // Candidate nearest anchors: lo and lo-1.
    let best = lo;
    if (lo > 0 && Math.abs(anchorIdx[lo - 1] - i) <= Math.abs(anchorIdx[lo] - i))
      best = lo - 1;
    ln.t = anchorMono[best] + wrapToNearest(ln.wallSod - anchorWall[best]);
  }

  // Absolute-time anchors. Each rollover/start banner gives a real datetime
  // (date AND time-of-day), and the config dump at the top of the file happens
  // at that same instant — so we pair the banner's datetime with the monotonic
  // time of the file's first line. Every other line's absolute date is then
  // derived from the continuous monotonic clock, which is why a single file
  // that spans several days (one banner, but the printer never restarted) no
  // longer collapses every print onto the banner's calendar day.
  const anchors = ordered.map((f, k) => {
    if (!f.rolloverDate) return null;
    const fi = firstIdxOfFile[k];
    if (fi == null || fi >= stream.length || stream[fi].fileIndex !== k)
      return null;
    return { absMs: f.rolloverDate.getTime(), mono: stream[fi].t };
  });
  // A file without a banner (e.g. a middle rotation) inherits its neighbour's
  // anchor — the monotonic clock is continuous across rotations, so any single
  // anchor dates the whole session correctly.
  for (let k = 1; k < anchors.length; k++)
    if (!anchors[k]) anchors[k] = anchors[k - 1];
  for (let k = anchors.length - 2; k >= 0; k--)
    if (!anchors[k]) anchors[k] = anchors[k + 1];

  return { stream, ordered, anchors };
}

function absDateForLine(anchors, ln) {
  const a = anchors[ln.fileIndex];
  if (!a) return null;
  return new Date(a.absMs + (ln.t - a.mono) * 1000);
}

// Detect prints in the merged stream. A print is "complete" only if we saw both
// its start and its end within the loaded logs.
function detectPrints(stream, anchors) {
  const prints = [];
  let cur = null;

  const close = (endIdx, aborted) => {
    if (!cur) return;
    cur.endIndex = endIdx;
    cur.endT = stream[endIdx].t;
    cur.aborted = aborted;
    cur.complete = true;
    cur.durationSec = Math.max(0, cur.endT - cur.startT);
    prints.push(cur);
    cur = null;
  };

  for (let i = 0; i < stream.length; i++) {
    const body = stream[i].body;

    const sm = START_RE.exec(body);
    if (sm) {
      // A new start while one is open => previous never finished in-log.
      if (cur) {
        cur.complete = false;
        prints.push(cur);
        cur = null;
      }
      const path = sm[1].trim();
      cur = {
        filename: basename(path),
        path,
        startIndex: i,
        startT: stream[i].t,
        startDate: absDateForLine(anchors, stream[i]),
        finishedFlag: false,
      };
      continue;
    }

    if (cur) {
      if (body.startsWith('Finished SD card print')) {
        cur.finishedFlag = true;
        continue;
      }
      const em = EXITING_RE.exec(body);
      if (em) {
        const linesLeft = parseInt(em[1], 10);
        // "Finished" immediately before, or 0 lines left => clean completion.
        close(i, !cur.finishedFlag && linesLeft > 0);
        continue;
      }
    }
  }

  // Any still-open print reached the end of the logs without finishing.
  if (cur) {
    cur.complete = false;
    prints.push(cur);
  }

  return prints;
}

/**
 * Parse an array of { name, text } log files.
 * Returns { prints, stream, ordered } where prints[] each have:
 *   filename, path, startT, endT?, durationSec?, complete, aborted?, startDate?,
 *   startIndex, endIndex?
 * The returned stream/ordered are needed by extractEvents().
 */
export function parseLogs(fileEntries) {
  const files = fileEntries.map((f) => parseFile(f.name, f.text));
  const { stream, ordered, anchors } = buildTimeline(files);
  const prints = detectPrints(stream, anchors);
  return { prints, stream, ordered, anchors };
}

/**
 * Extract feature events for a given print.
 * @param {object} parsed  result of parseLogs()
 * @param {object} print   one entry from parsed.prints (must be complete)
 * @param {object} feature { detect } from FEATURES, or a custom { regex, group }
 * Returns [{ offsetSec, label, absDate? }] sorted by time.
 */
export function extractEvents(parsed, print, feature) {
  const { stream, anchors } = parsed;
  const out = [];
  if (print.startIndex == null || print.endIndex == null) return out;

  let matchFn = feature.detect;
  if (!matchFn && feature.regex) {
    let re;
    try {
      re = feature.regex instanceof RegExp
        ? feature.regex
        : new RegExp(feature.regex);
    } catch (e) {
      return out; // invalid regex -> no events
    }
    const group = feature.group ?? 0;
    matchFn = (text) => {
      const m = re.exec(text);
      if (!m) return null;
      return m[group] != null ? String(m[group]) : text.slice(0, 40);
    };
  }
  if (!matchFn) return out;

  for (let i = print.startIndex; i <= print.endIndex; i++) {
    const ln = stream[i];
    const label = matchFn(ln.body);
    if (label != null) {
      out.push({
        offsetSec: Math.max(0, ln.t - print.startT),
        label,
        absDate: absDateForLine(anchors, ln),
      });
    }
  }
  return out;
}
