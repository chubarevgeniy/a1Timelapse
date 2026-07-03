# 3D Print Studio (Web App)

A client-side web application with two tools for 3D-printing timelapses. A mode
selector on the home screen lets you switch between them.

1. **Timelapse Filter** — smooths out timelapses from 3D printers (originally
   Bambu Lab A1/A1 Mini) by keeping only the video frames where the print head
   is in a specific position (e.g. parked for a snapshot).
2. **Printer Log → DaVinci** — parses Klipper (`klippy.log`) files, lists the
   prints found in them, and exports an FCPXML for DaVinci Resolve with a
   marker (or a razor cut) at every chosen event, so you can turn a phone
   timelapse into a per-event edit.

**[🚀 Open the Web App](https://chubarevgeniy.github.io/a1Timelapse/)**

**[🚀 Boost on makerworld](https://makerworld.com/models/2447065)**

## Features

- **100% Client-Side:** No upload required. Processing (video *and* logs) happens entirely in your browser.
- **Privacy Focused:** Your videos and logs never leave your device.
- **Fast:** Leverages modern browser capabilities for efficient video processing.
- **Interactive Configuration:** Easily select the Region of Interest (ROI) and target color visually.

## Printer Log → DaVinci

This mode bridges your Klipper printer and your video editor.

1. **Upload logs.** Select one or more `klippy.log` files. Klipper rotates the
   log at 10&nbsp;MB, so a long print can span several files — upload all the
   parts and they're stitched together on a single continuous timeline. (The
   merge and event timing use the monotonic `Stats` clock, so they survive
   reboots, NTP jumps and midnight rollovers.)
2. **Pick a print.** Every print found in the logs is listed with its start
   time and duration. Only prints whose **start _and_ end** are inside the
   loaded logs can be processed (others are shown but disabled).
3. **Choose an event ("feature").** Built-in detectors: *print-head change
   (toolchange)*, *head park*, *head pick*. Layer changes are **not** written to
   `klippy.log` by this firmware — if you add a macro that logs them (or want to
   match any other line), use the **custom regex** option.
4. **Set the timelapse speed** (e.g. 15x/30x). An event that happened `t`
   real-seconds into the print lands at `t / speed` seconds on the video
   timeline. Pick **markers** or **cuts (razor)** and export the `.fcpxml`.
5. **In DaVinci Resolve:** *File → Import → Timeline…*, relink the offline clip
   to your phone's timelapse, then slide the clip (or the markers) to line up
   the first event and fine-tune. Because the mapping is linear, everything
   else lines up once the start is synced.

## How to Use

1. **Open the App:** Go to [chubarevgeniy.github.io/a1Timelapse](https://chubarevgeniy.github.io/a1Timelapse/).
2. **Upload Video:** Click "Select Video" to load your timelapse file (MP4).
3. **Find the Parked Position:** Use the video timeline slider to find a frame where the print head is in the desired "parked" position (usually at the very edge of the build plate).
4. **Configure Detection:**
   - **Select ROI:** Click and drag on the video preview to draw a rectangle around the area where the print head parks.
   - **Pick Color:** Click on the specific color of the print head (or a marker) within that box.
   - **Adjust Settings:** Fine-tune the color tolerance slider if the detection is too sensitive or not sensitive enough.
5. **Process:** Click "Process Video". The app will scan the video and compile a new MP4 file containing only the frames where the print head was detected in the target area.
6. **Download:** Once processing is complete, a "Download" button will appear. Click it to save your smooth timelapse.

## Local Development (Web App)

To run the web application locally on your machine:

1. Navigate to the `web` directory:
   ```bash
   cd web
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local URL (usually `http://localhost:5173`) in your browser.

---

# Legacy Python Desktop App

The original Python script for desktop use is also available in this repository.

## Requirements

- Python 3.7+
- opencv-python
- numpy
- pygame

Install dependencies with:

```sh
pip install -r requirements.txt
```

## Usage

1. Run the script:

    ```sh
    python timelapse.py
    ```

    Or with debug mode enabled:

    ```sh
    python timelapse.py --debug
    ```

2. Select an input video file in the dialog.
3. In the preview window:
    - **LMB (Left Mouse Button):** Drag to select ROI
    - **RMB (Right Mouse Button):** Click to pick color
    - **Scroll:** Change minimum feature size (min_pixels)
    - **1-9:** Set tolerance (0.1–0.9)
    - **Enter:** Confirm selection and start processing

4. The filtered video will be saved as `<original_filename>_filtered.mp4` in the same directory.

## Notes

- The preview and debug windows use 1280x720 resolution for convenience.
- The script prints debug information if enabled.
