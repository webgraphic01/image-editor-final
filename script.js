document.addEventListener('DOMContentLoaded', function() {
    feather.replace();

    // --- DOM ELEMENT SELECTION ---
    const getEl = (id) => document.getElementById(id);
    const canvasArea = getEl('canvas-area');
    const uploadContainer = getEl('upload-container');
    const imageUploadInput = getEl('imageUpload');
    const generateBtn = getEl('generate-btn');
    const toolList = document.querySelector('.tool-list');
    const promptInput = getEl('prompt-input');

    // --- STATE MANAGEMENT ---
    let state = {
        activeTool: 'brush',
        image: null,
        imageContainer: null,
        baseCanvas: null, // Holds the main image content
        drawCanvas: null, // For user interaction (masks, etc.)
        drawCtx: null,
        isDrawing: false,
        isMaskDrawn: false,
        apiKey: null,
        history: [],
        historyIndex: -1
    };

    // --- INITIALIZATION ---
    getEl('upload-btn')?.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', handleImageUpload);
    toolList.addEventListener('click', handleToolChange);
    generateBtn.addEventListener('click', handleGeneration);
    promptInput.addEventListener('input', updateGenerateButtonState);
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // --- HISTORY (UNDO/REDO) ---
    function saveState() {
        if (!state.baseCanvas) return;
        const imageData = state.baseCanvas.getContext('2d').getImageData(0, 0, state.baseCanvas.width, state.baseCanvas.height);
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(imageData);
        state.historyIndex = state.history.length - 1;
        updateUndoRedoButtons();
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            state.baseCanvas.getContext('2d').putImageData(state.history[state.historyIndex], 0, 0);
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            state.baseCanvas.getContext('2d').putImageData(state.history[state.historyIndex], 0, 0);
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        toolList.querySelector('[data-tool="undo"]').disabled = state.historyIndex <= 0;
        toolList.querySelector('[data-tool="redo"]').disabled = state.historyIndex >= state.history.length - 1;
    }

    // --- IMAGE & CANVAS HANDLING ---
    function handleImageUpload(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { resetAllState(); state.image = new Image(); state.image.src = event.target.result; state.image.onload = () => { createImageAndCanvas(); uploadContainer.style.display = 'none'; }; }; reader.readAsDataURL(file); }

    function createImageAndCanvas() {
        state.imageContainer = document.createElement('div');
        state.imageContainer.className = 'image-container';
        
        state.baseCanvas = document.createElement('canvas');
        state.baseCanvas.id = 'base-canvas';
        
        state.drawCanvas = document.createElement('canvas');
        state.drawCanvas.id = 'draw-canvas';
        state.drawCtx = state.drawCanvas.getContext('2d', { willReadFrequently: true });
        
        state.imageContainer.append(state.baseCanvas, state.drawCanvas);
        canvasArea.appendChild(state.imageContainer);
        
        syncCanvasAndContainerSize();
        
        const baseCtx = state.baseCanvas.getContext('2d');
        baseCtx.drawImage(state.image, 0, 0, state.baseCanvas.width, state.baseCanvas.height);
        
        saveState(); // Save initial state for undo
        setActiveTool('brush');
    }

    function syncCanvasAndContainerSize() {
        if (!state.image) return;
        const canvasAreaRect = canvasArea.getBoundingClientRect();
        const maxW = canvasAreaRect.width * 0.9;
        const maxH = canvasAreaRect.height * 0.9;
        const imgAspectRatio = state.image.naturalWidth / state.image.naturalHeight;
        let w = state.image.naturalWidth;
        let h = state.image.naturalHeight;
        if (w > maxW) { w = maxW; h = w / imgAspectRatio; }
        if (h > maxH) { h = maxH; w = h * imgAspectRatio; }
        [state.imageContainer, state.baseCanvas, state.drawCanvas].forEach(el => {
            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            if (el.tagName === 'CANVAS') {
                el.width = state.image.naturalWidth > 1024 ? 1024 : state.image.naturalWidth;
                el.height = state.image.naturalHeight > 1024 ? 1024 : state.image.naturalHeight;
            }
        });
        if (state.baseCanvas.getContext('2d')) {
             state.baseCanvas.getContext('2d').drawImage(state.image, 0, 0, state.baseCanvas.width, state.baseCanvas.height);
        }
    }

    function resetAllState() { if (state.imageContainer) state.imageContainer.remove(); canvasArea.appendChild(uploadContainer); uploadContainer.style.display = 'flex'; state = { ...state, image: null, isMaskDrawn: false, history: [], historyIndex: -1 }; updateUndoRedoButtons(); }

    // --- TOOL & INTERACTION LOGIC ---
    function handleToolChange(e) { const toolBtn = e.target.closest('.tool-btn'); if (!toolBtn) return; const toolName = toolBtn.dataset.tool; if (toolName === 'reset') { resetAllState(); } else if (toolName === 'undo') { undo(); } else if (toolName === 'redo') { redo(); } else { setActiveTool(toolName); } }
    function setActiveTool(toolName) { state.activeTool = toolName; toolList.querySelector('.active')?.classList.remove('active'); const newActiveBtn = toolList.querySelector(`[data-tool="${toolName}"]`); if (newActiveBtn) newActiveBtn.classList.add('active'); if (state.imageContainer) { state.imageContainer.className = `image-container tool-${toolName}`; state.drawCanvas.onmousedown = { brush: startDrawing, eraser: startErasing, pan: startPanning }[state.activeTool] || null; } }
    function handleKeyboardShortcuts(e) { if (e.target.tagName === 'TEXTAREA') return; const keyMap = { b: 'brush', e: 'eraser', h: 'pan' }; if (keyMap[e.key]) setActiveTool(keyMap[e.key]); if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); } }
    function startPanning(e) { let panStart = { x: e.clientX, y: e.clientY }; let containerStart = { x: state.imageContainer.offsetLeft, y: state.imageContainer.offsetTop }; const doPanning = (e) => { const dx = e.clientX - panStart.x; const dy = e.clientY - panStart.y; state.imageContainer.style.left = `${containerStart.x + dx}px`; state.imageContainer.style.top = `${containerStart.y + dy}px`; }; const stopPanning = () => { document.removeEventListener('mousemove', doPanning); document.removeEventListener('mouseup', stopPanning); }; document.addEventListener('mousemove', doPanning); document.addEventListener('mouseup', stopPanning); }

    // --- DRAWING, ERASING & GENERATION ---
    function startDrawing(e) { state.isDrawing = true; state.isMaskDrawn = false; state.drawCtx.clearRect(0, 0, state.drawCanvas.width, state.drawCanvas.height); state.drawCtx.beginPath(); state.drawCtx.moveTo(e.offsetX * (state.drawCanvas.width / state.drawCanvas.offsetWidth), e.offsetY * (state.drawCanvas.height / state.drawCanvas.offsetHeight)); state.drawCanvas.onmousemove = doDrawing; state.drawCanvas.onmouseup = stopDrawing; }
    function doDrawing(e) { if (!state.isDrawing) return; state.drawCtx.lineWidth = 60; state.drawCtx.lineCap = 'round'; state.drawCtx.strokeStyle = 'rgba(0,0,0,1)'; state.drawCtx.lineTo(e.offsetX * (state.drawCanvas.width / state.drawCanvas.offsetWidth), e.offsetY * (state.drawCanvas.height / state.drawCanvas.offsetHeight)); state.drawCtx.stroke(); }
    function stopDrawing() { state.isDrawing = false; state.isMaskDrawn = true; updateGenerateButtonState(); state.drawCanvas.onmousemove = null; }

    function startErasing(e) { state.isDrawing = true; const erase = (e) => { if (!state.isDrawing) return; const x = e.offsetX * (state.baseCanvas.width / state.baseCanvas.offsetWidth); const y = e.offsetY * (state.baseCanvas.height / state.baseCanvas.offsetHeight); state.baseCanvas.getContext('2d').globalCompositeOperation = 'destination-out'; state.baseCanvas.getContext('2d').beginPath(); state.baseCanvas.getContext('2d').arc(x, y, 30, 0, Math.PI * 2); state.baseCanvas.getContext('2d').fill(); }; erase(e); state.drawCanvas.onmousemove = erase; state.drawCanvas.onmouseup = () => { state.isDrawing = false; state.baseCanvas.getContext('2d').globalCompositeOperation = 'source-over'; saveState(); state.drawCanvas.onmousemove = null; }; }
    
    function updateGenerateButtonState() { generateBtn.disabled = !state.isMaskDrawn || !promptInput.value.trim(); }
    
    function showLoader(onComplete) {
        const loader = document.createElement('div');
        loader.className = 'loader-overlay';
        loader.innerHTML = `<div class="loader-text">Contacting DALL-E... <span id="progress-percent">0%</span></div><div class="progress-bar-container"><div id="progress-bar" class="progress-bar"></div></div>`;
        (state.imageContainer || canvasArea).appendChild(loader);
        let progress = 0;
        const interval = setInterval(() => {
            progress += 2;
            getEl('progress-percent').textContent = `${Math.round(progress)}%`;
            getEl('progress-bar').style.width = `${progress}%`;
            if (progress >= 100) { clearInterval(interval); onComplete(); loader.remove(); }
        }, 120);
    }

    function getApiKey() { if (!state.apiKey) { state.apiKey = prompt("Please enter your OpenAI API key to proceed:"); } return state.apiKey; }

    async function handleGeneration() {
        if (generateBtn.disabled) return;
        const apiKey = getApiKey();
        if (!apiKey) return;

        generateBtn.disabled = true;
        showLoader(async () => {
            try {
                // This is the crucial part: create a temporary canvas for the mask
                const maskBlob = await new Promise(resolve => state.drawCanvas.toBlob(resolve, 'image/png'));
                const originalImageBlob = await new Promise(resolve => state.baseCanvas.toBlob(resolve, 'image/png'));

                const formData = new FormData();
                formData.append('image', originalImageBlob);
                formData.append('mask', maskBlob);
                formData.append('prompt', promptInput.value);
                formData.append('n', 1);
                formData.append('size', '1024x1024');

                // Using a CORS proxy to bypass browser restrictions for this demo.
                // In a real app, this API call should be made from a server.
                const response = await fetch("https://cors-anywhere.herokuapp.com/https://api.openai.com/v1/images/edits", {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error.message || 'Server returned an error');
                }
                
                const data = await response.json();
                const resultImg = new Image();
                resultImg.crossOrigin = 'Anonymous';
                resultImg.onload = () => {
                    const baseCtx = state.baseCanvas.getContext('2d');
                    baseCtx.drawImage(resultImg, 0, 0, state.baseCanvas.width, state.baseCanvas.height);
                    saveState(); // Save the final result
                };
                resultImg.src = data.data[0].url;

            } catch (error) {
                console.error("Generation failed:", error);
                alert(`Image generation failed: ${error.message}. You may need to enable the CORS proxy demo at https://cors-anywhere.herokuapp.com/corsdemo`);
            } finally {
                state.isMaskDrawn = false;
                state.drawCtx.clearRect(0, 0, state.drawCanvas.width, state.drawCanvas.height);
                updateGenerateButtonState();
            }
        });
    }
});
