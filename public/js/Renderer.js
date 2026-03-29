'use strict';

class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;

    // Preload plant/terrain sprites
    this.sprites = {};
    var staticSprites = [
      'wheat_1', 'wheat_2',
      'berry_1', 'berry_2',
      'ground_1', 'ground_2', 'ground_3', 'ground_4',
      'hedge_1', 'hedge_2',
      'player', 'playerDamage', 'playerBlink',
    ];
    for (var i = 0; i < staticSprites.length; i++) {
      var name = staticSprites[i];
      var img = new Image();
      img.src = 'picture/' + name + '.png';
      this.sprites[name] = img;
    }
    // Mature stage sprites: placeholder as static png (will swap to animated later)
    var matureSprites = ['wheat_3', 'berry_3'];
    for (var m = 0; m < matureSprites.length; m++) {
      var mName = matureSprites[m];
      var mImg = new Image();
      mImg.src = 'picture/' + mName + '.gif'; // will be replaced with png later
      this.sprites[mName] = mImg;
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ── Chunk-based terrain cache ──
  // Map split into CHUNK_SIZE x CHUNK_SIZE grid-cell chunks.
  // Each chunk is pre-rendered to an offscreen canvas.
  // Per frame: only draw ~6-12 visible chunks via drawImage.

  initChunks(terrainCells) {
    var gs = Constants.GRID_SIZE;
    this.CHUNK_CELLS = 8; // 8x8 grid cells per chunk
    this.CHUNK_PX = this.CHUNK_CELLS * gs; // 512px
    this.chunksX = Math.ceil(Constants.MAP_WIDTH / this.CHUNK_PX);
    this.chunksY = Math.ceil(Constants.MAP_HEIGHT / this.CHUNK_PX);
    this._chunks = {};
    this._terrainLookup = {};

    // Build lookup: "gx,gy" → cell
    for (var i = 0; i < terrainCells.length; i++) {
      var c = terrainCells[i];
      this._terrainLookup[c.gx + ',' + c.gy] = c;
    }

    // Pre-render all chunks
    for (var cx = 0; cx < this.chunksX; cx++) {
      for (var cy = 0; cy < this.chunksY; cy++) {
        this._renderChunk(cx, cy);
      }
    }
    this._chunksReady = true;
  }

  _renderChunk(cx, cy) {
    var gs = Constants.GRID_SIZE;
    var cpx = this.CHUNK_PX;
    var osc = document.createElement('canvas');
    osc.width = cpx;
    osc.height = cpx;
    var octx = osc.getContext('2d');

    var g4 = this.sprites['ground_4'];
    var hasGround = g4 && g4.complete && g4.naturalWidth > 0;

    var baseGx = cx * this.CHUNK_CELLS;
    var baseGy = cy * this.CHUNK_CELLS;

    for (var dx = 0; dx < this.CHUNK_CELLS; dx++) {
      for (var dy = 0; dy < this.CHUNK_CELLS; dy++) {
        var gx = baseGx + dx;
        var gy = baseGy + dy;
        var px = dx * gs;
        var py = dy * gs;
        var cell = this._terrainLookup[gx + ',' + gy];

        if (cell) {
          this._drawTerrainCell(octx, px, py, gs, cell);
        } else if (hasGround) {
          // Empty ground with texture
          octx.drawImage(g4, px, py, gs, gs);
        } else {
          // Fallback solid color
          octx.fillStyle = '#1a3a1a';
          octx.fillRect(px, py, gs, gs);
        }
      }
    }

    this._chunks[cx + ',' + cy] = osc;
  }

  _drawTerrainCell(ctx, px, py, gs, cell) {
    if (cell.type === 'pond') {
      ctx.fillStyle = '#1a5c8a';
      ctx.fillRect(px, py, gs, gs);
      ctx.fillStyle = 'rgba(40,130,210,0.4)';
      ctx.fillRect(px, py, gs, gs);
    } else if (cell.type === 'boulder') {
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(px, py, gs, gs);
      ctx.fillStyle = '#6e6e6e';
      var bseed = cell.gx * 31 + cell.gy * 17;
      ctx.fillRect(px + (bseed % 20) + 4, py + ((bseed * 7) % 20) + 4, 12, 8);
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(px + ((bseed * 3) % 30) + 2, py + ((bseed * 11) % 30) + 2, 8, 6);
    } else if (cell.type === 'rock') {
      // Draw ground first, then rock on top
      var g1 = this.sprites['ground_1'];
      if (g1 && g1.complete && g1.naturalWidth > 0) {
        ctx.drawImage(g1, px, py, gs, gs);
      }
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.arc(px + gs / 2, py + gs / 2, gs / 2 - 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5e5e5e';
      ctx.beginPath();
      ctx.arc(px + gs / 2 - 2, py + gs / 2 - 2, gs / 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (cell.type === 'grass') {
      ctx.fillStyle = '#1a5a1a';
      ctx.fillRect(px, py, gs, gs);
      ctx.fillStyle = 'rgba(0,180,0,0.5)';
      var gseed = cell.gx * 1000 + cell.gy;
      for (var j = 0; j < 6; j++) {
        var bx = px + ((gseed * (j + 1) * 7) % (gs - 8)) + 4;
        var by = py + ((gseed * (j + 1) * 13) % (gs - 12)) + 8;
        ctx.fillRect(bx, by, 2, 8);
        ctx.fillRect(bx - 1, by, 4, 2);
      }
    }
  }

  // Invalidate chunk at world grid position (call when terrain changes)
  invalidateChunk(gx, gy) {
    if (!this._chunksReady) return;
    var cx = Math.floor(gx / this.CHUNK_CELLS);
    var cy = Math.floor(gy / this.CHUNK_CELLS);
    this._renderChunk(cx, cy);
  }

  // Update terrain lookup and re-render affected chunk
  updateTerrainCell(gx, gy, cell) {
    if (!this._chunksReady) return;
    if (cell) {
      this._terrainLookup[gx + ',' + gy] = cell;
    } else {
      delete this._terrainLookup[gx + ',' + gy];
    }
    this.invalidateChunk(gx, gy);
  }

  clear() {
    this.ctx.fillStyle = '#1a3a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid() {
    const ctx = this.ctx;
    const cam = this.camera;
    const gs = Constants.GRID_SIZE;
    const viewW = this.canvas.width / (cam.zoom || 1);
    const viewH = this.canvas.height / (cam.zoom || 1);

    const startX = Math.floor(cam.x / gs) * gs;
    const startY = Math.floor(cam.y / gs) * gs;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    for (let x = startX; x < cam.x + viewW + gs; x += gs) {
      const sx = x - cam.x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, viewH + gs);
      ctx.stroke();
    }

    for (let y = startY; y < cam.y + viewH + gs; y += gs) {
      const sy = y - cam.y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(viewW + gs, sy);
      ctx.stroke();
    }
  }

  drawBoundary() {
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 4;
    ctx.strokeRect(-cam.x, -cam.y, Constants.MAP_WIDTH, Constants.MAP_HEIGHT);
  }

  drawTerrain(terrainCells) {
    if (!this._chunksReady) {
      // First call or not initialized: init chunks
      this.initChunks(terrainCells);
      return;
    }

    // Update terrain lookup for changes (grass cut/regrown, new ponds, etc.)
    var changed = new Set();
    var newLookup = {};
    for (var i = 0; i < terrainCells.length; i++) {
      var c = terrainCells[i];
      var k = c.gx + ',' + c.gy;
      newLookup[k] = c;
      if (!this._terrainLookup[k]) {
        changed.add(Math.floor(c.gx / this.CHUNK_CELLS) + ',' + Math.floor(c.gy / this.CHUNK_CELLS));
      }
    }
    // Check removed terrain
    for (var k in this._terrainLookup) {
      if (!newLookup[k]) {
        var parts = k.split(',');
        changed.add(Math.floor(parts[0] / this.CHUNK_CELLS) + ',' + Math.floor(parts[1] / this.CHUNK_CELLS));
      }
    }
    if (changed.size > 0) {
      this._terrainLookup = newLookup;
      changed.forEach(function(ck) {
        var p = ck.split(',');
        this._renderChunk(parseInt(p[0]), parseInt(p[1]));
      }.bind(this));
    }

    // Draw only visible chunks
    var ctx = this.ctx;
    var cam = this.camera;
    var z = cam.zoom || 1;
    var cpx = this.CHUNK_PX;
    var startCx = Math.max(0, Math.floor(cam.x / cpx));
    var startCy = Math.max(0, Math.floor(cam.y / cpx));
    var endCx = Math.min(this.chunksX - 1, Math.floor((cam.x + this.canvas.width / z) / cpx));
    var endCy = Math.min(this.chunksY - 1, Math.floor((cam.y + this.canvas.height / z) / cpx));

    for (var cx = startCx; cx <= endCx; cx++) {
      for (var cy = startCy; cy <= endCy; cy++) {
        var chunk = this._chunks[cx + ',' + cy];
        if (!chunk) continue;
        var pos = cam.worldToScreen(cx * cpx, cy * cpx);
        ctx.drawImage(chunk, pos.x, pos.y);
      }
    }
  }

  drawPlant(plant) {
    if (!this.camera.isVisible(plant.x, plant.y, 80)) return;
    const ctx = this.ctx;
    const gs = Constants.GRID_SIZE;
    const cellX = plant.x - gs / 2;
    const cellY = plant.y - gs / 2;
    const pos = this.camera.worldToScreen(cellX, cellY);
    const pad = 4;

    // Look up colors from plant type (fallback to wheat)
    const def = Constants.PLANT_TYPES[plant.type] || Constants.PLANT_TYPES.wheat;

    if (plant.type === 'dandelion') {
      this._drawDandelion(ctx, pos, gs, pad, plant, def);
      return;
    }
    // Sprite-based plants (wheat, berry)
    if (plant.type === 'wheat' || plant.type === 'berry') {
      var spriteKey = plant.type + '_' + (plant.stage + 1);
      var sprite = this.sprites[spriteKey];
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        ctx.drawImage(sprite, pos.x, pos.y, gs, gs);
        this._drawPlantHpBar(ctx, pos, gs, pad, plant);
        // Bugged overlay
        if (plant.bugged) {
          ctx.fillStyle = '#7CFC00';
          var inner = gs - pad * 2;
          var ox = pos.x + pad;
          var oy = pos.y + pad;
          ctx.fillRect(ox + 4, oy + 5, 2, 2);
          ctx.fillRect(ox + inner - 8, oy + 4, 2, 2);
          ctx.fillRect(ox + inner / 2, oy + inner - 7, 2, 2);
          ctx.fillRect(ox + 3, oy + inner / 2, 2, 2);
          ctx.fillRect(ox + inner - 6, oy + inner - 5, 2, 2);
        }
        return;
      }
      // Fallback: berry uses its own renderer, wheat falls through to default
      if (plant.type === 'berry') {
        this._drawBerry(ctx, pos, gs, pad, plant, def);
        return;
      }
    }
    if (plant.type === 'berry') {
      this._drawBerry(ctx, pos, gs, pad, plant, def);
      return;
    }
    // Special plant types with unique rendering
    if (plant.type === 'pitTrap') {
      this._drawPitTrap(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type === 'hedge') {
      // stage 0,1 = hedge_1 (seedling), stage 2 = hedge_2 (mature)
      var hKey = plant.stage === 2 ? 'hedge_2' : 'hedge_1';
      var hSprite = this.sprites[hKey];
      if (hSprite && hSprite.complete && hSprite.naturalWidth > 0) {
        ctx.drawImage(hSprite, pos.x, pos.y, gs, gs);
        this._drawPlantHpBar(ctx, pos, gs, pad, plant);
      } else {
        this._drawHedge(ctx, pos, gs, pad, plant, def);
      }
      return;
    }
    if (plant.type === 'placedStone') {
      // Warm-toned stone (different from terrain rocks)
      ctx.fillStyle = plant.stage === 2 ? '#7a6b5a' : '#999';
      ctx.beginPath();
      ctx.arc(pos.x + gs / 2, pos.y + gs / 2, gs / 2 - pad - 2, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = '#8a7b6a';
      ctx.beginPath();
      ctx.arc(pos.x + gs / 2 - 3, pos.y + gs / 2 - 3, gs / 4, 0, Math.PI * 2);
      ctx.fill();
      this._drawPlantHpBar(ctx, pos, gs, pad, plant);
      return;
    }
    if (plant.type === 'cactus') {
      this._drawCactus(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type === 'mint') {
      this._drawMint(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type === 'grape') {
      this._drawGrape(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type === 'chili') {
      this._drawChili(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type === 'rice') {
      this._drawRice(ctx, pos, gs, pad, plant, def);
      return;
    }
    if (plant.type.startsWith('flower')) {
      this._drawFlower(ctx, pos, gs, pad, plant, def);
      return;
    }

    if (plant.stage === 0) {
      // Seed: tilled soil with seed dots
      ctx.fillStyle = '#5C3A1E';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.seedColor;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillRect(pos.x + pad + 8 + c * 16, pos.y + pad + 8 + r * 16, 4, 4);
        }
      }
    } else if (plant.stage === 1) {
      // Sprout: tilled soil with small shoots
      ctx.fillStyle = '#4A2E0A';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.sproutColor;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const sx = pos.x + pad + 6 + c * 16;
          const sy = pos.y + pad + 4 + r * 16;
          ctx.fillRect(sx + 2, sy + 6, 2, 8);
          ctx.fillRect(sx, sy + 2, 6, 4);
        }
      }
    } else {
      // Mature
      ctx.fillStyle = '#4A2E0A';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const sx = pos.x + pad + 4 + c * 16;
          const sy = pos.y + pad + 2 + r * 16;
          ctx.fillStyle = def.sproutColor;
          ctx.fillRect(sx + 3, sy + 6, 2, 12);
          ctx.fillStyle = def.matureColor;
          ctx.fillRect(sx, sy, 8, 6);
        }
      }

      // HP bar for damaged mature plants
      if (plant.hp < plant.maxHp) {
        const barW = gs - pad * 2;
        const barH = 4;
        const barX = pos.x + pad;
        const barY = pos.y + pad - 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = plant.hp / plant.maxHp;
        ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(barX, barY, barW * ratio, barH);
      }
    }
    // Bugged plant overlay (bugKeeper) — scattered green dots
    if (plant.bugged) {
      ctx.fillStyle = '#7CFC00';
      const inner = gs - pad * 2;
      const ox = pos.x + pad;
      const oy = pos.y + pad;
      ctx.fillRect(ox + 4, oy + 5, 2, 2);
      ctx.fillRect(ox + inner - 8, oy + 4, 2, 2);
      ctx.fillRect(ox + inner / 2, oy + inner - 7, 2, 2);
      ctx.fillRect(ox + 3, oy + inner / 2, 2, 2);
      ctx.fillRect(ox + inner - 6, oy + inner - 5, 2, 2);
    }
  }

  _drawDandelion(ctx, pos, gs, pad, plant, def) {
    if (plant.stage === 0) {
      // Seed: earth with small dots
      ctx.fillStyle = '#3a5a20';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.seedColor;
      for (let i = 0; i < 4; i++) {
        const dx = 12 + (i % 2) * 24;
        const dy = 12 + Math.floor(i / 2) * 24;
        ctx.fillRect(pos.x + pad + dx, pos.y + pad + dy, 4, 4);
      }
    } else if (plant.stage === 1) {
      // Sprout: small leaves
      ctx.fillStyle = '#3a5a20';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.sproutColor;
      for (let i = 0; i < 4; i++) {
        const dx = 10 + (i % 2) * 22;
        const dy = 8 + Math.floor(i / 2) * 22;
        ctx.fillRect(pos.x + pad + dx, pos.y + pad + 4 + dy, 2, 10);
        ctx.fillRect(pos.x + pad + dx - 2, pos.y + pad + dy, 6, 4);
      }
    } else {
      // Mature: yellow dandelion flowers
      ctx.fillStyle = '#3a5a20';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);

      for (let i = 0; i < 4; i++) {
        const cx = pos.x + pad + 14 + (i % 2) * 22;
        const cy = pos.y + pad + 14 + Math.floor(i / 2) * 22;
        // Stem
        ctx.fillStyle = def.sproutColor;
        ctx.fillRect(cx, cy + 4, 2, 10);
        // Flower head
        ctx.fillStyle = def.matureColor;
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // HP bar for damaged plants
      if (plant.hp < plant.maxHp) {
        const barW = gs - pad * 2;
        const barH = 4;
        const barX = pos.x + pad;
        const barY = pos.y + pad - 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = plant.hp / plant.maxHp;
        ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(barX, barY, barW * ratio, barH);
      }
    }
  }

  _drawBerry(ctx, pos, gs, pad, plant, def) {
    if (plant.stage === 0) {
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.seedColor;
      for (let i = 0; i < 4; i++) {
        const dx = 12 + (i % 2) * 24;
        const dy = 12 + Math.floor(i / 2) * 24;
        ctx.fillRect(pos.x + pad + dx, pos.y + pad + dy, 4, 4);
      }
    } else if (plant.stage === 1) {
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = def.sproutColor;
      for (let i = 0; i < 4; i++) {
        const dx = 10 + (i % 2) * 22;
        const dy = 8 + Math.floor(i / 2) * 22;
        ctx.fillRect(pos.x + pad + dx, pos.y + pad + 4 + dy, 2, 10);
        ctx.fillRect(pos.x + pad + dx - 2, pos.y + pad + dy, 6, 4);
      }
    } else {
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      for (let i = 0; i < 4; i++) {
        const cx = pos.x + pad + 14 + (i % 2) * 22;
        const cy = pos.y + pad + 14 + Math.floor(i / 2) * 22;
        ctx.fillStyle = def.sproutColor;
        ctx.fillRect(cx, cy + 4, 2, 10);
        ctx.fillStyle = def.matureColor;
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 2, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Danger indicator
      ctx.strokeStyle = 'rgba(255,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);

      if (plant.hp < plant.maxHp) {
        const barW = gs - pad * 2;
        const barH = 4;
        const barX = pos.x + pad;
        const barY = pos.y + pad - 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = plant.hp / plant.maxHp;
        ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(barX, barY, barW * ratio, barH);
      }
    }
  }

  _drawPitTrap(ctx, pos, gs, pad, plant, def) {
    if (plant.stage < 2) {
      // Digging animation
      ctx.fillStyle = '#4a3520';
      ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
      ctx.fillStyle = '#2a1a0a';
      const s = plant.stage === 1 ? 0.7 : 0.4;
      const inset = gs * (1 - s) / 2;
      ctx.fillRect(pos.x + inset, pos.y + inset, gs * s, gs * s);
    } else {
      // Mature: nearly invisible dark hole
      ctx.fillStyle = '#1a1a0a';
      ctx.fillRect(pos.x + pad + 2, pos.y + pad + 2, gs - pad * 2 - 4, gs - pad * 2 - 4);
      ctx.strokeStyle = 'rgba(60,40,20,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x + pad + 2, pos.y + pad + 2, gs - pad * 2 - 4, gs - pad * 2 - 4);
    }
  }

  _drawHedge(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = plant.stage === 2 ? def.matureColor : def.sproutColor;
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      // Dense leaf pattern
      ctx.fillStyle = '#0a4a0a';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(pos.x + pad + c * 14, pos.y + pad + r * 14, 10, 10);
          }
        }
      }
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawCactus(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      // Main body
      ctx.fillStyle = def.matureColor;
      ctx.fillRect(pos.x + 22, pos.y + 12, 20, 40);
      // Arms
      ctx.fillRect(pos.x + 10, pos.y + 18, 14, 8);
      ctx.fillRect(pos.x + 10, pos.y + 18, 8, 20);
      ctx.fillRect(pos.x + 40, pos.y + 24, 14, 8);
      ctx.fillRect(pos.x + 46, pos.y + 16, 8, 16);
      // Spines
      ctx.fillStyle = '#ADFF2F';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(pos.x + 20 + i * 5, pos.y + 10, 2, 2);
        ctx.fillRect(pos.x + 22 + i * 4, pos.y + 50, 2, 2);
      }
    } else {
      ctx.fillStyle = def.sproutColor;
      const h = plant.stage === 1 ? 20 : 10;
      ctx.fillRect(pos.x + 26, pos.y + gs - pad - h, 12, h);
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawMint(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      // Mint leaves pattern
      ctx.fillStyle = def.matureColor;
      for (let i = 0; i < 5; i++) {
        const lx = pos.x + pad + 4 + (i % 3) * 16;
        const ly = pos.y + pad + 4 + Math.floor(i / 3) * 20 + (i % 2) * 8;
        ctx.fillRect(lx, ly, 12, 8);
        ctx.fillRect(lx + 2, ly - 2, 8, 12);
      }
    } else {
      ctx.fillStyle = plant.stage === 1 ? def.sproutColor : def.seedColor;
      const dots = plant.stage === 1 ? 4 : 2;
      for (let i = 0; i < dots; i++) {
        ctx.fillRect(pos.x + pad + 10 + (i % 2) * 24, pos.y + pad + 10 + Math.floor(i / 2) * 24, 6, 6);
      }
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawGrape(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = '#2a1a2a';
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      // Grape cluster
      ctx.fillStyle = def.matureColor;
      const cx = pos.x + gs / 2;
      const cy = pos.y + gs / 2;
      for (let row = 0; row < 3; row++) {
        const count = 4 - row;
        for (let i = 0; i < count; i++) {
          const gx = cx - (count - 1) * 5 + i * 10;
          const gy = cy - 10 + row * 10;
          ctx.beginPath();
          ctx.arc(gx, gy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Stem
      ctx.fillStyle = def.sproutColor;
      ctx.fillRect(cx - 1, pos.y + pad + 2, 2, 12);
    } else {
      ctx.fillStyle = plant.stage === 1 ? def.sproutColor : def.seedColor;
      ctx.fillRect(pos.x + 26, pos.y + 20, 2, plant.stage === 1 ? 20 : 10);
      if (plant.stage === 1) {
        ctx.fillRect(pos.x + 22, pos.y + 16, 10, 6);
      }
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawChili(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = '#3a1a0a';
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      // Chili peppers
      for (let i = 0; i < 3; i++) {
        const cx = pos.x + 14 + i * 16;
        const cy = pos.y + 20;
        ctx.fillStyle = def.sproutColor;
        ctx.fillRect(cx + 2, cy - 6, 2, 8);
        ctx.fillStyle = def.matureColor;
        ctx.fillRect(cx, cy, 6, 16);
        ctx.fillRect(cx + 1, cy + 14, 4, 6);
      }
    } else {
      ctx.fillStyle = plant.stage === 1 ? def.sproutColor : def.seedColor;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(pos.x + 14 + i * 16, pos.y + 24, 4, plant.stage === 1 ? 14 : 6);
      }
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawRice(ctx, pos, gs, pad, plant, def) {
    // Background: water rice = blue, land rice = muddy brown
    if (plant.landRice) {
      ctx.fillStyle = 'rgba(100,70,30,0.6)';
    } else {
      ctx.fillStyle = 'rgba(30,80,120,0.5)';
    }
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const sx = pos.x + pad + 4 + c * 16;
          const sy = pos.y + pad + 2 + r * 16;
          ctx.fillStyle = def.sproutColor;
          ctx.fillRect(sx + 3, sy + 6, 2, 12);
          ctx.fillStyle = def.matureColor;
          ctx.fillRect(sx + 1, sy, 6, 4);
          ctx.fillRect(sx + 3, sy + 2, 4, 3);
        }
      }
    } else {
      ctx.fillStyle = plant.stage === 1 ? def.sproutColor : def.seedColor;
      for (let i = 0; i < 4; i++) {
        const x = pos.x + pad + 10 + (i % 2) * 24;
        const y = pos.y + pad + 10 + Math.floor(i / 2) * 24;
        ctx.fillRect(x, y, 4, plant.stage === 1 ? 12 : 4);
      }
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawFlower(ctx, pos, gs, pad, plant, def) {
    ctx.fillStyle = '#2a3a1a';
    ctx.fillRect(pos.x + pad, pos.y + pad, gs - pad * 2, gs - pad * 2);
    if (plant.stage === 2) {
      for (let i = 0; i < 4; i++) {
        const cx = pos.x + pad + 14 + (i % 2) * 22;
        const cy = pos.y + pad + 14 + Math.floor(i / 2) * 22;
        // Stem
        ctx.fillStyle = def.sproutColor;
        ctx.fillRect(cx, cy + 4, 2, 10);
        // Petals
        ctx.fillStyle = def.matureColor;
        ctx.beginPath();
        ctx.arc(cx + 1, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        // Center
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(cx + 1, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = plant.stage === 1 ? def.sproutColor : def.seedColor;
      for (let i = 0; i < 4; i++) {
        const x = pos.x + pad + 10 + (i % 2) * 22;
        const y = pos.y + pad + 10 + Math.floor(i / 2) * 22;
        ctx.fillRect(x, y, 4, plant.stage === 1 ? 10 : 4);
      }
    }
    this._drawPlantHpBar(ctx, pos, gs, pad, plant);
  }

  _drawPlantHpBar(ctx, pos, gs, pad, plant) {
    if (plant.stage === 2 && plant.hp < plant.maxHp) {
      const barW = gs - pad * 2;
      const barH = 4;
      const barX = pos.x + pad;
      const barY = pos.y + pad - 6;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      const ratio = plant.hp / plant.maxHp;
      ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
  }

  drawPlayer(player, isMe) {
    if (!player.alive) return;
    if (player.hidden && !isMe) return;
    if (!this.camera.isVisible(player.x, player.y, 60)) return;

    var ctx = this.ctx;
    var pos = this.camera.worldToScreen(player.x, player.y);
    var size = player.playerSize || Constants.PLAYER_SIZE;
    var spriteSize = size * 1.8; // sprite is larger than hitbox
    var now = Date.now();

    // Alpha
    var alpha = 1;
    if (isMe && player.hidden) alpha = 0.4;
    if (player.dashing) alpha = 0.5;
    if (player.invincible && Math.floor(now / 100) % 2 === 0) alpha *= 0.5;
    ctx.globalAlpha = alpha;

    // Dash trail
    if (player.dashing && this.prevPlayerPos && this.prevPlayerPos[player.id]) {
      var prev = this.prevPlayerPos[player.id];
      var prevPos = this.camera.worldToScreen(prev.x, prev.y);
      var pSprite = this.sprites['player'];
      if (pSprite && pSprite.complete && pSprite.naturalWidth > 0) {
        ctx.globalAlpha = 0.15;
        ctx.drawImage(pSprite, prevPos.x - spriteSize / 2, prevPos.y - spriteSize / 2, spriteSize, spriteSize);
        ctx.globalAlpha = 0.3;
        var midX = (prevPos.x + pos.x) / 2;
        var midY = (prevPos.y + pos.y) / 2;
        ctx.drawImage(pSprite, midX - spriteSize / 2, midY - spriteSize / 2, spriteSize, spriteSize);
      }
      ctx.globalAlpha = alpha;
    }

    // Walk bounce: detect movement from prev position
    var bounceY = 0;
    if (this.prevPlayerPos && this.prevPlayerPos[player.id]) {
      var pp = this.prevPlayerPos[player.id];
      var moved = Math.abs(player.x - pp.x) + Math.abs(player.y - pp.y);
      if (moved > 0.5) {
        bounceY = Math.sin(now / 40) * 2; // faster, smaller bounce
      }
    }

    // Damage shake
    var shakeX = 0;
    if (player.hurt) {
      shakeX = Math.sin(now / 20) * 4;
    }

    // Blink timing: each player blinks at random intervals (3-6s), lasts 150ms
    if (!this._blinkTimers) this._blinkTimers = {};
    var bt = this._blinkTimers[player.id];
    if (!bt) {
      bt = { nextBlink: now + 2000 + Math.random() * 4000, blinking: false };
      this._blinkTimers[player.id] = bt;
    }
    if (!bt.blinking && now >= bt.nextBlink) {
      bt.blinking = true;
      bt.blinkEnd = now + 150;
    }
    if (bt.blinking && now >= bt.blinkEnd) {
      bt.blinking = false;
      bt.nextBlink = now + 3000 + Math.random() * 3000;
    }

    // Choose sprite: damage > blink > normal
    var spriteKey = player.hurt ? 'playerDamage' : (bt.blinking ? 'playerBlink' : 'player');
    var sprite = this.sprites[spriteKey];
    var drawX = pos.x - spriteSize / 2 + shakeX;
    var drawY = pos.y - spriteSize / 2 + bounceY;

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, drawX, drawY, spriteSize, spriteSize);
    } else {
      // Fallback: colored square
      ctx.fillStyle = player.color;
      ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pos.x - 6, pos.y - 4, 4, 4);
      ctx.fillRect(pos.x + 2, pos.y - 4, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(pos.x - 5, pos.y - 3, 2, 2);
      ctx.fillRect(pos.x + 3, pos.y - 3, 2, 2);
    }

    ctx.globalAlpha = 1;

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, pos.x, pos.y - spriteSize / 2 - 12 + bounceY);

    // Level badge
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText('Lv' + player.level, pos.x, pos.y - spriteSize / 2 + bounceY);

    // HP bar above player
    var barW = 32;
    var barH = 4;
    var barX = pos.x - barW / 2;
    var barY = pos.y - spriteSize / 2 - 24 + bounceY;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    var hpRatio = player.hp / player.maxHp;
    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    // Shield indicator
    if (player.shield) {
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, spriteSize / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trapped indicator
    if (player.trapped) {
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 3;
      ctx.strokeRect(pos.x - size / 2 - 4, pos.y - size / 2 - 4, size + 8, size + 8);
      ctx.fillStyle = 'rgba(50,30,10,0.3)';
      ctx.fillRect(pos.x - size / 2 - 4, pos.y - size / 2 - 4, size + 8, size + 8);
    }

    // Rage mode indicator
    if (player.raging) {
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x - size / 2 - 3, pos.y - size / 2 - 3, size + 6, size + 6);
      var t = now / 100;
      ctx.fillStyle = 'rgba(255,100,0,0.6)';
      ctx.fillRect(pos.x - 4 + Math.sin(t) * 3, pos.y - size / 2 - 8, 4, 4);
      ctx.fillRect(pos.x + 4 + Math.cos(t) * 3, pos.y - size / 2 - 6, 3, 3);
    }


    // Store position for dash trail & bounce detection
    if (!this.prevPlayerPos) this.prevPlayerPos = {};
    this.prevPlayerPos[player.id] = { x: player.x, y: player.y };
  }

  drawChargeCircle(player, progress, isMe) {
    if (!this.camera.isVisible(player.x, player.y, 120)) return;
    const ctx = this.ctx;
    const pos = this.camera.worldToScreen(player.x, player.y);
    const radius = player.scytheLength || Constants.SCYTHE_LENGTH;

    // Pulsing red fill
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 40, 40, ' + (0.05 + progress * 0.12) + ')';
    ctx.fill();

    // Progress arc (clockwise from top)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = 'rgba(255, 30, 30, ' + (0.4 + progress * 0.5) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Outer ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawChargeThrow(player, progress, angle, range, throwWidth) {
    if (!this.camera.isVisible(player.x, player.y, range + 20)) return;
    const ctx = this.ctx;
    const pos = this.camera.worldToScreen(player.x, player.y);
    const halfW = (throwWidth || 30) / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin * halfW;
    const perpY = cos * halfW;
    const endX = pos.x + cos * range;
    const endY = pos.y + sin * range;

    // Corridor fill
    ctx.fillStyle = 'rgba(255, 40, 40, ' + (0.04 + progress * 0.1) + ')';
    ctx.beginPath();
    ctx.moveTo(pos.x + perpX, pos.y + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(pos.x - perpX, pos.y - perpY);
    ctx.closePath();
    ctx.fill();

    // Progress line
    const lineLen = range * progress;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + cos * lineLen, pos.y + sin * lineLen);
    ctx.strokeStyle = 'rgba(255, 30, 30, ' + (0.4 + progress * 0.5) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Corridor outline
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pos.x + perpX, pos.y + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(pos.x - perpX, pos.y - perpY);
    ctx.closePath();
    ctx.stroke();
  }

  drawScythe(screenX, screenY, angle, scytheLength) {
    const ctx = this.ctx;
    const len = scytheLength || Constants.SCYTHE_LENGTH;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);

    // Handle (brown stick)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(8, -2, len - 16, 4);

    // Blade shaft (grey, at the tip)
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(len - 14, -10, 4, 20);

    // Blade edge (lighter, curved part)
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(len - 22, -12, 12, 4);
    ctx.fillRect(len - 26, -10, 6, 4);

    ctx.restore();
  }

  drawProjectiles(projectiles) {
    if (!projectiles || !projectiles.length) return;
    const ctx = this.ctx;
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!this.camera.isVisible(p.x, p.y, 40)) continue;
      const pos = this.camera.worldToScreen(p.x, p.y);

      if (p.type === 'slash') {
        // Flying slash blade (scale with width)
        var hw = p.width ? p.width / 2 : 14;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        const spinAngle = p.angle + Date.now() / 50 * Math.PI;
        ctx.rotate(spinAngle);
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(-hw, -2, hw * 2, 4);
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(-hw * 0.7, -hw * 0.4, hw * 1.4, hw * 0.3);
        ctx.fillRect(-hw * 0.7, hw * 0.1, hw * 1.4, hw * 0.3);
        ctx.restore();
      } else if (p.type === 'boomerang') {
        // Spinning blade (slash-style) with golden tint
        ctx.save();
        ctx.translate(pos.x, pos.y);
        const spinAngle = (p.angle || 0) + Date.now() / 60 * Math.PI;
        ctx.rotate(spinAngle);
        ctx.fillStyle = '#F0E68C';
        ctx.fillRect(-16, -2, 32, 4);
        ctx.fillStyle = '#DAA520';
        ctx.fillRect(-12, -6, 24, 4);
        ctx.fillRect(-12, 2, 24, 4);
        ctx.restore();
        // Linger indicator (when speed is 0, blade is hovering)
        if (p.speed === 0) {
          ctx.strokeStyle = 'rgba(255,200,0,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (p.type === 'bullet') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(-6, -2, 12, 4);
        ctx.restore();
      } else if (p.type === 'fertilizer') {
        if (p.exploded) {
          // Explosion animation
          const r = p.radius || 50;
          // Outer blast
          ctx.fillStyle = 'rgba(255,120,0,0.5)';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          // Inner blast
          ctx.fillStyle = 'rgba(255,200,50,0.6)';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.fillStyle = 'rgba(255,255,200,0.7)';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r * 0.25, 0, Math.PI * 2);
          ctx.fill();
          // Ring
          ctx.strokeStyle = 'rgba(255,80,0,0.6)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Flying fertilizer ball with arc
          const size = 8 + p.progress * 4;
          ctx.fillStyle = '#8B4513';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y - (1 - Math.abs(p.progress - 0.5) * 2) * 30, size, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (p.type === 'water') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(p.angle);
        const w = p.range || 200;
        const h = p.width || 50;
        ctx.fillStyle = 'rgba(50,150,255,0.4)';
        ctx.fillRect(0, -h / 2, w, h);
        ctx.fillStyle = 'rgba(100,200,255,0.3)';
        ctx.fillRect(10, -h / 3, w - 20, h * 2 / 3);
        ctx.restore();
      }
    }
  }

  drawCombineBlades(player) {
    const pos = this.camera.worldToScreen(player.x, player.y);
    const ctx = this.ctx;
    const len = player.scytheLength || Constants.SCYTHE_LENGTH;
    const baseAngle = Date.now() / 300;
    for (let i = 0; i < 3; i++) {
      const angle = baseAngle + (i * Math.PI * 2 / 3);
      this.drawScythe(pos.x, pos.y, angle, len);
    }
  }

  drawFlame(player, angle) {
    if (!this.camera.isVisible(player.x, player.y, 250)) return;
    const ctx = this.ctx;
    const pos = this.camera.worldToScreen(player.x, player.y);
    const w = 150;
    const h = 60;
    const t = Date.now() / 80;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Outer flame (dark red/orange)
    ctx.fillStyle = '#CC3300';
    ctx.fillRect(12, -h * 0.35, w * 0.75, h * 0.7);

    // Mid flame (orange)
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(8, -h * 0.25, w * 0.55, h * 0.5);

    // Inner flame (bright yellow)
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(4, -h * 0.12, w * 0.35, h * 0.24);

    // Flickering particles
    ctx.fillStyle = '#FF4500';
    for (let j = 0; j < 8; j++) {
      const fx = 20 + ((t * 3 + j * 31) % (w * 0.7));
      const fy = Math.sin(t + j * 1.7) * h * 0.3;
      ctx.fillRect(fx, fy - 3, 6, 6);
    }
    ctx.fillStyle = '#FFAA00';
    for (let j = 0; j < 5; j++) {
      const fx = 10 + ((t * 2 + j * 47) % (w * 0.5));
      const fy = Math.sin(t * 1.3 + j * 2.1) * h * 0.2;
      ctx.fillRect(fx, fy - 2, 4, 4);
    }

    ctx.restore();
  }

  drawMinimap(players, myId, terrainCells, leaderboard) {
    const minimap = document.getElementById('minimap');
    const mctx = minimap.getContext('2d');
    const mw = minimap.width;
    const mh = minimap.height;
    const scaleX = mw / Constants.MAP_WIDTH;
    const scaleY = mh / Constants.MAP_HEIGHT;
    const gs = Constants.GRID_SIZE;

    mctx.fillStyle = '#0f3d0f';
    mctx.fillRect(0, 0, mw, mh);

    // Draw terrain
    if (terrainCells) {
      for (let i = 0; i < terrainCells.length; i++) {
        const cell = terrainCells[i];
        const colors = Constants.TERRAIN_COLORS[cell.type];
        if (!colors) continue;
        mctx.fillStyle = colors.minimapColor;
        const mx = cell.gx * gs * scaleX;
        const my = cell.gy * gs * scaleY;
        const mgs = Math.max(gs * scaleX, 1);
        const mgsy = Math.max(gs * scaleY, 1);
        mctx.fillRect(mx, my, mgs, mgsy);
      }
    }

    // Find #1 player name from leaderboard
    const topName = leaderboard && leaderboard.length > 0 ? leaderboard[0].name : null;

    // Draw players: only self and #1
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      const isMe = p.id === myId;
      const isTop = topName && p.name === topName;
      if (!isMe && !isTop) continue;
      if (p.hidden && !isMe) continue;
      const mx = p.x * scaleX;
      const my = p.y * scaleY;
      if (isMe) {
        mctx.fillStyle = '#fff';
        mctx.fillRect(mx - 2, my - 2, 4, 4);
      } else {
        // #1 player: gold crown marker
        mctx.fillStyle = '#FFD700';
        mctx.fillRect(mx - 2, my - 2, 4, 4);
        mctx.strokeStyle = '#FF4500';
        mctx.lineWidth = 1;
        mctx.strokeRect(mx - 3, my - 3, 6, 6);
      }
    }

    // Border
    mctx.strokeStyle = '#e74c3c';
    mctx.lineWidth = 1;
    mctx.strokeRect(0, 0, mw, mh);
  }
}
