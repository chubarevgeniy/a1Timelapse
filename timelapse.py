import sys
import os
import argparse
import tkinter as tk
from tkinter import filedialog

import cv2
import numpy as np
import pygame

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

def select_roi_and_color(video_path):
    """Interactive ROI and color selection using pygame, with frame navigation."""
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    current_frame_idx = 0

    def get_frame(idx):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        return ret, frame

    ret, frame = get_frame(current_frame_idx)
    if not ret:
        cap.release()
        raise ValueError("Failed to read video")

    PREVIEW_W, PREVIEW_H = 1280, 720

    def update_preview_surface(frame):
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb_preview = cv2.resize(frame_rgb, (PREVIEW_W, PREVIEW_H), interpolation=cv2.INTER_AREA)
        return pygame.surfarray.make_surface(np.transpose(frame_rgb_preview, (1, 0, 2)))

    preview_surface = update_preview_surface(frame)
    orig_h, orig_w = frame.shape[:2]
    scale_x = PREVIEW_W / orig_w
    scale_y = PREVIEW_H / orig_h

    pygame.init()
    screen = pygame.display.set_mode((PREVIEW_W, PREVIEW_H))
    pygame.display.set_caption("Select ROI, pick color (RMB), scroll to change size, Enter to confirm")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 28)

    target_radius = 20  # default radius in pixels
    radius_tolerance = 0.2  # 20% tolerance
    tolerance = 0.2  # color tolerance
    selecting = True
    start_pos = None
    end_pos = None
    roi_rect = None
    selected_color_bgr = None
    detector = None
    detector_params = None

    while selecting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                cap.release()
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
                elif event.key == pygame.K_q:
                    radius_tolerance = min(1.0, radius_tolerance + 0.05)
                elif event.key == pygame.K_a:
                    radius_tolerance = max(0.01, radius_tolerance - 0.05)
                elif event.key == pygame.K_RIGHT:
                    if current_frame_idx < total_frames - 1:
                        current_frame_idx += 1
                        ret, new_frame = get_frame(current_frame_idx)
                        if ret:
                            frame = new_frame
                            preview_surface = update_preview_surface(frame)
                elif event.key == pygame.K_LEFT:
                    if current_frame_idx > 0:
                        current_frame_idx -= 1
                        ret, new_frame = get_frame(current_frame_idx)
                        if ret:
                            frame = new_frame
                            preview_surface = update_preview_surface(frame)
            elif event.type == pygame.MOUSEWHEEL:
                target_radius = max(1, target_radius + event.y)

        # Draw frame (resize for preview)
        screen.blit(preview_surface, (0, 0))

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

        # Draw selected color as a circle with target_radius
        if selected_color_bgr is not None:
            selected_color_rgb = tuple(cv2.cvtColor(np.uint8([[selected_color_bgr]]), cv2.COLOR_BGR2RGB)[0][0])
            preview_radius = int(target_radius * scale_x)  # or use scale_y if aspect ratio is not 1:1
            pygame.draw.circle(screen, selected_color_rgb, (30, 30), preview_radius)

        # Draw target radius in green at (30, 30)
        preview_radius = int(target_radius * ((scale_x + scale_y) / 2))
        pygame.draw.circle(screen, (0, 255, 0), (30, 30), preview_radius, 2)

        # If color is selected and ROI is set, draw found radius in red and all detected circles in debug mode
        if selected_color_bgr is not None and roi_rect:
            current_params = (selected_color_bgr, tolerance, target_radius, radius_tolerance)
            if detector is None or detector_params != current_params:
                detector = ColorCircleDetector(
                    selected_color_bgr,
                    color_tolerance=tolerance,
                    target_radius=target_radius,
                    radius_tolerance=radius_tolerance,
                    debug=False
                )
                detector_params = current_params

            top, bottom, left, right = roi_rect
            roi_frame = frame[top:bottom, left:right]
            detector.detect(roi_frame)

            # Draw all found circles in red at (30, 30) with their detected radius
            for (_, _, found_radius) in detector.last_circles:
                preview_found_radius = int(found_radius * ((scale_x + scale_y) / 2))
                pygame.draw.circle(screen, (255, 0, 0), (30, 30), preview_found_radius, 2)

            # In debug mode, draw all detected circles on the preview ROI
            if __debug__:
                for (x, y, r) in detector.last_circles:
                    # Scale coordinates and radius to preview
                    px = int((left + x) * scale_x)
                    py = int((top + y) * scale_y)
                    pr = int(r * ((scale_x + scale_y) / 2))
                    pygame.draw.circle(screen, (255, 0, 0), (px, py), pr, 2)

        # Draw target_radius and tolerance values
        txt = font.render(f"radius: {target_radius}px", True, (255, 255, 255))
        screen.blit(txt, (80, 10))
        txt_tol = font.render(f"color tol: {tolerance:.2f}", True, (255, 255, 255))
        screen.blit(txt_tol, (80, 40))
        txt_rtol = font.render(f"radius tol: {radius_tolerance:.2f}", True, (255, 255, 255))
        screen.blit(txt_rtol, (80, 70))
        txt_frame = font.render(f"frame: {current_frame_idx+1}/{total_frames}", True, (255, 255, 255))
        screen.blit(txt_frame, (80, 100))

        # Draw instructions
        instructions = [
            "LMB: Select ROI",
            "RMB: Pick color",
            "Wheel: Change radius",
            "1-9: Set color tolerance",
            "Q/A: Change radius tolerance",
            "Left/Right: Change frame",
            "Enter: Confirm selection"
        ]
        for i, line in enumerate(instructions):
            txt_help = font.render(line, True, (255, 255, 0))
            screen.blit(txt_help, (10, 130 + i * 25))

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    cap.release()
    return roi_rect, selected_color_bgr, tolerance, target_radius, radius_tolerance

def process_video(input_path, output_path, debug=True):
    roi_rect, color, color_tol, target_radius, radius_tol = select_roi_and_color(input_path)

    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frames_saved = 0
    frame_buffer = []
    frame_index = 0

    detector = ColorCircleDetector(color, color_tolerance=color_tol, target_radius=target_radius, radius_tolerance=radius_tol, debug=debug)

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

    if frame_buffer:
        mid = len(frame_buffer) // 2
        out.write(frame_buffer[mid])
        frames_saved += 1

    cap.release()
    out.release()
    print(f"Frames saved: {frames_saved}")

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
