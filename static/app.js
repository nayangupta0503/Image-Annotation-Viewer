// Application State
let state = {
    images: [],
    currentIndex: -1,
    labelColors: {}, // Maps label name -> HSL color string
    hueCounter: 0,   // For generating distinct class colors
    showLabels: true,
    imageFiles: {},  // Map of lowercase_filename -> File object
    currentObjectUrl: null // Active object URL to revoke later
};

// DOM Elements
const configForm = document.getElementById('config-form');
const visualizerLayout = document.getElementById('visualizer-layout');
const statusBadge = document.getElementById('status-badge');
const imageList = document.getElementById('image-list');
const imageSearch = document.getElementById('image-search');
const imageStats = document.getElementById('image-stats');
const currentFilename = document.getElementById('current-filename');
const mainImage = document.getElementById('main-image');
const bboxContainer = document.getElementById('bbox-container');
const toggleLabels = document.getElementById('toggle-labels');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const imageIndex = document.getElementById('image-index');
const categoriesLegend = document.getElementById('categories-legend');
const notificationContainer = document.getElementById('notification-container');
const canvasWrapper = document.getElementById('canvas-wrapper');

// File inputs & display elements
const jsonFileInput = document.getElementById('json-file-input');
const imagesFolderInput = document.getElementById('images-folder-input');
const jsonFileName = document.getElementById('json-file-name');
const imagesFolderName = document.getElementById('images-folder-name');

// 1. Toast Notification system
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconClass = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;
    
    notificationContainer.appendChild(toast);
    
    // Automatically remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 2. Color assignment helper for categories
function getLabelColor(label) {
    if (state.labelColors[label]) {
        return state.labelColors[label];
    }
    
    // Distribute hues evenly for distinct classes
    // We increment by ~137.5 degrees (golden angle) to avoid similar adjacent colors
    const hue = (state.hueCounter * 137.5) % 360;
    state.hueCounter++;
    
    const color = `hsl(${hue}, 85%, 50%)`;
    state.labelColors[label] = color;
    return color;
}

// 2.5. Annotation normalization logic in Javascript
function normalizeAnnotations(data, imageFilesList) {
    let normalized = [];
    
    // 1. COCO Format
    if (data && typeof data === 'object' && "images" in data && "annotations" in data) {
        const categories = {};
        (data.categories || []).forEach(cat => {
            categories[cat.id] = cat.name || `category_${cat.id}`;
        });
        
        const imagesDict = {};
        (data.images || []).forEach(img => {
            imagesDict[img.id] = {
                filename: img.file_name,
                width: img.width,
                height: img.height,
                annotations: []
            };
        });
        
        (data.annotations || []).forEach(ann => {
            const imgId = ann.image_id;
            if (imagesDict[imgId]) {
                const bbox = ann.bbox || [];
                const catId = ann.category_id;
                const label = categories[catId] || `category_${catId}`;
                imagesDict[imgId].annotations.push({
                    bbox: bbox,
                    label: label
                });
            }
        });
        
        normalized = Object.values(imagesDict);
    }
    // 2. Flat dictionary format
    else if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [filename, annList] of Object.entries(data)) {
            const imgAnns = [];
            if (Array.isArray(annList)) {
                annList.forEach(ann => {
                    if (ann && typeof ann === 'object') {
                        const bbox = ann.box || ann.bbox || ann.rect;
                        const label = ann.label || ann.category || "object";
                        if (bbox && bbox.length === 4) {
                            imgAnns.push({ bbox, label });
                        }
                    }
                });
            }
            normalized.push({
                filename: filename,
                annotations: imgAnns
            });
        }
    }
    // 3. List format
    else if (Array.isArray(data)) {
        data.forEach(item => {
            if (item && typeof item === 'object') {
                const filename = item.filename || item.file_name || item.image_path;
                if (filename) {
                    const annsSrc = item.annotations || item.objects || item.bboxes || [];
                    const imgAnns = [];
                    annsSrc.forEach(ann => {
                        if (ann && typeof ann === 'object' && !Array.isArray(ann)) {
                            const bbox = ann.box || ann.bbox || ann.rect;
                            const label = ann.label || ann.category || "object";
                            if (bbox && bbox.length === 4) {
                                imgAnns.push({ bbox, label });
                            }
                        } else if (Array.isArray(ann) && ann.length === 4) {
                            imgAnns.push({
                                bbox: ann,
                                label: "object"
                            });
                        }
                    });
                    
                    const basename = filename.split(/[/\\]/).pop();
                    normalized.push({
                        filename: basename,
                        annotations: imgAnns
                    });
                }
            }
        });
    }

    // Scan selected images list to add any non-annotated images
    const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.svg'];
    const existingNames = new Set(normalized.map(item => item.filename.toLowerCase().split(/[/\\]/).pop()));
    
    imageFilesList.forEach(filename => {
        const lowerName = filename.toLowerCase();
        const basename = filename.split(/[/\\]/).pop().toLowerCase();
        const hasValidExt = imgExts.some(ext => lowerName.endsWith(ext));
        if (hasValidExt && !existingNames.has(basename)) {
            normalized.push({
                filename: filename.split(/[/\\]/).pop(),
                annotations: []
            });
        }
    });

    normalized.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));
    return normalized;
}

// Display name updates for selected file/folder
jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        jsonFileName.textContent = file.name;
    } else {
        jsonFileName.textContent = 'No file selected';
    }
});

imagesFolderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        let folderName = 'Folder selected';
        const sampleFile = files[0];
        if (sampleFile.webkitRelativePath) {
            const parts = sampleFile.webkitRelativePath.split('/');
            if (parts.length > 0) {
                folderName = parts[0];
            }
        }
        imagesFolderName.textContent = `${folderName} (${files.length} files)`;
    } else {
        imagesFolderName.textContent = 'No folder selected';
    }
});

// 3. Load dataset locally using FileReader
configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const jsonFile = jsonFileInput.files[0];
    const imageFiles = Array.from(imagesFolderInput.files);
    
    if (!jsonFile) {
        showToast('Please select a JSON annotation file.', 'danger');
        return;
    }
    if (imageFiles.length === 0) {
        showToast('Please select an images folder.', 'danger');
        return;
    }
    
    // Index the selected image files by basename
    state.imageFiles = {};
    const imageFilenamesList = [];
    imageFiles.forEach(file => {
        const basename = file.name.split(/[/\\]/).pop().toLowerCase();
        state.imageFiles[basename] = file;
        imageFilenamesList.push(file.name);
    });
    
    // Read the JSON file
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            const dataset = normalizeAnnotations(data, imageFilenamesList);
            
            state.images = dataset;
            state.currentIndex = -1;
            
            showToast(`Dataset loaded successfully! Found ${dataset.length} images.`, 'success');
            
            // Update layout visibility and stats
            statusBadge.className = 'badge badge-loaded';
            statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Loaded: ${dataset.length} images`;
            visualizerLayout.classList.remove('hidden');
            
            renderImageList();
            
            if (state.images.length > 0) {
                selectImage(0);
            } else {
                clearViewer();
            }
        } catch (err) {
            showToast(`Error parsing JSON: ${err.message}`, 'danger');
        }
    };
    reader.onerror = function() {
        showToast('Error reading the JSON file.', 'danger');
    };
    reader.readAsText(jsonFile);
});

// 4. Render Sidebar Image List
function renderImageList(filter = '') {
    imageList.innerHTML = '';
    let visibleCount = 0;
    
    state.images.forEach((img, idx) => {
        if (filter && !img.filename.toLowerCase().includes(filter.toLowerCase())) {
            return;
        }
        
        visibleCount++;
        const li = document.createElement('li');
        li.className = `image-item ${idx === state.currentIndex ? 'active' : ''}`;
        li.id = `image-item-${idx}`;
        li.innerHTML = `
            <span class="image-item-name" title="${img.filename}">${img.filename}</span>
            <span class="count-badge">${img.annotations.length}</span>
        `;
        
        li.addEventListener('click', () => selectImage(idx));
        imageList.appendChild(li);
    });
    
    imageStats.textContent = `Showing: ${visibleCount} / ${state.images.length} images`;
}

// 5. Select Image and Load it
function selectImage(index) {
    if (index < 0 || index >= state.images.length) return;
    
    // Update active class in sidebar
    const prevActive = document.querySelector('.image-item.active');
    if (prevActive) prevActive.classList.remove('active');
    
    state.currentIndex = index;
    const currentItem = document.getElementById(`image-item-${index}`);
    if (currentItem) {
        currentItem.classList.add('active');
        // Scroll active item into view
        currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    const imgData = state.images[index];
    currentFilename.textContent = imgData.filename;
    imageIndex.textContent = `${index + 1} / ${state.images.length}`;
    
    // Set loading indicator
    mainImage.style.opacity = '0.5';
    bboxContainer.innerHTML = '';
    
    // Revoke previous object URL if any
    if (state.currentObjectUrl) {
        URL.revokeObjectURL(state.currentObjectUrl);
        state.currentObjectUrl = null;
    }
    
    // Build image URL using local File object
    const basename = imgData.filename.split(/[/\\]/).pop().toLowerCase();
    const fileObj = state.imageFiles[basename];
    if (fileObj) {
        state.currentObjectUrl = URL.createObjectURL(fileObj);
        mainImage.src = state.currentObjectUrl;
    } else {
        mainImage.src = '';
        showToast(`Image file "${imgData.filename}" not found in selected folder.`, 'danger');
    }
    
    // Disable/Enable buttons
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === state.images.length - 1;
}

// Clear viewer when no images are present
function clearViewer() {
    currentFilename.textContent = 'No image selected';
    mainImage.src = '';
    bboxContainer.innerHTML = '';
    imageIndex.textContent = '0 / 0';
    btnPrev.disabled = true;
    btnNext.disabled = true;
    categoriesLegend.innerHTML = '<p class="text-muted">No classes to display</p>';
}

// 6. Draw Bounding Boxes overlay on load
mainImage.onload = function() {
    mainImage.style.opacity = '1';
    drawBoundingBoxes();
};

function drawBoundingBoxes() {
    bboxContainer.innerHTML = '';
    categoriesLegend.innerHTML = '';
    
    if (state.currentIndex === -1 || state.images.length === 0) return;
    
    const imgData = state.images[state.currentIndex];
    const anns = imgData.annotations;
    
    // Natural dimensions (source image)
    const nw = mainImage.naturalWidth;
    const nh = mainImage.naturalHeight;
    
    // Rendered dimensions
    const cw = mainImage.clientWidth;
    const ch = mainImage.clientHeight;
    
    if (!nw || !nh || !cw || !ch) {
        // Retry shortly if layout is not fully painted
        setTimeout(drawBoundingBoxes, 50);
        return;
    }
    
    const scaleX = cw / nw;
    const scaleY = ch / nh;
    
    // Gather counts for summary panel
    const categoryCounts = {};
    
    anns.forEach(ann => {
        const [x, y, w, h] = ann.bbox;
        const label = ann.label;
        
        categoryCounts[label] = (categoryCounts[label] || 0) + 1;
        const color = getLabelColor(label);
        
        // Calculate coordinate boundaries
        const left = x * scaleX;
        const top = y * scaleY;
        const width = w * scaleX;
        const height = h * scaleY;
        
        // Spawn box div
        const box = document.createElement('div');
        box.className = 'bbox-box';
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        box.style.borderColor = color;
        box.style.color = color; // Used for dynamic HSL box shadows via CSScurrentColor
        box.style.backgroundColor = color.replace(')', ', 0.08)').replace('hsl', 'hsla');
        
        // Tooltip description
        box.title = `Class: ${label}\nBBox: [${x.toFixed(0)}, ${y.toFixed(0)}, ${w.toFixed(0)}, ${h.toFixed(0)}]`;
        
        // Spawn label tag div
        const tag = document.createElement('div');
        tag.className = 'bbox-label';
        tag.style.backgroundColor = color;
        tag.textContent = label;
        
        box.appendChild(tag);
        bboxContainer.appendChild(box);
    });
    
    // Draw class categories legend
    const labels = Object.keys(categoryCounts);
    if (labels.length === 0) {
        categoriesLegend.innerHTML = '<p style="color: var(--text-muted); font-size:12px;">No annotations in this image</p>';
    } else {
        labels.forEach(label => {
            const count = categoryCounts[label];
            const color = getLabelColor(label);
            
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-left">
                    <span class="legend-color-dot" style="background-color: ${color}"></span>
                    <span>${label}</span>
                </div>
                <span class="legend-count">${count}</span>
            `;
            categoriesLegend.appendChild(legendItem);
        });
    }
}

// 7. Event Handlers
btnPrev.addEventListener('click', () => {
    if (state.currentIndex > 0) {
        selectImage(state.currentIndex - 1);
    }
});

btnNext.addEventListener('click', () => {
    if (state.currentIndex < state.images.length - 1) {
        selectImage(state.currentIndex + 1);
    }
});

// Toggle Labels Checkbox
toggleLabels.addEventListener('change', (e) => {
    state.showLabels = e.target.checked;
    if (state.showLabels) {
        bboxContainer.classList.remove('hide-labels');
    } else {
        bboxContainer.classList.add('hide-labels');
    }
});

// Search input handler
imageSearch.addEventListener('input', (e) => {
    renderImageList(e.target.value);
});

// Recalculate on Resize
window.addEventListener('resize', () => {
    if (state.currentIndex !== -1) {
        drawBoundingBoxes();
    }
});

// Keyboard Navigation Shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore key presses inside text inputs
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
        return;
    }
    
    const key = e.key.toLowerCase();
    
    if (key === 'arrowleft') {
        e.preventDefault();
        if (state.currentIndex > 0) {
            selectImage(state.currentIndex - 1);
        }
    } else if (key === 'arrowright') {
        e.preventDefault();
        if (state.currentIndex < state.images.length - 1) {
            selectImage(state.currentIndex + 1);
        }
    } else if (key === 'l') {
        e.preventDefault();
        toggleLabels.checked = !toggleLabels.checked;
        // Dispatch event manually to trigger UI updates
        toggleLabels.dispatchEvent(new Event('change'));
        showToast(state.showLabels ? 'Labels visible' : 'Labels hidden');
    }
});
