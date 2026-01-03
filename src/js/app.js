/**
 * Ourotus Atlas - Main Application
 */

const App = {
  // Current state
  state: {
    activeNotebook: null,
    activeSection: null,
    activePage: null,
    activeTab: 'map', // 'map' or 'lorebook'
    isEditing: false,
    viewMode: 'edit' // 'edit' or 'preview'
  },
  
  // Editor autosave timeout
  editorTimeout: null,
  
  /**
   * Initialize the application
   */
  async init() {
    // Initialize database
    await DB.init();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize hex map
    HexMap.init('hexmap-container');
    HexMap.onHexSelect = (hex, data) => this.onHexSelect(hex, data);
    
    // Render initial UI
    this.renderNotebooks();
    this.renderBiomes();
    this.updateSyncStatus();
    this.updateWorldTitle();
    
    // Select first notebook if exists
    if (DB.data.notebooks.length > 0) {
      this.selectNotebook(DB.data.notebooks[0].id);
    }
    
    // Listen for data changes
    DB.on('change', () => this.onDataChange());
    DB.on('sync', (data) => this.updateSyncStatus(data));
    
    console.log('Ourotus Atlas initialized');
  },
  
  /**
   * Set up UI event listeners
   */
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });
    
    // Header actions
    document.getElementById('btn-save')?.addEventListener('click', () => this.saveToCache());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportData());
    document.getElementById('btn-import')?.addEventListener('click', () => this.showImportDialog());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.confirmReset());
    
    // Import file input
    document.getElementById('import-input')?.addEventListener('change', (e) => this.importData(e));
    
    // Notebook actions
    document.getElementById('btn-add-notebook')?.addEventListener('click', () => this.showNotebookModal());
    
    // Section actions
    document.getElementById('btn-add-section')?.addEventListener('click', () => this.showSectionModal());
    
    // Page actions
    document.getElementById('btn-add-page')?.addEventListener('click', () => this.addPage());
    document.getElementById('btn-delete-page')?.addEventListener('click', () => this.deletePage());
    
    // Editor
    document.getElementById('page-title')?.addEventListener('input', (e) => this.onPageTitleChange(e));
    document.getElementById('page-content')?.addEventListener('input', (e) => this.onPageContentChange(e));
    
    // View mode toggle
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => this.setViewMode('edit'));
    document.getElementById('btn-preview-mode')?.addEventListener('click', () => this.setViewMode('preview'));
    
    // Hex map controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => HexMap.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => HexMap.zoomOut());
    document.getElementById('btn-reset-view')?.addEventListener('click', () => HexMap.resetView());
    
    // Hex editing
    document.getElementById('hex-biome')?.addEventListener('change', (e) => this.onHexBiomeChange(e));
    document.getElementById('hex-label')?.addEventListener('input', (e) => this.onHexLabelChange(e));
    document.getElementById('hex-notes')?.addEventListener('input', (e) => this.onHexNotesChange(e));
    
    // Biome management
    document.getElementById('btn-add-biome')?.addEventListener('click', () => this.showBiomeModal());
    
    // Modal close handlers
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModals();
      });
    });
    
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  },
  
  /**
   * Switch between main tabs
   */
  switchTab(tab) {
    this.state.activeTab = tab;
    
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.getElementById('map-panel')?.classList.toggle('hidden', tab !== 'map');
    document.getElementById('lorebook-panel')?.classList.toggle('hidden', tab !== 'lorebook');
    
    if (tab === 'map') {
      HexMap.resize();
    }
  },
  
  /**
   * Update world title in header
   */
  updateWorldTitle() {
    const titleEl = document.getElementById('world-title');
    const subtitleEl = document.getElementById('world-subtitle');
    
    if (titleEl && DB.data.meta) {
      titleEl.textContent = DB.data.meta.name || 'Ourotus Atlas';
    }
    if (subtitleEl && DB.data.meta) {
      subtitleEl.textContent = DB.data.meta.subtitle || 'Your world awaits';
    }
  },
  
  /**
   * Update sync status indicator
   */
  updateSyncStatus(data) {
    const statusEl = document.getElementById('sync-status');
    const statusText = document.getElementById('sync-text');
    
    if (!statusEl) return;
    
    statusEl.classList.remove('modified', 'error');
    
    if (data?.status === 'modified') {
      statusEl.classList.add('modified');
      statusText.textContent = 'Unsaved changes';
    } else if (data?.status === 'error') {
      statusEl.classList.add('error');
      statusText.textContent = 'Sync error';
    } else {
      statusText.textContent = 'All saved';
    }
  },
  
  // ============================================
  // Notebook/Section/Page Management
  // ============================================
  
  /**
   * Render notebook list
   */
  renderNotebooks() {
    const container = document.getElementById('notebook-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    DB.data.notebooks.forEach(notebook => {
      const sections = DB.getSectionsForNotebook(notebook.id);
      const isExpanded = this.state.activeNotebook === notebook.id;
      
      const item = document.createElement('li');
      item.className = `notebook-item ${isExpanded ? 'expanded' : ''}`;
      item.innerHTML = `
        <div class="notebook-header ${isExpanded ? 'active' : ''}" data-notebook="${notebook.id}">
          <div class="notebook-icon" style="background: ${notebook.color}">
            <i class="${notebook.icon}"></i>
          </div>
          <span class="notebook-name">${this.escapeHtml(notebook.name)}</span>
          <i class="fas fa-chevron-right notebook-chevron"></i>
        </div>
        <ul class="section-list">
          ${sections.map(section => `
            <li class="section-item ${this.state.activeSection === section.id ? 'active' : ''}" 
                data-section="${section.id}">
              <span class="section-color" style="background: ${section.color}"></span>
              <span class="section-name">${this.escapeHtml(section.name)}</span>
            </li>
          `).join('')}
        </ul>
      `;
      
      container.appendChild(item);
      
      // Notebook click handler
      item.querySelector('.notebook-header').addEventListener('click', () => {
        this.selectNotebook(notebook.id);
      });
      
      // Notebook context menu
      item.querySelector('.notebook-header').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, [
          { label: 'Edit Notebook', icon: 'fa-edit', action: () => this.showNotebookModal(notebook) },
          { label: 'Add Section', icon: 'fa-plus', action: () => this.showSectionModal(notebook.id) },
          { divider: true },
          { label: 'Delete Notebook', icon: 'fa-trash', danger: true, action: () => this.deleteNotebook(notebook.id) }
        ]);
      });
      
      // Section click handlers
      item.querySelectorAll('.section-item').forEach(sectionEl => {
        const sectionId = sectionEl.dataset.section;
        
        sectionEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectSection(sectionId);
        });
        
        sectionEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const section = DB.getSection(sectionId);
          this.showContextMenu(e, [
            { label: 'Edit Section', icon: 'fa-edit', action: () => this.showSectionModal(notebook.id, section) },
            { label: 'Add Page', icon: 'fa-plus', action: () => this.addPage(sectionId) },
            { divider: true },
            { label: 'Delete Section', icon: 'fa-trash', danger: true, action: () => this.deleteSection(sectionId) }
          ]);
        });
      });
    });
  },
  
  /**
   * Select a notebook
   */
  selectNotebook(notebookId) {
    const wasExpanded = this.state.activeNotebook === notebookId;
    
    if (wasExpanded) {
      // Toggle collapse
      this.state.activeNotebook = null;
    } else {
      this.state.activeNotebook = notebookId;
      
      // Select first section
      const sections = DB.getSectionsForNotebook(notebookId);
      if (sections.length > 0) {
        this.selectSection(sections[0].id);
      } else {
        this.state.activeSection = null;
        this.state.activePage = null;
        this.renderPages();
        this.renderEditor();
      }
    }
    
    this.renderNotebooks();
  },
  
  /**
   * Select a section
   */
  selectSection(sectionId) {
    this.state.activeSection = sectionId;
    
    // Get section's notebook
    const section = DB.getSection(sectionId);
    if (section) {
      this.state.activeNotebook = section.notebookId;
    }
    
    // Select first page
    const pages = DB.getPagesForSection(sectionId);
    if (pages.length > 0) {
      this.selectPage(pages[0].id);
    } else {
      this.state.activePage = null;
      this.renderEditor();
    }
    
    this.renderNotebooks();
    this.renderPages();
  },
  
  /**
   * Render page list
   */
  renderPages() {
    const container = document.getElementById('page-list');
    const sectionTitle = document.getElementById('section-title');
    
    if (!container) return;
    
    if (!this.state.activeSection) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-book-open empty-state-icon"></i>
          <p class="empty-state-text">Select a section to view pages</p>
        </div>
      `;
      if (sectionTitle) sectionTitle.textContent = '';
      return;
    }
    
    const section = DB.getSection(this.state.activeSection);
    if (sectionTitle && section) {
      sectionTitle.textContent = section.name;
    }
    
    const pages = DB.getPagesForSection(this.state.activeSection);
    
    if (pages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-file-alt empty-state-icon"></i>
          <p class="empty-state-text">No pages yet</p>
          <button class="btn btn-primary btn-sm" onclick="App.addPage()">
            <i class="fas fa-plus"></i> Add Page
          </button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = pages.map(page => `
      <li class="page-item ${this.state.activePage === page.id ? 'active' : ''}" 
          data-page="${page.id}">
        <div class="page-title">${this.escapeHtml(page.title)}</div>
        <div class="page-date">${this.formatDate(page.updatedAt)}</div>
      </li>
    `).join('');
    
    // Click handlers
    container.querySelectorAll('.page-item').forEach(el => {
      el.addEventListener('click', () => this.selectPage(el.dataset.page));
      
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, [
          { label: 'Delete Page', icon: 'fa-trash', danger: true, action: () => this.deletePage(el.dataset.page) }
        ]);
      });
    });
  },
  
  /**
   * Select a page
   */
  selectPage(pageId) {
    this.state.activePage = pageId;
    this.renderPages();
    this.renderEditor();
  },
  
  /**
   * Render page editor
   */
  renderEditor() {
    const titleInput = document.getElementById('page-title');
    const contentInput = document.getElementById('page-content');
    const previewContent = document.getElementById('preview-content');
    const editorPanel = document.getElementById('editor-panel');
    
    if (!this.state.activePage) {
      if (editorPanel) {
        editorPanel.innerHTML = `
          <div class="empty-state h-full">
            <i class="fas fa-feather-alt empty-state-icon"></i>
            <p class="empty-state-title">No page selected</p>
            <p class="empty-state-text">Select a page from the list or create a new one</p>
          </div>
        `;
      }
      return;
    }
    
    const page = DB.getPage(this.state.activePage);
    if (!page) return;
    
    // Restore editor structure if it was replaced
    if (!titleInput) {
      this.rebuildEditorPanel();
      return this.renderEditor();
    }
    
    titleInput.value = page.title;
    contentInput.value = page.content;
    
    // Render preview
    if (previewContent && typeof marked !== 'undefined') {
      previewContent.innerHTML = marked.parse(page.content || '');
    }
  },
  
  /**
   * Rebuild editor panel structure
   */
  rebuildEditorPanel() {
    const panel = document.getElementById('editor-panel');
    if (!panel) return;
    
    panel.innerHTML = `
      <div class="editor-header">
        <input type="text" id="page-title" class="editor-title-input" placeholder="Page Title">
        <div class="flex gap-sm">
          <button class="btn btn-ghost btn-sm" id="btn-edit-mode">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-ghost btn-sm" id="btn-preview-mode">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-ghost btn-sm text-danger" id="btn-delete-page">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="editor-content">
        <div id="edit-view">
          <textarea id="page-content" class="editor-textarea" placeholder="Write your content here... (Markdown supported)"></textarea>
        </div>
        <div id="preview-view" class="hidden">
          <div id="preview-content" class="preview-content"></div>
        </div>
      </div>
    `;
    
    // Re-attach event listeners
    document.getElementById('page-title')?.addEventListener('input', (e) => this.onPageTitleChange(e));
    document.getElementById('page-content')?.addEventListener('input', (e) => this.onPageContentChange(e));
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => this.setViewMode('edit'));
    document.getElementById('btn-preview-mode')?.addEventListener('click', () => this.setViewMode('preview'));
    document.getElementById('btn-delete-page')?.addEventListener('click', () => this.deletePage());
  },
  
  /**
   * Page title change handler
   */
  onPageTitleChange(e) {
    if (!this.state.activePage) return;
    
    clearTimeout(this.editorTimeout);
    this.editorTimeout = setTimeout(() => {
      DB.updatePage(this.state.activePage, { title: e.target.value });
      this.renderPages();
    }, 500);
  },
  
  /**
   * Page content change handler
   */
  onPageContentChange(e) {
    if (!this.state.activePage) return;
    
    clearTimeout(this.editorTimeout);
    this.editorTimeout = setTimeout(() => {
      DB.updatePage(this.state.activePage, { content: e.target.value });
      
      // Update preview
      const previewContent = document.getElementById('preview-content');
      if (previewContent && typeof marked !== 'undefined') {
        previewContent.innerHTML = marked.parse(e.target.value || '');
      }
    }, 500);
  },
  
  /**
   * Set view mode (edit/preview)
   */
  setViewMode(mode) {
    this.state.viewMode = mode;
    
    const editView = document.getElementById('edit-view');
    const previewView = document.getElementById('preview-view');
    
    if (editView) editView.classList.toggle('hidden', mode !== 'edit');
    if (previewView) previewView.classList.toggle('hidden', mode !== 'preview');
    
    document.getElementById('btn-edit-mode')?.classList.toggle('active', mode === 'edit');
    document.getElementById('btn-preview-mode')?.classList.toggle('active', mode === 'preview');
  },
  
  /**
   * Add new page
   */
  addPage(sectionId) {
    const targetSection = sectionId || this.state.activeSection;
    if (!targetSection) {
      this.showToast('Please select a section first', 'warning');
      return;
    }
    
    const page = DB.createPage(targetSection, { title: 'New Page' });
    this.selectPage(page.id);
    
    // Focus title input
    setTimeout(() => {
      document.getElementById('page-title')?.focus();
    }, 100);
  },
  
  /**
   * Delete current page
   */
  deletePage(pageId) {
    const targetPage = pageId || this.state.activePage;
    if (!targetPage) return;
    
    if (confirm('Delete this page? This cannot be undone.')) {
      DB.deletePage(targetPage);
      
      if (this.state.activePage === targetPage) {
        this.state.activePage = null;
        
        // Select another page
        const pages = DB.getPagesForSection(this.state.activeSection);
        if (pages.length > 0) {
          this.selectPage(pages[0].id);
        } else {
          this.renderEditor();
        }
      }
      
      this.renderPages();
      this.showToast('Page deleted', 'success');
    }
  },
  
  // ============================================
  // Hex Map Integration
  // ============================================
  
  /**
   * Hex selection handler
   */
  onHexSelect(hex, hexData) {
    const detailsPanel = document.getElementById('hex-details');
    if (!detailsPanel) return;
    
    const biome = DB.getBiome(hexData?.biomeId) || DB.data.biomes[0];
    
    detailsPanel.innerHTML = `
      <div class="hex-details-form">
        <div class="hex-details-header">
          <div class="hex-biome-color" id="hex-biome-color" style="background: ${biome?.color || '#333'}"></div>
          <div>
            <div style="font-weight: 500; margin-bottom: 2px;">${biome?.name || 'Unknown'}</div>
            <div class="hex-coords" id="hex-coords">(${hex.q}, ${hex.r})</div>
          </div>
        </div>
        
        <div class="hex-field">
          <label>Biome</label>
          <select id="hex-biome" class="input">
            ${DB.data.biomes.map(b => 
              `<option value="${b.id}" ${hexData?.biomeId === b.id ? 'selected' : ''}>${b.name}</option>`
            ).join('')}
          </select>
        </div>
        
        <div class="hex-field">
          <label>Label</label>
          <input type="text" id="hex-label" class="input" placeholder="Location name..." value="${this.escapeHtml(hexData?.label || '')}">
        </div>
        
        <div class="hex-field">
          <label>Notes</label>
          <textarea id="hex-notes" class="input" rows="4" placeholder="Notes about this hex...">${this.escapeHtml(hexData?.notes || '')}</textarea>
        </div>
        
        ${biome?.description ? `
          <div class="hex-field">
            <label>Biome Info</label>
            <p style="font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.5;">
              ${this.escapeHtml(biome.description)}
            </p>
          </div>
        ` : ''}
      </div>
    `;
    
    // Re-attach event listeners
    document.getElementById('hex-biome')?.addEventListener('change', (e) => this.onHexBiomeChange(e));
    document.getElementById('hex-label')?.addEventListener('input', (e) => this.onHexLabelChange(e));
    document.getElementById('hex-notes')?.addEventListener('input', (e) => this.onHexNotesChange(e));
  },
  
  /**
   * Hex biome change
   */
  onHexBiomeChange(e) {
    if (!HexMap.state.selectedHex) return;
    
    const { q, r } = HexMap.state.selectedHex;
    DB.updateHex(q, r, { biomeId: e.target.value });
    HexMap.render();
    
    // Update color preview
    const biome = DB.getBiome(e.target.value);
    const colorEl = document.getElementById('hex-biome-color');
    if (colorEl && biome) {
      colorEl.style.background = biome.color;
    }
  },
  
  /**
   * Hex label change
   */
  onHexLabelChange(e) {
    if (!HexMap.state.selectedHex) return;
    
    clearTimeout(this.hexEditTimeout);
    this.hexEditTimeout = setTimeout(() => {
      const { q, r } = HexMap.state.selectedHex;
      DB.updateHex(q, r, { label: e.target.value });
      HexMap.render();
    }, 500);
  },
  
  /**
   * Hex notes change
   */
  onHexNotesChange(e) {
    if (!HexMap.state.selectedHex) return;
    
    clearTimeout(this.hexEditTimeout);
    this.hexEditTimeout = setTimeout(() => {
      const { q, r } = HexMap.state.selectedHex;
      DB.updateHex(q, r, { notes: e.target.value });
    }, 500);
  },
  
  /**
   * Render biome list
   */
  renderBiomes() {
    const container = document.getElementById('biome-list');
    if (!container) return;
    
    container.innerHTML = DB.data.biomes.map(biome => `
      <li class="biome-item" data-biome="${biome.id}">
        <span class="biome-swatch" style="background: ${biome.color}"></span>
        <span class="biome-name">${this.escapeHtml(biome.name)}</span>
      </li>
    `).join('');
    
    container.querySelectorAll('.biome-item').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const biome = DB.getBiome(el.dataset.biome);
        this.showContextMenu(e, [
          { label: 'Edit Biome', icon: 'fa-edit', action: () => this.showBiomeModal(biome) },
          { divider: true },
          { label: 'Delete Biome', icon: 'fa-trash', danger: true, action: () => this.deleteBiome(el.dataset.biome) }
        ]);
      });
    });
  },
  
  // ============================================
  // Modals
  // ============================================
  
  /**
   * Show notebook modal
   */
  showNotebookModal(notebook = null) {
    const modal = document.getElementById('notebook-modal');
    if (!modal) return;
    
    const isEdit = !!notebook;
    
    document.getElementById('notebook-modal-title').textContent = isEdit ? 'Edit Notebook' : 'New Notebook';
    document.getElementById('notebook-id').value = notebook?.id || '';
    document.getElementById('notebook-name').value = notebook?.name || '';
    document.getElementById('notebook-icon').value = notebook?.icon || 'fas fa-book';
    document.getElementById('notebook-color').value = notebook?.color || '#6366f1';
    
    document.getElementById('btn-delete-notebook').classList.toggle('hidden', !isEdit);
    
    modal.classList.add('active');
    document.getElementById('notebook-name').focus();
    
    // Save handler
    document.getElementById('btn-save-notebook').onclick = () => {
      const data = {
        name: document.getElementById('notebook-name').value,
        icon: document.getElementById('notebook-icon').value,
        color: document.getElementById('notebook-color').value
      };
      
      if (isEdit) {
        DB.updateNotebook(notebook.id, data);
      } else {
        const newNotebook = DB.createNotebook(data);
        this.selectNotebook(newNotebook.id);
      }
      
      this.renderNotebooks();
      this.closeModals();
      this.showToast(isEdit ? 'Notebook updated' : 'Notebook created', 'success');
    };
    
    // Delete handler
    document.getElementById('btn-delete-notebook').onclick = () => {
      if (confirm('Delete this notebook and all its contents?')) {
        this.deleteNotebook(notebook.id);
        this.closeModals();
      }
    };
  },
  
  /**
   * Show section modal
   */
  showSectionModal(notebookId, section = null) {
    const modal = document.getElementById('section-modal');
    if (!modal) return;
    
    const targetNotebook = notebookId || this.state.activeNotebook;
    if (!targetNotebook) {
      this.showToast('Please select a notebook first', 'warning');
      return;
    }
    
    const isEdit = !!section;
    
    document.getElementById('section-modal-title').textContent = isEdit ? 'Edit Section' : 'New Section';
    document.getElementById('section-id').value = section?.id || '';
    document.getElementById('section-notebook-id').value = targetNotebook;
    document.getElementById('section-name').value = section?.name || '';
    document.getElementById('section-color').value = section?.color || '#6366f1';
    
    document.getElementById('btn-delete-section').classList.toggle('hidden', !isEdit);
    
    modal.classList.add('active');
    document.getElementById('section-name').focus();
    
    // Save handler
    document.getElementById('btn-save-section').onclick = () => {
      const data = {
        name: document.getElementById('section-name').value,
        color: document.getElementById('section-color').value
      };
      
      if (isEdit) {
        DB.updateSection(section.id, data);
      } else {
        const newSection = DB.createSection(targetNotebook, data);
        this.selectSection(newSection.id);
      }
      
      this.renderNotebooks();
      this.closeModals();
      this.showToast(isEdit ? 'Section updated' : 'Section created', 'success');
    };
    
    // Delete handler
    document.getElementById('btn-delete-section').onclick = () => {
      if (confirm('Delete this section and all its pages?')) {
        this.deleteSection(section.id);
        this.closeModals();
      }
    };
  },
  
  /**
   * Show biome modal
   */
  showBiomeModal(biome = null) {
    const modal = document.getElementById('biome-modal');
    if (!modal) return;
    
    const isEdit = !!biome;
    
    document.getElementById('biome-modal-title').textContent = isEdit ? 'Edit Biome' : 'New Biome';
    document.getElementById('biome-id').value = biome?.id || '';
    document.getElementById('biome-name').value = biome?.name || '';
    document.getElementById('biome-color').value = biome?.color || '#808080';
    document.getElementById('biome-description').value = biome?.description || '';
    
    document.getElementById('btn-delete-biome').classList.toggle('hidden', !isEdit);
    
    modal.classList.add('active');
    document.getElementById('biome-name').focus();
    
    // Save handler
    document.getElementById('btn-save-biome').onclick = () => {
      const data = {
        name: document.getElementById('biome-name').value,
        color: document.getElementById('biome-color').value,
        description: document.getElementById('biome-description').value
      };
      
      if (isEdit) {
        DB.updateBiome(biome.id, data);
      } else {
        data.id = data.name.toLowerCase().replace(/\s+/g, '_');
        DB.createBiome(data);
      }
      
      this.renderBiomes();
      HexMap.render();
      this.closeModals();
      this.showToast(isEdit ? 'Biome updated' : 'Biome created', 'success');
    };
    
    // Delete handler
    document.getElementById('btn-delete-biome').onclick = () => {
      if (!DB.deleteBiome(biome.id)) {
        this.showToast('Cannot delete biome in use', 'error');
        return;
      }
      this.renderBiomes();
      this.closeModals();
      this.showToast('Biome deleted', 'success');
    };
  },
  
  /**
   * Close all modals
   */
  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  },
  
  // ============================================
  // Context Menu
  // ============================================
  
  /**
   * Show context menu
   */
  showContextMenu(e, items) {
    // Remove existing
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    items.forEach(item => {
      if (item.divider) {
        menu.innerHTML += '<div class="context-menu-divider"></div>';
      } else {
        const el = document.createElement('div');
        el.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
        el.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
        el.addEventListener('click', () => {
          item.action();
          menu.remove();
        });
        menu.appendChild(el);
      }
    });
    
    document.body.appendChild(menu);
    
    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        menu.remove();
        document.removeEventListener('click', handler);
      });
    }, 0);
  },
  
  // ============================================
  // Data Operations
  // ============================================
  
  /**
   * Save to browser cache
   */
  async saveToCache() {
    await DB.saveAllToCache();
    this.showToast('Saved to browser', 'success');
  },
  
  /**
   * Export data
   */
  exportData() {
    DB.downloadAllData();
    this.showToast('Export downloaded', 'success');
  },
  
  /**
   * Show import dialog
   */
  showImportDialog() {
    document.getElementById('import-input')?.click();
  },
  
  /**
   * Import data from file
   */
  async importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      await DB.importData(file);
      this.showToast('Data imported successfully', 'success');
      
      // Refresh UI
      this.renderNotebooks();
      this.renderBiomes();
      HexMap.render();
      this.updateWorldTitle();
      
      // Reset file input
      e.target.value = '';
    } catch (error) {
      this.showToast('Import failed: ' + error.message, 'error');
    }
  },
  
  /**
   * Confirm reset
   */
  confirmReset() {
    if (confirm('Reset all data to defaults? This cannot be undone.')) {
      DB.resetToDefaults().then(() => {
        this.state.activeNotebook = null;
        this.state.activeSection = null;
        this.state.activePage = null;
        
        this.renderNotebooks();
        this.renderBiomes();
        HexMap.render();
        this.updateWorldTitle();
        
        this.showToast('Reset to defaults', 'success');
      });
    }
  },
  
  /**
   * Delete notebook
   */
  deleteNotebook(id) {
    if (confirm('Delete this notebook and all its contents?')) {
      DB.deleteNotebook(id);
      
      if (this.state.activeNotebook === id) {
        this.state.activeNotebook = null;
        this.state.activeSection = null;
        this.state.activePage = null;
      }
      
      this.renderNotebooks();
      this.renderPages();
      this.renderEditor();
      this.showToast('Notebook deleted', 'success');
    }
  },
  
  /**
   * Delete section
   */
  deleteSection(id) {
    DB.deleteSection(id);
    
    if (this.state.activeSection === id) {
      this.state.activeSection = null;
      this.state.activePage = null;
    }
    
    this.renderNotebooks();
    this.renderPages();
    this.renderEditor();
    this.showToast('Section deleted', 'success');
  },
  
  /**
   * Data change handler
   */
  onDataChange() {
    this.updateSyncStatus({ status: 'modified' });
  },
  
  // ============================================
  // Utilities
  // ============================================
  
  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
      success: 'fa-check',
      error: 'fa-exclamation',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
      <span class="toast-message">${this.escapeHtml(message)}</span>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    container.appendChild(toast);
    
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    
    setTimeout(() => toast.remove(), 5000);
  },
  
  /**
   * Keyboard shortcuts
   */
  onKeyDown(e) {
    // Ctrl/Cmd + S = Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this.saveToCache();
    }
    
    // Escape = Close modals
    if (e.key === 'Escape') {
      this.closeModals();
    }
  },
  
  /**
   * Escape HTML for XSS prevention
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  
  /**
   * Format date
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Export
window.App = App;
