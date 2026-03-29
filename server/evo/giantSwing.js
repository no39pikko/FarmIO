'use strict';

const C = require('../constants');
const { pointToBoxDist, clamp } = require('../collision');

function checkHedgeInvisibility(game, socketId, player) {
  const cls = C.CLASSES[player.className];
  if (!cls || !cls.hedgeInvisibility) return;
  const gx = Math.floor(player.x / C.GRID_SIZE);
  const gy = Math.floor(player.y / C.GRID_SIZE);
  const key = gx + ',' + gy;
  for (const plant of game.plants.values()) {
    if (plant.gridKey !== key) continue;
    if (plant.type !== 'hedge' || !plant.isMature()) continue;
    if (plant.ownerId !== socketId) continue;
    player.hidden = true;
    return;
  }
}

// Static helpers (avoid circular require of Game)
function toGridCell(x, y) {
  return { gx: Math.floor(x / C.GRID_SIZE), gy: Math.floor(y / C.GRID_SIZE) };
}
function gridKey(gx, gy) { return gx + ',' + gy; }

module.exports = {

  // ── Combine ────────────────────────────────────────────────
  // Automatic spinning attack every 500ms. Normal attack is fully blocked.
  combine: {
    onAttack(game, socketId, player, now) {
      // Always block normal attack flow — combine uses auto-attack only
      return true;
    },

    onTick(game, socketId, player, dt, now) {
      const cfg = C.CLASSES.combine.autoAttack;

      // LMB rising edge → start spinning
      if (player.input.lmb && !player.prevLmb && !player.combineActive) {
        if (now - player.lastAttack >= player.atkCooldown) {
          player.combineActive = true;
          player.combineUntil = now + cfg.activeDuration;
          player.autoAttackTimer = 0;
        }
      }

      if (!player.combineActive) return;

      // Active duration expired → stop and start CD
      if (now >= player.combineUntil) {
        player.combineActive = false;
        player.lastAttack = now;
        return;
      }

      player.autoAttackTimer += dt * 1000;
      const interval = Math.max(player.chargeDuration, 100);
      if (player.autoAttackTimer < interval) return;
      player.autoAttackTimer -= interval;

      player.swingHits = new Set();
      game.performCircularHit(socketId, player, now, player.atk);

      // Cut grass in scythe range
      var range = player.scytheLength;
      var gridSize = C.GRID_SIZE;
      var startGx = Math.max(0, Math.floor((player.x - range) / gridSize));
      var endGx = Math.min(Math.floor(C.MAP_WIDTH / gridSize) - 1, Math.floor((player.x + range) / gridSize));
      var startGy = Math.max(0, Math.floor((player.y - range) / gridSize));
      var endGy = Math.min(Math.floor(C.MAP_HEIGHT / gridSize) - 1, Math.floor((player.y + range) / gridSize));
      for (var gx = startGx; gx <= endGx; gx++) {
        for (var gy = startGy; gy <= endGy; gy++) {
          game.terrain.cutGrass(gx, gy, now);
        }
      }
    },

    getSpeedMult(game, player, baseMult) {
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Charge Swing ───────────────────────────────────────────
  // Hold LMB to charge up to 6s. Release to swing with damage multiplier.
  chargeSwing: {
    onTick(game, socketId, player, dt, now) {
      // Start charge on LMB rising edge
      if (player.input.lmb && !player.prevLmb && player.chargeStart <= 0) {
        if (now - player.lastAttack >= player.atkCooldown) {
          player.chargeStart = now;
        }
      }

      if (player.chargeStart <= 0) return;

      const cfg = C.CLASSES.chargeSwing.chargeAttack;
      const elapsed = now - player.chargeStart;

      // LMB released or max charge reached
      if (!player.input.lmb || elapsed >= cfg.maxCharge) {
        // Linear scaling: 1.0x at 0s → maxMult at maxCharge
        const ratio = Math.min(elapsed / cfg.maxCharge, 1);
        const mult = 1 + (cfg.maxMult - 1) * ratio;
        const dmg = Math.floor(player.atk * mult);

        player.chargeStart = 0;
        player.lastAttack = now;
        player.swingStart = now;
        player.swingHits = new Set();
        game.performCircularHit(socketId, player, now, dmg);
      }
    },

    getSpeedMult(game, player, baseMult) {
      if (player.chargeStart > 0) {
        return baseMult * C.CLASSES.chargeSwing.chargeAttack.chargeSpeedMult;
      }
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Reaper ─────────────────────────────────────────────────
  // Invisible only when standing still on a plant cell.
  reaper: {
    onAttack(game, socketId, player, now) {
      return false; // use normal attack flow
    },

    onTick(game, socketId, player, dt, now) {
      // Check if standing on any plant cell
      const cell = toGridCell(player.x, player.y);
      const key = gridKey(cell.gx, cell.gy);
      const onPlant = game.plantGrid.has(key);

      // Must be on plant AND not moving AND not attacking
      const moving = player.input.up || player.input.down || player.input.left || player.input.right;
      const attacking = player.swingStart > 0 && now - player.swingStart < 50;

      if (onPlant && !moving && !attacking) {
        player.hidden = true;
      }
    },

    getSpeedMult(game, player, baseMult) {
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Chain Sickle ───────────────────────────────────────────
  // Pull enemy 40px toward attacker on hit.
  chainSickle: {
    onAttack(game, socketId, player, now) {
      return false; // use normal attack flow
    },

    onTick(game, socketId, player, dt, now) {},

    getSpeedMult(game, player, baseMult) {
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {
      // Only pull players, not plants
      if (!victim || !victim.alive) return;

      const dx = attacker.x - victim.x;
      const dy = attacker.y - victim.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const pullDist = C.CLASSES.chainSickle.pullOnHit.distance; // 40
      const nx = dx / dist;
      const ny = dy / dist;

      victim.x += nx * pullDist;
      victim.y += ny * pullDist;

      // Clamp to map bounds
      const half = C.PLAYER_SIZE / 2;
      victim.x = clamp(victim.x, half, C.MAP_WIDTH - half);
      victim.y = clamp(victim.y, half, C.MAP_HEIGHT - half);
    },
  },

  // ── Cavalry ────────────────────────────────────────────────
  // LMB starts a charge rush: speed x2, dmg x2, damages plants on contact.
  // Stops when: max distance reached, hits invulnerable plant, hits alive player that survives.
  // After charge: slow for 2s, then cooldown.
  cavalry: {
    onAttack(game, socketId, player, now) {
      return true; // block normal attack — cavalry uses charge rush
    },

    onTick(game, socketId, player, dt, now) {
      const cfg = C.CLASSES.cavalry.chargeRush;
      const playerHalf = C.PLAYER_SIZE / 2;
      const plantHalf = C.GRID_SIZE / 2;

      // Start prep on LMB rising edge
      if (player.input.lmb && !player.prevLmb && !player.cavalryCharging && !player.cavalryPrepUntil) {
        if (now - player.lastAttack >= player.atkCooldown) {
          player.cavalryPrepUntil = now + cfg.prepTime;
          player.cavalryAngle = player.mouseAngle;
        }
      }

      // Prep phase: can't move, show indicator
      if (player.cavalryPrepUntil && now < player.cavalryPrepUntil) {
        return; // waiting
      }

      // Prep done → start rush
      if (player.cavalryPrepUntil && now >= player.cavalryPrepUntil) {
        player.cavalryPrepUntil = 0;
        player.cavalryCharging = true;
        player.cavalryDist = 0;
        player.cavalrySlowUntil = 0;
      }

      if (player.cavalryCharging) {
        const speed = player.speed * cfg.speedMult;
        const step = speed * dt;
        const cos = Math.cos(player.cavalryAngle);
        const sin = Math.sin(player.cavalryAngle);

        // Move player in charge direction
        const half = (player.playerSize || C.PLAYER_SIZE) / 2;
        player.x = clamp(player.x + cos * step, half, C.MAP_WIDTH - half);
        player.y = clamp(player.y + sin * step, half, C.MAP_HEIGHT - half);
        player.cavalryDist += step;

        let stopCharge = false;

        // Hit players along path
        for (const [sid, other] of game.players) {
          if (sid === socketId || !other.alive) continue;
          if (now < other.invincibleUntil) continue;
          const otherHalf = (other.playerSize || C.PLAYER_SIZE) / 2;
          const d = pointToBoxDist(player.x, player.y, other.x, other.y, otherHalf);
          if (d > playerHalf) continue;
          const dmg = Math.floor(player.atk * cfg.dmgMult);
          game.applyDamage(socketId, player, sid, other, dmg);
          if (other.alive) stopCharge = true; // hit but didn't kill → stop
        }

        // Hit plants along path
        for (const [id, plant] of game.plants) {
          if (plant.def.invulnerable) {
            // Check collision with invulnerable plant → stop
            const d = pointToBoxDist(player.x, player.y, plant.x, plant.y, plantHalf);
            if (d <= playerHalf) { stopCharge = true; }
            continue;
          }
          if (!plant.isMature()) continue;
          const d = pointToBoxDist(player.x, player.y, plant.x, plant.y, plantHalf);
          if (d > playerHalf) continue;
          plant.hp -= Math.floor(player.atk * cfg.dmgMult);
          if (plant.hp <= 0) {
            game.harvestPlant(player, id, plant);
          }
        }

        // Cut grass along path
        const gc = { gx: Math.floor(player.x / C.GRID_SIZE), gy: Math.floor(player.y / C.GRID_SIZE) };
        game.terrain.cutGrass(gc.gx, gc.gy, now);

        // Max distance reached
        if (player.cavalryDist >= cfg.maxDist) stopCharge = true;

        if (stopCharge) {
          player.cavalryCharging = false;
          player.lastAttack = now;
          player.cavalrySlowUntil = now + cfg.slowDuration;
        }
      }
    },

    getSpeedMult(game, player, baseMult) {
      if (player.cavalryCharging || player.cavalryPrepUntil) return 0;
      const cfg = C.CLASSES.cavalry.chargeRush;
      if (player.cavalrySlowUntil && Date.now() < player.cavalrySlowUntil) {
        return baseMult * cfg.slowMult;
      }
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Grass Cutter ───────────────────────────────────────────
  // Normal harvest (XP + heal), then destroy the plant (no regrow).
  grassCutter: {
    onAttack(game, socketId, player, now) {
      return false; // use normal attack flow
    },

    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
    },

    getSpeedMult(game, player, baseMult) {
      return baseMult;
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},

    // After normal harvest, force-destroy the plant (prevent regrow)
    onHarvest(game, player, plant, id) {
      if (plant.gridKey) game.plantGrid.delete(plant.gridKey);
      if (plant.wild) game.wildPlantCount--;
      game.plants.delete(id);
    },
  },
};
