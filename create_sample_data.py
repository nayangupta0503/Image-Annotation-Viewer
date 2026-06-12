import os
import json
from PIL import Image, ImageDraw

def make_sample_images():
    os.makedirs("sample_data/images", exist_ok=True)
    
    # 1. Cat and Dog image (640x480)
    img1 = Image.new("RGB", (640, 480), color=(240, 240, 240))
    draw1 = ImageDraw.Draw(img1)
    # Draw a cat box mock
    draw1.rectangle([50, 100, 250, 350], fill=(255, 200, 200), outline=(255, 50, 50), width=3)
    # Draw a dog box mock
    draw1.ellipse([300, 150, 550, 400], fill=(200, 200, 255), outline=(50, 50, 255), width=3)
    img1.save("sample_data/images/cat_dog.jpg")
    
    # 2. Living Room (800x600)
    img2 = Image.new("RGB", (800, 600), color=(220, 240, 220))
    draw2 = ImageDraw.Draw(img2)
    # Draw a chair
    draw2.rectangle([100, 300, 250, 550], fill=(255, 255, 200), outline=(200, 200, 50), width=3)
    # Draw a table
    draw2.rectangle([300, 350, 700, 550], fill=(222, 184, 135), outline=(139, 69, 19), width=3)
    img2.save("sample_data/images/living_room.jpg")
    
    # 3. Street (1024x768)
    img3 = Image.new("RGB", (1024, 768), color=(230, 230, 230))
    draw3 = ImageDraw.Draw(img3)
    # Draw a car
    draw3.rectangle([100, 400, 500, 650], fill=(200, 255, 255), outline=(0, 128, 128), width=3)
    # Draw a person
    draw3.rectangle([600, 300, 750, 700], fill=(255, 220, 255), outline=(128, 50, 128), width=3)
    img3.save("sample_data/images/street.jpg")

    # BBoxes are in COCO format: [x_min, y_min, width, height]
    # Save custom/flat format annotations
    flat_data = {
        "cat_dog.jpg": [
            {"box": [50, 100, 200, 250], "label": "cat"},
            {"box": [300, 150, 250, 250], "label": "dog"}
        ],
        "living_room.jpg": [
            {"box": [100, 300, 150, 250], "label": "chair"},
            {"box": [300, 350, 400, 200], "label": "table"}
        ],
        "street.jpg": [
            {"box": [100, 400, 400, 250], "label": "car"},
            {"box": [600, 300, 150, 400], "label": "person"}
        ]
    }
    with open("sample_data/annotations_flat.json", "w") as f:
        json.dump(flat_data, f, indent=4)
        
    # Save COCO format annotations
    coco_data = {
        "images": [
            {"id": 1, "file_name": "cat_dog.jpg", "width": 640, "height": 480},
            {"id": 2, "file_name": "living_room.jpg", "width": 800, "height": 600},
            {"id": 3, "file_name": "street.jpg", "width": 1024, "height": 768}
        ],
        "annotations": [
            {"id": 101, "image_id": 1, "category_id": 1, "bbox": [50, 100, 200, 250]},
            {"id": 102, "image_id": 1, "category_id": 2, "bbox": [300, 150, 250, 250]},
            {"id": 103, "image_id": 2, "category_id": 3, "bbox": [100, 300, 150, 250]},
            {"id": 104, "image_id": 2, "category_id": 4, "bbox": [300, 350, 400, 200]},
            {"id": 105, "image_id": 3, "category_id": 5, "bbox": [100, 400, 400, 250]},
            {"id": 106, "image_id": 3, "category_id": 6, "bbox": [600, 300, 150, 400]}
        ],
        "categories": [
            {"id": 1, "name": "cat"},
            {"id": 2, "name": "dog"},
            {"id": 3, "name": "chair"},
            {"id": 4, "name": "table"},
            {"id": 5, "name": "car"},
            {"id": 6, "name": "person"}
        ]
    }
    with open("sample_data/annotations_coco.json", "w") as f:
        json.dump(coco_data, f, indent=4)
        
    print("Sample data successfully generated in c:\\D\\code\\annotations\\sample_data\\")

if __name__ == "__main__":
    make_sample_images()
