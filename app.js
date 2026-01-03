/**
 * OUROTUS ATLAS - Main Application
 * Handles UI interactions, modals, and orchestrates all modules
 */

const App = (function() {
    // Current state
    let currentLorebookId = null;
    let currentCelestialId = null;
    
    /**
     * Initialize the application
     */
    async function init() {
        try {
            // Initialize data manager
            await DataManager.init();
            
            // Initialize celestial renderer
            CelestialRenderer.init('celestial-viewport');
            
            // Setup UI
            setupEventListeners();
            
            // Load initial data
            loadWorldInfo();
            loadCelestialBodies();
            loadLorebooks();
            
            // Subscribe to data changes
            DataManager.subscribe('*', handleDataChange);
            
            // Load settings
            applySettings();
            
            showToast('World data loaded', 'success');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            showToast('Failed to initialize application', 'error');
        }
    }
    
    /**
     * Setup all event listeners
     */
    function setupEventListeners() {
        // Data status controls
        document.getElementById('save-cache-btn').addEventListener('click', saveToCache);
        document.getElementById('download-data-btn').addEventListener('click', downloadData);
        document.getElementById('upload-data-input').addEventListener('change', uploadData);
        document.getElementById('reset-data-btn').addEventListener('click', resetData);
        
        // Celestial controls
        document.getElementById('rotate-toggle').addEventListener('click', toggleRotation);
        document.getElementById('grid-toggle').addEventListener('click', toggleGrid);
        document.getElementById('clouds-toggle').addEventListener('click', toggleAtmosphere);
        document.getElementById('labels-toggle').addEventListener('click', toggleLabels);
        document.getElementById('zoom-in').addEventListener('click', () => CelestialRenderer.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => CelestialRenderer.zoomOut());
        document.getElementById('reset-view').addEventListener('click', () => CelestialRenderer.resetView());
        
        // Add celestial body
        document.getElementById('add-celestial-btn').addEventListener('click', () => openCelestialModal());
        document.getElementById('celestial-settings-btn').addEventListener('click', () => {
            const currentId = CelestialRenderer.getCurrentBodyId();
            if (currentId) {
                openCelestialModal(currentId);
            }
        });
        
        // Texture upload
        setupTextureUpload();
        
        // Add lorebook
        document.getElementById('add-lorebook-btn').addEventListener('click', () => openLorebookModal());
        
        // Lorebook search
        document.getElementById('lorebook-search').addEventListener('input', (e) => {
            filterLorebooks(e.target.value);
        });
        
        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.modal;
                closeModal(modalId);
            });
        });
        
        document.querySelectorAll('[data-modal]').forEach(btn => {
            if (btn.classList.contains('btn-secondary')) {
                btn.addEventListener('click', () => {
                    const modalId = btn.dataset.modal;
                    closeModal(modalId);
                });
            }
        });
        
        // Modal overlay click to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal(overlay.id);
                }
            });
        });
        
        // Lorebook modal
        document.getElementById('save-lorebook-btn').addEventListener('click', saveLorebook);
        document.getElementById('delete-lorebook-btn').addEventListener('click', deleteLorebook);
        document.getElementById('lorebook-icon').addEventListener('input', updateIconPreview);
        
        // Celestial modal
        document.getElementById('save-celestial-btn').addEventListener('click', saveCelestial);
        document.getElementById('delete-celestial-btn').addEventListener('click', deleteCelestial);
        document.getElementById('add-stat-btn').addEventListener('click', addStatField);
        document.getElementById('celestial-atmosphere').addEventListener('change', (e) => {
            document.querySelector('.atmosphere-options').style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Lorebook viewer
        document.getElementById('edit-current-lorebook').addEventListener('click', () => {
            if (currentLorebookId) {
                closeModal('lorebook-viewer-modal');
                openLorebookModal(currentLorebookId);
            }
        });
        
        // Warn before leaving if unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (DataManager.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    }
    
    /**
     * Setup texture upload with drag and drop
     */
    function setupTextureUpload() {
        const dropZone = document.getElementById('texture-drop-zone');
        const fileInput = document.getElementById('texture-upload');
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleTextureUpload(file);
            }
        });
        
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleTextureUpload(file);
            }
        });
    }
    
    /**
     * Handle texture file upload
     */
    function handleTextureUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const textureUrl = e.target.result;
            CelestialRenderer.setCustomTexture(textureUrl);
            
            // Save to current celestial body
            const currentId = CelestialRenderer.getCurrentBodyId();
            if (currentId) {
                DataManager.updateCelestialBody(currentId, { texture: textureUrl });
            }
            
            showToast('Texture applied successfully', 'success');
        };
        reader.readAsDataURL(file);
    }
    
    /**
     * Load world info into header
     */
    function loadWorldInfo() {
        const meta = DataManager.getMeta();
        document.getElementById('world-title').textContent = meta.worldName;
        document.getElementById('world-subtitle').textContent = meta.worldSubtitle;
    }
    
    /**
     * Load celestial bodies into selector and render first one
     */
    function loadCelestialBodies() {
        const bodies = DataManager.getCelestialBodies();
        const selector = document.getElementById('celestial-selector');
        const settings = DataManager.getSettings();
        
        selector.innerHTML = '';
        
        bodies.forEach((body, index) => {
            const tab = document.createElement('button');
            tab.className = 'celestial-tab';
            tab.textContent = body.name;
            tab.dataset.id = body.id;
            
            if (body.id === settings.defaultCelestialId || (index === 0 && !settings.defaultCelestialId)) {
                tab.classList.add('active');
                loadCelestialBody(body.id);
            }
            
            tab.addEventListener('click', () => {
                document.querySelectorAll('.celestial-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                loadCelestialBody(body.id);
            });
            
            selector.appendChild(tab);
        });
    }
    
    /**
     * Load a specific celestial body
     */
    function loadCelestialBody(id) {
        const body = DataManager.getCelestialBody(id);
        if (!body) return;
        
        currentCelestialId = id;
        CelestialRenderer.loadCelestialBody(body);
        renderCelestialStats(body);
    }
    
    /**
     * Render celestial body stats
     */
    function renderCelestialStats(body) {
        const container = document.getElementById('celestial-stats');
        container.innerHTML = '';
        
        if (!body.stats || body.stats.length === 0) return;
        
        body.stats.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-value">${stat.value}</div>
                <div class="stat-label">${stat.label}</div>
            `;
            container.appendChild(card);
        });
    }
    
    /**
     * Load lorebooks into grid
     */
    function loadLorebooks() {
        const lorebooks = DataManager.getLorebooks();
        renderLorebooks(lorebooks);
    }
    
    /**
     * Render lorebooks to grid
     */
    function renderLorebooks(lorebooks) {
        const container = document.getElementById('lorebooks-container');
        container.innerHTML = '';
        
        lorebooks.forEach(lorebook => {
            const card = createLorebookCard(lorebook);
            container.appendChild(card);
        });
    }
    
    /**
     * Create a lorebook card element
     */
    function createLorebookCard(lorebook) {
        const card = document.createElement('div');
        card.className = 'lorebook-card';
        card.dataset.id = lorebook.id;
        
        card.innerHTML = `
            <div class="lorebook-inner">
                <div class="lorebook-cover" style="background: linear-gradient(145deg, ${lorebook.color}, ${adjustColor(lorebook.color, -30)})">
                    <div class="lorebook-spine" style="background: ${adjustColor(lorebook.color, -50)}"></div>
                    <i class="${lorebook.icon} lorebook-icon"></i>
                    <h3 class="lorebook-title">${escapeHtml(lorebook.title)}</h3>
                    <p class="lorebook-subtitle">${escapeHtml(lorebook.subtitle)}</p>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openLorebookViewer(lorebook.id);
        });
        
        return card;
    }
    
    /**
     * Filter lorebooks by search query
     */
    function filterLorebooks(query) {
        if (!query.trim()) {
            loadLorebooks();
            return;
        }
        
        const filtered = DataManager.searchLorebooks(query);
        renderLorebooks(filtered);
    }
    
    /**
     * Open lorebook viewer modal
     */
    function openLorebookViewer(id) {
        const lorebook = DataManager.getLorebook(id);
        if (!lorebook) return;
        
        currentLorebookId = id;
        
        document.getElementById('viewer-icon').className = lorebook.icon;
        document.getElementById('viewer-title').textContent = lorebook.title;
        
        // Render markdown content
        const content = document.getElementById('viewer-content');
        content.innerHTML = marked.parse(lorebook.content);
        
        openModal('lorebook-viewer-modal');
    }
    
    /**
     * Open lorebook editor modal
     */
    function openLorebookModal(id = null) {
        const modal = document.getElementById('lorebook-modal');
        const title = document.getElementById('lorebook-modal-title');
        const deleteBtn = document.getElementById('delete-lorebook-btn');
        
        if (id) {
            const lorebook = DataManager.getLorebook(id);
            if (!lorebook) return;
            
            title.textContent = 'Edit Lorebook';
            deleteBtn.style.display = 'inline-flex';
            
            document.getElementById('lorebook-edit-id').value = id;
            document.getElementById('lorebook-title').value = lorebook.title;
            document.getElementById('lorebook-subtitle').value = lorebook.subtitle;
            document.getElementById('lorebook-icon').value = lorebook.icon;
            document.getElementById('lorebook-color').value = lorebook.color;
            document.getElementById('lorebook-content').value = lorebook.content;
            document.getElementById('lorebook-tags').value = lorebook.tags.join(', ');
            
            updateIconPreview();
        } else {
            title.textContent = 'New Lorebook';
            deleteBtn.style.display = 'none';
            
            document.getElementById('lorebook-edit-id').value = '';
            document.getElementById('lorebook-title').value = '';
            document.getElementById('lorebook-subtitle').value = '';
            document.getElementById('lorebook-icon').value = 'fas fa-book';
            document.getElementById('lorebook-color').value = '#5a3a2a';
            document.getElementById('lorebook-content').value = '';
            document.getElementById('lorebook-tags').value = '';
            
            updateIconPreview();
        }
        
        openModal('lorebook-modal');
    }
    
    /**
     * Save lorebook from modal
     */
    function saveLorebook() {
        const id = document.getElementById('lorebook-edit-id').value;
        const data = {
            title: document.getElementById('lorebook-title').value,
            subtitle: document.getElementById('lorebook-subtitle').value,
            icon: document.getElementById('lorebook-icon').value,
            color: document.getElementById('lorebook-color').value,
            content: document.getElementById('lorebook-content').value,
            tags: document.getElementById('lorebook-tags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t)
        };
        
        if (!data.title) {
            showToast('Please enter a title', 'warning');
            return;
        }
        
        if (id) {
            DataManager.updateLorebook(id, data);
            showToast('Lorebook updated', 'success');
        } else {
            DataManager.addLorebook(data);
            showToast('Lorebook created', 'success');
        }
        
        closeModal('lorebook-modal');
        loadLorebooks();
    }
    
    /**
     * Delete lorebook
     */
    function deleteLorebook() {
        const id = document.getElementById('lorebook-edit-id').value;
        if (!id) return;
        
        if (confirm('Are you sure you want to delete this lorebook?')) {
            DataManager.deleteLorebook(id);
            closeModal('lorebook-modal');
            loadLorebooks();
            showToast('Lorebook deleted', 'success');
        }
    }
    
    /**
     * Update icon preview in lorebook modal
     */
    function updateIconPreview() {
        const iconClass = document.getElementById('lorebook-icon').value;
        const preview = document.getElementById('lorebook-icon-preview');
        preview.innerHTML = `<i class="${iconClass}"></i>`;
    }
    
    /**
     * Open celestial editor modal
     */
    function openCelestialModal(id = null) {
        const modal = document.getElementById('celestial-modal');
        const title = document.getElementById('celestial-modal-title');
        const deleteBtn = document.getElementById('delete-celestial-btn');
        
        if (id) {
            const body = DataManager.getCelestialBody(id);
            if (!body) return;
            
            title.textContent = 'Edit Celestial Body';
            deleteBtn.style.display = 'inline-flex';
            
            document.getElementById('celestial-edit-id').value = id;
            document.getElementById('celestial-name').value = body.name;
            document.getElementById('celestial-type').value = body.type;
            document.getElementById('celestial-radius').value = body.radius;
            document.getElementById('celestial-rotation').value = body.rotationSpeed;
            document.getElementById('celestial-description').value = body.description || '';
            document.getElementById('celestial-color1').value = body.colors.primary;
            document.getElementById('celestial-color2').value = body.colors.secondary;
            document.getElementById('celestial-color3').value = body.colors.accent;
            document.getElementById('celestial-atmosphere').checked = body.atmosphere?.enabled ?? true;
            document.getElementById('celestial-atmo-color').value = body.atmosphere?.color || '#ffffff';
            
            document.querySelector('.atmosphere-options').style.display = 
                body.atmosphere?.enabled ? 'block' : 'none';
            
            // Load stats
            renderStatsEditor(body.stats || []);
        } else {
            title.textContent = 'New Celestial Body';
            deleteBtn.style.display = 'none';
            
            document.getElementById('celestial-edit-id').value = '';
            document.getElementById('celestial-name').value = '';
            document.getElementById('celestial-type').value = 'planet';
            document.getElementById('celestial-radius').value = '3';
            document.getElementById('celestial-rotation').value = '0.002';
            document.getElementById('celestial-description').value = '';
            document.getElementById('celestial-color1').value = '#1a3a5f';
            document.getElementById('celestial-color2').value = '#2a7a3a';
            document.getElementById('celestial-color3').value = '#d4a460';
            document.getElementById('celestial-atmosphere').checked = true;
            document.getElementById('celestial-atmo-color').value = '#ffffff';
            
            document.querySelector('.atmosphere-options').style.display = 'block';
            
            renderStatsEditor([]);
        }
        
        openModal('celestial-modal');
    }
    
    /**
     * Render stats editor fields
     */
    function renderStatsEditor(stats) {
        const container = document.getElementById('celestial-stats-editor');
        container.innerHTML = '';
        
        stats.forEach((stat, index) => {
            addStatField(stat.label, stat.value);
        });
    }
    
    /**
     * Add a stat field to the editor
     */
    function addStatField(label = '', value = '') {
        const container = document.getElementById('celestial-stats-editor');
        const row = document.createElement('div');
        row.className = 'stat-editor-row';
        row.innerHTML = `
            <input type="text" placeholder="Label (e.g., Diameter)" value="${escapeHtml(label)}" class="stat-label-input">
            <input type="text" placeholder="Value (e.g., 12,742 km)" value="${escapeHtml(value)}" class="stat-value-input">
            <button type="button" class="remove-stat-btn"><i class="fas fa-times"></i></button>
        `;
        
        row.querySelector('.remove-stat-btn').addEventListener('click', () => {
            row.remove();
        });
        
        container.appendChild(row);
    }
    
    /**
     * Save celestial body from modal
     */
    function saveCelestial() {
        const id = document.getElementById('celestial-edit-id').value;
        
        // Gather stats
        const stats = [];
        document.querySelectorAll('.stat-editor-row').forEach(row => {
            const label = row.querySelector('.stat-label-input').value.trim();
            const value = row.querySelector('.stat-value-input').value.trim();
            if (label && value) {
                stats.push({ label, value });
            }
        });
        
        const data = {
            name: document.getElementById('celestial-name').value,
            type: document.getElementById('celestial-type').value,
            radius: parseFloat(document.getElementById('celestial-radius').value),
            rotationSpeed: parseFloat(document.getElementById('celestial-rotation').value),
            description: document.getElementById('celestial-description').value,
            colors: {
                primary: document.getElementById('celestial-color1').value,
                secondary: document.getElementById('celestial-color2').value,
                accent: document.getElementById('celestial-color3').value,
                polar: '#e8f8f8'
            },
            atmosphere: {
                enabled: document.getElementById('celestial-atmosphere').checked,
                color: document.getElementById('celestial-atmo-color').value,
                opacity: 0.7
            },
            stats
        };
        
        if (!data.name) {
            showToast('Please enter a name', 'warning');
            return;
        }
        
        if (id) {
            DataManager.updateCelestialBody(id, data);
            showToast('Celestial body updated', 'success');
            
            // Reload if currently viewing this body
            if (CelestialRenderer.getCurrentBodyId() === id) {
                loadCelestialBody(id);
            }
        } else {
            const newBody = DataManager.addCelestialBody(data);
            showToast('Celestial body created', 'success');
        }
        
        closeModal('celestial-modal');
        loadCelestialBodies();
    }
    
    /**
     * Delete celestial body
     */
    function deleteCelestial() {
        const id = document.getElementById('celestial-edit-id').value;
        if (!id) return;
        
        const bodies = DataManager.getCelestialBodies();
        if (bodies.length <= 1) {
            showToast('Cannot delete the last celestial body', 'warning');
            return;
        }
        
        if (confirm('Are you sure you want to delete this celestial body?')) {
            DataManager.deleteCelestialBody(id);
            closeModal('celestial-modal');
            loadCelestialBodies();
            showToast('Celestial body deleted', 'success');
        }
    }
    
    /**
     * Toggle rotation
     */
    function toggleRotation() {
        const btn = document.getElementById('rotate-toggle');
        const isRotating = CelestialRenderer.toggleRotation();
        btn.classList.toggle('active', isRotating);
    }
    
    /**
     * Toggle grid
     */
    function toggleGrid() {
        const btn = document.getElementById('grid-toggle');
        const showGrid = CelestialRenderer.toggleGrid();
        btn.classList.toggle('active', showGrid);
    }
    
    /**
     * Toggle atmosphere/clouds
     */
    function toggleAtmosphere() {
        const btn = document.getElementById('clouds-toggle');
        const showAtmo = CelestialRenderer.toggleAtmosphere();
        btn.classList.toggle('active', showAtmo);
    }
    
    /**
     * Toggle labels
     */
    function toggleLabels() {
        const btn = document.getElementById('labels-toggle');
        const showLabels = CelestialRenderer.toggleLabels();
        btn.classList.toggle('active', showLabels);
    }
    
    /**
     * Apply settings from data
     */
    function applySettings() {
        const settings = DataManager.getSettings();
        
        CelestialRenderer.setRotation(settings.autoRotate);
        CelestialRenderer.setGrid(settings.showGrid);
        CelestialRenderer.setAtmosphere(settings.showAtmosphere);
        
        document.getElementById('rotate-toggle').classList.toggle('active', settings.autoRotate);
        document.getElementById('grid-toggle').classList.toggle('active', settings.showGrid);
        document.getElementById('clouds-toggle').classList.toggle('active', settings.showAtmosphere);
        document.getElementById('labels-toggle').classList.toggle('active', settings.showLabels);
    }
    
    /**
     * Save to browser cache
     */
    async function saveToCache() {
        const success = await DataManager.saveToCache();
        if (success) {
            showToast('Data saved to browser cache', 'success');
        } else {
            showToast('Failed to save to cache', 'error');
        }
    }
    
    /**
     * Download data as JSON file
     */
    function downloadData() {
        DataManager.exportData();
        showToast('DATA.json downloaded', 'success');
    }
    
    /**
     * Upload data from JSON file
     */
    async function uploadData(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            await DataManager.importData(file);
            
            // Reload everything
            loadWorldInfo();
            loadCelestialBodies();
            loadLorebooks();
            applySettings();
            
            showToast('Data imported successfully', 'success');
        } catch (error) {
            console.error('Import error:', error);
            showToast('Failed to import data: ' + error.message, 'error');
        }
        
        // Reset file input
        e.target.value = '';
    }
    
    /**
     * Reset to default data
     */
    async function resetData() {
        if (!confirm('Are you sure you want to reset all data to defaults? This cannot be undone.')) {
            return;
        }
        
        await DataManager.resetToDefault();
        
        // Reload everything
        loadWorldInfo();
        loadCelestialBodies();
        loadLorebooks();
        applySettings();
        
        showToast('Data reset to defaults', 'success');
    }
    
    /**
     * Handle data change events
     */
    function handleDataChange(data) {
        // Data has changed, UI should react
        console.log('Data changed:', data);
    }
    
    /**
     * Open a modal
     */
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    /**
     * Close a modal
     */
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="${icons[type]}"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Adjust color brightness
     */
    function adjustColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
        const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
        const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
        return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    }
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Public API
    return {
        showToast,
        openLorebookModal,
        openCelestialModal,
        loadLorebooks,
        loadCelestialBodies
    };
})();

// Make available globally
window.App = App;
