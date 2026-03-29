'use strict';

const C = require('../constants');
const Plant = require('../Plant');

// Static helpers from Game (avoid circular require)
function toGridCell(x, y) {
  return {
    gx: Math.floor(x / C.GRID_SIZE),
    gy: Math.floor(y / C.GRID_SIZE),
  };
}

function gridKey(gx, gy) {
  return gx + ',' + gy;
}

function gridCenter(gx, gy) {
  return {
    x: gx * C.GRID_SIZE + C.GRID_SIZE / 2,
    y: gy * C.GRID_SIZE + C.GRID_SIZE / 2,
  };
}

// Shared: gardener branch — hidden in own mature hedges
function checkHedgeInvisibility(game, socketId, player) {
  const cls = C.CLASSES[player.className];
  if (!cls || !cls.hedgeInvisibility) return;
  const cell = toGridCell(player.x, player.y);
  const key = gridKey(cell.gx, cell.gy);
  for (const plant of game.plants.values()) {
    if (plant.gridKey !== key) continue;
    if (plant.type !== 'hedge') continue;
    if (!plant.isMature()) continue;
    if (plant.ownerId !== socketId) continue;
    player.hidden = true;
    return;
  }
}

module.exports = {
  // ──────────────────────────────────────────────────────────────
  // 0. gardener — plants hedges, hidden in own hedges
  // ──────────────────────────────────────────────────────────────
  gardener: {
    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
    },
    onPlant(game, socketId, player, cell, key, now) {
      return false; // hedge and wheat use default handler
    },
    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 1. herbFarmer — 1 seed → 3x3 mint grid + hedge invisibility
  // ──────────────────────────────────────────────────────────────
  herbFarmer: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat' || player.selectedPlantType === 'hedge') return false;
      if (player.seeds <= 0) return true;

      player.seeds--;

      const size = C.CLASSES.herbFarmer.mintPlant.size; // 3
      const half = Math.floor(size / 2);

      for (let dx = -half; dx <= half; dx++) {
        for (let dy = -half; dy <= half; dy++) {
          const gx = cell.gx + dx;
          const gy = cell.gy + dy;
          const cellKey = gridKey(gx, gy);

          if (game.terrain.hasActiveTerrain(gx, gy, 'pond')) continue;
          game.terrain.cutGrass(gx, gy, now);

          const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
          const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;
          if (gx < 0 || gx > maxGx || gy < 0 || gy > maxGy) continue;

          if (game.plantGrid.has(cellKey)) {
            for (const [id, existing] of game.plants) {
              if (existing.gridKey === cellKey) {
                if (existing.wild) game.wildPlantCount--;
                game.plants.delete(id);
                break;
              }
            }
            game.plantGrid.delete(cellKey);
          }

          const center = gridCenter(gx, gy);
          const mint = new Plant(center.x, center.y, 'mint');
          mint.gridKey = cellKey;
          mint.ownerId = socketId;
          game.plants.set(mint.id, mint);
          game.plantGrid.add(cellKey);
        }
      }

      return true;
    },

    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
    },
    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 2. bugKeeper — seed parasitises nearby plant + hedge invisibility
  // ──────────────────────────────────────────────────────────────
  bugKeeper: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat' || player.selectedPlantType === 'hedge') return false;
      if (player.seeds <= 0) return true;

      const maxDist = 3;
      let closest = null;
      let closestDist = Infinity;

      for (const plant of game.plants.values()) {
        if (plant.bugged) continue;
        if (!plant.gridKey) continue;

        const [pgx, pgy] = plant.gridKey.split(',').map(Number);
        const dist = Math.abs(pgx - cell.gx) + Math.abs(pgy - cell.gy);
        if (dist <= maxDist && dist < closestDist) {
          closestDist = dist;
          closest = plant;
        }
      }

      if (!closest) return true;

      player.seeds--;
      closest.bugged = true;
      closest.bugOwnerId = socketId;

      return true;
    },

    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
    },
    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 3. pondMaker — seed creates pond terrain cell (now farmerEvo branch)
  // ──────────────────────────────────────────────────────────────
  pondMaker: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType !== 'pond') return false;
      if (player.seeds <= 0) return true;

      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;
      if (game.plantGrid.has(key)) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, Date.now());

      game.terrain.cells.set(key, { type: 'pond', active: true, respawnAt: 0, ownerId: socketId });

      const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
      const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

      for (const [dx, dy] of dirs) {
        const nx = cell.gx + dx;
        const ny = cell.gy + dy;
        if (nx < 0 || nx > maxGx || ny < 0 || ny > maxGy) continue;
        const nKey = gridKey(nx, ny);
        const neighbor = game.terrain.cells.get(nKey);
        if (!neighbor || neighbor.type !== 'pond') {
          game.terrain.pondAdjacentCells.add(nKey);
        }
      }

      return true;
    },

    onTick(game, socketId, player, dt, now) {},
    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) {
      // Ignore pond slowdown
      const cell = toGridCell(player.x, player.y);
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) {
        return baseMult * (1 / C.TERRAIN_TYPES.pond.speedMultiplier);
      }
      return baseMult;
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 4. digger — plants pitTrap + hedge invisibility
  // ──────────────────────────────────────────────────────────────
  digger: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat' || player.selectedPlantType === 'hedge') return false;
      if (player.seeds <= 0) return true;
      if (game.plantGrid.has(key)) return true;
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, Date.now());

      const center = gridCenter(cell.gx, cell.gy);
      const trap = new Plant(center.x, center.y, 'pitTrap');
      trap.gridKey = key;
      trap.ownerId = socketId;
      game.plants.set(trap.id, trap);
      game.plantGrid.add(key);

      return true;
    },

    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);

      for (const [id, plant] of game.plants) {
        if (plant.type !== 'pitTrap' || !plant.isMature()) continue;
        if (plant.ownerId !== socketId) continue;

        for (const [otherSid, other] of game.players) {
          if (otherSid === socketId || !other.alive) continue;
          if (other.trappedUntil && now < other.trappedUntil) continue;

          const otherCell = toGridCell(other.x, other.y);
          const otherKey = gridKey(otherCell.gx, otherCell.gy);
          if (plant.gridKey !== otherKey) continue;

          other.trappedUntil = now + C.PIT_TRAP_STUN;

          if (plant.gridKey) game.plantGrid.delete(plant.gridKey);
          game.plants.delete(id);
          break;
        }
      }
    },

    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 5. landscaper — pond + stone + hedge + harvest-destroys plants
  // ──────────────────────────────────────────────────────────────
  landscaper: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat' || player.selectedPlantType === 'hedge') return false;

      if (player.selectedPlantType === 'pond') {
        // Pond placement (same as pondMaker)
        if (player.seeds <= 0) return true;
        if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;
        if (game.plantGrid.has(key)) return true;

        player.seeds--;
        game.terrain.cutGrass(cell.gx, cell.gy, Date.now());
        game.terrain.cells.set(key, { type: 'pond', active: true, respawnAt: 0, ownerId: socketId });

        const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
        const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of dirs) {
          const nx = cell.gx + dx;
          const ny = cell.gy + dy;
          if (nx < 0 || nx > maxGx || ny < 0 || ny > maxGy) continue;
          const nKey = gridKey(nx, ny);
          const neighbor = game.terrain.cells.get(nKey);
          if (!neighbor || neighbor.type !== 'pond') {
            game.terrain.pondAdjacentCells.add(nKey);
          }
        }
        return true;
      }

      // placedStone: use default handler
      return false;
    },

    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
    },

    // Harvest destroys plant (same as grassCutter)
    onHarvest(game, player, plant, id) {
      if (plant.gridKey) game.plantGrid.delete(plant.gridKey);
      if (plant.wild) game.wildPlantCount--;
      game.plants.delete(id);
    },

    getSpeedMult(game, player, baseMult) {
      // Ignore pond slowdown
      const cell = toGridCell(player.x, player.y);
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) {
        return baseMult * (1 / C.TERRAIN_TYPES.pond.speedMultiplier);
      }
      return baseMult;
    },
  },
};
