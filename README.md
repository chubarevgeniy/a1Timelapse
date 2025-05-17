# Bambu Timelapse Frame Filter

This tool allows you to select a region of interest (ROI) and a target color from a video, then extracts frames where the color feature is detected within the ROI.  
It uses OpenCV, Pygame, and a simple GUI for interactive selection.

## Features

- Select ROI with the mouse
- Pick target color from the frame
- Adjust detection tolerance (1-9 keys)
- Adjust minimum feature size (mouse wheel)
- Preview selected color and ROI
- Debug visualization of detected features

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

---

**Enjoy your timelapse filtering!**