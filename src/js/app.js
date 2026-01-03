/**
 * Ourotus Atlas - Main Application v2.0
 */

const App = {
  state: {
    activeNotebook: null,
    activeSection: null,
    activePage: null,
    activeTab: 'map',
    viewMode: 'edit'
  },
  editorTimeout: null,
  hexEditTimeout: null,

  async init() {
    await DB.init();
    this.setupEventListeners();
    HexMap.init('hexmap-container');
    HexMap.onHexSelect = (hex, data) => this.onHexSelect(hex, data);
    
    this.renderNotebooks();
    this.renderBiomes();
    this.updateSyncStatus();
    this.updateWorldTitle();
    
    if (DB.data.notebooks.length > 0) this.selectNotebook(DB.data.notebooks[0].id);
    
    DB.on('change', () => this.onDataChange());
    DB.on('sync', (d) => this.updateSyncStatus(d));
    
    console.log('Ourotus Atlas initialized');
  },

  setupEventListeners() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    
    document.getElementById('btn-save')?.addEventListener('click', () => this.saveToCache());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportData());
    document.getElementById('btn-import')?.addEventListener('click', () => document.getElementById('import-input')?.click());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.confirmReset());
    document.getElementById('import-input')?.addEventListener('change', e => this.importData(e));
    
    document.getElementById('btn-add-notebook')?.addEventListener('click', () => this.showNotebookModal());
    document.getElementById('btn-add-page')?.addEventListener('click', () => this.addPage());
    document.getElementById('btn-delete-page')?.addEventListener('click', () => this.deletePage());
    
    document.getElementById('page-title')?.addEventListener('input', e => this.onPageTitleChange(e));
    document.getElementById('page-content')?.addEventListener('input', e => this.onPageContentChange(e));
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => this.setViewMode('edit'));
    document.getElementById('btn-preview-mode')?.addEventListener('click', () => this.setViewMode('preview'));
    
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => HexMap.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => HexMap.zoomOut());
    document.getElementById('btn-reset-view')?.addEventListener('click', () => HexMap.resetView());
    document.getElementById('btn-add-biome')?.addEventListener('click', () => this.showBiomeModal());
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', e => { if (e.target === o) this.closeModals(); });
    });
    document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => this.closeModals()));
    
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.saveToCache(); }
      if (e.key === 'Escape') this.closeModals();
    });
  },

  switchTab(tab) {
    this.state.activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('map-panel')?.classList.toggle('hidden', tab !== 'map');
    document.getElementById('lorebook-panel')?.classList.toggle('hidden', tab !== 'lorebook');
    if (tab === 'map') HexMap.resize();
  },

  updateWorldTitle() {
    const t = document.getElementById('world-title');
    const s = document.getElementById('world-subtitle');
    if (t && DB.data.meta) t.textContent = DB.data.meta.name || 'Ourotus Atlas';
    if (s && DB.data.meta) s.textContent = DB.data.meta.subtitle || 'World Builder';
  },

  updateSyncStatus(d) {
    const el = document.getElementById('sync-status');
    const txt = document.getElementById('sync-text');
    if (!el) return;
    el.classList.remove('modified', 'error');
    if (d?.status === 'modified') { el.classList.add('modified'); txt.textContent = 'Unsaved changes'; }
    else if (d?.status === 'error') { el.classList.add('error'); txt.textContent = 'Sync error'; }
    else txt.textContent = 'All saved';
  },

  renderNotebooks() {
    const c = document.getElementById('notebook-list');
    if (!c) return;
    c.innerHTML = '';
    
    DB.data.notebooks.forEach(nb => {
      const secs = DB.getSectionsForNotebook(nb.id);
      const exp = this.state.activeNotebook === nb.id;
      
      const item = document.createElement('li');
      item.className = `notebook-item ${exp ? 'expanded' : ''}`;
      item.innerHTML = `
        <div class="notebook-header ${exp ? 'active' : ''}" data-notebook="${nb.id}">
          <div class="notebook-icon" style="background:${nb.color}"><i class="${nb.icon}"></i></div>
          <span class="notebook-name">${this.esc(nb.name)}</span>
          <i class="fas fa-chevron-right notebook-chevron"></i>
        </div>
        <ul class="section-list">
          ${secs.map(s => `
            <li class="section-item ${this.state.activeSection === s.id ? 'active' : ''}" data-section="${s.id}">
              <span class="section-color" style="background:${s.color}"></span>
              <span class="section-name">${this.esc(s.name)}</span>
            </li>
          `).join('')}
        </ul>
      `;
      c.appendChild(item);
      
      item.querySelector('.notebook-header').addEventListener('click', () => this.selectNotebook(nb.id));
      item.querySelector('.notebook-header').addEventListener('contextmenu', e => {
        e.preventDefault();
        this.showContextMenu(e, [
          { label: 'Edit Notebook', icon: 'fa-edit', action: () => this.showNotebookModal(nb) },
          { label: 'Add Section', icon: 'fa-plus', action: () => this.showSectionModal(nb.id) },
          { divider: true },
          { label: 'Delete Notebook', icon: 'fa-trash', danger: true, action: () => this.deleteNotebook(nb.id) }
        ]);
      });
      
      item.querySelectorAll('.section-item').forEach(el => {
        el.addEventListener('click', e => { e.stopPropagation(); this.selectSection(el.dataset.section); });
        el.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          const sec = DB.getSection(el.dataset.section);
          this.showContextMenu(e, [
            { label: 'Edit Section', icon: 'fa-edit', action: () => this.showSectionModal(nb.id, sec) },
            { label: 'Add Page', icon: 'fa-plus', action: () => this.addPage(el.dataset.section) },
            { divider: true },
            { label: 'Delete Section', icon: 'fa-trash', danger: true, action: () => this.deleteSection(el.dataset.section) }
          ]);
        });
      });
    });
  },

  selectNotebook(id) {
    if (this.state.activeNotebook === id) { this.state.activeNotebook = null; }
    else {
      this.state.activeNotebook = id;
      const secs = DB.getSectionsForNotebook(id);
      if (secs.length > 0) this.selectSection(secs[0].id);
      else { this.state.activeSection = null; this.state.activePage = null; this.renderPages(); this.renderEditor(); }
    }
    this.renderNotebooks();
  },

  selectSection(id) {
    this.state.activeSection = id;
    const sec = DB.getSection(id);
    if (sec) this.state.activeNotebook = sec.notebookId;
    const pages = DB.getPagesForSection(id);
    if (pages.length > 0) this.selectPage(pages[0].id);
    else { this.state.activePage = null; this.renderEditor(); }
    this.renderNotebooks();
    this.renderPages();
  },

  renderPages() {
    const c = document.getElementById('page-list');
    const st = document.getElementById('section-title');
    if (!c) return;
    
    if (!this.state.activeSection) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-book-open empty-state-icon"></i><p class="empty-state-text">Select a section</p></div>';
      if (st) st.textContent = 'Pages';
      return;
    }
    
    const sec = DB.getSection(this.state.activeSection);
    if (st && sec) st.textContent = sec.name;
    
    const pages = DB.getPagesForSection(this.state.activeSection);
    if (pages.length === 0) {
      c.innerHTML = `<div class="empty-state"><i class="fas fa-file-alt empty-state-icon"></i><p class="empty-state-text">No pages</p><button class="btn btn-primary btn-sm" onclick="App.addPage()"><i class="fas fa-plus"></i> Add Page</button></div>`;
      return;
    }
    
    c.innerHTML = pages.map(p => `
      <li class="page-item ${this.state.activePage === p.id ? 'active' : ''}" data-page="${p.id}">
        <div class="page-title">${this.esc(p.title)}</div>
        <div class="page-date">${this.formatDate(p.updatedAt)}</div>
      </li>
    `).join('');
    
    c.querySelectorAll('.page-item').forEach(el => {
      el.addEventListener('click', () => this.selectPage(el.dataset.page));
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.showContextMenu(e, [{ label: 'Delete Page', icon: 'fa-trash', danger: true, action: () => this.deletePage(el.dataset.page) }]);
      });
    });
  },

  selectPage(id) {
    this.state.activePage = id;
    this.renderPages();
    this.renderEditor();
  },

  renderEditor() {
    const ti = document.getElementById('page-title');
    const ci = document.getElementById('page-content');
    const pv = document.getElementById('preview-content');
    const ep = document.getElementById('editor-panel');
    
    if (!this.state.activePage) {
      if (ep) ep.innerHTML = '<div class="empty-state"><i class="fas fa-feather-alt empty-state-icon"></i><p class="empty-state-title">No page selected</p><p class="empty-state-text">Select or create a page</p></div>';
      return;
    }
    
    const page = DB.getPage(this.state.activePage);
    if (!page) return;
    
    if (!ti) { this.rebuildEditorPanel(); return this.renderEditor(); }
    
    ti.value = page.title;
    ci.value = page.content;
    if (pv && typeof marked !== 'undefined') pv.innerHTML = marked.parse(page.content || '');
  },

  rebuildEditorPanel() {
    const p = document.getElementById('editor-panel');
    if (!p) return;
    p.innerHTML = `
      <div class="editor-header">
        <input type="text" id="page-title" class="editor-title-input" placeholder="Page Title">
        <div class="flex gap-sm">
          <button class="btn btn-ghost btn-sm active" id="btn-edit-mode"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-ghost btn-sm" id="btn-preview-mode"><i class="fas fa-eye"></i> Preview</button>
          <button class="btn btn-ghost btn-sm text-danger" id="btn-delete-page"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="editor-content">
        <div id="edit-view"><textarea id="page-content" class="editor-textarea" placeholder="Write content here... (Markdown supported)"></textarea></div>
        <div id="preview-view" class="hidden"><div id="preview-content" class="preview-content"></div></div>
      </div>
    `;
    document.getElementById('page-title')?.addEventListener('input', e => this.onPageTitleChange(e));
    document.getElementById('page-content')?.addEventListener('input', e => this.onPageContentChange(e));
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => this.setViewMode('edit'));
    document.getElementById('btn-preview-mode')?.addEventListener('click', () => this.setViewMode('preview'));
    document.getElementById('btn-delete-page')?.addEventListener('click', () => this.deletePage());
  },

  onPageTitleChange(e) {
    if (!this.state.activePage) return;
    clearTimeout(this.editorTimeout);
    this.editorTimeout = setTimeout(() => { DB.updatePage(this.state.activePage, { title: e.target.value }); this.renderPages(); }, 500);
  },

  onPageContentChange(e) {
    if (!this.state.activePage) return;
    clearTimeout(this.editorTimeout);
    this.editorTimeout = setTimeout(() => {
      DB.updatePage(this.state.activePage, { content: e.target.value });
      const pv = document.getElementById('preview-content');
      if (pv && typeof marked !== 'undefined') pv.innerHTML = marked.parse(e.target.value || '');
    }, 500);
  },

  setViewMode(m) {
    this.state.viewMode = m;
    document.getElementById('edit-view')?.classList.toggle('hidden', m !== 'edit');
    document.getElementById('preview-view')?.classList.toggle('hidden', m !== 'preview');
    document.getElementById('btn-edit-mode')?.classList.toggle('active', m === 'edit');
    document.getElementById('btn-preview-mode')?.classList.toggle('active', m === 'preview');
  },

  addPage(secId) {
    const ts = secId || this.state.activeSection;
    if (!ts) { this.showToast('Select a section first', 'warning'); return; }
    const pg = DB.createPage(ts, { title: 'New Page' });
    this.selectPage(pg.id);
    setTimeout(() => document.getElementById('page-title')?.focus(), 100);
  },

  deletePage(id) {
    const tp = id || this.state.activePage;
    if (!tp) return;
    if (confirm('Delete this page?')) {
      DB.deletePage(tp);
      if (this.state.activePage === tp) {
        this.state.activePage = null;
        const pages = DB.getPagesForSection(this.state.activeSection);
        if (pages.length > 0) this.selectPage(pages[0].id);
        else this.renderEditor();
      }
      this.renderPages();
      this.showToast('Page deleted', 'success');
    }
  },

  // Hex Map
  onHexSelect(hex, hexData) {
    const dp = document.getElementById('hex-details');
    if (!dp) return;
    const biome = DB.getBiome(hexData?.biomeId) || DB.data.biomes[0];
    
    dp.innerHTML = `
      <div class="hex-details-form">
        <div class="hex-details-header">
          <div class="hex-biome-color" id="hex-biome-color" style="background:${biome?.color || '#333'}"></div>
          <div>
            <div style="font-weight:500">${biome?.name || 'Unknown'}</div>
            <div class="hex-coords">(${hex.q}, ${hex.r})</div>
          </div>
        </div>
        <div class="hex-field">
          <label>Biome</label>
          <select id="hex-biome" class="input">
            ${DB.data.biomes.map(b => `<option value="${b.id}" ${hexData?.biomeId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </div>
        <div class="hex-field">
          <label>Label</label>
          <input type="text" id="hex-label" class="input" placeholder="Location name..." value="${this.esc(hexData?.label || '')}">
        </div>
        <div class="hex-field">
          <label>Notes</label>
          <textarea id="hex-notes" class="input" rows="3" placeholder="Notes...">${this.esc(hexData?.notes || '')}</textarea>
        </div>
        ${biome?.description ? `<div class="hex-field"><label>Biome Info</label><p style="font-size:0.8rem;color:var(--text-secondary)">${this.esc(biome.description)}</p></div>` : ''}
      </div>
    `;
    
    document.getElementById('hex-biome')?.addEventListener('change', e => this.onHexBiomeChange(e));
    document.getElementById('hex-label')?.addEventListener('input', e => this.onHexLabelChange(e));
    document.getElementById('hex-notes')?.addEventListener('input', e => this.onHexNotesChange(e));
  },

  onHexBiomeChange(e) {
    if (!HexMap.state.selectedHex) return;
    const { q, r } = HexMap.state.selectedHex;
    DB.updateHex(q, r, { biomeId: e.target.value });
    HexMap.render();
    const biome = DB.getBiome(e.target.value);
    const c = document.getElementById('hex-biome-color');
    if (c && biome) c.style.background = biome.color;
  },

  onHexLabelChange(e) {
    if (!HexMap.state.selectedHex) return;
    clearTimeout(this.hexEditTimeout);
    this.hexEditTimeout = setTimeout(() => {
      const { q, r } = HexMap.state.selectedHex;
      DB.updateHex(q, r, { label: e.target.value });
      HexMap.render();
    }, 500);
  },

  onHexNotesChange(e) {
    if (!HexMap.state.selectedHex) return;
    clearTimeout(this.hexEditTimeout);
    this.hexEditTimeout = setTimeout(() => {
      const { q, r } = HexMap.state.selectedHex;
      DB.updateHex(q, r, { notes: e.target.value });
    }, 500);
  },

  renderBiomes() {
    const c = document.getElementById('biome-list');
    if (!c) return;
    c.innerHTML = DB.data.biomes.map(b => `
      <li class="biome-item" data-biome="${b.id}">
        <span class="biome-swatch" style="background:${b.color}"></span>
        <span class="biome-name">${this.esc(b.name)}</span>
      </li>
    `).join('');
    
    c.querySelectorAll('.biome-item').forEach(el => {
      el.addEventListener('contextmenu', e => {
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

  deleteBiome(id) {
    if (!DB.deleteBiome(id)) { this.showToast('Cannot delete biome in use', 'error'); return; }
    this.renderBiomes();
    this.showToast('Biome deleted', 'success');
  },

  // Modals
  showNotebookModal(nb = null) {
    const m = document.getElementById('notebook-modal');
    if (!m) return;
    const isEdit = !!nb;
    document.getElementById('notebook-modal-title').textContent = isEdit ? 'Edit Notebook' : 'New Notebook';
    document.getElementById('notebook-id').value = nb?.id || '';
    document.getElementById('notebook-name').value = nb?.name || '';
    document.getElementById('notebook-icon').value = nb?.icon || 'fas fa-book';
    document.getElementById('notebook-color').value = nb?.color || '#6366f1';
    document.getElementById('btn-delete-notebook').classList.toggle('hidden', !isEdit);
    m.classList.add('active');
    document.getElementById('notebook-name').focus();
    
    document.getElementById('btn-save-notebook').onclick = () => {
      const d = { name: document.getElementById('notebook-name').value, icon: document.getElementById('notebook-icon').value, color: document.getElementById('notebook-color').value };
      if (isEdit) DB.updateNotebook(nb.id, d);
      else { const n = DB.createNotebook(d); this.selectNotebook(n.id); }
      this.renderNotebooks();
      this.closeModals();
      this.showToast(isEdit ? 'Notebook updated' : 'Notebook created', 'success');
    };
    document.getElementById('btn-delete-notebook').onclick = () => { if (confirm('Delete notebook?')) { this.deleteNotebook(nb.id); this.closeModals(); } };
  },

  showSectionModal(nbId, sec = null) {
    const m = document.getElementById('section-modal');
    if (!m) return;
    const tnb = nbId || this.state.activeNotebook;
    if (!tnb) { this.showToast('Select a notebook first', 'warning'); return; }
    const isEdit = !!sec;
    document.getElementById('section-modal-title').textContent = isEdit ? 'Edit Section' : 'New Section';
    document.getElementById('section-id').value = sec?.id || '';
    document.getElementById('section-notebook-id').value = tnb;
    document.getElementById('section-name').value = sec?.name || '';
    document.getElementById('section-color').value = sec?.color || '#6366f1';
    document.getElementById('btn-delete-section').classList.toggle('hidden', !isEdit);
    m.classList.add('active');
    document.getElementById('section-name').focus();
    
    document.getElementById('btn-save-section').onclick = () => {
      const d = { name: document.getElementById('section-name').value, color: document.getElementById('section-color').value };
      if (isEdit) DB.updateSection(sec.id, d);
      else { const s = DB.createSection(tnb, d); this.selectSection(s.id); }
      this.renderNotebooks();
      this.closeModals();
      this.showToast(isEdit ? 'Section updated' : 'Section created', 'success');
    };
    document.getElementById('btn-delete-section').onclick = () => { if (confirm('Delete section?')) { this.deleteSection(sec.id); this.closeModals(); } };
  },

  showBiomeModal(biome = null) {
    const m = document.getElementById('biome-modal');
    if (!m) return;
    const isEdit = !!biome;
    document.getElementById('biome-modal-title').textContent = isEdit ? 'Edit Biome' : 'New Biome';
    document.getElementById('biome-id').value = biome?.id || '';
    document.getElementById('biome-name').value = biome?.name || '';
    document.getElementById('biome-color').value = biome?.color || '#808080';
    document.getElementById('biome-description').value = biome?.description || '';
    document.getElementById('btn-delete-biome').classList.toggle('hidden', !isEdit);
    m.classList.add('active');
    document.getElementById('biome-name').focus();
    
    document.getElementById('btn-save-biome').onclick = () => {
      const d = { name: document.getElementById('biome-name').value, color: document.getElementById('biome-color').value, description: document.getElementById('biome-description').value };
      if (isEdit) DB.updateBiome(biome.id, d);
      else { d.id = d.name.toLowerCase().replace(/\s+/g, '_'); DB.createBiome(d); }
      this.renderBiomes();
      HexMap.render();
      this.closeModals();
      this.showToast(isEdit ? 'Biome updated' : 'Biome created', 'success');
    };
    document.getElementById('btn-delete-biome').onclick = () => {
      if (!DB.deleteBiome(biome.id)) { this.showToast('Cannot delete biome in use', 'error'); return; }
      this.renderBiomes();
      this.closeModals();
      this.showToast('Biome deleted', 'success');
    };
  },

  closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); },

  showContextMenu(e, items) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    items.forEach(item => {
      if (item.divider) { menu.innerHTML += '<div class="context-menu-divider"></div>'; }
      else {
        const el = document.createElement('div');
        el.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
        el.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
        el.addEventListener('click', () => { item.action(); menu.remove(); });
        menu.appendChild(el);
      }
    });
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function h() { menu.remove(); document.removeEventListener('click', h); }), 0);
  },

  // Data ops
  async saveToCache() { await DB.saveAllToCache(); this.showToast('Saved to browser', 'success'); },
  exportData() { DB.downloadAllData(); this.showToast('Export downloaded', 'success'); },
  async importData(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await DB.importData(f);
      this.showToast('Imported successfully', 'success');
      this.renderNotebooks();
      this.renderBiomes();
      HexMap.render();
      this.updateWorldTitle();
      e.target.value = '';
    } catch (err) { this.showToast('Import failed: ' + err.message, 'error'); }
  },
  confirmReset() {
    if (confirm('Reset all data?')) {
      DB.resetToDefaults().then(() => {
        this.state.activeNotebook = null;
        this.state.activeSection = null;
        this.state.activePage = null;
        this.renderNotebooks();
        this.renderBiomes();
        HexMap.render();
        this.updateWorldTitle();
        this.showToast('Reset complete', 'success');
      });
    }
  },
  deleteNotebook(id) {
    if (confirm('Delete notebook?')) {
      DB.deleteNotebook(id);
      if (this.state.activeNotebook === id) { this.state.activeNotebook = null; this.state.activeSection = null; this.state.activePage = null; }
      this.renderNotebooks();
      this.renderPages();
      this.renderEditor();
      this.showToast('Notebook deleted', 'success');
    }
  },
  deleteSection(id) {
    DB.deleteSection(id);
    if (this.state.activeSection === id) { this.state.activeSection = null; this.state.activePage = null; }
    this.renderNotebooks();
    this.renderPages();
    this.renderEditor();
    this.showToast('Section deleted', 'success');
  },
  onDataChange() { this.updateSyncStatus({ status: 'modified' }); },

  // Utils
  showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const icons = { success: 'fa-check', error: 'fa-exclamation', warning: 'fa-exclamation-triangle', info: 'fa-info' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="toast-icon"><i class="fas ${icons[type]}"></i></div><span class="toast-message">${this.esc(msg)}</span><button class="toast-close"><i class="fas fa-times"></i></button>`;
    c.appendChild(t);
    t.querySelector('.toast-close').addEventListener('click', () => t.remove());
    setTimeout(() => t.remove(), 5000);
  },
  esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
  formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;