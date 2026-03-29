'use strict';

const C = require('./constants');

let nextId = 1;

class Player {
  constructor(name) {
    this.id = 'p' + (nextId++);
    this.name = name || 'Farmer';
    this.x = Math.random() * (C.MAP_WIDTH - 200) + 100;
    this.y = Math.random() * (C.MAP_HEIGHT - 200) + 100;
    this.level = 1;
    this.xp = 0;
    this.color = Player.randomColor();
    this.className = C.DEFAULT_CLASS;
    this.selectedPlantType = 'wheat';
    this.plantBuffUntil = 0;  // farmerEvo: buff expiry timestamp

    // Skill points
    this.skillPoints = 0;
    this.skills = {};
    for (const name of C.SKILL_NAMES) this.skills[name] = 0;

    // Computed stats (filled by getStats)
    this.maxHp = 0;
    this.hp = 0;
    this.atk = 0;
    this.speed = 0;
    this.maxSeeds = 0;
    this.seedRegenTime = 0;
    this.atkCooldown = 0;
    this.swingDuration = 0;

    // Combat
    this.lastDamageTaken = 0;  // timestamp of last damage received

    // Attack
    this.lastAttack = 0;
    this.chargeStart = 0;   // charge phase timestamp
    this.swingStart = 0;    // post-hit animation timestamp
    this.swingHits = new Set();
    this.chargeDuration = 0;

    // Seed
    this.seeds = 0;
    this.seedRegenAccum = 0;

    // Input state
    this.input = { up: false, down: false, left: false, right: false, lmb: false, rmb: false, mx: 0, my: 0 };
    this.prevLmb = false;
    this.prevRmb = false;
    this.mouseAngle = 0;
    this.throwAngle = 0;   // locked angle when slash is thrown

    // Shield (Cook class: blocks 1 hit, charges with 3 harvests)
    this.shield = false;
    this.shieldCharges = 0;

    // Berry damage accumulator
    this.berryDmgAccum = 0;

    // Dash (blink)
    this.lastDash = 0;
    this.prevShift = false;
    this.dashUntil = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;

    // Visibility
    this.hidden = false;

    // Tier 2 class state
    this.autoAttackTimer = 0;      // combine: spinning blade timer
    this.reaperInvisUntil = 0;     // reaper: invisible until timestamp
    this.trappedUntil = 0;         // digger pit trap: stuck until timestamp
    this.rageHarvestCount = 0;     // brewer: harvest counter
    this.rageUntil = 0;            // brewer: rage mode active until
    this.bodySlamHits = new Set(); // truck: prevent multi-hit per frame
    this.flowerBuffUntil = 0;      // flower farmer: buff expiry
    this.cornInvisUntil = 0;       // corn farmer: invis linger
    this.flowerBuffType = null;    // flower farmer: buff type (atk/speed)
    this.flameUntil = 0;           // flamethrower: flame active until
    this.flameAngle = 0;           // flamethrower: locked flame direction
    this.flameDmgTimer = 0;        // flamethrower: damage tick accumulator
    this.cavalryCharging = false;  // cavalry: currently charging
    this.cavalryAngle = 0;         // cavalry: charge direction
    this.cavalryDist = 0;          // cavalry: distance traveled in charge
    this.cavalrySlowUntil = 0;     // cavalry: slow debuff after charge
    this.cavalryPrepUntil = 0;     // cavalry: prep phase
    this.combineActive = false;    // combine: spinning active
    this.combineUntil = 0;         // combine: spinning until

    // Death / respawn
    this.alive = true;
    this.respawnAt = 0;
    this.invincibleUntil = 0;

    // Init
    this.getStats();
    this.hp = this.maxHp;
    this.seeds = this.maxSeeds;
  }

  static randomColor() {
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e84393'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getStats() {
    const base = C.CLASSES[this.className].base;
    const pp = C.SKILL_PER_POINT;
    const sk = this.skills;
    this.maxHp         = base.hp          + (sk.hp || 0)          * pp.hp;
    this.atk           = Math.floor(base.atk * (1 + (sk.atk || 0) * pp.atk));
    this.speed         = base.speed       + (sk.speed || 0)       * pp.speed;
    this.maxSeeds      = C.BASE_SEED_MAX;
    this.seedRegenTime = base.seedRegen   + (sk.seedRegen || 0)   * pp.seedRegen;
    this.atkCooldown   = Math.round(base.atkCooldown * (1 - (sk.atkCooldown || 0) * pp.atkCooldown));
    this.chargeDuration = base.atkSpeed   + (sk.atkSpeed || 0)    * pp.atkSpeed;
    // Class-specific modifiers
    const cls = C.CLASSES[this.className];
    if (cls.hpMult) this.maxHp = Math.floor(this.maxHp * cls.hpMult);
    this.scytheLength = C.SCYTHE_LENGTH * (cls.scytheLengthMult || 1);
    // Level scaling: grow bigger, slightly slower per level
    const lvBonus = this.level - 1;
    this.speed = Math.max(80, this.speed - lvBonus * 2);
    this.playerSize = C.PLAYER_SIZE + lvBonus * 0.4;
  }

  allocateSkill(index) {
    const name = C.SKILL_NAMES[index];
    if (!name) return false;
    if (this.skillPoints <= 0) return false;
    if (this.skills[name] >= C.SKILL_MAX) return false;
    this.skills[name]++;
    this.skillPoints--;
    const oldMaxHp = this.maxHp;
    this.getStats();
    // Scale HP proportionally when maxHp increases
    if (this.maxHp > oldMaxHp) {
      this.hp += this.maxHp - oldMaxHp;
    }
    return true;
  }

  evolve(className) {
    const current = C.CLASSES[this.className];
    if (!current.evolvesTo || !current.evolvesTo.includes(className)) return false;
    const evolveLevel = current.evolveLevel || C.EVOLVE_LEVEL || 8;
    if (this.level < evolveLevel) return false;
    this.className = className;
    this.selectedPlantType = 'wheat';
    const oldMaxHp = this.maxHp;
    this.getStats();
    this.hp += Math.max(0, this.maxHp - oldMaxHp);
    this.hp = Math.min(this.hp, this.maxHp);
    return true;
  }

  addXp(amount) {
    this.xp += amount;
    while (this.level < C.MAX_LEVEL &&
           this.xp >= C.XP_THRESHOLDS[this.level + 1]) {
      this.level++;
      this.skillPoints++;
      this.hp = this.maxHp; // full heal on level-up
    }
  }

  resetProgress() {
    // Keep half of levels (rounded down), redistribute skill points
    const keepLevel = Math.max(1, Math.floor(this.level / 2));
    this.level = keepLevel;
    this.xp = C.XP_THRESHOLDS[keepLevel] || 0;
    this.skillPoints = keepLevel - 1;
    for (const name of C.SKILL_NAMES) this.skills[name] = 0;
    // Reset to farmer — evolution panel will show available options
    this.className = C.DEFAULT_CLASS;
    this.selectedPlantType = 'wheat';
    this.plantBuffUntil = 0;
    this.shield = false;
    this.shieldCharges = 0;
    this.autoAttackTimer = 0;
    this.reaperInvisUntil = 0;
    this.trappedUntil = 0;
    this.rageHarvestCount = 0;
    this.rageUntil = 0;
    this.flowerBuffUntil = 0;
    this.flowerBuffType = null;
    this.cornInvisUntil = 0;
    this.flameUntil = 0;
    this.flameAngle = 0;
    this.flameDmgTimer = 0;
    this.cavalryCharging = false;
    this.cavalryAngle = 0;
    this.cavalryDist = 0;
    this.cavalrySlowUntil = 0;
    this.cavalryPrepUntil = 0;
    this.combineActive = false;
    this.combineUntil = 0;
    this.getStats();
  }

  _findParentClass(className) {
    for (const [key, cls] of Object.entries(C.CLASSES)) {
      if (cls.evolvesTo && cls.evolvesTo.includes(className)) return key;
    }
    return null;
  }

  updateSeeds(dtMs) {
    if (this.seeds >= this.maxSeeds) {
      this.seedRegenAccum = 0;
      return;
    }
    this.seedRegenAccum += dtMs;
    while (this.seedRegenAccum >= this.seedRegenTime && this.seeds < this.maxSeeds) {
      this.seeds++;
      this.seedRegenAccum -= this.seedRegenTime;
    }
  }

  respawn() {
    this.alive = true;
    this.x = Math.random() * (C.MAP_WIDTH - 200) + 100;
    this.y = Math.random() * (C.MAP_HEIGHT - 200) + 100;
    this.hp = this.maxHp;
    this.seeds = this.maxSeeds;
    this.invincibleUntil = Date.now() + C.INVINCIBLE_DURATION;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      className: this.className,
      scytheLength: this.scytheLength,
      playerSize: this.playerSize || C.PLAYER_SIZE,
      selectedPlantType: this.selectedPlantType,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      level: this.level,
      xp: this.xp,
      color: this.color,
      alive: this.alive,
      hidden: this.hidden || false,
      shield: this.shield || false,
      dashing: Date.now() < this.dashUntil,
      hurt: Date.now() - this.lastDamageTaken < 300,
      invincible: Date.now() < this.invincibleUntil,
      charging: this.chargeStart > 0,
      chargeElapsed: this.chargeStart > 0 ? Date.now() - this.chargeStart : 0,
      chargeDuration: this.chargeDuration || (C.CLASSES[this.className].chargeAttack ? C.CLASSES[this.className].chargeAttack.maxCharge : 6000),
      swinging: this.swingStart > 0 && (Date.now() - this.swingStart) < C.SWING_ANIM_DURATION,
      swingElapsed: this.swingStart > 0 ? Date.now() - this.swingStart : 0,
      swingDuration: C.SWING_ANIM_DURATION,
      mouseAngle: this.mouseAngle,
      throwAngle: this.throwAngle,
      cavalryCharging: this.cavalryCharging || false,
      cavalryPrepping: !!this.cavalryPrepUntil,
      cavalryAngle: this.cavalryAngle || 0,
      combineActive: this.combineActive || false,
      atkCooldown: this.atkCooldown,
      seeds: this.seeds,
      maxSeeds: this.maxSeeds,
      seedRegenPct: this.seeds < this.maxSeeds
        ? this.seedRegenAccum / this.seedRegenTime
        : 1,
      blinkCdPct: Math.min(1, (Date.now() - this.lastDash) / (C.DASH_BASE_COOLDOWN + (this.level - 1) * C.DASH_COOLDOWN_PER_LEVEL)),
      skillPoints: this.skillPoints,
      skills: this.skills,
      trapped: Date.now() < this.trappedUntil,
      raging: Date.now() < this.rageUntil,
      rageHarvestCount: this.rageHarvestCount || 0,
      reaperInvis: Date.now() < this.reaperInvisUntil,
      flaming: this.flameUntil > 0 && Date.now() < this.flameUntil,
      flameAngle: this.flameAngle || 0,
    };
  }
}

module.exports = Player;
