'use strict';

const C = require('./constants');

class Terrain {
  constructor() {
    // "gx,gy" -> { type: 'pond'|'grass'|'boulder'|'rock', active: true, respawnAt: 0 }
    this.cells = new Map();
    this.pondAdjacentCells = new Set();
  }

  generate() {
    const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
    const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;

    // 1. Boulders (9x9 indestructible)
    this._generateBoulders(maxGx, maxGy);

    // 2. Rocks (1x1 scattered)
    this._generateRocks(maxGx, maxGy);

    // 3. Rivers with ponds
    this._generateRivers(maxGx, maxGy);

    // 4. Grass clusters
    this._generateClusters('grass', maxGx, maxGy);

    this._computePondAdjacency(maxGx, maxGy);
  }

  _generateBoulders(maxGx, maxGy) {
    const cfg = C.TERRAIN_GEN.boulder;
    const half = Math.floor(cfg.size / 2);

    for (let i = 0; i < cfg.count; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const cx = cfg.margin + half + Math.floor(Math.random() * (maxGx - 2 * cfg.margin - cfg.size));
        const cy = cfg.margin + half + Math.floor(Math.random() * (maxGy - 2 * cfg.margin - cfg.size));

        // Check no overlap with existing terrain
        let overlap = false;
        for (let dx = -half; dx <= half && !overlap; dx++) {
          for (let dy = -half; dy <= half && !overlap; dy++) {
            if (this.cells.has((cx + dx) + ',' + (cy + dy))) overlap = true;
          }
        }
        if (overlap) continue;

        // Place boulder
        for (let dx = -half; dx <= half; dx++) {
          for (let dy = -half; dy <= half; dy++) {
            this.cells.set((cx + dx) + ',' + (cy + dy), { type: 'boulder', active: true, respawnAt: 0 });
          }
        }
        break;
      }
    }
  }

  _generateRocks(maxGx, maxGy) {
    const cfg = C.TERRAIN_GEN.rock;
    for (let i = 0; i < cfg.count; i++) {
      const gx = cfg.margin + Math.floor(Math.random() * (maxGx - 2 * cfg.margin));
      const gy = cfg.margin + Math.floor(Math.random() * (maxGy - 2 * cfg.margin));
      const key = gx + ',' + gy;
      if (this.cells.has(key)) continue;
      this.cells.set(key, { type: 'rock', active: true, respawnAt: 0 });
    }
  }

  _generateRivers(maxGx, maxGy) {
    const cfg = C.TERRAIN_GEN.river;
    const margin = cfg.margin;
    // Divide map into zones for even distribution
    const zones = this._getZones(cfg.count, maxGx, maxGy, margin);

    for (let i = 0; i < cfg.count; i++) {
      const zone = zones[i] || { x1: margin, y1: margin, x2: maxGx - margin, y2: maxGy - margin };

      // Start pond
      const startX = zone.x1 + Math.floor(Math.random() * (zone.x2 - zone.x1));
      const startY = zone.y1 + Math.floor(Math.random() * (zone.y2 - zone.y1));
      const startSize = cfg.pondSize.min + Math.floor(Math.random() * (cfg.pondSize.max - cfg.pondSize.min + 1));
      this._growPond(startX, startY, startSize, maxGx, maxGy, margin);

      // Pick a random direction for river
      const angle = Math.random() * Math.PI * 2;
      const riverLen = 15 + Math.floor(Math.random() * 20); // 15-34 cells long
      let rx = startX, ry = startY;
      const cos = Math.cos(angle), sin = Math.sin(angle);

      for (let step = 0; step < riverLen; step++) {
        // Meander: slight random deviation
        rx += cos + (Math.random() - 0.5) * 0.8;
        ry += sin + (Math.random() - 0.5) * 0.8;
        const gx = Math.round(rx);
        const gy = Math.round(ry);
        if (gx < 1 || gx > maxGx - 1 || gy < 1 || gy > maxGy - 1) break;

        const key = gx + ',' + gy;
        const existing = this.cells.get(key);
        if (existing && (existing.type === 'boulder' || existing.type === 'rock')) continue;

        // River cells are ponds (same behavior: slow, crop boost, rice plantable)
        this.cells.set(key, { type: 'pond', active: true, respawnAt: 0 });
        // Widen occasionally
        if (Math.random() < 0.5) {
          const wKey = (gx + (Math.random() < 0.5 ? 1 : -1)) + ',' + gy;
          if (!this.cells.has(wKey)) {
            this.cells.set(wKey, { type: 'pond', active: true, respawnAt: 0 });
          }
        }
      }

      // End pond
      const endX = Math.round(rx);
      const endY = Math.round(ry);
      if (endX > margin && endX < maxGx - margin && endY > margin && endY < maxGy - margin) {
        const endSize = cfg.pondSize.min + Math.floor(Math.random() * (cfg.pondSize.max - cfg.pondSize.min + 1));
        this._growPond(endX, endY, endSize, maxGx, maxGy, margin);
      }
    }
  }

  _getZones(count, maxGx, maxGy, margin) {
    // Split map into roughly even zones
    const zones = [];
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const zoneW = Math.floor((maxGx - 2 * margin) / cols);
    const zoneH = Math.floor((maxGy - 2 * margin) / rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (zones.length >= count) break;
        zones.push({
          x1: margin + c * zoneW,
          y1: margin + r * zoneH,
          x2: margin + (c + 1) * zoneW,
          y2: margin + (r + 1) * zoneH,
        });
      }
    }
    return zones;
  }

  _growPond(cx, cy, size, maxGx, maxGy, margin) {
    const cluster = [{ gx: cx, gy: cy }];
    const visited = new Set([cx + ',' + cy]);
    const key0 = cx + ',' + cy;
    const existing0 = this.cells.get(key0);
    if (!existing0) {
      this.cells.set(key0, { type: 'pond', active: true, respawnAt: 0 });
    }

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (cluster.length < size) {
      const base = cluster[Math.floor(Math.random() * cluster.length)];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const ngx = base.gx + dir[0];
      const ngy = base.gy + dir[1];
      const nKey = ngx + ',' + ngy;

      if (ngx < margin || ngx > maxGx - margin) continue;
      if (ngy < margin || ngy > maxGy - margin) continue;
      if (visited.has(nKey)) continue;

      const ex = this.cells.get(nKey);
      if (ex && ex.type === 'boulder') continue;
      if (ex && ex.type === 'rock') continue;

      visited.add(nKey);
      cluster.push({ gx: ngx, gy: ngy });
      this.cells.set(nKey, { type: 'pond', active: true, respawnAt: 0 });
    }
  }

  _generateClusters(type, maxGx, maxGy) {
    const cfg = C.TERRAIN_GEN[type];
    const margin = cfg.margin;

    for (let i = 0; i < cfg.count; i++) {
      const seedGx = margin + Math.floor(Math.random() * (maxGx - 2 * margin));
      const seedGy = margin + Math.floor(Math.random() * (maxGy - 2 * margin));
      const seedKey = seedGx + ',' + seedGy;

      if (this.cells.has(seedKey)) continue;

      const clusterSize = cfg.minSize +
        Math.floor(Math.random() * (cfg.maxSize - cfg.minSize + 1));

      const cluster = [{ gx: seedGx, gy: seedGy }];
      const visited = new Set([seedKey]);
      this.cells.set(seedKey, { type, active: true, respawnAt: 0 });

      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      while (cluster.length < clusterSize) {
        const base = cluster[Math.floor(Math.random() * cluster.length)];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        const ngx = base.gx + dir[0];
        const ngy = base.gy + dir[1];
        const nKey = ngx + ',' + ngy;

        if (ngx < margin || ngx > maxGx - margin) continue;
        if (ngy < margin || ngy > maxGy - margin) continue;
        if (visited.has(nKey)) continue;
        if (this.cells.has(nKey)) continue;

        visited.add(nKey);
        cluster.push({ gx: ngx, gy: ngy });
        this.cells.set(nKey, { type, active: true, respawnAt: 0 });
      }
    }
  }

  _computePondAdjacency(maxGx, maxGy) {
    this.pondAdjacentCells.clear();
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [key, cell] of this.cells) {
      if (cell.type !== 'pond') continue;
      const [gx, gy] = key.split(',').map(Number);
      for (const [dx, dy] of dirs) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx > maxGx || ny < 0 || ny > maxGy) continue;
        const nKey = nx + ',' + ny;
        const neighbor = this.cells.get(nKey);
        if (!neighbor || neighbor.type !== 'pond') {
          this.pondAdjacentCells.add(nKey);
        }
      }
    }
  }

  getCell(gx, gy) {
    return this.cells.get(gx + ',' + gy) || null;
  }

  hasActiveTerrain(gx, gy, type) {
    const cell = this.getCell(gx, gy);
    return cell !== null && cell.type === type && cell.active;
  }

  isWater(gx, gy) {
    const cell = this.getCell(gx, gy);
    return cell !== null && cell.type === 'pond' && cell.active;
  }

  isImpassableTerrain(gx, gy) {
    const cell = this.getCell(gx, gy);
    if (!cell) return false;
    const tt = C.TERRAIN_TYPES[cell.type];
    return tt && tt.impassable;
  }

  isAdjacentToPond(gridKey) {
    return this.pondAdjacentCells.has(gridKey);
  }

  cutGrass(gx, gy, now) {
    const key = gx + ',' + gy;
    const cell = this.cells.get(key);
    if (!cell || cell.type !== 'grass' || !cell.active) return false;
    cell.active = false;
    cell.respawnAt = now + C.TERRAIN_TYPES.grass.respawnTime;
    return true;
  }

  update(now, plantGrid) {
    for (const [key, cell] of this.cells) {
      if (cell.type === 'grass' && !cell.active && cell.respawnAt > 0 && now >= cell.respawnAt) {
        if (plantGrid && plantGrid.has(key)) {
          cell.respawnAt = now + C.TERRAIN_TYPES.grass.respawnTime;
          continue;
        }
        cell.active = true;
        cell.respawnAt = 0;
      }
    }
  }

  removeByOwner(socketId) {
    const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
    const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;
    let removed = false;
    for (const [key, cell] of this.cells) {
      if (cell.ownerId === socketId) {
        this.cells.delete(key);
        removed = true;
      }
    }
    if (removed) this._computePondAdjacency(maxGx, maxGy);
  }

  toJSON() {
    const result = [];
    for (const [key, cell] of this.cells) {
      if (!cell.active) continue;
      const [gx, gy] = key.split(',').map(Number);
      result.push({ gx, gy, type: cell.type });
    }
    return result;
  }
}

module.exports = Terrain;
