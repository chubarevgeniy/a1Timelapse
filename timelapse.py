import sys
import os
import argparse
import tkinter as tk
from tkinter import filedialog

import cv2
import numpy as np
import pygame

class ColorFeatureDetector:
    def __init__(self, target_color_bgr, tolerance=0.1, min_pixels=100, debug=False):
        self.target_color_bgr = target_color_bgr
        self.tolerance = tolerance
        self.min_pixels = min_pixels
        self.debug = debug
        self.last_mask = None

    def detect(self, frame_roi):
        hsv = cv2.cvtColor(frame_roi, cv2.COLOR_BGR2HSV)
        color = np.uint8([[self.target_color_bgr]])
        hsv_color = cv2.cvtColor(color, cv2.COLOR_BGR2HSV)[0][0]

        delta = np.array([int(180 * self.tolerance), int(255 * self.tolerance), int(255 * self.tolerance)])
        lower = np.maximum(hsv_color - delta, [0, 0, 0])
        upper = np.minimum(hsv_color + delta, [179, 255, 255])

        if self.debug:
            print(f"Target HSV: {hsv_color}, Lower: {lower}, Upper: {upper}")

        mask = cv2.inRange(hsv, lower, upper)
        self.last_mask = mask
        match = np.count_nonzero(mask) >= self.min_pixels

        return match

    def visualize(self, full_frame, roi_rect):
        """Show debug visualization of detected feature in the ROI."""
        if self.last_mask is not None:
            top, bottom, left, right = roi_rect
            roi_frame = full_frame[top:bottom, left:right].copy()
            highlight = cv2.bitwise_and(roi_frame, roi_frame, mask=self.last_mask)
            full_frame_copy = full_frame.copy()
            full_frame_copy[top:bottom, left:right] = highlight
            cv2.rectangle(full_frame_copy, (left, top), (right, bottom), (0, 255, 255), 2)
            debug_preview = cv2.resize(full_frame_copy, (1280, 720), interpolation=cv2.INTER_AREA)
            cv2.imshow("Debug - Full frame with ROI and detected feature", debug_preview)
            cv2.waitKey(0)
            cv2.destroyAllWindows()

def select_roi_and_color(video_path):
    """Interactive ROI and color selection using pygame."""
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise ValueError("Failed to read video")

    PREVIEW_W, PREVIEW_H = 1280, 720
    orig_h, orig_w = frame.shape[:2]
    scale_x = PREVIEW_W / orig_w
    scale_y = PREVIEW_H / orig_h

    pygame.init()
    screen = pygame.display.set_mode((PREVIEW_W, PREVIEW_H))
    pygame.display.set_caption("Select ROI, pick color (RMB), scroll to change size, Enter to confirm")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 28)

    selecting = True
    start_pos = None
    end_pos = None
    roi_rect = None
    selected_color_bgr = None
    min_pixels = 100
    tolerance = 0.2  # default value

    while selecting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # Left click for ROI
                    start_pos = event.pos
                elif event.button == 3:  # Right click for color
                    x, y = event.pos
                    orig_x = int(x / scale_x)
                    orig_y = int(y / scale_y)
                    selected_color_bgr = tuple(frame[orig_y, orig_x].tolist())
            elif event.type == pygame.MOUSEBUTTONUP:
                if event.button == 1 and start_pos:
                    end_pos = event.pos
                    x0, y0 = [int(start_pos[0] / scale_x), int(start_pos[1] / scale_y)]
                    x1, y1 = [int(end_pos[0] / scale_x), int(end_pos[1] / scale_y)]
                    left, right = sorted([x0, x1])
                    top, bottom = sorted([y0, y1])
                    # Clamp to frame size
                    left = max(0, min(left, orig_w - 1))
                    right = max(0, min(right, orig_w))
                    top = max(0, min(top, orig_h - 1))
                    bottom = max(0, min(bottom, orig_h))
                    if right - left > 0 and bottom - top > 0:
                        roi_rect = (top, bottom, left, right)
                    else:
                        roi_rect = None
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN and roi_rect and selected_color_bgr:
                    selecting = False
                elif pygame.K_1 <= event.key <= pygame.K_9:
                    tolerance = (event.key - pygame.K_0) / 20.0
            elif event.type == pygame.MOUSEWHEEL:
                min_pixels = max(1, min_pixels + event.y * 10)

        # Draw frame (resize for preview)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb_preview = cv2.resize(frame_rgb, (PREVIEW_W, PREVIEW_H), interpolation=cv2.INTER_AREA)
        screen.blit(pygame.surfarray.make_surface(np.transpose(frame_rgb_preview, (1, 0, 2))), (0, 0))

        # Draw ROI selection rectangle (scale ROI to preview)
        if start_pos and pygame.mouse.get_pressed()[0]:
            current_pos = pygame.mouse.get_pos()
            pygame.draw.rect(screen, (0, 255, 0), pygame.Rect(
                min(start_pos[0], current_pos[0]), min(start_pos[1], current_pos[1]),
                abs(start_pos[0] - current_pos[0]), abs(start_pos[1] - current_pos[1])
            ), 2)
        elif roi_rect:
            top, bottom, left, right = roi_rect
            preview_rect = pygame.Rect(
                int(left * scale_x), int(top * scale_y),
                int((right - left) * scale_x), int((bottom - top) * scale_y)
            )
            pygame.draw.rect(screen, (255, 0, 0), preview_rect, 2)

        # Draw selected color as a circle with area = min_pixels
        if selected_color_bgr is not None:
            selected_color_rgb = tuple(cv2.cvtColor(np.uint8([[selected_color_bgr]]), cv2.COLOR_BGR2RGB)[0][0])
            radius = int(np.sqrt(min_pixels / np.pi))
            pygame.draw.circle(screen, selected_color_rgb, (30, 30), radius)

        # Draw min_pixels
        txt = font.render(f"min_pixels: {min_pixels}", True, (255, 255, 255))
        screen.blit(txt, (80, 10))

        # Draw tolerance value
        txt_tol = font.render(f"tolerance: {tolerance:.2f}", True, (255, 255, 255))
        screen.blit(txt_tol, (80, 40))

        # Draw instructions
        instructions = [
            "LMB: Select ROI",
            "RMB: Pick color",
            "Scroll: Change min_pixels",
            "1-9: Set tolerance (0.05-0.45)",
            "Enter: Confirm selection"
        ]
        for i, line in enumerate(instructions):
            txt_help = font.render(line, True, (255, 255, 0))
            screen.blit(txt_help, (10, 70 + i * 25))

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    return roi_rect, selected_color_bgr, min_pixels, tolerance

def process_video(input_path, output_path, debug=True):
    """Process the video and save filtered frames."""
    roi_rect, color, min_pixels, tolerance = select_roi_and_color(input_path)

    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')

    temp_frames = []
    frame_buffer = []
    frame_index = 0

    detector = ColorFeatureDetector(color, tolerance=tolerance, min_pixels=min_pixels, debug=debug)

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        top, bottom, left, right = roi_rect
        roi_frame = frame[top:bottom, left:right]
        if detector.detect(roi_frame):
            print(f"Frame {frame_index} passed the filter")
            if detector.debug:
                detector.visualize(frame, roi_rect)
            frame_buffer.append(frame)
        else:
            if frame_buffer:
                mid = len(frame_buffer) // 2
                temp_frames.append(frame_buffer[mid])
                frame_buffer = []
        frame_index += 1

    if frame_buffer:
        mid = len(frame_buffer) // 2
        temp_frames.append(frame_buffer[mid])

    cap.release()

    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    for f in temp_frames:
        out.write(f)
    out.release()
    print(f"Frames saved: {len(temp_frames)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bambu Timelapse Frame Filter")
    parser.add_argument('--debug', action='store_true', help='Enable debug mode with extra output and visualization')
    args = parser.parse_args()

    root = tk.Tk()
    root.withdraw()
    input_video = filedialog.askopenfilename(title="Select input video", filetypes=[("MP4 files", "*.mp4"), ("All files", "*.*")])
    if not input_video:
        print("No file selected.")
        sys.exit()
    base, ext = os.path.splitext(input_video)
    output_video = base + "_filtered" + ext
    process_video(input_video, output_video, debug=args.debug)
