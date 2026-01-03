/**
 * OUROTUS ATLAS - Data Management Module
 * Handles all data operations: storage, caching, import/export, sync status
 */

const DataManager = (function() {
    // Database configuration
    const DB_NAME = 'OurotusAtlasDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'worldData';
    
    // Internal state
    let db = null;
    let currentData = null;
    let savedDataHash = null;
    let listeners = [];
    
    // Default data structure
    const DEFAULT_DATA = {
        meta: {
            version: '1.0.0',
            worldName: 'Ourotus Atlas',
            worldSubtitle: 'A realm of infinite possibilities',
            lastModified: new Date().toISOString(),
            author: ''
        },
        celestialBodies: [
            {
                id: 'planet-1',
                name: 'Aetheria',
                type: 'planet',
                description: 'A mystical world where magic flows through the very air and ancient secrets lie buried beneath continents.',
                radius: 3,
                rotationSpeed: 0.002,
                colors: {
                    primary: '#1a3a5f',
                    secondary: '#2a7a3a',
                    accent: '#d4a460',
                    polar: '#e8f8f8'
                },
                atmosphere: {
                    enabled: true,
                    color: '#ffffff',
                    opacity: 0.7
                },
                texture: null,
                stats: [
                    { label: 'Diameter', value: '12,742 km' },
                    { label: 'Moons', value: '3' },
                    { label: 'Day Length', value: '40 hours' },
                    { label: 'Gravity', value: '127%' }
                ],
                biomes: [
                    { name: 'Crystal Peaks', color: '#8a7fcc', x: 0.2, y: 0.2 },
                    { name: 'Verdant Expanse', color: '#2a7a3a', x: 0.6, y: 0.3 },
                    { name: 'Shattered Wastes', color: '#7a6a5a', x: 0.4, y: 0.6 },
                    { name: 'Embersand Desert', color: '#d4a460', x: 0.8, y: 0.7 }
                ]
            },
            {
                id: 'moon-1',
                name: 'Lunara',
                type: 'moon',
                description: 'The silver moon, home to ancient elvish observatories.',
                radius: 1,
                rotationSpeed: 0.001,
                colors: {
                    primary: '#c0c0c0',
                    secondary: '#a0a0a0',
                    accent: '#e0e0e0',
                    polar: '#ffffff'
                },
                atmosphere: {
                    enabled: false,
                    color: '#ffffff',
                    opacity: 0
                },
                texture: null,
                stats: [
                    { label: 'Diameter', value: '3,474 km' },
                    { label: 'Orbit', value: '27 days' }
                ],
                biomes: []
            }
        ],
        lorebooks: [
            {
                id: 'lore-1',
                title: 'Chronicles of Aetheria',
                subtitle: 'History & Mythology',
                icon: 'fas fa-landmark',
                color: '#5a3a2a',
                tags: ['history', 'mythology', 'creation'],
                content: `### The Creation

Aetheria was formed from the coalescing essence of the Astral Sea, shaped by the primordial titans in the Dawn Age. The world's magical nature stems from this celestial origin.

### The Age of Titans

For millennia, elemental titans ruled the planet, shaping its mountains, oceans, and skies. Their conflicts created the magical leylines that crisscross the planet's surface.

### The Mortal Dawn

The first mortal races emerged from the titans' experiments:
- **Elves** from starlight
- **Dwarves** from stone
- **Humans** from clay
- **Others** from various elemental forces

### The Cataclysm

800 years ago, a war between arcane empires resulted in the Sundering—a magical disaster that created the Shattered Wastes and altered the planet's magical field forever.`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'lore-2',
                title: 'Bestiary & Flora',
                subtitle: 'Creatures & Plants',
                icon: 'fas fa-paw',
                color: '#2d5016',
                tags: ['creatures', 'flora', 'monsters'],
                content: `### Unique Creatures

- **Crystal Drakes:** Wingless dragons that feed on magical energy, found in Crystal Peaks.
- **Whisperwolves:** Canine predators that move silently through the Verdant Expanse.
- **Sandsnappers:** Burrowing predators of the Embersand Desert with crystalline teeth.
- **Leviathan Rays:** Massive filter feeders of the Azure Depths, with bioluminescent patterns.

### Magical Flora

- **Memory Moss:** Absorbs and replays nearby sounds and emotions.
- **Starbloom:** Flowers that glow at night and point toward leylines.
- **Whisperwillow:** Trees that communicate through rustling leaves.
- **Crystal Cacti:** Desert plants that store water in crystalline formations.

### Alchemical Resources

The Shattered Wastes contain mutated flora with potent alchemical properties, though harvesting them is dangerous due to reality distortions.`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'lore-3',
                title: 'Campaign Journal',
                subtitle: 'Adventures & Plot Hooks',
                icon: 'fas fa-dungeon',
                color: '#6b3309',
                tags: ['campaign', 'npcs', 'quests'],
                content: `### Current Campaign Arcs

**The Crystal Conspiracy:** A secret society is harvesting crystal energy to power an ancient device that could rewrite reality.

**Forest's Fury:** The Verdant Expanse is expanding unnaturally, consuming border towns. The forest spirits are agitated by an unknown disturbance.

### NPCs of Note

- **Archmage Valerius:** Keeper of the Celestial Observatory
- **Chieftain Bronzebeard:** Leader of the Crystal Peak dwarves
- **Lady Seraphina:** Ruler of the floating city in Azure Depths
- **The Sand Prophet:** Mysterious seer of the Embersand Desert

### Artifacts to Find

- **The Heart of the Mountain:** A massive crystal that stabilizes the Crystal Peaks region
- **Titan's Sigil:** A stone tablet containing forgotten elemental magic
- **Leviathan's Pearl:** A pearl that allows communication with sea creatures`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ],
        settings: {
            defaultCelestialId: 'planet-1',
            autoRotate: true,
            showGrid: false,
            showAtmosphere: true,
            showLabels: false,
            backgroundColor: '#050508'
        }
    };
    
    /**
     * Generate a simple hash for data comparison
     */
    function hashData(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    
    /**
     * Generate a unique ID
     */
    function generateId(prefix = 'item') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Initialize IndexedDB
     */
    async function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }
    
    /**
     * Save data to IndexedDB
     */
    async function saveToCache(data) {
        if (!db) await initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.put({ id: 'worldData', data: data });
            
            request.onsuccess = () => {
                savedDataHash = hashData(data);
                updateSyncStatus();
                resolve(true);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Load data from IndexedDB
     */
    async function loadFromCache() {
        if (!db) await initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.get('worldData');
            
            request.onsuccess = () => {
                if (request.result && request.result.data) {
                    resolve(request.result.data);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Clear IndexedDB cache
     */
    async function clearCache() {
        if (!db) await initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.clear();
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Update sync status indicator
     */
    function updateSyncStatus() {
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        
        if (!indicator || !statusText) return;
        
        const currentHash = hashData(currentData);
        
        indicator.className = 'status-indicator';
        
        if (currentHash === savedDataHash) {
            indicator.classList.add('synced');
            statusText.textContent = 'Synced';
        } else {
            indicator.classList.add('modified');
            statusText.textContent = 'Unsaved changes';
        }
    }
    
    /**
     * Notify all listeners of data change
     */
    function notifyListeners(eventType, data) {
        listeners.forEach(listener => {
            if (listener.event === eventType || listener.event === '*') {
                listener.callback(data);
            }
        });
    }
    
    /**
     * Deep clone an object
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    // Public API
    return {
        /**
         * Initialize the data manager
         */
        async init() {
            try {
                await initDB();
                
                // Try to load cached data
                const cachedData = await loadFromCache();
                
                if (cachedData) {
                    currentData = cachedData;
                    savedDataHash = hashData(cachedData);
                    console.log('Loaded data from cache');
                } else {
                    // Use default data
                    currentData = deepClone(DEFAULT_DATA);
                    await saveToCache(currentData);
                    console.log('Initialized with default data');
                }
                
                updateSyncStatus();
                notifyListeners('init', currentData);
                
                return currentData;
            } catch (error) {
                console.error('Failed to initialize data manager:', error);
                currentData = deepClone(DEFAULT_DATA);
                return currentData;
            }
        },
        
        /**
         * Get all data
         */
        getData() {
            return deepClone(currentData);
        },
        
        /**
         * Get meta information
         */
        getMeta() {
            return deepClone(currentData.meta);
        },
        
        /**
         * Update meta information
         */
        updateMeta(meta) {
            currentData.meta = { ...currentData.meta, ...meta };
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('metaUpdate', currentData.meta);
        },
        
        /**
         * Get all celestial bodies
         */
        getCelestialBodies() {
            return deepClone(currentData.celestialBodies);
        },
        
        /**
         * Get a specific celestial body
         */
        getCelestialBody(id) {
            const body = currentData.celestialBodies.find(b => b.id === id);
            return body ? deepClone(body) : null;
        },
        
        /**
         * Add a celestial body
         */
        addCelestialBody(body) {
            const newBody = {
                id: generateId('celestial'),
                name: 'New World',
                type: 'planet',
                description: '',
                radius: 3,
                rotationSpeed: 0.002,
                colors: {
                    primary: '#1a3a5f',
                    secondary: '#2a7a3a',
                    accent: '#d4a460',
                    polar: '#e8f8f8'
                },
                atmosphere: {
                    enabled: true,
                    color: '#ffffff',
                    opacity: 0.7
                },
                texture: null,
                stats: [],
                biomes: [],
                ...body
            };
            
            currentData.celestialBodies.push(newBody);
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('celestialAdd', newBody);
            
            return newBody;
        },
        
        /**
         * Update a celestial body
         */
        updateCelestialBody(id, updates) {
            const index = currentData.celestialBodies.findIndex(b => b.id === id);
            if (index === -1) return null;
            
            currentData.celestialBodies[index] = {
                ...currentData.celestialBodies[index],
                ...updates
            };
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('celestialUpdate', currentData.celestialBodies[index]);
            
            return deepClone(currentData.celestialBodies[index]);
        },
        
        /**
         * Delete a celestial body
         */
        deleteCelestialBody(id) {
            const index = currentData.celestialBodies.findIndex(b => b.id === id);
            if (index === -1) return false;
            
            const deleted = currentData.celestialBodies.splice(index, 1)[0];
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('celestialDelete', deleted);
            
            return true;
        },
        
        /**
         * Get all lorebooks
         */
        getLorebooks() {
            return deepClone(currentData.lorebooks);
        },
        
        /**
         * Get a specific lorebook
         */
        getLorebook(id) {
            const lorebook = currentData.lorebooks.find(l => l.id === id);
            return lorebook ? deepClone(lorebook) : null;
        },
        
        /**
         * Search lorebooks
         */
        searchLorebooks(query) {
            const lowerQuery = query.toLowerCase();
            return currentData.lorebooks.filter(l => 
                l.title.toLowerCase().includes(lowerQuery) ||
                l.subtitle.toLowerCase().includes(lowerQuery) ||
                l.content.toLowerCase().includes(lowerQuery) ||
                l.tags.some(t => t.toLowerCase().includes(lowerQuery))
            ).map(l => deepClone(l));
        },
        
        /**
         * Add a lorebook
         */
        addLorebook(lorebook) {
            const newLorebook = {
                id: generateId('lore'),
                title: 'New Lorebook',
                subtitle: 'Untitled',
                icon: 'fas fa-book',
                color: '#5a3a2a',
                tags: [],
                content: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...lorebook
            };
            
            currentData.lorebooks.push(newLorebook);
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('lorebookAdd', newLorebook);
            
            return newLorebook;
        },
        
        /**
         * Update a lorebook
         */
        updateLorebook(id, updates) {
            const index = currentData.lorebooks.findIndex(l => l.id === id);
            if (index === -1) return null;
            
            currentData.lorebooks[index] = {
                ...currentData.lorebooks[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('lorebookUpdate', currentData.lorebooks[index]);
            
            return deepClone(currentData.lorebooks[index]);
        },
        
        /**
         * Delete a lorebook
         */
        deleteLorebook(id) {
            const index = currentData.lorebooks.findIndex(l => l.id === id);
            if (index === -1) return false;
            
            const deleted = currentData.lorebooks.splice(index, 1)[0];
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('lorebookDelete', deleted);
            
            return true;
        },
        
        /**
         * Get settings
         */
        getSettings() {
            return deepClone(currentData.settings);
        },
        
        /**
         * Update settings
         */
        updateSettings(settings) {
            currentData.settings = { ...currentData.settings, ...settings };
            currentData.meta.lastModified = new Date().toISOString();
            updateSyncStatus();
            notifyListeners('settingsUpdate', currentData.settings);
        },
        
        /**
         * Save current data to cache
         */
        async saveToCache() {
            try {
                await saveToCache(currentData);
                notifyListeners('save', currentData);
                return true;
            } catch (error) {
                console.error('Failed to save to cache:', error);
                return false;
            }
        },
        
        /**
         * Export data as JSON file
         */
        exportData() {
            const dataStr = JSON.stringify(currentData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `DATA_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            notifyListeners('export', currentData);
        },
        
        /**
         * Import data from JSON file
         */
        async importData(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = async (e) => {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        
                        // Validate structure
                        if (!importedData.meta || !importedData.celestialBodies || !importedData.lorebooks) {
                            throw new Error('Invalid data structure');
                        }
                        
                        currentData = importedData;
                        currentData.meta.lastModified = new Date().toISOString();
                        
                        await saveToCache(currentData);
                        updateSyncStatus();
                        notifyListeners('import', currentData);
                        
                        resolve(currentData);
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
        async resetToDefault() {
            currentData = deepClone(DEFAULT_DATA);
            await saveToCache(currentData);
            updateSyncStatus();
            notifyListeners('reset', currentData);
            return currentData;
        },
        
        /**
         * Check if there are unsaved changes
         */
        hasUnsavedChanges() {
            return hashData(currentData) !== savedDataHash;
        },
        
        /**
         * Subscribe to data changes
         */
        subscribe(event, callback) {
            const listener = { event, callback };
            listeners.push(listener);
            
            // Return unsubscribe function
            return () => {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            };
        },
        
        /**
         * Generate unique ID
         */
        generateId
    };
})();

// Make available globally
window.DataManager = DataManager;
