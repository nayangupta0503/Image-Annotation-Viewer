import os
import json
import webbrowser
from threading import Timer
from flask import Flask, jsonify, request, send_from_directory, render_template

app = Flask(__name__, template_folder='templates', static_folder='static')

# Global state to keep track of the configured images directory
configured_images_dir = None

def normalize_annotations(json_path, images_dir):
    """
    Parses and normalizes annotations from the JSON file.
    Supports COCO format and custom flat/list formats.
    Also scans the images directory for any non-annotated images to display.
    """
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Annotation JSON file not found: {json_path}")
        
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    normalized = []
    
    # 1. COCO Format
    # Contains 'images', 'annotations', and 'categories'
    if isinstance(data, dict) and "images" in data and "annotations" in data:
        # Build category lookup
        categories = {}
        for cat in data.get("categories", []):
            categories[cat["id"]] = cat.get("name", f"category_{cat['id']}")
            
        # Build image lookup
        images_dict = {}
        for img in data.get("images", []):
            images_dict[img["id"]] = {
                "filename": img["file_name"],
                "width": img.get("width"),
                "height": img.get("height"),
                "annotations": []
            }
            
        # Map annotations to images
        for ann in data.get("annotations", []):
            img_id = ann.get("image_id")
            if img_id in images_dict:
                bbox = ann.get("bbox", []) # COCO format: [x, y, w, h]
                cat_id = ann.get("category_id")
                label = categories.get(cat_id, f"category_{cat_id}")
                images_dict[img_id]["annotations"].append({
                    "bbox": bbox,
                    "label": label
                })
        
        normalized = list(images_dict.values())
        
    # 2. Flat dictionary format (e.g. {"img1.jpg": [{"box": [x,y,w,h], "label": "cat"}]})
    elif isinstance(data, dict):
        for filename, ann_list in data.items():
            img_anns = []
            if isinstance(ann_list, list):
                for ann in ann_list:
                    if isinstance(ann, dict):
                        bbox = ann.get("box") or ann.get("bbox") or ann.get("rect")
                        label = ann.get("label") or ann.get("category") or "object"
                        if bbox and len(bbox) == 4:
                            img_anns.append({
                                "bbox": bbox,
                                "label": label
                            })
            normalized.append({
                "filename": filename,
                "annotations": img_anns
            })
            
    # 3. List format (e.g. [{"filename": "img1.jpg", "annotations": [...]}] )
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                filename = item.get("filename") or item.get("file_name") or item.get("image_path")
                if filename:
                    anns_src = item.get("annotations") or item.get("objects") or item.get("bboxes") or []
                    img_anns = []
                    for ann in anns_src:
                        if isinstance(ann, dict):
                            bbox = ann.get("box") or ann.get("bbox") or ann.get("rect")
                            label = ann.get("label") or ann.get("category") or "object"
                            if bbox and len(bbox) == 4:
                                img_anns.append({
                                    "bbox": bbox,
                                    "label": label
                                })
                        elif isinstance(ann, list) and len(ann) == 4:
                            img_anns.append({
                                "bbox": ann,
                                "label": "object"
                            })
                    normalized.append({
                        "filename": os.path.basename(filename),
                        "annotations": img_anns
                    })
                    
    # Scan the images directory to find all available images
    if os.path.isdir(images_dir):
        all_files = os.listdir(images_dir)
        # Supported browser image formats
        img_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.svg'}
        existing_names = {item["filename"].lower() for item in normalized}
        
        for name in all_files:
            _, ext = os.path.splitext(name)
            if ext.lower() in img_exts and name.lower() not in existing_names:
                normalized.append({
                    "filename": name,
                    "annotations": []
                })
                
    # Sort files naturally
    normalized.sort(key=lambda x: x["filename"].lower())
    return normalized

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/load', methods=['POST'])
def load_dataset():
    global configured_images_dir
    try:
        req_data = request.get_json() or {}
        json_path = req_data.get('json_path', '').strip()
        images_dir = req_data.get('images_dir', '').strip()
        
        # Resolve absolute paths and expand user variables
        json_path = os.path.abspath(os.path.expanduser(json_path))
        images_dir = os.path.abspath(os.path.expanduser(images_dir))
        
        if not os.path.exists(json_path):
            return jsonify({"success": False, "error": f"JSON annotation path does not exist: {json_path}"}), 400
        if not os.path.exists(images_dir):
            return jsonify({"success": False, "error": f"Images directory path does not exist: {images_dir}"}), 400
        if not os.path.isdir(images_dir):
            return jsonify({"success": False, "error": f"Images directory path is not a directory: {images_dir}"}), 400
            
        configured_images_dir = images_dir
        
        dataset = normalize_annotations(json_path, images_dir)
        return jsonify({
            "success": True,
            "data": dataset,
            "json_path": json_path,
            "images_dir": images_dir,
            "total_images": len(dataset)
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/image/<path:filename>')
def serve_image(filename):
    global configured_images_dir
    if not configured_images_dir:
        return "Images directory has not been configured yet.", 400
    if not os.path.exists(configured_images_dir):
        return f"Configured images directory no longer exists: {configured_images_dir}", 404
        
    # Send from directory ensures safe paths relative to directory root
    return send_from_directory(configured_images_dir, filename)

@app.route('/api/browse/file', methods=['POST'])
def browse_file():
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', 1)
        
        file_path = filedialog.askopenfilename(
            parent=root,
            title="Select JSON Annotation File",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        root.destroy()
        
        if file_path:
            file_path = os.path.normpath(file_path).replace('\\', '/')
            return jsonify({"success": True, "path": file_path})
        else:
            return jsonify({"success": False, "cancelled": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/browse/directory', methods=['POST'])
def browse_directory():
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', 1)
        
        dir_path = filedialog.askdirectory(
            parent=root,
            title="Select Images Directory"
        )
        root.destroy()
        
        if dir_path:
            dir_path = os.path.normpath(dir_path).replace('\\', '/')
            return jsonify({"success": True, "path": dir_path})
        else:
            return jsonify({"success": False, "cancelled": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000/")

if __name__ == '__main__':
    # Automatically open the browser 1 second after flask starts running
    Timer(1.0, open_browser).start()
    app.run(host='127.0.0.1', port=5000, debug=False)
