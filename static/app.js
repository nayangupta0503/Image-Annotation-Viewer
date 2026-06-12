// Application State
let state = {
    images: [],
    currentIndex: -1,
    labelColors: {}, // Maps label name -> HSL color string
    hueCounter: 0,   // For generating distinct class colors
    showLabels: true
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
const btnBrowseJson = document.getElementById('btn-browse-json');
const btnBrowseImages = document.getElementById('btn-browse-images');
const jsonPathInput = document.getElementById('json-path');
const imagesDirInput = document.getElementById('images-dir');

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

// 2.5. File/Folder Browsing logic
btnBrowseJson.addEventListener('click', async () => {
    try {
        btnBrowseJson.disabled = true;
        const originalHtml = btnBrowseJson.innerHTML;
        btnBrowseJson.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Browsing...';
        
        const response = await fetch('/api/browse/file', { method: 'POST' });
        const res = await response.json();
        
        btnBrowseJson.disabled = false;
        btnBrowseJson.innerHTML = originalHtml;
        
        if (res.success && res.path) {
            jsonPathInput.value = res.path;
            showToast('JSON file selected successfully.', 'success');
        } else if (res.error) {
            showToast(`Error: ${res.error}`, 'danger');
        }
    } catch (err) {
        btnBrowseJson.disabled = false;
        btnBrowseJson.innerHTML = '<i class="fa-regular fa-folder-open"></i> Browse';
        showToast(`Error communicating with backend: ${err.message}`, 'danger');
    }
});

btnBrowseImages.addEventListener('click', async () => {
    try {
        btnBrowseImages.disabled = true;
        const originalHtml = btnBrowseImages.innerHTML;
        btnBrowseImages.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Browsing...';
        
        const response = await fetch('/api/browse/directory', { method: 'POST' });
        const res = await response.json();
        
        btnBrowseImages.disabled = false;
        btnBrowseImages.innerHTML = originalHtml;
        
        if (res.success && res.path) {
            imagesDirInput.value = res.path;
            showToast('Images directory selected successfully.', 'success');
        } else if (res.error) {
            showToast(`Error: ${res.error}`, 'danger');
        }
    } catch (err) {
        btnBrowseImages.disabled = false;
        btnBrowseImages.innerHTML = '<i class="fa-regular fa-folder"></i> Browse';
        showToast(`Error communicating with backend: ${err.message}`, 'danger');
    }
});

// 3. Load dataset via API
configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jsonPath = document.getElementById('json-path').value.strip ? 
                     document.getElementById('json-path').value.strip() : 
                     document.getElementById('json-path').value.trim();
    const imagesDir = document.getElementById('images-dir').value.strip ? 
                      document.getElementById('images-dir').value.strip() : 
                      document.getElementById('images-dir').value.trim();

    try {
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ json_path: jsonPath, images_dir: imagesDir })
        });
        
        const res = await response.json();
        
        if (!response.ok || !res.success) {
            showToast(res.error || 'Failed to load dataset.', 'danger');
            return;
        }
        
        // Success configuration
        state.images = res.data;
        state.currentIndex = -1;
        
        showToast(`Dataset loaded successfully! Found ${res.total_images} images.`, 'success');
        
        // Update layout visibility and stats
        statusBadge.className = 'badge badge-loaded';
        statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Loaded: ${res.total_images} images`;
        visualizerLayout.classList.remove('hidden');
        
        renderImageList();
        
        if (state.images.length > 0) {
            selectImage(0);
        } else {
            clearViewer();
        }
        
    } catch (err) {
        showToast(`Network error: ${err.message}`, 'danger');
    }
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
    
    // Build image URL using backend endpoint
    mainImage.src = `/api/image/${encodeURIComponent(imgData.filename)}`;
    
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
