'use strict';

// Generate XP thresholds: 1.2x scaling per level, 50 levels
const _xpThresholds = [0, 0];
let _cum = 0, _per = 30;
for (let lv = 2; lv <= 50; lv++) {
  _cum += Math.floor(_per);
  _xpThresholds[lv] = _cum;
  _per *= 1.2;
}

module.exports = {
  // Map
  MAP_WIDTH: 4000,
  MAP_HEIGHT: 4000,
  GRID_SIZE: 64,

  // Tick
  TICK_RATE: 20,
  STATE_RATE: 10,

  // Player base (non-skill)
  PLAYER_SIZE: 24,
  PLAYER_ATK_RANGE: 50,

  // Scythe (non-skill constants)
  SCYTHE_LENGTH: 50,
  SWING_ANIM_DURATION: 300,

  // Skill system
  SKILL_MAX: 8,
  SKILL_NAMES: ['seedRegen', 'hp', 'atkCooldown', 'atkSpeed', 'atk', 'speed'],
  SKILL_PER_POINT: {
    seedRegen:   -1125,
    hp:          15,
    atkCooldown: 0.1,
    atkSpeed:    -50,
    atk:         0.2,
    speed:       12,
  },
  BASE_SEED_MAX: 10,

  // ─── Classes ──────────────────────────────────────────────
  CLASSES: {
    // Base class
    farmer: {
      name: 'Farmer',
      evolveLevel: 8,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      evolvesTo: ['giantSwing', 'slashThrow', 'cook', 'gardener', 'farmerEvo'],
    },

    // ── Tier 1 ─────────────────────────────────────────────
    giantSwing: {
      name: 'Giant Swing',
      evolveLevel: 15,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 3000, atkSpeed: 500, atk: 20, speed: 150 },
      scytheLengthMult: 2.0,
      evolvesTo: ['combine', 'chargeSwing', 'reaper', 'chainSickle', 'cavalry'],
    },
    slashThrow: {
      name: 'Slash Throw',
      evolveLevel: 15,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      throwRange: 300, throwWidth: 30,
      evolvesTo: ['boomerang', 'pestControl', 'waterCannon', 'fertilizerThrow', 'bigSlash'],
    },
    cook: {
      name: 'Cook',
      evolveLevel: 15,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      shieldOnHarvest: true,
      harvestHealMult: 3,
      evolvesTo: ['foodFighter', 'chineseChef', 'smoker', 'brewer', 'alchemist'],
    },
    gardener: {
      name: 'Gardener',
      evolveLevel: 15,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantTypes: ['wheat', 'hedge'],
      plantsHedge: true,
      hedgeInvisibility: true,
      evolvesTo: ['flamethrower', 'herbFarmer', 'landscaper', 'digger', 'bugKeeper'],
    },
    farmerEvo: {
      name: 'Farmer II',
      evolveLevel: 15,
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantTypes: ['wheat', 'berry'],
      evolvesTo: ['cornFarmer', 'cactusFarmer', 'flowerFarmer', 'riceFarmer', 'truck'],
    },

    // ── Tier 2: Gardener branch (farming meta / offensive) ──
    herbFarmer: {
      name: 'ハーブ農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      mintPlant: { size: 3 },
      plantsHedge: true,
      hedgeInvisibility: true,
      plantTypes: ['wheat', 'hedge', 'mint'],
      evolvesTo: [],
    },
    bugKeeper: {
      name: '虫飼い',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      bugAttach: true,
      plantsHedge: true,
      hedgeInvisibility: true,
      plantTypes: ['wheat', 'hedge', 'bug'],
      evolvesTo: [],
    },
    digger: {
      name: '穴掘り士',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantsPitTrap: true,
      plantsHedge: true,
      hedgeInvisibility: true,
      plantTypes: ['wheat', 'hedge', 'pitTrap'],
      evolvesTo: [],
    },

    // ── Tier 2: Giant Swing branch ─────────────────────────
    combine: {
      name: 'コンバイン',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 5000, atkSpeed: 500, atk: 5, speed: 150 },
      scytheLengthMult: 1.5,
      autoAttack: { blades: 3, activeDuration: 10000 },
      evolvesTo: [],
    },
    chargeSwing: {
      name: 'チャージスイング',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 1500, atkSpeed: 0, atk: 20, speed: 150 },
      scytheLengthMult: 2.0,
      chargeAttack: {
        maxCharge: 3000,
        maxMult: 2.0,
        chargeSpeedMult: 0.5,
      },
      evolvesTo: [],
    },
    reaper: {
      name: '死神',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 3000, atkSpeed: 500, atk: 20, speed: 150 },
      scytheLengthMult: 2.0,
      evolvesTo: [],
    },
    chainSickle: {
      name: '鎖鎌使い',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 3000, atkSpeed: 500, atk: 20, speed: 150 },
      scytheLengthMult: 2.0,
      pullOnHit: { distance: 40 },
      evolvesTo: [],
    },
    cavalry: {
      name: '騎兵',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 3000, atkSpeed: 500, atk: 20, speed: 150 },
      chargeRush: { maxDist: 300, speedMult: 2.0, dmgMult: 2.0, slowDuration: 2000, slowMult: 0.5, prepTime: 500 },
      evolvesTo: [],
    },
    grassCutter: {
      name: '草刈り屋',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      destroysPlants: true,
      plantsHedge: true,
      hedgeInvisibility: true,
      plantTypes: ['wheat', 'hedge'],
      evolvesTo: [],
    },
    landscaper: {
      name: '造園家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      destroysPlants: true,
      plantsPonds: true,
      plantsHedge: true,
      hedgeInvisibility: true,
      ignorePondSlow: true,
      plantTypes: ['wheat', 'hedge', 'pond', 'placedStone'],
      evolvesTo: [],
    },

    // ── Tier 2: Farmer II branch (fortress / defense) ──────
    cornFarmer: {
      name: 'コーン農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      cornInvisibility: { lingerDuration: 2000 },
      plantTypes: ['wheat', 'berry', 'corn'],
      evolvesTo: [],
    },
    pondMaker: {
      name: '灌漑農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantsPonds: true,
      plantTypes: ['wheat', 'berry', 'pond'],
      evolvesTo: [],
    },
    cactusFarmer: {
      name: 'サボテン農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantTypes: ['wheat', 'berry', 'cactus'],
      evolvesTo: [],
    },
    flowerFarmer: {
      name: '花農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantTypes: ['wheat', 'berry', 'flowerRed', 'flowerBlue', 'flowerWhite'],
      evolvesTo: [],
    },
    riceFarmer: {
      name: '米農家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantTypes: ['wheat', 'berry', 'rice'],
      ignorePondSlow: true,
      evolvesTo: [],
    },

    // ── Tier 2: Slash Throw branch ─────────────────────────
    boomerang: {
      name: '鎌ブーメラン',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      boomerangAttack: { range: 300, speed: 500, halfW: 24, lingerTime: 500 },
      evolvesTo: [],
    },
    flamethrower: {
      name: '焼畑農業',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 5000, atkSpeed: 0, atk: 5, speed: 150 },
      flameAttack: { range: 150, width: 60, duration: 10000, tickInterval: 250 },
      autoAttack: true,
      plantsHedge: true,
      hedgeInvisibility: true,
      plantTypes: ['wheat', 'hedge'],
      evolvesTo: [],
    },
    pestControl: {
      name: '害獣駆除',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      throwRange: 500, throwWidth: 30,
      evolvesTo: [],
    },
    waterCannon: {
      name: '放水',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      waterAttack: { range: 300, width: 50, pushForce: 200, growsPlants: true },
      evolvesTo: [],
    },
    fertilizerThrow: {
      name: '肥やし投げ',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      fertilizerAttack: { range: 350, explosionRadius: 50, dmgMult: 2.0 },
      evolvesTo: [],
    },
    bigSlash: {
      name: 'ビッグスラッシュ',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 4000, atkSpeed: 500, atk: 20, speed: 150 },
      throwRange: 300, throwWidth: 90,
      evolvesTo: [],
    },

    // ── Tier 2: Cook branch ────────────────────────────────
    foodFighter: {
      name: 'フードファイター',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      harvestHealMult: 10,
      hpMult: 1.5,
      evolvesTo: [],
    },
    truck: {
      name: 'トラック',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 0, atkSpeed: 0, atk: 20, speed: 150 },
      bodySlam: { dmgMult: 2.0, hitRadius: 8 },
      hpMult: 1.5,
      plantBuff: { speedMult: 1.5, atkMult: 1.5, duration: 3000 },
      harvestHealMult: 3,
      plantTypes: ['wheat', 'berry'],
      evolvesTo: [],
    },
    chineseChef: {
      name: '中華料理人',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      stunOnHit: { duration: 1000 },
      shieldOnHarvest: true,
      harvestHealMult: 3,
      plantTypes: ['wheat', 'chili'],
      evolvesTo: [],
    },
    smoker: {
      name: '燻製職人',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      passiveRegen: { hpPerSec: 6 },
      shieldOnHarvest: true,
      harvestHealMult: 3,
      plantTypes: ['wheat', 'pepper'],
      evolvesTo: [],
    },
    brewer: {
      name: '醸造家',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      harvestHealMult: 3,
      rage: { harvestsNeeded: 20, duration: 10000, speedMult: 2, atkMult: 2, regenPerSec: 10 },
      evolvesTo: [],
    },
    alchemist: {
      name: '調合師',
      base: { seedMax: 1, seedRegen: 10000, hp: 100, atkCooldown: 2000, atkSpeed: 500, atk: 20, speed: 150 },
      shieldOnHarvest: true,
      harvestHealMult: 3,
      poisonOnHit: { dps: 10, duration: 5000 },
      plantTypes: ['wheat', 'aconite'],
      evolvesTo: [],
    },
  },
  DEFAULT_CLASS: 'farmer',

  // XP / Level
  MAX_LEVEL: 50,
  XP_THRESHOLDS: _xpThresholds,

  // ─── Plant types ──────────────────────────────────────────
  PLANT_TYPES: {
    wheat: {
      id: 'wheat', growTime: 10000, hp: 30,
      harvestXp: 10, harvestHeal: 2, nurtureTaps: 10,
      seedColor: '#8B6914', sproutColor: '#2ecc71',
      matureColor: '#f1c40f', glowColor: '#f1c40f',
    },
    dandelion: {
      id: 'dandelion', growTime: 8000, hp: 15,
      harvestXp: 5, harvestHeal: 10, nurtureTaps: 0,
      seedColor: '#6B8E23', sproutColor: '#32CD32',
      matureColor: '#FFD700', glowColor: '#FFFF00',
      wild: true,
    },
    berry: {
      id: 'berry', growTime: 12000, hp: 25,
      harvestXp: 8, harvestHeal: 20, nurtureTaps: 10,
      contactDmgPerPx: 0.8,
      seedColor: '#8B0000', sproutColor: '#228B22',
      matureColor: '#DC143C', glowColor: '#FF4444',
    },
    // ── New plant types ──
    mint: {
      id: 'mint', growTime: 6000, hp: 20,
      harvestXp: 8, harvestHeal: 5, nurtureTaps: 0,
      seedColor: '#00A86B', sproutColor: '#00FF7F',
      matureColor: '#3EB489', glowColor: '#98FB98',
    },
    rice: {
      id: 'rice', growTime: 12000, hp: 25,
      harvestXp: 20, harvestHeal: 5, nurtureTaps: 10,
      waterPlant: true,  // can only grow in pond
      seedColor: '#DAA520', sproutColor: '#90EE90',
      matureColor: '#FFFACD', glowColor: '#FFE4B5',
    },
    flowerRed: {
      id: 'flowerRed', growTime: 10000, hp: 20,
      harvestXp: 8, harvestHeal: 5, nurtureTaps: 10,
      harvestBuff: { type: 'atk', mult: 1.5, duration: 5000 },
      seedColor: '#FF1493', sproutColor: '#228B22',
      matureColor: '#FF1493', glowColor: '#FF69B4',
    },
    flowerBlue: {
      id: 'flowerBlue', growTime: 10000, hp: 20,
      harvestXp: 8, harvestHeal: 5, nurtureTaps: 10,
      harvestBuff: { type: 'speed', mult: 1.5, duration: 5000 },
      seedColor: '#4169E1', sproutColor: '#228B22',
      matureColor: '#4169E1', glowColor: '#6495ED',
    },
    flowerWhite: {
      id: 'flowerWhite', growTime: 10000, hp: 20,
      harvestXp: 8, harvestHeal: 30, nurtureTaps: 10,
      seedColor: '#FFFAFA', sproutColor: '#228B22',
      matureColor: '#FFFAFA', glowColor: '#FFF5EE',
    },
    grape: {
      id: 'grape', growTime: 20000, hp: 30,
      harvestXp: 15, harvestHeal: 10, nurtureTaps: 10,
      regrowTime: 5000,  // after first harvest, stem remains → fast regrow
      seedColor: '#4B0082', sproutColor: '#228B22',
      matureColor: '#8B008B', glowColor: '#9400D3',
    },
    cactus: {
      id: 'cactus', growTime: 10000, hp: 30,
      harvestXp: 6, harvestHeal: 15, nurtureTaps: 10,
      contactDmgPerPx: 1.6,
      seedColor: '#006400', sproutColor: '#228B22',
      matureColor: '#2E8B57', glowColor: '#32CD32',
    },
    chili: {
      id: 'chili', growTime: 10000, hp: 20,
      harvestXp: 8, harvestHeal: 5, nurtureTaps: 10,
      givesShield: true,
      seedColor: '#FF4500', sproutColor: '#228B22',
      matureColor: '#FF0000', glowColor: '#FF4500',
    },
    pepper: {
      id: 'pepper', growTime: 10000, hp: 30,
      harvestXp: 10, harvestHeal: 2, nurtureTaps: 10,
      seedColor: '#2F4F4F', sproutColor: '#228B22',
      matureColor: '#696969', glowColor: '#808080',
    },
    aconite: {
      id: 'aconite', growTime: 10000, hp: 25,
      harvestXp: 8, harvestHeal: 5, nurtureTaps: 10,
      seedColor: '#4B0082', sproutColor: '#228B22',
      matureColor: '#8A2BE2', glowColor: '#9370DB',
    },
    corn: {
      id: 'corn', growTime: 10000, hp: 30,
      harvestXp: 10, harvestHeal: 5, nurtureTaps: 10,
      seedColor: '#8B7500', sproutColor: '#228B22',
      matureColor: '#DAA520', glowColor: '#FFD700',
    },
    pitTrap: {
      id: 'pitTrap', growTime: 3000, hp: 999999,
      harvestXp: 0, harvestHeal: 0, nurtureTaps: 0,
      invulnerable: true,
      trapDuration: 3000,  // ms player is stuck
      seedColor: '#654321', sproutColor: '#654321',
      matureColor: '#3a2a0a', glowColor: '#654321',
    },
    hedge: {
      id: 'hedge', growTime: 5000, hp: 80,
      harvestXp: 0, harvestHeal: 0, nurtureTaps: 0,
      impassable: true,
      seedColor: '#006400', sproutColor: '#228B22',
      matureColor: '#0B6623', glowColor: '#228B22',
    },
    placedStone: {
      id: 'placedStone', growTime: 1000, hp: 160,
      harvestXp: 0, harvestHeal: 0, nurtureTaps: 0,
      impassable: true,
      seedColor: '#777777', sproutColor: '#888888',
      matureColor: '#7a6b5a', glowColor: '#8a7b6a',
    },
  },
  DEFAULT_PLANT_TYPE: 'wheat',

  // ─── Terrain ──────────────────────────────────────────────
  TERRAIN_TYPES: {
    pond:  { speedMultiplier: 0.5, cropGrowthMultiplier: 3.0 },
    grass: { respawnTime: 60000 },
    boulder: { impassable: true },
    rock:    { impassable: true },
  },
  TERRAIN_GEN: {
    grass:   { count: 20, minSize: 3, maxSize: 4, margin: 2 },
    boulder: { count: 3, size: 3, margin: 3 },
    rock:    { count: 15, margin: 1 },
    river:   { count: 5, pondSize: { min: 10, max: 20 }, margin: 3 },
  },

  // Wild plant spawning
  WILD_SPAWN_INTERVAL: 5000,
  WILD_MAX_DANDELIONS: 30,
  WILD_SPAWN_CHANCE: 0.3,

  // PvP
  KILL_XP_REWARD_RATIO: 0.25,
  DEATH_XP_LOSS_RATIO: 0.5,
  RESPAWN_DELAY: 3000,
  INVINCIBLE_DURATION: 2000,
  REGEN_SAFE_TIME: 30000,    // 30s without damage → regen starts
  REGEN_HP_PER_SEC: 10,      // HP/sec when regen active

  // Dash (Shift, stamina-based — CD scales with level)
  DASH_DISTANCE: 100,
  DASH_DURATION: 120,
  DASH_BASE_COOLDOWN: 1000,     // 1s at level 1
  DASH_COOLDOWN_PER_LEVEL: 100, // +0.1s per level

  // Pit trap
  PIT_TRAP_STUN: 3000,

  // Input send rate (client)
  INPUT_RATE: 20,
};
