/**
 * Ourotus Atlas - Hexmap Module
 * Rimworld-style hex grid world map
 */

const HexMap = {
  canvas: null,
  ctx: null,
  container: null,
  
  // View state
  view: {
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    minZoom: 0.3,
    maxZoom: 3
  },
  
  // Hex settings
  hex: {
    size: 30,  // Radius of hex
    width: 0,  // Calculated
    height: 0  // Calculated
  },
  
  // Interaction state
  state: {
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    viewStart: { x: 0, y: 0 },
    selectedHex: null,
    hoveredHex: null
  },
  
  // Callbacks
  onHexSelect: null,
  onHexHover: null,
  
  /**
   * Initialize the hex map
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('HexMap container not found:', containerId);
      return;
    }
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hexmap-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    
    // Calculate hex dimensions
    this.updateHexDimensions();
    
    // Set up event listeners
    this.setupEvents();
    
    // Initial resize
    this.resize();
    
    // Watch for resize
    window.addEventListener('resize', () => this.resize());
    
    // Center the view
    this.centerView();
  },
  
  /**
   * Update hex size calculations
   */
  updateHexDimensions() {
    this.hex.width = this.hex.size * 2;
    this.hex.height = Math.sqrt(3) * this.hex.size;
  },
  
  /**
   * Resize canvas to container
   */
  resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.render();
  },
  
  /**
   * Center view on map
   */
  centerView() {
    const settings = DB.data.hexmap?.settings || { width: 20, height: 15 };
    const mapWidth = settings.width * this.hex.width * 0.75;
    const mapHeight = settings.height * this.hex.height;
    
    this.view.offsetX = (this.canvas.width - mapWidth * this.view.zoom) / 2;
    this.view.offsetY = (this.canvas.height - mapHeight * this.view.zoom) / 2;
    this.render();
  },
  
  /**
   * Set up event listeners
   */
  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    
    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    this.canvas.addEventListener('touchend', () => this.onMouseUp());
  },
  
  /**
   * Convert pixel to hex coordinates
   */
  pixelToHex(px, py) {
    // Adjust for view offset and zoom
    const x = (px - this.view.offsetX) / this.view.zoom;
    const y = (py - this.view.offsetY) / this.view.zoom;
    
    // Convert to axial coordinates
    const q = (2/3 * x) / this.hex.size;
    const r = (-1/3 * x + Math.sqrt(3)/3 * y) / this.hex.size;
    
    // Round to nearest hex
    return this.roundHex(q, r);
  },
  
  /**
   * Round fractional hex coordinates
   */
  roundHex(q, r) {
    const s = -q - r;
    
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    
    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }
    
    return { q: rq, r: rr };
  },
  
  /**
   * Convert hex to pixel coordinates (center of hex)
   */
  hexToPixel(q, r) {
    const x = this.hex.size * (3/2 * q);
    const y = this.hex.size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return { x, y };
  },
  
  /**
   * Get hex corners for drawing
   */
  getHexCorners(cx, cy) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i - 30);
      corners.push({
        x: cx + this.hex.size * Math.cos(angle),
        y: cy + this.hex.size * Math.sin(angle)
      });
    }
    return corners;
  },
  
  /**
   * Mouse event handlers
   */
  onMouseDown(e) {
    this.state.isDragging = true;
    this.state.dragStart = { x: e.clientX, y: e.clientY };
    this.state.viewStart = { x: this.view.offsetX, y: this.view.offsetY };
    this.canvas.style.cursor = 'grabbing';
  },
  
  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (this.state.isDragging) {
      const dx = e.clientX - this.state.dragStart.x;
      const dy = e.clientY - this.state.dragStart.y;
      this.view.offsetX = this.state.viewStart.x + dx;
      this.view.offsetY = this.state.viewStart.y + dy;
      this.render();
    } else {
      // Hover detection
      const hex = this.pixelToHex(x, y);
      const hexData = DB.getHex(hex.q, hex.r);
      
      if (this.state.hoveredHex?.q !== hex.q || this.state.hoveredHex?.r !== hex.r) {
        this.state.hoveredHex = hex;
        this.render();
        
        if (this.onHexHover) {
          this.onHexHover(hex, hexData);
        }
      }
    }
  },
  
  onMouseUp() {
    this.state.isDragging = false;
    this.canvas.style.cursor = 'grab';
  },
  
  onClick(e) {
    if (this.state.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hex = this.pixelToHex(x, y);
    
    this.state.selectedHex = hex;
    this.render();
    
    if (this.onHexSelect) {
      const hexData = DB.getHex(hex.q, hex.r);
      this.onHexSelect(hex, hexData);
    }
  },
  
  onWheel(e) {
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.view.minZoom, Math.min(this.view.maxZoom, this.view.zoom * zoomFactor));
    
    // Zoom toward mouse position
    const scale = newZoom / this.view.zoom;
    this.view.offsetX = mouseX - (mouseX - this.view.offsetX) * scale;
    this.view.offsetY = mouseY - (mouseY - this.view.offsetY) * scale;
    this.view.zoom = newZoom;
    
    this.render();
  },
  
  onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.state.isDragging = true;
      this.state.dragStart = { x: touch.clientX, y: touch.clientY };
      this.state.viewStart = { x: this.view.offsetX, y: this.view.offsetY };
    }
  },
  
  onTouchMove(e) {
    if (e.touches.length === 1 && this.state.isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.state.dragStart.x;
      const dy = touch.clientY - this.state.dragStart.y;
      this.view.offsetX = this.state.viewStart.x + dx;
      this.view.offsetY = this.state.viewStart.y + dy;
      this.render();
    }
  },
  
  /**
   * Render the hex map
   */
  render() {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    
    // Draw background grid pattern
    this.drawBackground(ctx, width, height);
    
    // Save context for transformations
    ctx.save();
    ctx.translate(this.view.offsetX, this.view.offsetY);
    ctx.scale(this.view.zoom, this.view.zoom);
    
    // Get hexes to render
    const hexes = DB.data.hexmap?.hexes || [];
    const biomes = DB.data.biomes || [];
    
    // Draw hexes
    hexes.forEach(hex => {
      const biome = biomes.find(b => b.id === hex.biomeId) || { color: '#333' };
      const pos = this.hexToPixel(hex.q, hex.r);
      
      this.drawHex(ctx, pos.x, pos.y, biome, hex);
    });
    
    // Draw hover highlight
    if (this.state.hoveredHex) {
      const pos = this.hexToPixel(this.state.hoveredHex.q, this.state.hoveredHex.r);
      this.drawHexHighlight(ctx, pos.x, pos.y, 'rgba(255, 255, 255, 0.2)');
    }
    
    // Draw selection highlight
    if (this.state.selectedHex) {
      const pos = this.hexToPixel(this.state.selectedHex.q, this.state.selectedHex.r);
      this.drawHexHighlight(ctx, pos.x, pos.y, 'rgba(99, 102, 241, 0.5)');
    }
    
    // Draw hex labels
    hexes.forEach(hex => {
      if (hex.label) {
        const pos = this.hexToPixel(hex.q, hex.r);
        this.drawHexLabel(ctx, pos.x, pos.y, hex.label);
      }
    });
    
    // Draw markers
    const markers = DB.data.hexmap?.markers || [];
    markers.forEach(marker => {
      const pos = this.hexToPixel(marker.q, marker.r);
      this.drawMarker(ctx, pos.x, pos.y, marker);
    });
    
    ctx.restore();
  },
  
  /**
   * Draw background pattern
   */
  drawBackground(ctx, width, height) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    const spacing = 40;
    for (let x = 0; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  },
  
  /**
   * Draw a single hex
   */
  drawHex(ctx, cx, cy, biome, hexData) {
    const corners = this.getHexCorners(cx, cy);
    
    // Fill
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    
    // Biome color with pattern
    ctx.fillStyle = biome.color;
    ctx.fill();
    
    // Add pattern overlay
    this.drawBiomePattern(ctx, cx, cy, biome.pattern);
    
    // Border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Inner border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  
  /**
   * Draw biome pattern overlay
   */
  drawBiomePattern(ctx, cx, cy, pattern) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    
    switch (pattern) {
      case 'waves':
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - 20, cy + i * 8);
          ctx.quadraticCurveTo(cx - 10, cy + i * 8 - 4, cx, cy + i * 8);
          ctx.quadraticCurveTo(cx + 10, cy + i * 8 + 4, cx + 20, cy + i * 8);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        break;
        
      case 'trees':
        for (let i = 0; i < 3; i++) {
          const tx = cx + (Math.random() - 0.5) * 30;
          const ty = cy + (Math.random() - 0.5) * 30;
          ctx.beginPath();
          ctx.moveTo(tx, ty - 6);
          ctx.lineTo(tx - 4, ty + 4);
          ctx.lineTo(tx + 4, ty + 4);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 50, 0, 0.5)';
          ctx.fill();
        }
        break;
        
      case 'peaks':
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy + 8);
        ctx.lineTo(cx - 5, cy - 8);
        ctx.lineTo(cx, cy + 2);
        ctx.lineTo(cx + 5, cy - 6);
        ctx.lineTo(cx + 10, cy + 8);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
        
      case 'dunes':
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(cx + i * 12, cy, 10, 4, 0, 0, Math.PI);
          ctx.strokeStyle = 'rgba(200, 150, 50, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        break;
        
      case 'snow':
        for (let i = 0; i < 5; i++) {
          const sx = cx + (Math.random() - 0.5) * 30;
          const sy = cy + (Math.random() - 0.5) * 30;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fill();
        }
        break;
        
      case 'marsh':
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const mx = cx + (Math.random() - 0.5) * 25;
          const my = cy + (Math.random() - 0.5) * 25;
          ctx.moveTo(mx, my + 5);
          ctx.lineTo(mx, my - 5);
        }
        ctx.strokeStyle = 'rgba(100, 150, 50, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
        
      case 'lava':
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.fill();
        break;
        
      case 'crystals':
        for (let i = 0; i < 3; i++) {
          const cx2 = cx + (Math.random() - 0.5) * 20;
          const cy2 = cy + (Math.random() - 0.5) * 20;
          ctx.beginPath();
          ctx.moveTo(cx2, cy2 - 6);
          ctx.lineTo(cx2 - 3, cy2 + 3);
          ctx.lineTo(cx2 + 3, cy2 + 3);
          ctx.closePath();
          ctx.fillStyle = 'rgba(200, 150, 255, 0.5)';
          ctx.fill();
        }
        break;
    }
    
    ctx.restore();
  },
  
  /**
   * Draw hex highlight
   */
  drawHexHighlight(ctx, cx, cy, color) {
    const corners = this.getHexCorners(cx, cy);
    
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  
  /**
   * Draw hex label
   */
  drawHexLabel(ctx, cx, cy, label) {
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Background
    const metrics = ctx.measureText(label);
    const padding = 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      cx - metrics.width / 2 - padding,
      cy - 6 - padding,
      metrics.width + padding * 2,
      12 + padding * 2
    );
    
    // Text
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, cy);
  },
  
  /**
   * Draw map marker
   */
  drawMarker(ctx, cx, cy, marker) {
    const icons = {
      castle: '🏰',
      tree: '🌳',
      skull: '💀',
      star: '⭐',
      cave: '🕳️',
      tower: '🗼',
      village: '🏘️',
      ship: '⛵'
    };
    
    const icon = icons[marker.icon] || '📍';
    
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, cy - 10);
  },
  
  /**
   * Zoom controls
   */
  zoomIn() {
    this.view.zoom = Math.min(this.view.maxZoom, this.view.zoom * 1.2);
    this.render();
  },
  
  zoomOut() {
    this.view.zoom = Math.max(this.view.minZoom, this.view.zoom / 1.2);
    this.render();
  },
  
  resetView() {
    this.view.zoom = 1;
    this.centerView();
  },
  
  /**
   * Select a specific hex
   */
  selectHex(q, r) {
    this.state.selectedHex = { q, r };
    this.render();
    
    if (this.onHexSelect) {
      const hexData = DB.getHex(q, r);
      this.onHexSelect({ q, r }, hexData);
    }
  }
};

// Export
window.HexMap = HexMap;
