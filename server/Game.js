'use strict';

const C = require('./constants');
const P = require('./protocol');
const Player = require('./Player');
const Plant = require('./Plant');
const Terrain = require('./Terrain');
const { distance, clamp, angleDiff, pointToBoxDist } = require('./collision');

// ── Evo modules ──────────────────────────────────────────
const evoGiantSwing = require('./evo/giantSwing');
const evoSlashThrow = require('./evo/slashThrow');
const evoCook       = require('./evo/cook');
const evoGardener   = require('./evo/gardener');
const evoFarmerEvo  = require('./evo/farmerEvo');

// Build flat handler lookup: className → handler object
const EVO_HANDLERS = Object.assign({},
  evoGiantSwing, evoSlashThrow, evoCook, evoGardener, evoFarmerEvo
);

class Game {
  constructor(io) {
    this.io = io;
    this.players = new Map();   // socketId → Player
    this.plants = new Map();    // plantId → Plant
    this.plantGrid = new Set(); // "gx,gy" keys for occupied cells
    this.sockets = new Map();   // socketId → socket
    this.tickCount = 0;
    this.terrain = new Terrain();
    this.wildPlantCount = 0;
    this._projectiles = [];
  }

  // Snap world coords to grid cell center
  static toGridCell(x, y) {
    const gx = Math.floor(x / C.GRID_SIZE);
    const gy = Math.floor(y / C.GRID_SIZE);
    return { gx, gy };
  }

  static gridKey(gx, gy) {
    return gx + ',' + gy;
  }

  static gridCenter(gx, gy) {
    return {
      x: gx * C.GRID_SIZE + C.GRID_SIZE / 2,
      y: gy * C.GRID_SIZE + C.GRID_SIZE / 2,
    };
  }

  start() {
    // Generate terrain
    this.terrain.generate();

    // Game loop at TICK_RATE
    const tickMs = 1000 / C.TICK_RATE;
    this.lastTick = Date.now();
    setInterval(() => this.tick(), tickMs);

    // State broadcast at STATE_RATE
    const stateMs = 1000 / C.STATE_RATE;
    setInterval(() => this.broadcastState(), stateMs);

    // Wild plant spawner
    setInterval(() => this.spawnWildPlants(), C.WILD_SPAWN_INTERVAL);

    // Socket.IO connections
    this.io.on('connection', (socket) => this.onConnect(socket));
  }

  onConnect(socket) {
    socket.on(P.C_JOIN, (data) => this.onJoin(socket, data));
    socket.on(P.C_INPUT, (data) => this.onInput(socket, data));
    socket.on(P.C_SKILL, (data) => this.onSkill(socket, data));
    socket.on(P.C_EVOLVE, (data) => this.onEvolve(socket, data));
    socket.on(P.C_PING, () => socket.emit(P.S_PONG, Date.now()));
    socket.on('disconnect', () => this.onDisconnect(socket));
  }

  onSkill(socket, data) {
    const player = this.players.get(socket.id);
    if (!player) return;
    const index = Number(data && data.index);
    player.allocateSkill(index);
  }

  onEvolve(socket, data) {
    const player = this.players.get(socket.id);
    if (!player) return;
    player.evolve(String(data && data.className));
  }

  onJoin(socket, data) {
    const name = (data && data.name) ? String(data.name).slice(0, 16) : 'Farmer';
    const player = new Player(name);
    this.players.set(socket.id, player);
    this.sockets.set(socket.id, socket);
    socket.emit(P.S_WELCOME, { id: player.id });
  }

  onInput(socket, data) {
    const player = this.players.get(socket.id);
    if (!player || !player.alive) return;
    player.input = {
      up: !!data.up,
      down: !!data.down,
      left: !!data.left,
      right: !!data.right,
      lmb: !!data.lmb,
      rmb: !!data.rmb,
      shift: !!data.shift,
      mx: Number(data.mx) || 0,
      my: Number(data.my) || 0,
    };
    if (typeof data.mouseAngle === 'number') {
      player.mouseAngle = data.mouseAngle;
    }
    if (typeof data.mouseDist === 'number') {
      player.mouseDist = data.mouseDist;
    }
    if (data.selectedPlantType) {
      const cls = C.CLASSES[player.className];
      const allowed = cls.plantTypes || ['wheat'];
      if (allowed.includes(data.selectedPlantType)) {
        player.selectedPlantType = data.selectedPlantType;
      }
    }
  }

  onDisconnect(socket) {
    // Remove all plants owned by disconnecting player
    for (const [id, plant] of this.plants) {
      if (plant.ownerId === socket.id) {
        if (plant.gridKey) this.plantGrid.delete(plant.gridKey);
        this.plants.delete(id);
      }
    }
    this.terrain.removeByOwner(socket.id);
    this.players.delete(socket.id);
    this.sockets.delete(socket.id);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    this.tickCount++;

    // Update terrain (grass respawn)
    this.terrain.update(now, this.plantGrid);

    // Update plants (with pond adjacency growth boost)
    for (const plant of this.plants.values()) {
      const mult = (plant.gridKey && this.terrain.isAdjacentToPond(plant.gridKey))
        ? C.TERRAIN_TYPES.pond.cropGrowthMultiplier
        : 1;
      plant.update(now, mult);
    }

    // Update base projectiles (slash)
    this.updateProjectiles(dt, now);

    // Update players
    for (const [socketId, player] of this.players) {
      if (!player.alive) {
        // Check respawn
        if (player.respawnAt && now >= player.respawnAt) {
          player.respawn();
          player.respawnAt = 0;
          const sock = this.sockets.get(socketId);
          if (sock) sock.emit(P.S_RESPAWN, { x: player.x, y: player.y });
        }
        continue;
      }

      player.updateSeeds(dt * 1000);
      this.updateMovement(socketId, player, dt);
      this.handleAttackStart(socketId, player, now);
      this.updateCharge(socketId, player, now);
      this.updateSwing(player, now);
      this.handlePlant(socketId, player, now);
      this.handleDash(player, now);

      // Reset hidden each tick (evo onTick or grass check will set it)
      player.hidden = false;

      // Evo module: onTick (BEFORE prevLmb update so rising edge detection works)
      const evoHandler = EVO_HANDLERS[player.className];
      if (evoHandler && evoHandler.onTick) {
        evoHandler.onTick(this, socketId, player, dt, now);
      }

      player.prevLmb = player.input.lmb;
      player.prevRmb = player.input.rmb;
      player.prevShift = player.input.shift;

      // Passive regen: 30s without taking damage → HP regen
      if (player.hp < player.maxHp && now - (player.lastDamageTaken || 0) >= C.REGEN_SAFE_TIME) {
        player.hp = Math.min(player.maxHp, Math.floor(player.hp + C.REGEN_HP_PER_SEC * dt));
      }

      // Grass invisibility (don't override if evo module already set hidden)
      const pCell = Game.toGridCell(player.x, player.y);
      if (!player.hidden) {
        player.hidden = this.terrain.hasActiveTerrain(pCell.gx, pCell.gy, 'grass');
      }

      // FarmerEvo: plant buff when standing on plant cell
      const playerKey = Game.gridKey(pCell.gx, pCell.gy);
      if (C.CLASSES[player.className].plantBuff && this.plantGrid.has(playerKey)) {
        player.plantBuffUntil = now + C.CLASSES[player.className].plantBuff.duration;
      }

      // Contact damage: berry or bugged plant on same cell
      let contactPlant = null;
      for (const plant of this.plants.values()) {
        if (!plant.isMature()) continue;
        if (plant.gridKey !== playerKey) continue;
        if (plant.bugged) {
          // Bugged: damages everyone except the bug owner
          if (plant.bugOwnerId !== socketId) { contactPlant = plant; break; }
        } else if (plant.def.contactDmgPerPx) {
          // Contact damage plants (berry, cactus, etc): damages enemies of the owner
          if (plant.ownerId !== socketId) { contactPlant = plant; break; }
        }
      }
      if (contactPlant && now >= player.invincibleUntil) {
        const dmgPerPx = contactPlant.def.contactDmgPerPx || 0.8;
        // Calculate distance moved this tick
        const movedDist = Math.sqrt(
          (player.x - (player.prevX || player.x)) ** 2 +
          (player.y - (player.prevY || player.y)) ** 2
        );
        if (movedDist > 0) {
          player.berryDmgAccum += movedDist * dmgPerPx;
          const intDmg = Math.floor(player.berryDmgAccum);
          if (intDmg > 0) {
            player.berryDmgAccum -= intDmg;
            if (player.shield) {
              player.shield = false;
            } else {
              player.hp -= intDmg;
              player.lastDamageTaken = now;
              if (player.hp <= 0) {
                // Find kill credit: bug owner or plant owner
                const creditId = contactPlant.bugged ? contactPlant.bugOwnerId : contactPlant.ownerId;
                let killerSid = null, killerPlayer = null;
                if (creditId) {
                  const kp = this.players.get(creditId);
                  if (kp) { killerSid = creditId; killerPlayer = kp; }
                }
                if (killerPlayer) {
                  this.killPlayer(killerSid, killerPlayer, socketId, player);
                } else {
                  player.alive = false;
                  player.respawnAt = now + C.RESPAWN_DELAY;
                  player.resetProgress();
                  for (const [id, p] of this.plants) {
                    if (p.ownerId === socketId) {
                      if (p.gridKey) this.plantGrid.delete(p.gridKey);
                      this.plants.delete(id);
                    }
                  }
                  const sock = this.sockets.get(socketId);
                  const deathName = contactPlant.bugged ? 'Bug' : (contactPlant.def.id || 'Plant');
                  if (sock) sock.emit(P.S_DEATH, { killer: deathName });
                }
              }
            }
          }
        }
      } else {
        player.berryDmgAccum = 0;
      }
      player.prevX = player.x;
      player.prevY = player.y;
    }
  }

  updateMovement(socketId, player, dt) {
    const now = Date.now();

    // Trapped: no movement
    if (now < player.trappedUntil) return;

    // Dashing: override normal movement with high-speed blink
    if (now < player.dashUntil) {
      const dashSpeed = C.DASH_DISTANCE / (C.DASH_DURATION / 1000);
      player.x += player.dashDirX * dashSpeed * dt;
      player.y += player.dashDirY * dashSpeed * dt;
      const half = C.PLAYER_SIZE / 2;
      player.x = clamp(player.x, half, C.MAP_WIDTH - half);
      player.y = clamp(player.y, half, C.MAP_HEIGHT - half);
      return;
    }

    let dx = 0, dy = 0;
    if (player.input.up) dy -= 1;
    if (player.input.down) dy += 1;
    if (player.input.left) dx -= 1;
    if (player.input.right) dx += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    // Pond slowdown
    let speedMult = 1.0;
    const cell = Game.toGridCell(player.x, player.y);
    if (this.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) {
      speedMult = C.TERRAIN_TYPES.pond.speedMultiplier;
    }

    // Land rice (muddy paddy) slows non-riceFarmer players
    if (player.className !== 'riceFarmer') {
      const cellKey = Game.gridKey(cell.gx, cell.gy);
      for (const plant of this.plants.values()) {
        if (plant.gridKey !== cellKey) continue;
        if (plant.type === 'rice' && plant.landRice && plant.isMature()) {
          speedMult *= 0.5;
          break;
        }
      }
    }

    // FarmerEvo plant buff
    const pb = C.CLASSES[player.className].plantBuff;
    if (pb && now < player.plantBuffUntil) {
      speedMult *= pb.speedMult;
    }

    // Evo module: getSpeedMult
    const evoHandler = EVO_HANDLERS[player.className];
    if (evoHandler && evoHandler.getSpeedMult) {
      speedMult = evoHandler.getSpeedMult(this, player, speedMult);
    }

    // Cannot move if speed is 0 (e.g. chargeSwing while charging)
    if (speedMult === 0) return;

    const newX = player.x + dx * player.speed * speedMult * dt;
    const newY = player.y + dy * player.speed * speedMult * dt;

    // Clamp to map bounds
    const half = C.PLAYER_SIZE / 2;
    player.x = clamp(newX, half, C.MAP_WIDTH - half);
    player.y = clamp(newY, half, C.MAP_HEIGHT - half);

    // Impassable terrain blocking (boulder, rock)
    const newCell = Game.toGridCell(player.x, player.y);
    if (this.terrain.isImpassableTerrain(newCell.gx, newCell.gy)) {
      player.x = player.prevX || player.x;
      player.y = player.prevY || player.y;
    }

    // Impassable plant blocking (hedge, cactus for non-owners)
    const newKey = Game.gridKey(newCell.gx, newCell.gy);
    for (const plant of this.plants.values()) {
      if (!plant.isMature() || !plant.def.impassable) continue;
      if (plant.gridKey !== newKey) continue;
      if (plant.ownerId === socketId) continue;
      // Push player back
      player.x = player.prevX || player.x;
      player.y = player.prevY || player.y;
      break;
    }
  }

  handleAttackStart(socketId, player, now) {
    // Trapped: no attacking
    if (now < player.trappedUntil) return;

    // Classes with custom attack patterns (managed by their onTick)
    const cls = C.CLASSES[player.className];
    if (cls.autoAttack) return;    // combine: auto-attacks via onTick
    if (cls.chargeAttack) return;  // chargeSwing: variable charge via onTick
    if (cls.bodySlam) return;      // truck: body slam only, no weapon attack
    if (cls.chargeRush) return;    // cavalry: charge rush via onTick

    // Rising edge only
    if (!player.input.lmb || player.prevLmb) return;
    // Already charging or in swing animation
    if (player.chargeStart > 0) return;
    if (player.swingStart > 0 && now - player.swingStart < C.SWING_ANIM_DURATION) return;
    // Cooldown (from last attack execution)
    if (now - player.lastAttack < player.atkCooldown) return;
    player.chargeStart = now;
  }

  updateCharge(socketId, player, now) {
    if (player.chargeStart <= 0) return;
    // Classes with custom charge logic (chargeSwing manages its own release)
    const clsCharge = C.CLASSES[player.className];
    if (clsCharge.chargeAttack) return;
    if (now - player.chargeStart < player.chargeDuration) return;

    // Charge complete → hit → start swing/throw animation
    player.chargeStart = 0;
    player.lastAttack = now;
    player.swingStart = now;
    player.swingHits = new Set();

    const cls = C.CLASSES[player.className];
    let atkMult = (cls.plantBuff && now < player.plantBuffUntil)
      ? cls.plantBuff.atkMult : 1;

    // Evo module: getAtkMult
    const evoHandler = EVO_HANDLERS[player.className];
    if (evoHandler && evoHandler.getAtkMult) {
      atkMult *= evoHandler.getAtkMult(player, now);
    }

    const dmg = Math.floor(player.atk * atkMult);

    // Evo module: onAttack override for projectile classes (slashThrow branch)
    if (evoHandler && evoHandler.onAttack) {
      const blocked = evoHandler.onAttack(this, socketId, player, now, dmg);
      if (blocked) return;
    }

    if (cls.throwRange) {
      // Slash throw: create flying projectile
      player.throwAngle = player.mouseAngle;
      this._projectiles.push({
        type: 'slash',
        ownerId: socketId,
        x: player.x,
        y: player.y,
        angle: player.mouseAngle,
        speed: 600,
        range: cls.throwRange,
        halfW: (cls.throwWidth || 30) / 2,
        distTraveled: 0,
        dmg: dmg,
        hitPlayers: new Set(),
        hitPlants: new Set(),
      });
    } else {
      // Normal: circular hit in scythe range
      this.performCircularHit(socketId, player, now, dmg);
    }
  }

  performCircularHit(socketId, player, now, dmg) {
    const plantHalf = C.GRID_SIZE / 2;
    const evoHandler = EVO_HANDLERS[player.className];

    for (const [id, plant] of this.plants) {
      if (!plant.isMature()) continue;
      if (plant.def.invulnerable) continue;
      const d = pointToBoxDist(player.x, player.y, plant.x, plant.y, plantHalf);
      if (d > player.scytheLength) continue;
      player.swingHits.add(id);

      // Evo module: onPlantHit (grassCutter destroys plants entirely)
      if (evoHandler && evoHandler.onPlantHit) {
        if (evoHandler.onPlantHit(this, player, id, plant)) continue;
      }

      plant.hp -= dmg;
      if (plant.hp <= 0) {
        this.harvestPlant(player, id, plant);
      }
    }

    for (const [sid, other] of this.players) {
      if (sid === socketId || !other.alive) continue;
      if (now < other.invincibleUntil) continue;
      const otherHalf = (other.playerSize || C.PLAYER_SIZE) / 2;
      const d = pointToBoxDist(player.x, player.y, other.x, other.y, otherHalf);
      if (d > player.scytheLength) continue;
      player.swingHits.add(other.id);
      this.applyDamage(socketId, player, sid, other, dmg);
    }
  }

  applyDamage(attackerSid, attacker, victimSid, victim, dmg) {
    if (victim.shield) {
      victim.shield = false;
      return;
    }
    victim.hp -= dmg;
    victim.lastDamageTaken = Date.now();

    // Evo module: onHit
    const evoHandler = EVO_HANDLERS[attacker.className];
    if (evoHandler && evoHandler.onHit) {
      evoHandler.onHit(this, attacker, attackerSid, victim, victimSid, dmg);
    }

    if (victim.hp <= 0) {
      this.killPlayer(attackerSid, attacker, victimSid, victim);
    }
  }

  harvestPlant(player, id, plant) {
    const xpMult = C.CLASSES[player.className].harvestXpMult || 1;
    player.addXp(Math.floor(plant.def.harvestXp * xpMult));
    const healMult = C.CLASSES[player.className].harvestHealMult || 1;
    player.hp = Math.min(player.maxHp, player.hp + plant.def.harvestHeal * healMult);
    // Cook class: 3 harvests → shield
    if (C.CLASSES[player.className].shieldOnHarvest && !player.shield) {
      player.shieldCharges++;
      if (player.shieldCharges >= 3) {
        player.shield = true;
        player.shieldCharges = 0;
      }
    }

    // Evo module: onHarvest
    const evoHandler = EVO_HANDLERS[player.className];
    if (evoHandler && evoHandler.onHarvest) {
      evoHandler.onHarvest(this, player, plant, id);
    }

    // Clear bug on harvest
    if (plant.bugged) {
      plant.bugged = false;
      plant.bugOwnerId = null;
    }

    if (plant.ownerId) {
      plant.regrow();
    } else {
      if (plant.gridKey) this.plantGrid.delete(plant.gridKey);
      if (plant.wild) this.wildPlantCount--;
      this.plants.delete(id);
    }
  }

  handleDash(player, now) {
    // Rising edge on shift
    if (!player.input.shift || player.prevShift) return;
    // Stamina-based cooldown: scales with level
    const dashCd = C.DASH_BASE_COOLDOWN + (player.level - 1) * C.DASH_COOLDOWN_PER_LEVEL;
    if (now - player.lastDash < dashCd) return;
    if (now < player.dashUntil) return;

    // Start blink dash in mouse direction
    player.dashDirX = Math.cos(player.mouseAngle);
    player.dashDirY = Math.sin(player.mouseAngle);
    player.dashUntil = now + C.DASH_DURATION;
    player.lastDash = now;
  }

  updateSwing(player, now) {
    if (player.swingStart <= 0) return;
    const elapsed = now - player.swingStart;
    if (elapsed >= C.SWING_ANIM_DURATION) {
      player.swingStart = 0;
      return;
    }

    const cls = C.CLASSES[player.className];
    // Throw class: no sweep grass cutting
    if (cls.throwRange) return;

    // Swing animation: cut all grass within scythe range (same as plant hit detection)
    const range = player.scytheLength;
    const gridSize = C.GRID_SIZE;
    const startGx = Math.max(0, Math.floor((player.x - range) / gridSize));
    const endGx = Math.min(Math.floor(C.MAP_WIDTH / gridSize) - 1, Math.floor((player.x + range) / gridSize));
    const startGy = Math.max(0, Math.floor((player.y - range) / gridSize));
    const endGy = Math.min(Math.floor(C.MAP_HEIGHT / gridSize) - 1, Math.floor((player.y + range) / gridSize));
    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gy = startGy; gy <= endGy; gy++) {
        const grassKey = 'grass_' + gx + ',' + gy;
        if (player.swingHits.has(grassKey)) continue;
        const cx = gx * gridSize + gridSize / 2;
        const cy = gy * gridSize + gridSize / 2;
        const d = pointToBoxDist(player.x, player.y, cx, cy, gridSize / 2);
        if (d > range) continue;
        if (this.terrain.cutGrass(gx, gy, now)) {
          player.swingHits.add(grassKey);
        }
      }
    }
  }

  updateProjectiles(dt, now) {
    const plantHalf = C.GRID_SIZE / 2;
    const playerHalf = C.PLAYER_SIZE / 2;

    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      if (p.type !== 'slash') continue;

      const step = p.speed * dt;
      p.x += Math.cos(p.angle) * step;
      p.y += Math.sin(p.angle) * step;
      p.distTraveled += step;

      const owner = this.players.get(p.ownerId);
      if (!owner) { this._projectiles.splice(i, 1); continue; }

      // Hit plants along path
      for (const [id, plant] of this.plants) {
        if (!plant.isMature()) continue;
        if (plant.def.invulnerable) continue;
        if (p.hitPlants.has(id)) continue;
        const d = pointToBoxDist(p.x, p.y, plant.x, plant.y, plantHalf);
        if (d > p.halfW) continue;
        p.hitPlants.add(id);
        plant.hp -= p.dmg;
        if (plant.hp <= 0) {
          this.harvestPlant(owner, id, plant);
        }
      }

      // Hit players along path
      for (const [sid, other] of this.players) {
        if (sid === p.ownerId || !other.alive) continue;
        if (now < other.invincibleUntil) continue;
        if (p.hitPlayers.has(sid)) continue;
        const d = pointToBoxDist(p.x, p.y, other.x, other.y, playerHalf);
        if (d > p.halfW) continue;
        p.hitPlayers.add(sid);
        this.applyDamage(p.ownerId, owner, sid, other, p.dmg);
      }

      // Cut grass at projectile position
      const grassCell = Game.toGridCell(p.x, p.y);
      this.terrain.cutGrass(grassCell.gx, grassCell.gy, now);

      // Remove when out of range
      if (p.distTraveled >= p.range) {
        this._projectiles.splice(i, 1);
      }
    }
  }

  killPlayer(killerSocketId, killer, victimSocketId, victim) {
    victim.alive = false;
    victim.respawnAt = Date.now() + C.RESPAWN_DELAY;

    // XP reward to killer
    const reward = Math.floor(victim.xp * C.KILL_XP_REWARD_RATIO);
    killer.addXp(reward);

    // Full reset on death: level, XP, skills
    victim.resetProgress();

    // Remove all plants owned by the victim
    for (const [id, plant] of this.plants) {
      if (plant.ownerId === victimSocketId) {
        if (plant.gridKey) this.plantGrid.delete(plant.gridKey);
        this.plants.delete(id);
      }
    }

    // Remove pond terrain cells owned by the victim (pondMaker)
    this.terrain.removeByOwner(victimSocketId);

    // Notify
    const victimSock = this.sockets.get(victimSocketId);
    if (victimSock) victimSock.emit(P.S_DEATH, { killer: killer.name });

    // Killfeed broadcast
    this.io.emit(P.S_KILLFEED, {
      killer: killer.name,
      victim: victim.name,
    });
  }

  handlePlant(socketId, player, now) {
    // Rising edge only
    if (!player.input.rmb || player.prevRmb) return;

    const cell = Game.toGridCell(player.x, player.y);
    const key = Game.gridKey(cell.gx, cell.gy);

    // Evo module: onPlant (returns true to override default behavior)
    const evoHandler = EVO_HANDLERS[player.className];
    if (evoHandler && evoHandler.onPlant) {
      const handled = evoHandler.onPlant(this, socketId, player, cell, key, now);
      if (handled) return;
    }

    // If plant already exists on this cell, nurture it (tap to grow)
    if (this.plantGrid.has(key)) {
      for (const plant of this.plants.values()) {
        if (plant.gridKey === key && !plant.isMature()) {
          plant.nurture();
          break;
        }
      }
      return;
    }

    if (player.seeds <= 0) return;
    if (this.terrain.hasActiveTerrain(cell.gx, cell.gy, 'pond')) return;

    // Only allow planting types the class has in its plantTypes list (or wheat for all)
    const cls = C.CLASSES[player.className];
    const allowed = cls.plantTypes || ['wheat'];
    if (!allowed.includes(player.selectedPlantType)) {
      player.selectedPlantType = 'wheat';
    }

    // Auto-cut grass when planting on it
    this.terrain.cutGrass(cell.gx, cell.gy, Date.now());

    player.seeds--;
    const center = Game.gridCenter(cell.gx, cell.gy);
    const plant = new Plant(center.x, center.y, player.selectedPlantType);
    plant.gridKey = key;
    plant.ownerId = socketId;
    this.plants.set(plant.id, plant);
    this.plantGrid.add(key);
  }

  spawnWildPlants() {
    if (this.wildPlantCount >= C.WILD_MAX_DANDELIONS) return;
    if (Math.random() > C.WILD_SPAWN_CHANCE) return;

    const maxGx = Math.floor(C.MAP_WIDTH / C.GRID_SIZE) - 1;
    const maxGy = Math.floor(C.MAP_HEIGHT / C.GRID_SIZE) - 1;

    for (let attempt = 0; attempt < 10; attempt++) {
      const gx = Math.floor(Math.random() * (maxGx + 1));
      const gy = Math.floor(Math.random() * (maxGy + 1));
      const key = Game.gridKey(gx, gy);

      if (this.plantGrid.has(key)) continue;
      if (this.terrain.getCell(gx, gy)) continue;

      const center = Game.gridCenter(gx, gy);
      const plant = new Plant(center.x, center.y, 'dandelion');
      plant.gridKey = key;
      plant.wild = true;
      this.plants.set(plant.id, plant);
      this.plantGrid.add(key);
      this.wildPlantCount++;
      break;
    }
  }

  broadcastState() {
    const players = [];
    for (const player of this.players.values()) {
      players.push(player.toJSON());
    }

    const plants = [];
    for (const plant of this.plants.values()) {
      plants.push(plant.toJSON());
    }

    // Leaderboard: top 10 by xp
    const leaderboard = players
      .filter(p => p.alive)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10)
      .map(p => ({ name: p.name, xp: p.xp, level: p.level }));

    const terrain = this.terrain.toJSON();

    // Serialize projectiles for client rendering
    const projectiles = this._projectiles.map(p => ({
      type: p.type,
      x: p.x || (p.lingerPos ? p.lingerPos.x : 0),
      y: p.y || 0,
      angle: p.angle || 0,
      speed: p.speed || 0,
      startX: p.startX,
      startY: p.startY,
      targetX: p.targetX,
      targetY: p.targetY,
      progress: p.progress || 0,
      duration: p.duration || 0,
      range: p.range || 0,
      width: p.width || (p.halfW ? p.halfW * 2 : 0),
      radius: p.radius || 0,
      lingering: !!p.lingerPos,
      exploded: !!p.exploded,
    }));

    this.io.emit(P.S_STATE, { players, plants, leaderboard, terrain, projectiles });
  }
}

module.exports = Game;
