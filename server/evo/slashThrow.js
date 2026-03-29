'use strict';

const C = require('../constants');
const { distance, pointToBoxDist, clamp } = require('../collision');

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

// Helper: box-vs-oriented-rectangle overlap test (same logic as Game.performThrowHit)
function boxHitsRect(px, py, angle, range, halfW, bx, by, half) {
  const co = Math.cos(angle);
  const si = Math.sin(angle);
  const x0 = bx - half - px, x1 = bx + half - px;
  const y0 = by - half - py, y1 = by + half - py;
  let minA = Infinity, maxA = -Infinity, minP = Infinity, maxP = -Infinity;
  for (const dx of [x0, x1]) {
    for (const dy of [y0, y1]) {
      const a = dx * co + dy * si;
      const p = -dx * si + dy * co;
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
  }
  return maxA >= 0 && minA <= range && maxP >= -halfW && minP <= halfW;
}

function ensureProjectiles(game) {
  if (!game._projectiles) game._projectiles = [];
  return game._projectiles;
}

module.exports = {

  // ── Boomerang (Executioner-style: out → linger → return) ─────
  boomerang: {
    onAttack(game, socketId, player, now, dmg) {
      const projs = ensureProjectiles(game);
      const cfg = C.CLASSES.boomerang.boomerangAttack;
      projs.push({
        type: 'boomerang',
        ownerId: socketId,
        x: player.x,
        y: player.y,
        angle: player.mouseAngle,
        speed: cfg.speed,
        range: cfg.range,
        halfW: cfg.halfW,
        distTraveled: 0,
        phase: 'out',        // out → linger → back
        lingerUntil: 0,
        dmg: dmg,
        hitPlayersOut: new Set(),
        hitPlayersBack: new Set(),
        hitPlantsOut: new Set(),
        hitPlantsBack: new Set(),
      });
      player.throwAngle = player.mouseAngle;
      player.swingStart = now;
      player.lastAttack = now;
      player.chargeStart = 0;
      return true;
    },

    onTick(game, socketId, player, dt, now) {
      const projs = ensureProjectiles(game);
      const cfg = C.CLASSES.boomerang.boomerangAttack;
      const playerHalf = C.PLAYER_SIZE / 2;
      const plantHalf = C.GRID_SIZE / 2;

      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (p.type !== 'boomerang' || p.ownerId !== socketId) continue;

        if (p.phase === 'out') {
          // ── Outgoing: fly forward, hit along the way ──
          const step = p.speed * dt;
          p.x += Math.cos(p.angle) * step;
          p.y += Math.sin(p.angle) * step;
          p.distTraveled += step;

          // Hit players (piercing)
          for (const [sid, other] of game.players) {
            if (sid === p.ownerId || !other.alive) continue;
            if (now < other.invincibleUntil) continue;
            if (p.hitPlayersOut.has(sid)) continue;
            const d = pointToBoxDist(p.x, p.y, other.x, other.y, playerHalf);
            if (d <= p.halfW) {
              p.hitPlayersOut.add(sid);
              game.applyDamage(p.ownerId, player, sid, other, p.dmg);
            }
          }

          // Hit plants (piercing)
          for (const [id, plant] of game.plants) {
            if (!plant.isMature()) continue;
            if (plant.def.invulnerable) continue;
            if (p.hitPlantsOut.has(id)) continue;
            const d = pointToBoxDist(p.x, p.y, plant.x, plant.y, plantHalf);
            if (d <= p.halfW) {
              p.hitPlantsOut.add(id);
              plant.hp -= p.dmg;
              if (plant.hp <= 0) game.harvestPlant(player, id, plant);
            }
          }

          // Reached max range → linger
          if (p.distTraveled >= p.range) {
            p.phase = 'linger';
            p.lingerUntil = now + cfg.lingerTime;
            p.speed = 0;  // stop for client extrapolation
          }

        } else if (p.phase === 'linger') {
          // ── Lingering at max range — still deals damage ──
          for (const [sid, other] of game.players) {
            if (sid === p.ownerId || !other.alive) continue;
            if (now < other.invincibleUntil) continue;
            if (p.hitPlayersOut.has(sid)) continue;
            const d = pointToBoxDist(p.x, p.y, other.x, other.y, playerHalf);
            if (d <= p.halfW) {
              p.hitPlayersOut.add(sid);
              game.applyDamage(p.ownerId, player, sid, other, p.dmg);
            }
          }
          for (const [id, plant] of game.plants) {
            if (!plant.isMature() || plant.def.invulnerable) continue;
            if (p.hitPlantsOut.has(id)) continue;
            const d = pointToBoxDist(p.x, p.y, plant.x, plant.y, plantHalf);
            if (d <= p.halfW) {
              p.hitPlantsOut.add(id);
              plant.hp -= p.dmg;
              if (plant.hp <= 0) game.harvestPlant(player, id, plant);
            }
          }
          if (now >= p.lingerUntil) {
            p.phase = 'back';
            p.speed = cfg.speed;
          }

        } else if (p.phase === 'back') {
          // ── Returning to player ──
          const dx = player.x - p.x;
          const dy = player.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const step = p.speed * dt;

          // Reached player → remove
          if (dist <= step + 20) {
            projs.splice(i, 1);
            continue;
          }

          // Move toward player's current position
          const returnAngle = Math.atan2(dy, dx);
          p.x += Math.cos(returnAngle) * step;
          p.y += Math.sin(returnAngle) * step;
          p.angle = returnAngle;

          // Hit players on return (separate hit set)
          for (const [sid, other] of game.players) {
            if (sid === p.ownerId || !other.alive) continue;
            if (now < other.invincibleUntil) continue;
            if (p.hitPlayersBack.has(sid)) continue;
            const d = pointToBoxDist(p.x, p.y, other.x, other.y, playerHalf);
            if (d <= p.halfW) {
              p.hitPlayersBack.add(sid);
              game.applyDamage(p.ownerId, player, sid, other, p.dmg);
            }
          }

          // Hit plants on return
          for (const [id, plant] of game.plants) {
            if (!plant.isMature()) continue;
            if (plant.def.invulnerable) continue;
            if (p.hitPlantsBack.has(id)) continue;
            const d = pointToBoxDist(p.x, p.y, plant.x, plant.y, plantHalf);
            if (d <= p.halfW) {
              p.hitPlantsBack.add(id);
              plant.hp -= p.dmg;
              if (plant.hp <= 0) game.harvestPlant(player, id, plant);
            }
          }
        }
      }
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Flamethrower (10s sustained flame, then cooldown) ────────
  flamethrower: {
    onTick(game, socketId, player, dt, now) {
      checkHedgeInvisibility(game, socketId, player);
      const cfg = C.CLASSES.flamethrower.flameAttack;
      const playerHalf = C.PLAYER_SIZE / 2;
      const plantHalf = C.GRID_SIZE / 2;

      // Start flame on LMB rising edge — lock angle at fire time
      if (player.input.lmb && !player.prevLmb && !player.flameUntil) {
        if (now - player.lastAttack >= player.atkCooldown) {
          player.flameUntil = now + cfg.duration;
          player.flameAngle = player.mouseAngle;
          player.flameDmgTimer = 0;
        }
      }

      // Active flame: deal damage in cone every tickInterval
      if (player.flameUntil > 0 && now < player.flameUntil) {
        const angle = player.flameAngle;
        const halfW = cfg.width / 2;

        player.flameDmgTimer += dt * 1000;
        while (player.flameDmgTimer >= cfg.tickInterval) {
          player.flameDmgTimer -= cfg.tickInterval;

          // Hit players in cone
          for (const [sid, other] of game.players) {
            if (sid === socketId || !other.alive) continue;
            if (now < other.invincibleUntil) continue;
            if (!boxHitsRect(player.x, player.y, angle, cfg.range, halfW, other.x, other.y, playerHalf)) continue;
            game.applyDamage(socketId, player, sid, other, player.atk);
          }

          // Damage plants in cone (harvest + destroy on death)
          for (const [id, plant] of game.plants) {
            if (plant.def.invulnerable) continue;
            if (!boxHitsRect(player.x, player.y, angle, cfg.range, halfW, plant.x, plant.y, plantHalf)) continue;
            plant.hp -= player.atk;
            if (plant.hp <= 0) {
              if (plant.isMature()) {
                game.harvestPlant(player, id, plant);
              }
              // Destroy plant (prevent regrow, burn seeds too)
              if (game.plants.has(id)) {
                if (plant.gridKey) game.plantGrid.delete(plant.gridKey);
                if (plant.wild) game.wildPlantCount--;
                game.plants.delete(id);
              }
            }
          }

          // Burn grass in cone
          const gridSize = C.GRID_SIZE;
          const maxGx = Math.floor(C.MAP_WIDTH / gridSize) - 1;
          const maxGy = Math.floor(C.MAP_HEIGHT / gridSize) - 1;
          const startGx = Math.max(0, Math.floor((player.x - cfg.range) / gridSize));
          const endGx = Math.min(maxGx, Math.floor((player.x + cfg.range) / gridSize));
          const startGy = Math.max(0, Math.floor((player.y - cfg.range) / gridSize));
          const endGy = Math.min(maxGy, Math.floor((player.y + cfg.range) / gridSize));
          for (let gx = startGx; gx <= endGx; gx++) {
            for (let gy = startGy; gy <= endGy; gy++) {
              const cx = gx * gridSize + gridSize / 2;
              const cy = gy * gridSize + gridSize / 2;
              if (!boxHitsRect(player.x, player.y, angle, cfg.range, halfW, cx, cy, gridSize / 2)) continue;
              game.terrain.cutGrass(gx, gy, now);
            }
          }
        }
      } else if (player.flameUntil > 0 && now >= player.flameUntil) {
        // Flame expired → start cooldown
        player.lastAttack = now;
        player.flameUntil = 0;
        player.flameDmgTimer = 0;
      }
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Pest Control (enhanced slash: faster, longer range) ──────
  pestControl: {
    onAttack(game, socketId, player, now, dmg) {
      const projs = ensureProjectiles(game);
      const cls = C.CLASSES.pestControl;
      projs.push({
        type: 'slash',
        ownerId: socketId,
        x: player.x,
        y: player.y,
        angle: player.mouseAngle,
        speed: 900,
        range: cls.throwRange,
        halfW: (cls.throwWidth || 30) / 2,
        distTraveled: 0,
        dmg: dmg,
        hitPlayers: new Set(),
        hitPlants: new Set(),
      });
      player.throwAngle = player.mouseAngle;
      player.swingStart = now;
      player.lastAttack = now;
      player.chargeStart = 0;
      return true;
    },

    onTick(game, socketId, player, dt, now) {},

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Water Cannon ─────────────────────────────────────────────
  waterCannon: {
    onAttack(game, socketId, player, now, dmg) {
      const cfg = C.CLASSES.waterCannon.waterAttack;
      const range = cfg.range;
      const halfW = cfg.width / 2;
      const angle = player.mouseAngle;
      const co = Math.cos(angle);
      const si = Math.sin(angle);
      const playerHalf = C.PLAYER_SIZE / 2;
      const plantHalf = C.GRID_SIZE / 2;
      const half = C.PLAYER_SIZE / 2;

      // Hit players: push + small damage
      for (const [sid, other] of game.players) {
        if (sid === socketId || !other.alive) continue;
        if (now < other.invincibleUntil) continue;
        if (!boxHitsRect(player.x, player.y, angle, range, halfW, other.x, other.y, playerHalf)) continue;
        game.applyDamage(socketId, player, sid, other, dmg);
        // Push away in stream direction
        other.x += co * cfg.pushForce;
        other.y += si * cfg.pushForce;
        other.x = clamp(other.x, half, C.MAP_WIDTH - half);
        other.y = clamp(other.y, half, C.MAP_HEIGHT - half);
      }

      // Hit plants: grow immature, harvest mature
      for (const [id, plant] of game.plants) {
        if (!boxHitsRect(player.x, player.y, angle, range, halfW, plant.x, plant.y, plantHalf)) continue;
        if (plant.isMature()) {
          game.harvestPlant(player, id, plant);
        } else {
          // Advance growth by reducing plantedAt
          plant.plantedAt -= 2000;
        }
      }

      // Visual-only projectile for client rendering
      const projs = ensureProjectiles(game);
      projs.push({
        type: 'water',
        ownerId: socketId,
        x: player.x, y: player.y,
        angle: player.mouseAngle,
        speed: 0,
        range: range,
        width: cfg.width,
        _visualUntil: now + 300,
      });

      player.throwAngle = player.mouseAngle;
      player.swingStart = now;
      player.lastAttack = now;
      player.chargeStart = 0;
      return true;
    },

    onTick(game, socketId, player, dt, now) {
      // Clean up visual-only water projectiles
      const projs = ensureProjectiles(game);
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (p.type !== 'water' || p.ownerId !== socketId) continue;
        if (now >= p._visualUntil) projs.splice(i, 1);
      }
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },

  // ── Fertilizer Throw ─────────────────────────────────────────
  fertilizerThrow: {
    onAttack(game, socketId, player, now, dmg) {
      const projs = ensureProjectiles(game);
      const cfg = C.CLASSES.fertilizerThrow.fertilizerAttack;
      // Throw distance: min of mouse distance and max range
      const throwDist = Math.min(player.mouseDist || cfg.range, cfg.range);
      // Flight time scales with distance (min 200ms at point-blank, 500ms at max)
      const duration = 200 + (throwDist / cfg.range) * 300;
      const targetX = player.x + Math.cos(player.mouseAngle) * throwDist;
      const targetY = player.y + Math.sin(player.mouseAngle) * throwDist;
      projs.push({
        type: 'fertilizer',
        ownerId: socketId,
        startX: player.x,
        startY: player.y,
        targetX: targetX,
        targetY: targetY,
        x: player.x,
        y: player.y,
        progress: 0,
        duration: duration,
        dmg: Math.floor(dmg * (cfg.dmgMult || 1)),
        radius: cfg.explosionRadius,
      });
      player.throwAngle = player.mouseAngle;
      player.swingStart = now;
      player.lastAttack = now;
      player.chargeStart = 0;
      return true;
    },

    onTick(game, socketId, player, dt, now) {
      const projs = ensureProjectiles(game);
      const plantHalf = C.GRID_SIZE / 2;
      const playerHalf = C.PLAYER_SIZE / 2;

      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (p.type !== 'fertilizer' || p.ownerId !== socketId) continue;

        p.progress += dt / (p.duration / 1000);
        // Lerp position
        const t = Math.min(p.progress, 1);
        p.x = p.startX + (p.targetX - p.startX) * t;
        p.y = p.startY + (p.targetY - p.startY) * t;

        if (p.progress >= 1 && !p.exploded) {
          // Explode at target position
          const owner = game.players.get(p.ownerId);
          if (owner) {
            // Hit players in explosion radius
            for (const [sid, other] of game.players) {
              if (sid === p.ownerId || !other.alive) continue;
              if (now < other.invincibleUntil) continue;
              const d = pointToBoxDist(p.targetX, p.targetY, other.x, other.y, playerHalf);
              if (d > p.radius) continue;
              game.applyDamage(p.ownerId, owner, sid, other, p.dmg);
            }

            // Hit plants in explosion radius
            for (const [id, plant] of game.plants) {
              if (!plant.isMature()) continue;
              if (plant.def.invulnerable) continue;
              const d = pointToBoxDist(p.targetX, p.targetY, plant.x, plant.y, plantHalf);
              if (d > p.radius) continue;
              plant.hp -= p.dmg;
              if (plant.hp <= 0) {
                game.harvestPlant(owner, id, plant);
              }
            }

            // Cut grass in explosion radius
            const gridSize = C.GRID_SIZE;
            const startGx = Math.max(0, Math.floor((p.targetX - p.radius) / gridSize));
            const endGx = Math.min(Math.floor(C.MAP_WIDTH / gridSize) - 1, Math.floor((p.targetX + p.radius) / gridSize));
            const startGy = Math.max(0, Math.floor((p.targetY - p.radius) / gridSize));
            const endGy = Math.min(Math.floor(C.MAP_HEIGHT / gridSize) - 1, Math.floor((p.targetY + p.radius) / gridSize));
            for (let gx = startGx; gx <= endGx; gx++) {
              for (let gy = startGy; gy <= endGy; gy++) {
                const cx = gx * gridSize + gridSize / 2;
                const cy = gy * gridSize + gridSize / 2;
                const d = pointToBoxDist(p.targetX, p.targetY, cx, cy, gridSize / 2);
                if (d > p.radius) continue;
                game.terrain.cutGrass(gx, gy, now);
              }
            }
          }

          p.exploded = true;
          p.explodeTime = now;
        }

        // Remove after explosion animation (300ms)
        if (p.exploded && now - p.explodeTime > 300) {
          projs.splice(i, 1);
        }
      }
    },

    onHit(game, attacker, attackerSid, victim, victimSid, dmg) {},
  },
};
