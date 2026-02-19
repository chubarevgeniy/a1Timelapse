# Bambu Timelapse Post-Processor (Web App)

A client-side web application designed to smooth out timelapses from 3D printers (specifically Bambu Lab A1/A1 Mini). It filters video frames to keep only those where the print head is in a specific position (e.g., parked for a snapshot), creating a clean, professional-looking timelapse without the print head moving erratically.

**[🚀 Open the Web App](https://chubarevgeniy.github.io/a1Timelapse/)**

## Features

- **100% Client-Side:** No video upload required. Processing happens entirely in your browser using OpenCV.js and WebCodecs.
- **Privacy Focused:** Your videos never leave your device.
- **Fast:** Leverages modern browser capabilities for efficient video processing.
- **Interactive Configuration:** Easily select the Region of Interest (ROI) and target color visually.

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
