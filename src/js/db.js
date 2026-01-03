/**
 * Ourotus Atlas - Database Module
 * Handles IndexedDB caching, data loading, and sync status
 */

const DB = {
  name: 'OurotusAtlasDB',
  version: 2,
  instance: null,
  
  // Data tables
  tables: ['meta', 'biomes', 'hexmap', 'notebooks', 'sections', 'pages', 'celestial'],
  
  // Current data state
  data: {
    meta: null,
    biomes: [],
    hexmap: null,
    notebooks: [],
    sections: [],
    pages: [],
    celestial: []
  },
  
  // Sync status
  status: {
    cached: false,
    synced: true,
    lastCached: null,
    pendingChanges: new Set()
  },
  
  // Event listeners
  listeners: {
    change: [],
    sync: [],
    error: []
  },
  
  /**
   * Initialize the database
   */
  async init() {
    try {
      await this.openDB();
      await this.loadFromCache();
      
      if (!this.data.meta) {
        await this.loadDefaults();
      }
      
      this.emit('sync', { status: 'synced' });
      return true;
    } catch (error) {
      console.error('DB init error:', error);
      await this.loadDefaults();
      this.emit('error', error);
      return false;
    }
  },
  
  /**
   * Open IndexedDB connection
   */
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.instance = request.result;
        resolve(this.instance);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        this.tables.forEach(table => {
          if (!db.objectStoreNames.contains(table)) {
            db.createObjectStore(table, { keyPath: 'id' });
          }
        });
        
        // Special stores
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };
    });
  },
  
  /**
   * Load data from cache
   */
  async loadFromCache() {
    for (const table of this.tables) {
      const data = await this.getAll(table);
      
      if (table === 'meta' || table === 'hexmap') {
        this.data[table] = data[0] || null;
      } else {
        this.data[table] = data;
      }
    }
    
    this.status.cached = !!this.data.meta;
    this.status.synced = true;
    this.status.pendingChanges.clear();
  },
  
  /**
   * Load default data from /data folder
   */
  async loadDefaults() {
    const files = ['meta', 'biomes', 'hexmap', 'notebooks', 'sections', 'pages', 'celestial'];
    
    for (const file of files) {
      try {
        const response = await fetch(`data/${file}.json`);
        if (response.ok) {
          const json = await response.json();
          
          if (file === 'meta' || file === 'hexmap') {
            this.data[file] = json;
          } else {
            this.data[file] = Array.isArray(json) ? json : [json];
          }
        }
      } catch (error) {
        console.warn(`Failed to load ${file}.json:`, error);
      }
    }
    
    // Save defaults to cache
    await this.saveAllToCache();
  },
  
  /**
   * Get all records from a store
   */
  getAll(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        resolve([]);
        return;
      }
      
      const tx = this.instance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Put a record in a store
   */
  put(storeName, data) {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const tx = this.instance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Delete a record from a store
   */
  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const tx = this.instance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Clear a store
   */
  clear(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const tx = this.instance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Save all current data to cache
   */
  async saveAllToCache() {
    try {
      // Save meta
      if (this.data.meta) {
        await this.put('meta', { ...this.data.meta, id: 'world_meta' });
      }
      
      // Save hexmap
      if (this.data.hexmap) {
        await this.put('hexmap', { ...this.data.hexmap, id: 'world_hexmap' });
      }
      
      // Save arrays
      for (const table of ['biomes', 'notebooks', 'sections', 'pages', 'celestial']) {
        await this.clear(table);
        for (const item of this.data[table]) {
          await this.put(table, item);
        }
      }
      
      this.status.cached = true;
      this.status.synced = true;
      this.status.lastCached = new Date();
      this.status.pendingChanges.clear();
      
      this.emit('sync', { status: 'synced', timestamp: this.status.lastCached });
      return true;
    } catch (error) {
      console.error('Cache save error:', error);
      this.emit('error', error);
      return false;
    }
  },
  
  /**
   * Mark data as modified (needs sync)
   */
  markModified(table) {
    this.status.synced = false;
    this.status.pendingChanges.add(table);
    this.emit('sync', { status: 'modified', pending: [...this.status.pendingChanges] });
    
    // Trigger auto-save after delay
    this.scheduleAutoSave();
  },
  
  // Auto-save debounce
  autoSaveTimeout: null,
  
  scheduleAutoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    this.autoSaveTimeout = setTimeout(() => {
      this.saveAllToCache();
    }, 3000); // 3 second delay
  },
  
  /**
   * Export all data as downloadable files
   */
  async exportData() {
    const dataDir = {};
    
    dataDir['meta.json'] = JSON.stringify(this.data.meta, null, 2);
    dataDir['biomes.json'] = JSON.stringify(this.data.biomes, null, 2);
    dataDir['hexmap.json'] = JSON.stringify(this.data.hexmap, null, 2);
    dataDir['notebooks.json'] = JSON.stringify(this.data.notebooks, null, 2);
    dataDir['sections.json'] = JSON.stringify(this.data.sections, null, 2);
    dataDir['pages.json'] = JSON.stringify(this.data.pages, null, 2);
    dataDir['celestial.json'] = JSON.stringify(this.data.celestial, null, 2);
    
    return dataDir;
  },
  
  /**
   * Download a single JSON file
   */
  downloadFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  
  /**
   * Download all data as zip (simplified - downloads as combined JSON)
   */
  async downloadAllData() {
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      data: {
        meta: this.data.meta,
        biomes: this.data.biomes,
        hexmap: this.data.hexmap,
        notebooks: this.data.notebooks,
        sections: this.data.sections,
        pages: this.data.pages,
        celestial: this.data.celestial
      }
    };
    
    this.downloadFile('ourotus-atlas-export.json', exportData);
  },
  
  /**
   * Import data from uploaded file
   */
  async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target.result);
          
          // Handle combined export format
          if (json.data) {
            const { meta, biomes, hexmap, notebooks, sections, pages, celestial } = json.data;
            
            if (meta) this.data.meta = meta;
            if (biomes) this.data.biomes = biomes;
            if (hexmap) this.data.hexmap = hexmap;
            if (notebooks) this.data.notebooks = notebooks;
            if (sections) this.data.sections = sections;
            if (pages) this.data.pages = pages;
            if (celestial) this.data.celestial = celestial;
          }
          
          await this.saveAllToCache();
          this.emit('change', { type: 'import' });
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },
  
  /**
   * Reset to default data
   */
  async resetToDefaults() {
    for (const table of this.tables) {
      await this.clear(table);
    }
    
    this.data = {
      meta: null,
      biomes: [],
      hexmap: null,
      notebooks: [],
      sections: [],
      pages: [],
      celestial: []
    };
    
    await this.loadDefaults();
    this.emit('change', { type: 'reset' });
  },
  
  // ============================================
  // CRUD Operations for each table
  // ============================================
  
  // Notebooks
  getNotebook(id) {
    return this.data.notebooks.find(n => n.id === id);
  },
  
  createNotebook(data) {
    const notebook = {
      id: `nb_${Date.now()}`,
      name: data.name || 'New Notebook',
      color: data.color || '#6366f1',
      icon: data.icon || 'fas fa-book',
      sortOrder: this.data.notebooks.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.data.notebooks.push(notebook);
    this.markModified('notebooks');
    this.emit('change', { type: 'create', table: 'notebooks', item: notebook });
    return notebook;
  },
  
  updateNotebook(id, data) {
    const idx = this.data.notebooks.findIndex(n => n.id === id);
    if (idx === -1) return null;
    
    this.data.notebooks[idx] = {
      ...this.data.notebooks[idx],
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    this.markModified('notebooks');
    this.emit('change', { type: 'update', table: 'notebooks', item: this.data.notebooks[idx] });
    return this.data.notebooks[idx];
  },
  
  deleteNotebook(id) {
    const idx = this.data.notebooks.findIndex(n => n.id === id);
    if (idx === -1) return false;
    
    // Also delete associated sections and pages
    const sectionIds = this.data.sections.filter(s => s.notebookId === id).map(s => s.id);
    this.data.pages = this.data.pages.filter(p => !sectionIds.includes(p.sectionId));
    this.data.sections = this.data.sections.filter(s => s.notebookId !== id);
    this.data.notebooks.splice(idx, 1);
    
    this.markModified('notebooks');
    this.markModified('sections');
    this.markModified('pages');
    this.emit('change', { type: 'delete', table: 'notebooks', id });
    return true;
  },
  
  // Sections
  getSectionsForNotebook(notebookId) {
    return this.data.sections
      .filter(s => s.notebookId === notebookId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  
  getSection(id) {
    return this.data.sections.find(s => s.id === id);
  },
  
  createSection(notebookId, data) {
    const sectionsInNotebook = this.data.sections.filter(s => s.notebookId === notebookId);
    
    const section = {
      id: `sec_${Date.now()}`,
      notebookId,
      name: data.name || 'New Section',
      color: data.color || '#6366f1',
      sortOrder: sectionsInNotebook.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.data.sections.push(section);
    this.markModified('sections');
    this.emit('change', { type: 'create', table: 'sections', item: section });
    return section;
  },
  
  updateSection(id, data) {
    const idx = this.data.sections.findIndex(s => s.id === id);
    if (idx === -1) return null;
    
    this.data.sections[idx] = {
      ...this.data.sections[idx],
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    this.markModified('sections');
    this.emit('change', { type: 'update', table: 'sections', item: this.data.sections[idx] });
    return this.data.sections[idx];
  },
  
  deleteSection(id) {
    const idx = this.data.sections.findIndex(s => s.id === id);
    if (idx === -1) return false;
    
    // Delete associated pages
    this.data.pages = this.data.pages.filter(p => p.sectionId !== id);
    this.data.sections.splice(idx, 1);
    
    this.markModified('sections');
    this.markModified('pages');
    this.emit('change', { type: 'delete', table: 'sections', id });
    return true;
  },
  
  // Pages
  getPagesForSection(sectionId) {
    return this.data.pages
      .filter(p => p.sectionId === sectionId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  
  getPage(id) {
    return this.data.pages.find(p => p.id === id);
  },
  
  createPage(sectionId, data) {
    const pagesInSection = this.data.pages.filter(p => p.sectionId === sectionId);
    
    const page = {
      id: `pg_${Date.now()}`,
      sectionId,
      title: data.title || 'New Page',
      content: data.content || '',
      sortOrder: pagesInSection.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.data.pages.push(page);
    this.markModified('pages');
    this.emit('change', { type: 'create', table: 'pages', item: page });
    return page;
  },
  
  updatePage(id, data) {
    const idx = this.data.pages.findIndex(p => p.id === id);
    if (idx === -1) return null;
    
    this.data.pages[idx] = {
      ...this.data.pages[idx],
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    this.markModified('pages');
    this.emit('change', { type: 'update', table: 'pages', item: this.data.pages[idx] });
    return this.data.pages[idx];
  },
  
  deletePage(id) {
    const idx = this.data.pages.findIndex(p => p.id === id);
    if (idx === -1) return false;
    
    this.data.pages.splice(idx, 1);
    this.markModified('pages');
    this.emit('change', { type: 'delete', table: 'pages', id });
    return true;
  },
  
  // Biomes
  getBiome(id) {
    return this.data.biomes.find(b => b.id === id);
  },
  
  createBiome(data) {
    const biome = {
      id: data.id || `biome_${Date.now()}`,
      name: data.name || 'New Biome',
      color: data.color || '#808080',
      pattern: data.pattern || 'solid',
      temperature: data.temperature || 'temperate',
      humidity: data.humidity || 'moderate',
      elevation: data.elevation || 1,
      description: data.description || '',
      encounters: data.encounters || [],
      resources: data.resources || []
    };
    
    this.data.biomes.push(biome);
    this.markModified('biomes');
    this.emit('change', { type: 'create', table: 'biomes', item: biome });
    return biome;
  },
  
  updateBiome(id, data) {
    const idx = this.data.biomes.findIndex(b => b.id === id);
    if (idx === -1) return null;
    
    this.data.biomes[idx] = { ...this.data.biomes[idx], ...data };
    this.markModified('biomes');
    this.emit('change', { type: 'update', table: 'biomes', item: this.data.biomes[idx] });
    return this.data.biomes[idx];
  },
  
  deleteBiome(id) {
    // Don't delete if hexes use this biome
    const usedByHex = this.data.hexmap?.hexes?.some(h => h.biomeId === id);
    if (usedByHex) return false;
    
    const idx = this.data.biomes.findIndex(b => b.id === id);
    if (idx === -1) return false;
    
    this.data.biomes.splice(idx, 1);
    this.markModified('biomes');
    this.emit('change', { type: 'delete', table: 'biomes', id });
    return true;
  },
  
  // Hexmap
  getHex(q, r) {
    return this.data.hexmap?.hexes?.find(h => h.q === q && h.r === r);
  },
  
  updateHex(q, r, data) {
    if (!this.data.hexmap) return null;
    
    let hex = this.data.hexmap.hexes.find(h => h.q === q && h.r === r);
    
    if (!hex) {
      hex = { q, r, biomeId: 'plains', label: '', notes: '' };
      this.data.hexmap.hexes.push(hex);
    }
    
    Object.assign(hex, data);
    this.markModified('hexmap');
    this.emit('change', { type: 'update', table: 'hexmap', item: hex });
    return hex;
  },
  
  // Event system
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  },
  
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  },
  
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
};

// Export
window.DB = DB;
