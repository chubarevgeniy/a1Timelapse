import os
import cv2
import base64
import uuid
import threading
import time
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

from core import process_video_file

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER

# Dictionary to store task status: { task_id: { 'status': '...', 'progress': 0, 'output_file': '...' } }
tasks = {}

def processing_task(task_id, input_path, output_path, roi_rect, color, color_tol, target_radius, radius_tol):
    try:
        def update_progress(p):
            tasks[task_id]['progress'] = p

        process_video_file(
            input_path,
            output_path,
            roi_rect,
            color,
            color_tol,
            target_radius,
            radius_tol,
            debug=False,
            progress_callback=update_progress
        )
        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['progress'] = 100
        tasks[task_id]['output_file'] = os.path.basename(output_path)
    except Exception as e:
        tasks[task_id]['status'] = 'error'
        tasks[task_id]['error'] = str(e)
        print(f"Error in task {task_id}: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'video' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        original_filename = secure_filename(file.filename)
        filename = f"{uuid.uuid4()}_{original_filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Extract first frame
        cap = cv2.VideoCapture(filepath)
        ret, frame = cap.read()
        cap.release()

        if not ret:
            os.remove(filepath)
            return jsonify({'error': 'Could not read video file'}), 400

        # Resize for preview if too large (optional, but good for bandwidth)
        # Keeping original aspect ratio
        h, w = frame.shape[:2]

        # Encode frame to base64
        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            'filename': filename,
            'width': w,
            'height': h,
            'frame_data': frame_base64
        })

@app.route('/process', methods=['POST'])
def start_processing():
    data = request.json
    filename = data.get('filename')
    # Validate filename to prevent path traversal
    if not filename or '/' in filename or '\\' in filename:
        return jsonify({'error': 'Invalid filename'}), 400

    input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    if not os.path.exists(input_path):
        return jsonify({'error': 'File not found'}), 404

    # Parameters
    roi = data.get('roi') # [top, bottom, left, right]
    color = tuple(data.get('color')) # [b, g, r]
    color_tol = float(data.get('color_tolerance', 0.1))
    target_radius = int(data.get('target_radius', 20))
    radius_tol = float(data.get('radius_tolerance', 0.2))

    task_id = str(uuid.uuid4())
    output_filename = f"processed_{filename}"
    output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

    tasks[task_id] = {
        'status': 'processing',
        'progress': 0
    }

    thread = threading.Thread(target=processing_task, args=(
        task_id, input_path, output_path, roi, color, color_tol, target_radius, radius_tol
    ))
    thread.start()

    return jsonify({'task_id': task_id})

@app.route('/status/<task_id>', methods=['GET'])
def get_status(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task)

@app.route('/download/<filename>')
def download_file(filename):
    # Ensure filename is secure
    filename = secure_filename(filename)
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
