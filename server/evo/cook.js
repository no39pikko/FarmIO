'use strict';

const C = require('../constants');
const Plant = require('../Plant');
const { pointToBoxDist, clamp } = require('../collision');

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

// Body slam cooldown per-target (ms)
const BODY_SLAM_COOLDOWN = 100;

module.exports = {
  // ──────────────────────────────────────────────────────────────
  // 1. foodFighter — harvest healing x5
  // ──────────────────────────────────────────────────────────────
  foodFighter: {
    onTick(game, socketId, player, dt, now) {},

    onHarvest(game, player, plant, id) {},

    onPlant(game, socketId, player, cell, key, now) { return false; },
    onAttack(game, socketId, player, now, dmg) { return false; },
    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
    getAtkMult(player, now) { return 1; },
  },

  // ──────────────────────────────────────────────────────────────
  // 2. truck — body slam on contact, no weapon attack
  // ──────────────────────────────────────────────────────────────
  truck: {
    onTick(game, socketId, player, dt, now) {
      const cls = C.CLASSES.truck;
      const playerHalf = C.PLAYER_SIZE / 2;
      const hitRadius = cls.bodySlam.hitRadius;
      const plantHalf = C.GRID_SIZE / 2;

      // Check if standing on own plant (any stage = farmland)
      const cell = toGridCell(player.x, player.y);
      const key = gridKey(cell.gx, cell.gy);
      let onFarmland = false;
      for (const plant of game.plants.values()) {
        if (plant.gridKey === key && plant.ownerId === socketId) {
          onFarmland = true;
          break;
        }
      }

      // Body slam damage: 2x on farmland, 1x otherwise
      const slamDmg = onFarmland
        ? Math.floor(player.atk * cls.bodySlam.dmgMult)
        : player.atk;

      // Lazily initialise the hit-cooldown map
      if (!player.bodySlamHits || !(player.bodySlamHits instanceof Map)) {
        player.bodySlamHits = new Map();
      }

      // Hit players within hitRadius of truck
      for (const [sid, other] of game.players) {
        if (sid === socketId || !other.alive) continue;
        if (now < other.invincibleUntil) continue;

        const dist = pointToBoxDist(player.x, player.y, other.x, other.y, playerHalf);
        if (dist > hitRadius) continue;

        const lastHit = player.bodySlamHits.get(other.id) || 0;
        if (now - lastHit < BODY_SLAM_COOLDOWN) continue;

        player.bodySlamHits.set(other.id, now);
        game.applyDamage(socketId, player, sid, other, slamDmg);
      }

      // Harvest mature plants on contact
      for (const [id, plant] of game.plants) {
        if (!plant.isMature()) continue;
        if (plant.def.invulnerable) continue;
        const dist = pointToBoxDist(player.x, player.y, plant.x, plant.y, plantHalf);
        if (dist > hitRadius) continue;

        game.harvestPlant(player, id, plant);
      }

      // Purge stale entries periodically
      if (player.bodySlamHits.size > 50) {
        for (const [vid, ts] of player.bodySlamHits) {
          if (now - ts > 5000) player.bodySlamHits.delete(vid);
        }
      }
    },

    onHarvest(game, player, plant, id) {},

    onPlant(game, socketId, player, cell, key, now) { return false; },

    // Prevent all normal weapon attacks
    onAttack(game, socketId, player, now, dmg) { return true; },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
    getAtkMult(player, now) { return 1; },
  },

  // ──────────────────────────────────────────────────────────────
  // 3. chineseChef — stun on hit, plants chili (decorative), shield from harvest
  // ──────────────────────────────────────────────────────────────
  chineseChef: {
    onTick(game, socketId, player, dt, now) {
      // Init stun charge
      if (player.stunCharge === undefined) player.stunCharge = true;
    },

    onHarvest(game, player, plant, id) {
      // Harvesting chili restores stun charge
      if (plant.type === 'chili') {
        player.stunCharge = true;
      }
    },

    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat') return false;
      if (player.seeds <= 0) return true;
      if (game.plantGrid.has(key)) return true;
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, now);

      const center = gridCenter(cell.gx, cell.gy);
      const chili = new Plant(center.x, center.y, 'chili');
      chili.gridKey = key;
      chili.ownerId = socketId;
      game.plants.set(chili.id, chili);
      game.plantGrid.add(key);

      return true;
    },

    onAttack(game, socketId, player, now, dmg) { return false; },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {
      // Stun victim (consumes charge, restored by harvesting chili)
      if (!attacker.stunCharge) return;
      const cfg = C.CLASSES.chineseChef.stunOnHit;
      victim.trappedUntil = Math.max(victim.trappedUntil || 0, Date.now() + cfg.duration);
      attacker.stunCharge = false;
    },

    getSpeedMult(game, player, baseMult) { return baseMult; },
    getAtkMult(player, now) { return 1; },
  },

  // ──────────────────────────────────────────────────────────────
  // 4. smoker — passive HP regen, plants pepper
  // ──────────────────────────────────────────────────────────────
  smoker: {
    onTick(game, socketId, player, dt, now) {
      const hpPerSec = C.CLASSES.smoker.passiveRegen.hpPerSec;
      player.hp = Math.min(player.maxHp, Math.floor(player.hp + hpPerSec * dt));
    },

    onHarvest(game, player, plant, id) {},

    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat') return false;
      if (player.seeds <= 0) return true;
      if (game.plantGrid.has(key)) return true;
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, now);

      const center = gridCenter(cell.gx, cell.gy);
      const pepper = new Plant(center.x, center.y, 'pepper');
      pepper.gridKey = key;
      pepper.ownerId = socketId;
      game.plants.set(pepper.id, pepper);
      game.plantGrid.add(key);

      return true;
    },

    onAttack(game, socketId, player, now, dmg) { return false; },
    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
    getSpeedMult(game, player, baseMult) { return baseMult; },
    getAtkMult(player, now) { return 1; },
  },

  // ──────────────────────────────────────────────────────────────
  // 5. brewer — rage mode after 20 harvests
  // ──────────────────────────────────────────────────────────────
  brewer: {
    onTick(game, socketId, player, dt, now) {
      const rage = C.CLASSES.brewer.rage;

      if (player.rageUntil > 0 && now < player.rageUntil) {
        // Rage active: regenerate HP
        player.hp = Math.min(player.maxHp, player.hp + rage.regenPerSec * dt);
      } else if (player.rageUntil > 0 && now >= player.rageUntil) {
        // Rage just ended: reset so harvests can accumulate again
        player.rageUntil = 0;
      }
    },

    onHarvest(game, player, plant, id) {
      const rage = C.CLASSES.brewer.rage;
      const now = Date.now();

      // Don't increment during active rage
      if (player.rageUntil > 0 && now < player.rageUntil) return;

      player.rageHarvestCount = (player.rageHarvestCount || 0) + 1;

      if (player.rageHarvestCount >= rage.harvestsNeeded) {
        player.rageUntil = now + rage.duration;
        player.rageHarvestCount = 0;
      }
    },

    onPlant(game, socketId, player, cell, key, now) { return false; },
    onAttack(game, socketId, player, now, dmg) { return false; },
    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},

    getSpeedMult(game, player, baseMult) {
      const now = Date.now();
      if (player.rageUntil > 0 && now < player.rageUntil) {
        return baseMult * C.CLASSES.brewer.rage.speedMult;
      }
      return baseMult;
    },

    getAtkMult(player, now) {
      if (player.rageUntil > 0 && now < player.rageUntil) {
        return C.CLASSES.brewer.rage.atkMult;
      }
      return 1;
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 6. alchemist — poison on hit, plants aconite (decorative), shield from harvest
  // ──────────────────────────────────────────────────────────────
  alchemist: {
    onTick(game, socketId, player, dt, now) {
      // Init poison charge
      if (player.poisonCharge === undefined) player.poisonCharge = true;

      // Process poison on all players poisoned by this player
      for (const [sid, other] of game.players) {
        if (sid === socketId || !other.alive) continue;
        if (!other.poisonUntil || now >= other.poisonUntil) continue;
        if (other.poisonOwner !== socketId) continue;

        other.poisonTimer = (other.poisonTimer || 0) + dt * 1000;
        if (other.poisonTimer >= 500) {
          other.poisonTimer -= 500;
          const cfg = C.CLASSES.alchemist.poisonOnHit;
          const dmg = Math.floor(cfg.dps * 0.5);
          if (other.shield) {
            other.shield = false;
          } else {
            other.hp -= dmg;
            other.lastDamageTaken = now;
            if (other.hp <= 0) {
              game.killPlayer(socketId, player, sid, other);
            }
          }
        }
      }
    },

    onHarvest(game, player, plant, id) {
      // Harvesting aconite restores poison charge
      if (plant.type === 'aconite') {
        player.poisonCharge = true;
      }
    },

    onPlant(game, socketId, player, cell, key, now) {
      if (player.selectedPlantType === 'wheat') return false;
      if (player.seeds <= 0) return true;
      if (game.plantGrid.has(key)) return true;
      if (game.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return true;

      player.seeds--;
      game.terrain.cutGrass(cell.gx, cell.gy, now);

      const center = gridCenter(cell.gx, cell.gy);
      const aconite = new Plant(center.x, center.y, 'aconite');
      aconite.gridKey = key;
      aconite.ownerId = socketId;
      game.plants.set(aconite.id, aconite);
      game.plantGrid.add(key);

      return true;
    },

    onAttack(game, socketId, player, now, dmg) { return false; },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {
      // Apply poison (consumes charge, restored by harvesting aconite)
      if (!attacker.poisonCharge) return;
      const cfg = C.CLASSES.alchemist.poisonOnHit;
      victim.poisonUntil = Date.now() + cfg.duration;
      victim.poisonOwner = attackerSid;
      victim.poisonTimer = 0;
      attacker.poisonCharge = false;
    },

    getSpeedMult(game, player, baseMult) { return baseMult; },
    getAtkMult(player, now) { return 1; },
  },
};
