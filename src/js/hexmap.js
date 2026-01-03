/**
 * Ourotus Atlas - HexMap Module v2.0
 */

const HexMap = {
  canvas: null,
  ctx: null,
  container: null,
  
  view: { offsetX: 0, offsetY: 0, zoom: 1, minZoom: 0.3, maxZoom: 3 },
  hex: { size: 30, width: 0, height: 0 },
  state: { isDragging: false, dragStart: {x:0,y:0}, viewStart: {x:0,y:0}, selectedHex: null, hoveredHex: null },
  
  onHexSelect: null,

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hexmap-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    
    this.hex.width = this.hex.size * 2;
    this.hex.height = Math.sqrt(3) * this.hex.size;
    
    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.centerView();
  },

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.render();
  },

  centerView() {
    const s = DB.data.hexmap?.settings || { width: 20, height: 15 };
    const mw = s.width * this.hex.width * 0.75;
    const mh = s.height * this.hex.height;
    this.view.offsetX = (this.canvas.width - mw * this.view.zoom) / 2;
    this.view.offsetY = (this.canvas.height - mh * this.view.zoom) / 2;
    this.render();
  },

  setupEvents() {
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', e => this.onWheel(e));
    this.canvas.addEventListener('click', e => this.onClick(e));
  },

  pixelToHex(px, py) {
    const x = (px - this.view.offsetX) / this.view.zoom;
    const y = (py - this.view.offsetY) / this.view.zoom;
    const q = (2/3 * x) / this.hex.size;
    const r = (-1/3 * x + Math.sqrt(3)/3 * y) / this.hex.size;
    return this.roundHex(q, r);
  },

  roundHex(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const qD = Math.abs(rq - q), rD = Math.abs(rr - r), sD = Math.abs(rs - s);
    if (qD > rD && qD > sD) rq = -rr - rs;
    else if (rD > sD) rr = -rq - rs;
    return { q: rq, r: rr };
  },

  hexToPixel(q, r) {
    return { x: this.hex.size * (3/2 * q), y: this.hex.size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r) };
  },

  getHexCorners(cx, cy) {
    const c = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      c.push({ x: cx + this.hex.size * Math.cos(a), y: cy + this.hex.size * Math.sin(a) });
    }
    return c;
  },

  onMouseDown(e) {
    this.state.isDragging = true;
    this.state.dragStart = { x: e.clientX, y: e.clientY };
    this.state.viewStart = { x: this.view.offsetX, y: this.view.offsetY };
    this.canvas.style.cursor = 'grabbing';
  },

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    
    if (this.state.isDragging) {
      this.view.offsetX = this.state.viewStart.x + e.clientX - this.state.dragStart.x;
      this.view.offsetY = this.state.viewStart.y + e.clientY - this.state.dragStart.y;
      this.render();
    } else {
      const hex = this.pixelToHex(x, y);
      if (!this.state.hoveredHex || this.state.hoveredHex.q !== hex.q || this.state.hoveredHex.r !== hex.r) {
        this.state.hoveredHex = hex;
        this.render();
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
    const hex = this.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
    this.state.selectedHex = hex;
    this.render();
    if (this.onHexSelect) this.onHexSelect(hex, DB.getHex(hex.q, hex.r));
  },

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const zf = e.deltaY > 0 ? 0.9 : 1.1;
    const nz = Math.max(this.view.minZoom, Math.min(this.view.maxZoom, this.view.zoom * zf));
    const sc = nz / this.view.zoom;
    this.view.offsetX = mx - (mx - this.view.offsetX) * sc;
    this.view.offsetY = my - (my - this.view.offsetY) * sc;
    this.view.zoom = nz;
    this.render();
  },

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);
    
    // Grid bg
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    
    ctx.save();
    ctx.translate(this.view.offsetX, this.view.offsetY);
    ctx.scale(this.view.zoom, this.view.zoom);
    
    const hexes = DB.data.hexmap?.hexes || [];
    const biomes = DB.data.biomes || [];
    
    hexes.forEach(hex => {
      const biome = biomes.find(b => b.id === hex.biomeId) || { color: '#333' };
      const pos = this.hexToPixel(hex.q, hex.r);
      this.drawHex(ctx, pos.x, pos.y, biome, hex);
    });
    
    if (this.state.hoveredHex) {
      const pos = this.hexToPixel(this.state.hoveredHex.q, this.state.hoveredHex.r);
      this.drawHexHighlight(ctx, pos.x, pos.y, 'rgba(255,255,255,0.2)');
    }
    
    if (this.state.selectedHex) {
      const pos = this.hexToPixel(this.state.selectedHex.q, this.state.selectedHex.r);
      this.drawHexHighlight(ctx, pos.x, pos.y, 'rgba(99,102,241,0.5)');
    }
    
    hexes.forEach(hex => {
      if (hex.label) {
        const pos = this.hexToPixel(hex.q, hex.r);
        this.drawHexLabel(ctx, pos.x, pos.y, hex.label);
      }
    });
    
    const markers = DB.data.hexmap?.markers || [];
    markers.forEach(m => {
      const pos = this.hexToPixel(m.q, m.r);
      this.drawMarker(ctx, pos.x, pos.y, m);
    });
    
    ctx.restore();
  },

  drawHex(ctx, cx, cy, biome) {
    const corners = this.getHexCorners(cx, cy);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = biome.color;
    ctx.fill();
    this.drawBiomePattern(ctx, cx, cy, biome.pattern);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

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
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
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
          ctx.fillStyle = 'rgba(0,50,0,0.5)';
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
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'dunes':
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(cx + i * 12, cy, 10, 4, 0, 0, Math.PI);
          ctx.strokeStyle = 'rgba(200,150,50,0.5)';
          ctx.stroke();
        }
        break;
      case 'snow':
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(cx + (Math.random() - 0.5) * 30, cy + (Math.random() - 0.5) * 30, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fill();
        }
        break;
      case 'marsh':
        for (let i = 0; i < 4; i++) {
          const mx = cx + (Math.random() - 0.5) * 25;
          const my = cy + (Math.random() - 0.5) * 25;
          ctx.beginPath();
          ctx.moveTo(mx, my + 5);
          ctx.lineTo(mx, my - 5);
          ctx.strokeStyle = 'rgba(100,150,50,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        break;
      case 'lava':
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,100,0,0.5)';
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
          ctx.fillStyle = 'rgba(200,150,255,0.5)';
          ctx.fill();
        }
        break;
    }
    ctx.restore();
  },

  drawHexHighlight(ctx, cx, cy, color) {
    const corners = this.getHexCorners(cx, cy);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(99,102,241,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  drawHexLabel(ctx, cx, cy, label) {
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(label);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(cx - m.width / 2 - 4, cy - 10, m.width + 8, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, cy);
  },

  drawMarker(ctx, cx, cy, marker) {
    const icons = { castle: '🏰', tree: '🌳', skull: '💀', star: '⭐' };
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[marker.icon] || '📍', cx, cy - 10);
  },

  zoomIn() { this.view.zoom = Math.min(this.view.maxZoom, this.view.zoom * 1.2); this.render(); },
  zoomOut() { this.view.zoom = Math.max(this.view.minZoom, this.view.zoom / 1.2); this.render(); },
  resetView() { this.view.zoom = 1; this.centerView(); }
};

window.HexMap = HexMap;