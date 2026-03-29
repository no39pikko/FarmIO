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

module.exports = {
  // ──────────────────────────────────────────────────────────────
  // 1. riceFarmer — plants rice on pond cells, ignores pond slowdown
  // ──────────────────────────────────────────────────────────────
  riceFarmer: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType !== 'rice') return false;
      const onPond = game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond');

      // Nurture existing
      if (game.plantGrid.has(key)) {
        for (const plant of game.plants.values()) {
          if (plant.gridKey === key && !plant.isMature()) {
            plant.nurture();
            break;
          }
        }
        return true;
      }

      if (player.seeds <= 0) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, Date.now());
      const center = gridCenter(cell.gx, cell.gy);
      const rice = new Plant(center.x, center.y, 'rice');
      rice.gridKey = key;
      rice.ownerId = socketId;
      rice.landRice = !onPond; // land rice = muddy paddy
      game.plants.set(rice.id, rice);
      game.plantGrid.add(key);

      return true;
    },

    onTick(game, socketId, player, dt, now) {},
    onHarvest(game, player, plant, id) {},

    getSpeedMult(game, player, baseMult) {
      const cell = toGridCell(player.x, player.y);
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) {
        // Cancel the pond slowdown that was already applied in updateMovement
        return baseMult * (1 / C.TERRAIN_TYPES.pond.speedMultiplier);
      }
      return baseMult;
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 2. flowerFarmer — plants flowers, gains buffs on harvest
  // ──────────────────────────────────────────────────────────────
  flowerFarmer: {
    onPlant(game, socketId, player, cell, key, now) {
      // Default planting handles flower types correctly since
      // selectedPlantType is cycled via scroll in onInput.
      // No override needed.
      return false;
    },

    onTick(game, socketId, player, dt, now) {},

    onHarvest(game, player, plant, id) {
      const buff = plant.def.harvestBuff;
      if (!buff) return;

      const now = Date.now();
      player.flowerBuffType = buff.type;   // 'atk' or 'speed'
      player.flowerBuffUntil = now + buff.duration;
    },

    getSpeedMult(game, player, baseMult) {
      const now = Date.now();
      if (player.flowerBuffType === 'speed' && now < player.flowerBuffUntil) {
        const buff = C.PLANT_TYPES.flowerBlue.harvestBuff;
        return baseMult * buff.mult;
      }
      return baseMult;
    },

    getAtkMult(player, now) {
      if (player.flowerBuffType === 'atk' && now < player.flowerBuffUntil) {
        const buff = C.PLANT_TYPES.flowerRed.harvestBuff;
        return buff.mult;
      }
      return 1;
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 3. grapeFarmer — plants grapes that regrow to 50%
  // ──────────────────────────────────────────────────────────────
  grapeFarmer: {
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat') return false;
      if (game.plantGrid.has(key)) {
        // Nurture existing plant on this cell
        for (const plant of game.plants.values()) {
          if (plant.gridKey === key && !plant.isMature()) {
            plant.nurture();
            break;
          }
        }
        return true;
      }

      if (player.seeds <= 0) return true;
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, now);
      const center = gridCenter(cell.gx, cell.gy);
      const grape = new Plant(center.x, center.y, 'grape');
      grape.gridKey = key;
      grape.ownerId = socketId;
      game.plants.set(grape.id, grape);
      game.plantGrid.add(key);

      return true;
    },

    onTick(game, socketId, player, dt, now) {},

    onHarvest(game, player, plant, id) {
      // regrow() in Plant.js handles the fast regrow via regrowTime
    },

    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 4. cactusFarmer — plants impassable cactus with contact damage
  // ──────────────────────────────────────────────────────────────
  cactusFarmer: {
    // Cactus planting uses default handler (selectedPlantType = 'cactus' or 'wheat')
    // Contact damage handled by Game.js generic contactDmgPerPx system
    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat') return false;
      return false; // let default handler plant cactus via selectedPlantType
    },

    onTick(game, socketId, player, dt, now) {},
    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },

  // ──────────────────────────────────────────────────────────────
  // 5. mouse — speed boost on mature plant cells, no plantBuff
  // ──────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────
  // 5. cornFarmer — invisible in corn, 2s linger after leaving
  // ──────────────────────────────────────────────────────────────
  cornFarmer: {
    onPlant(game, socketId, player, cell, key, now) {
      // corn, wheat, berry all use default handler
      return false;
    },

    onTick(game, socketId, player, dt, now) {
      const cell = toGridCell(player.x, player.y);
      const key = gridKey(cell.gx, cell.gy);
      const cfg = C.CLASSES.cornFarmer.cornInvisibility;

      // Check if standing on own mature corn
      let inCorn = false;
      for (const plant of game.plants.values()) {
        if (plant.gridKey === key && plant.type === 'corn' && plant.isMature() && plant.ownerId === socketId) {
          inCorn = true;
          break;
        }
      }

      if (inCorn) {
        player.cornInvisUntil = now + cfg.lingerDuration;
        player.hidden = true;
      } else if (player.cornInvisUntil && now < player.cornInvisUntil) {
        player.hidden = true;
      }
    },

    onHarvest(game, player, plant, id) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
  },
};
