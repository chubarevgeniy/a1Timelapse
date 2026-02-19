import cv2
import numpy as np
import sys

class ColorCircleDetector:
    def __init__(self, target_color_bgr, color_tolerance=0.1, target_radius=20, radius_tolerance=0.2, debug=False):
        self.target_color_bgr = target_color_bgr
        self.color_tolerance = color_tolerance
        self.target_radius = target_radius
        self.radius_tolerance = radius_tolerance
        self.debug = debug
        self.last_mask = None
        self.last_circles = []

        color = np.uint8([[self.target_color_bgr]])
        hsv_color = cv2.cvtColor(color, cv2.COLOR_BGR2HSV)[0][0]

        delta = np.array([int(180 * self.color_tolerance), int(255 * self.color_tolerance), int(255 * self.color_tolerance)])
        self.lower = np.maximum(hsv_color - delta, [0, 0, 0])
        self.upper = np.minimum(hsv_color + delta, [179, 255, 255])

    def detect(self, frame_roi):
        hsv = cv2.cvtColor(frame_roi, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, self.lower, self.upper)
        self.last_mask = mask

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        self.last_circles = []
        for cnt in contours:
            ((x, y), radius) = cv2.minEnclosingCircle(cnt)
            if radius < 1:
                continue
            area = cv2.contourArea(cnt)
            circle_area = np.pi * radius * radius
            circularity = area / circle_area if circle_area > 0 else 0
            if (abs(radius - self.target_radius) <= self.target_radius * self.radius_tolerance) and (circularity > 0.2):
                self.last_circles.append((int(x), int(y), int(radius)))
        return len(self.last_circles) > 0

    def visualize(self, full_frame, roi_rect):
        if self.last_mask is not None:
            top, bottom, left, right = roi_rect
            roi_frame = full_frame[top:bottom, left:right].copy()
            highlight = cv2.bitwise_and(roi_frame, roi_frame, mask=self.last_mask)
            for (x, y, r) in self.last_circles:
                cv2.circle(highlight, (x, y), r, (0, 0, 255), 2)
            full_frame_copy = full_frame.copy()
            full_frame_copy[top:bottom, left:right] = highlight
            cv2.rectangle(full_frame_copy, (left, top), (right, bottom), (0, 255, 255), 2)
            debug_preview = cv2.resize(full_frame_copy, (1280, 720), interpolation=cv2.INTER_AREA)
            cv2.imshow("Debug - Full frame with ROI and detected circles", debug_preview)
            cv2.waitKey(0)
            cv2.destroyAllWindows()

def process_video_file(input_path, output_path, roi_rect, target_color_bgr, color_tolerance, target_radius, radius_tolerance, debug=False, progress_callback=None):
    """
    Processes the video file to filter frames based on the colored circle detection.

    Args:
        input_path (str): Path to input video.
        output_path (str): Path to output video.
        roi_rect (tuple): (top, bottom, left, right) defining the Region of Interest.
        target_color_bgr (tuple): Target color in BGR format.
        color_tolerance (float): Tolerance for color matching.
        target_radius (int): Target radius of the circle.
        radius_tolerance (float): Tolerance for radius matching.
        debug (bool): Enable debug visualization (cv2.imshow).
        progress_callback (callable): Optional callback receiving progress percentage (0-100).
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {input_path}")

    frames_saved = 0

    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frame_buffer = []
        frame_index = 0

        detector = ColorCircleDetector(
            target_color_bgr,
            color_tolerance=color_tolerance,
            target_radius=target_radius,
            radius_tolerance=radius_tolerance,
            debug=debug
        )

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            top, bottom, left, right = roi_rect
            roi_frame = frame[top:bottom, left:right]

            if detector.detect(roi_frame):
                print(f"Frame {frame_index} passed the filter")
                if detector.debug:
                    # Draw all detected circles in red on the ROI in the full frame
                    debug_frame = frame.copy()
                    for (x, y, r) in detector.last_circles:
                        cv2.circle(debug_frame[top:bottom, left:right], (x, y), r, (0, 0, 255), 2)
                    cv2.rectangle(debug_frame, (left, top), (right, bottom), (0, 255, 255), 2)
                    debug_preview = cv2.resize(debug_frame, (1280, 720), interpolation=cv2.INTER_AREA)
                    cv2.imshow("Debug - All detected circles", debug_preview)
                    cv2.waitKey(1)  # Show for a short time, or use 0 to wait for key
                frame_buffer.append(frame)
            else:
                if frame_buffer:
                    mid = len(frame_buffer) // 2
                    out.write(frame_buffer[mid])
                    frames_saved += 1
                    frame_buffer = []

            frame_index += 1
            if progress_callback and total_frames > 0 and frame_index % 10 == 0:
                progress_callback(int(frame_index / total_frames * 100))

        if frame_buffer:
            mid = len(frame_buffer) // 2
            out.write(frame_buffer[mid])
            frames_saved += 1

        if progress_callback:
            progress_callback(100)
    finally:
        cap.release()
        if 'out' in locals():
            out.release()

    print(f"Frames saved: {frames_saved}")
    return frames_saved
