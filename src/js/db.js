/**
 * Ourotus Atlas - Database Module v2.0
 */

const DB = {
  name: 'OurotusAtlasDB',
  version: 2,
  instance: null,
  tables: ['meta', 'biomes', 'hexmap', 'notebooks', 'sections', 'pages', 'celestial'],
  
  data: {
    meta: null,
    biomes: [],
    hexmap: null,
    notebooks: [],
    sections: [],
    pages: [],
    celestial: []
  },
  
  status: {
    synced: true,
    lastCached: null,
    pendingChanges: new Set()
  },
  
  listeners: { change: [], sync: [], error: [] },
  autoSaveTimeout: null,

  async init() {
    try {
      await this.openDB();
      await this.loadFromCache();
      if (!this.data.meta) await this.loadDefaults();
      this.emit('sync', { status: 'synced' });
      return true;
    } catch (error) {
      console.error('DB init error:', error);
      await this.loadDefaults();
      return false;
    }
  },

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.instance = request.result; resolve(this.instance); };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        this.tables.forEach(t => {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
        });
      };
    });
  },

  async loadFromCache() {
    for (const table of this.tables) {
      const data = await this.getAll(table);
      this.data[table] = (table === 'meta' || table === 'hexmap') ? (data[0] || null) : data;
    }
    this.status.synced = true;
    this.status.pendingChanges.clear();
  },

  async loadDefaults() {
    for (const file of this.tables) {
      try {
        const res = await fetch(`data/${file}.json`);
        if (res.ok) {
          const json = await res.json();
          this.data[file] = (file === 'meta' || file === 'hexmap') ? json : (Array.isArray(json) ? json : [json]);
        }
      } catch (e) { console.warn(`Failed to load ${file}.json`, e); }
    }
    await this.saveAllToCache();
  },

  getAll(storeName) {
    return new Promise((resolve) => {
      if (!this.instance) { resolve([]); return; }
      const tx = this.instance.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  },

  put(storeName, data) {
    return new Promise((resolve, reject) => {
      if (!this.instance) { reject(new Error('DB not init')); return; }
      const tx = this.instance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      if (!this.instance) { reject(new Error('DB not init')); return; }
      const tx = this.instance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  clear(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.instance) { reject(new Error('DB not init')); return; }
      const tx = this.instance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async saveAllToCache() {
    try {
      if (this.data.meta) await this.put('meta', { ...this.data.meta, id: 'world_meta' });
      if (this.data.hexmap) await this.put('hexmap', { ...this.data.hexmap, id: 'world_hexmap' });
      for (const table of ['biomes', 'notebooks', 'sections', 'pages', 'celestial']) {
        await this.clear(table);
        for (const item of this.data[table]) await this.put(table, item);
      }
      this.status.synced = true;
      this.status.lastCached = new Date();
      this.status.pendingChanges.clear();
      this.emit('sync', { status: 'synced', timestamp: this.status.lastCached });
      return true;
    } catch (e) { console.error('Cache save error:', e); this.emit('error', e); return false; }
  },

  markModified(table) {
    this.status.synced = false;
    this.status.pendingChanges.add(table);
    this.emit('sync', { status: 'modified', pending: [...this.status.pendingChanges] });
    this.scheduleAutoSave();
  },

  scheduleAutoSave() {
    if (this.autoSaveTimeout) clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => this.saveAllToCache(), 3000);
  },

  async downloadAllData() {
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      data: { ...this.data }
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ourotus-atlas-export.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target.result);
          if (json.data) {
            Object.keys(json.data).forEach(k => { if (this.data[k] !== undefined) this.data[k] = json.data[k]; });
          }
          await this.saveAllToCache();
          this.emit('change', { type: 'import' });
          resolve(true);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },

  async resetToDefaults() {
    for (const t of this.tables) await this.clear(t);
    this.data = { meta: null, biomes: [], hexmap: null, notebooks: [], sections: [], pages: [], celestial: [] };
    await this.loadDefaults();
    this.emit('change', { type: 'reset' });
  },

  // CRUD - Notebooks
  getNotebook(id) { return this.data.notebooks.find(n => n.id === id); },
  createNotebook(d) {
    const nb = { id: `nb_${Date.now()}`, name: d.name || 'New Notebook', color: d.color || '#6366f1', icon: d.icon || 'fas fa-book', sortOrder: this.data.notebooks.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.data.notebooks.push(nb);
    this.markModified('notebooks');
    this.emit('change', { type: 'create', table: 'notebooks', item: nb });
    return nb;
  },
  updateNotebook(id, d) {
    const i = this.data.notebooks.findIndex(n => n.id === id);
    if (i === -1) return null;
    this.data.notebooks[i] = { ...this.data.notebooks[i], ...d, updatedAt: new Date().toISOString() };
    this.markModified('notebooks');
    return this.data.notebooks[i];
  },
  deleteNotebook(id) {
    const i = this.data.notebooks.findIndex(n => n.id === id);
    if (i === -1) return false;
    const secIds = this.data.sections.filter(s => s.notebookId === id).map(s => s.id);
    this.data.pages = this.data.pages.filter(p => !secIds.includes(p.sectionId));
    this.data.sections = this.data.sections.filter(s => s.notebookId !== id);
    this.data.notebooks.splice(i, 1);
    this.markModified('notebooks');
    this.markModified('sections');
    this.markModified('pages');
    return true;
  },

  // CRUD - Sections
  getSectionsForNotebook(nbId) { return this.data.sections.filter(s => s.notebookId === nbId).sort((a,b) => a.sortOrder - b.sortOrder); },
  getSection(id) { return this.data.sections.find(s => s.id === id); },
  createSection(nbId, d) {
    const sec = { id: `sec_${Date.now()}`, notebookId: nbId, name: d.name || 'New Section', color: d.color || '#6366f1', sortOrder: this.data.sections.filter(s => s.notebookId === nbId).length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.data.sections.push(sec);
    this.markModified('sections');
    return sec;
  },
  updateSection(id, d) {
    const i = this.data.sections.findIndex(s => s.id === id);
    if (i === -1) return null;
    this.data.sections[i] = { ...this.data.sections[i], ...d, updatedAt: new Date().toISOString() };
    this.markModified('sections');
    return this.data.sections[i];
  },
  deleteSection(id) {
    const i = this.data.sections.findIndex(s => s.id === id);
    if (i === -1) return false;
    this.data.pages = this.data.pages.filter(p => p.sectionId !== id);
    this.data.sections.splice(i, 1);
    this.markModified('sections');
    this.markModified('pages');
    return true;
  },

  // CRUD - Pages
  getPagesForSection(secId) { return this.data.pages.filter(p => p.sectionId === secId).sort((a,b) => a.sortOrder - b.sortOrder); },
  getPage(id) { return this.data.pages.find(p => p.id === id); },
  createPage(secId, d) {
    const pg = { id: `pg_${Date.now()}`, sectionId: secId, title: d.title || 'New Page', content: d.content || '', sortOrder: this.data.pages.filter(p => p.sectionId === secId).length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.data.pages.push(pg);
    this.markModified('pages');
    return pg;
  },
  updatePage(id, d) {
    const i = this.data.pages.findIndex(p => p.id === id);
    if (i === -1) return null;
    this.data.pages[i] = { ...this.data.pages[i], ...d, updatedAt: new Date().toISOString() };
    this.markModified('pages');
    return this.data.pages[i];
  },
  deletePage(id) {
    const i = this.data.pages.findIndex(p => p.id === id);
    if (i === -1) return false;
    this.data.pages.splice(i, 1);
    this.markModified('pages');
    return true;
  },

  // CRUD - Biomes
  getBiome(id) { return this.data.biomes.find(b => b.id === id); },
  createBiome(d) {
    const b = { id: d.id || `biome_${Date.now()}`, name: d.name || 'New Biome', color: d.color || '#808080', pattern: d.pattern || 'solid', description: d.description || '', encounters: [], resources: [] };
    this.data.biomes.push(b);
    this.markModified('biomes');
    return b;
  },
  updateBiome(id, d) {
    const i = this.data.biomes.findIndex(b => b.id === id);
    if (i === -1) return null;
    this.data.biomes[i] = { ...this.data.biomes[i], ...d };
    this.markModified('biomes');
    return this.data.biomes[i];
  },
  deleteBiome(id) {
    if (this.data.hexmap?.hexes?.some(h => h.biomeId === id)) return false;
    const i = this.data.biomes.findIndex(b => b.id === id);
    if (i === -1) return false;
    this.data.biomes.splice(i, 1);
    this.markModified('biomes');
    return true;
  },

  // Hexmap
  getHex(q, r) { return this.data.hexmap?.hexes?.find(h => h.q === q && h.r === r); },
  updateHex(q, r, d) {
    if (!this.data.hexmap) return null;
    let hex = this.data.hexmap.hexes.find(h => h.q === q && h.r === r);
    if (!hex) { hex = { q, r, biomeId: 'plains', label: '', notes: '' }; this.data.hexmap.hexes.push(hex); }
    Object.assign(hex, d);
    this.markModified('hexmap');
    return hex;
  },

  // Events
  on(event, cb) { if (this.listeners[event]) this.listeners[event].push(cb); },
  off(event, cb) { if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(c => c !== cb); },
  emit(event, data) { if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data)); }
};

window.DB = DB;