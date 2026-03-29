'use strict';

class GameState {
  constructor() {
    this.players = {};
    this.plants = {};
    this.terrain = [];
    this.leaderboard = [];
    this.prevPlayers = {};
    this.interpFactor = 0;
    this.lastUpdate = 0;
    this.updateInterval = 100;
    this.swingAnims = {};
    this.chargeAnims = {};  // playerId → { startTime, duration }
  }

  applySnapshot(data, myId) {
    this.prevPlayers = {};
    for (const id in this.players) {
      this.prevPlayers[id] = {
        x: this.players[id].x,
        y: this.players[id].y,
      };
    }

    const newPlayers = {};
    for (const p of data.players) {
      newPlayers[p.id] = p;
      if (!this.prevPlayers[p.id]) {
        this.prevPlayers[p.id] = { x: p.x, y: p.y };
      }
      // Track charge/swing animations from server
      // Skip self for normal classes (client prediction), but use server data for custom-charge classes
      const cls = Constants.CLASSES[p.className];
      const serverCharge = cls && (cls.autoAttack || cls.chargeAttack || cls.bodySlam);
      if (p.id === myId && !serverCharge) continue;
      // Charge
      if (p.charging) {
        if (!this.chargeAnims[p.id]) {
          const elapsed = p.chargeElapsed || 0;
          this.chargeAnims[p.id] = { startTime: Date.now() - elapsed, duration: p.chargeDuration || 500 };
        }
      } else {
        delete this.chargeAnims[p.id];
      }
      // Swing (post-hit animation)
      if (p.swinging && (!this.swingAnims[p.id] || !this.swingAnims[p.id].active)) {
        const elapsed = p.swingElapsed || 0;
        this.swingAnims[p.id] = { startTime: Date.now() - elapsed, active: true, duration: p.swingDuration || 300, throwAngle: p.throwAngle || 0 };
      }
    }
    this.players = newPlayers;

    for (const id in this.swingAnims) {
      if (!newPlayers[id]) delete this.swingAnims[id];
    }
    for (const id in this.chargeAnims) {
      if (!newPlayers[id]) delete this.chargeAnims[id];
    }

    const newPlants = {};
    for (const pl of data.plants) {
      newPlants[pl.id] = pl;
    }
    this.plants = newPlants;
    this.terrain = data.terrain || [];
    this.leaderboard = data.leaderboard || [];

    // Store projectiles with snapshot timestamp for client-side extrapolation
    const now = Date.now();
    this.projectiles = (data.projectiles || []).map(p => ({
      type: p.type,
      x: p.x, y: p.y,
      angle: p.angle,
      speed: p.speed || 0,
      startX: p.startX, startY: p.startY,
      targetX: p.targetX, targetY: p.targetY,
      progress: p.progress || 0,
      duration: p.duration || 0,
      range: p.range || 0,
      width: p.width || 0,
      radius: p.radius || 0,
      lingering: p.lingering || false,
      exploded: p.exploded || false,
      _snapshotTime: now,
    }));
    this.lastUpdate = Date.now();
    this.interpFactor = 0;
  }

  updateInterpolation() {
    const elapsed = Date.now() - this.lastUpdate;
    this.interpFactor = Math.min(elapsed / this.updateInterval, 1);
  }

  startLocalCharge(playerId) {
    const p = this.players[playerId];
    const duration = (p && p.chargeDuration) || 500;
    this.chargeAnims[playerId] = { startTime: Date.now(), duration: duration };
  }

  getChargeProgress(playerId) {
    const anim = this.chargeAnims[playerId];
    if (!anim) return null;
    const elapsed = Date.now() - anim.startTime;
    if (elapsed >= anim.duration) return null;
    return elapsed / anim.duration;
  }

  completeLocalCharge(playerId, throwAngle) {
    delete this.chargeAnims[playerId];
    this.swingAnims[playerId] = {
      startTime: Date.now(), active: true,
      duration: Constants.SWING_ANIM_DURATION,
      throwAngle: throwAngle,
    };
  }

  getSwingAngle(playerId) {
    const anim = this.swingAnims[playerId];
    if (!anim || !anim.active) return null;
    const elapsed = Date.now() - anim.startTime;
    if (elapsed >= anim.duration) {
      anim.active = false;
      return null;
    }
    return (elapsed / anim.duration) * Math.PI * 2;
  }

  getSwingProgress(playerId) {
    const anim = this.swingAnims[playerId];
    if (!anim || !anim.active) return null;
    const elapsed = Date.now() - anim.startTime;
    if (elapsed >= anim.duration) return null;
    return elapsed / anim.duration;
  }

  getSwingThrowAngle(playerId) {
    const anim = this.swingAnims[playerId];
    return anim ? anim.throwAngle || 0 : 0;
  }

  getInterpolatedProjectiles() {
    const now = Date.now();
    return this.projectiles.map(p => {
      const dt = (now - p._snapshotTime) / 1000; // seconds since snapshot

      if (p.type === 'fertilizer') {
        // Lob projectile: interpolate progress, compute arc position
        const newProgress = Math.min(p.progress + dt / (p.duration / 1000), 1);
        const lx = p.startX + (p.targetX - p.startX) * newProgress;
        const ly = p.startY + (p.targetY - p.startY) * newProgress;
        return Object.assign({}, p, { x: lx, y: ly, progress: newProgress });
      }

      if (p.speed > 0) {
        // Linear projectile (slash, boomerang, bullet): extrapolate position
        return Object.assign({}, p, {
          x: p.x + Math.cos(p.angle) * p.speed * dt,
          y: p.y + Math.sin(p.angle) * p.speed * dt,
        });
      }

      return p; // lingering or stationary
    });
  }

  getInterpolatedPlayer(id) {
    const p = this.players[id];
    if (!p) return null;
    const prev = this.prevPlayers[id];
    if (!prev) return p;
    const t = this.interpFactor;
    return Object.assign({}, p, {
      x: prev.x + (p.x - prev.x) * t,
      y: prev.y + (p.y - prev.y) * t,
    });
  }
}
