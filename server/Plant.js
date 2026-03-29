'use strict';

const C = require('./constants');

let nextId = 1;

class Plant {
  constructor(x, y, typeName) {
    this.id = 'pl' + (nextId++);
    this.x = x;
    this.y = y;
    this.type = typeName || C.DEFAULT_PLANT_TYPE;
    this.def = C.PLANT_TYPES[this.type];
    this.plantedAt = Date.now();
    this.stage = 0; // 0=seed, 1=sprout, 2=mature
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.ownerId = null; // socketId of planter (null = wild)
  }

  regrow() {
    this.plantedAt = Date.now();
    this.hp = this.def.hp;
    if (this.def.regrowTime) {
      // Vine/stem remains after first harvest → skip seed stage, fast regrow
      this.harvested = true;
      this.stage = 1; // start at sprout (stem visible)
    } else {
      this.stage = 0;
    }
  }

  update(now, growthMultiplier) {
    if (this.stage === 2) return;
    const elapsed = now - this.plantedAt;
    const gm = growthMultiplier || 1;

    if (this.harvested && this.def.regrowTime) {
      // Regrow mode: stem already exists, only sprout→mature
      const rt = this.def.regrowTime / gm;
      if (elapsed >= rt) {
        this.stage = 2;
      } else {
        this.stage = 1; // always sprout during regrow (no seed stage)
      }
    } else {
      // Normal growth: seed→sprout→mature
      const gt = this.def.growTime / gm;
      if (elapsed >= gt) {
        this.stage = 2;
      } else if (elapsed >= gt / 2) {
        this.stage = 1;
      } else {
        this.stage = 0;
      }
    }
  }

  nurture() {
    if (this.stage === 2) return false;
    const tapsNeeded = this.def.nurtureTaps || 0;
    if (tapsNeeded <= 0) return false;
    // Each tap advances time by growTime / nurtureTaps
    this.plantedAt -= this.def.growTime / tapsNeeded;
    return true;
  }

  isMature() {
    return this.stage === 2;
  }

  toJSON() {
    const o = {
      id: this.id,
      x: this.x,
      y: this.y,
      type: this.type,
      stage: this.stage,
      hp: this.hp,
      maxHp: this.maxHp,
    };
    if (this.bugged) o.bugged = true;
    if (this.landRice) o.landRice = true;
    return o;
  }
}

module.exports = Plant;
