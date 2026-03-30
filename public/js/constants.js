'use strict';

const Constants = {
  MAP_WIDTH: 4000,
  MAP_HEIGHT: 4000,
  GRID_SIZE: 64,
  PLAYER_SIZE: 24,
  PLAYER_ATK_RANGE: 50,
  SCYTHE_LENGTH: 50,
  SWING_ANIM_DURATION: 300,
  INPUT_RATE: 20,
  INVINCIBLE_DURATION: 2000,

  SKILL_MAX: 8,
  SKILL_NAMES: ['seedRegen', 'hp', 'atkCooldown', 'atkSpeed', 'atk', 'speed'],
  SKILL_LABELS: ['Seed Regen', 'HP', 'Cooldown', 'Atk Speed', 'Attack', 'Speed'],

  PLANT_TYPES: {
    wheat:      { seedColor: '#8B6914', sproutColor: '#2ecc71', matureColor: '#f1c40f', glowColor: '#f1c40f' },
    dandelion:  { seedColor: '#6B8E23', sproutColor: '#32CD32', matureColor: '#FFD700', glowColor: '#FFFF00' },
    berry:      { seedColor: '#8B0000', sproutColor: '#228B22', matureColor: '#DC143C', glowColor: '#FF4444' },
    mint:       { seedColor: '#00A86B', sproutColor: '#00FF7F', matureColor: '#3EB489', glowColor: '#98FB98' },
    rice:       { seedColor: '#DAA520', sproutColor: '#90EE90', matureColor: '#FFFACD', glowColor: '#FFE4B5' },
    flowerRed:  { seedColor: '#FF1493', sproutColor: '#228B22', matureColor: '#FF1493', glowColor: '#FF69B4' },
    flowerBlue: { seedColor: '#4169E1', sproutColor: '#228B22', matureColor: '#4169E1', glowColor: '#6495ED' },
    flowerWhite:{ seedColor: '#FFFAFA', sproutColor: '#228B22', matureColor: '#FFFAFA', glowColor: '#FFF5EE' },
    grape:      { seedColor: '#4B0082', sproutColor: '#228B22', matureColor: '#8B008B', glowColor: '#9400D3' },
    cactus:     { seedColor: '#006400', sproutColor: '#228B22', matureColor: '#2E8B57', glowColor: '#32CD32' },
    chili:      { seedColor: '#FF4500', sproutColor: '#228B22', matureColor: '#FF0000', glowColor: '#FF4500' },
    pepper:     { seedColor: '#2F4F4F', sproutColor: '#228B22', matureColor: '#696969', glowColor: '#808080' },
    pitTrap:    { seedColor: '#654321', sproutColor: '#654321', matureColor: '#3a2a0a', glowColor: '#654321' },
    hedge:      { seedColor: '#006400', sproutColor: '#228B22', matureColor: '#0B6623', glowColor: '#228B22' },
    aconite:    { seedColor: '#4B0082', sproutColor: '#228B22', matureColor: '#8A2BE2', glowColor: '#9370DB' },
    corn:       { seedColor: '#8B7500', sproutColor: '#228B22', matureColor: '#DAA520', glowColor: '#FFD700' },
    placedStone:{ seedColor: '#777777', sproutColor: '#888888', matureColor: '#7a6b5a', glowColor: '#8a7b6a' },
  },

  CLASSES: {
    // Base
    farmer:      { name: 'Farmer',       desc: 'Base class', evolveLevel: 8,
                   evolvesTo: ['giantSwing', 'slashThrow', 'cook', 'gardener', 'farmerEvo'] },
    // Tier 1
    giantSwing:  { name: 'Giant Swing',  desc: '2x scythe range / longer CD', evolveLevel: 15,
                   evolvesTo: ['combine', 'chargeSwing', 'reaper', 'chainSickle', 'cavalry'] },
    slashThrow:  { name: 'Slash Throw',  desc: 'Ranged slash projectile', throwRange: 300, evolveLevel: 15,
                   evolvesTo: ['boomerang', 'pestControl', 'waterCannon', 'fertilizerThrow', 'bigSlash'] },
    cook:        { name: 'Cook',         desc: '3 harvests = shield / 3x heal', evolveLevel: 15,
                   evolvesTo: ['foodFighter', 'chineseChef', 'smoker', 'brewer', 'alchemist'] },
    gardener:    { name: 'Gardener',     desc: 'Plant hedges / hide in hedges', evolveLevel: 15, plantTypes: ['wheat', 'hedge'],
                   evolvesTo: ['flamethrower', 'herbFarmer', 'landscaper', 'digger', 'bugKeeper'] },
    farmerEvo:   { name: 'Farmer II',    desc: 'Buff on plants / berry / 3x heal', evolveLevel: 15, plantTypes: ['wheat', 'berry'],
                   evolvesTo: ['cornFarmer', 'cactusFarmer', 'flowerFarmer', 'riceFarmer', 'truck'] },
    // Tier 2: Gardener (farming meta / offensive)
    herbFarmer:  { name: 'Herb Farmer',  desc: '3x3 mint field + hedge stealth', plantTypes: ['wheat', 'hedge', 'mint'] },
    bugKeeper:   { name: 'Bug Keeper',   desc: 'Infest plants + hedge stealth', plantTypes: ['wheat', 'hedge', 'bug'] },
    digger:      { name: 'Digger',       desc: 'Pit traps + hedge stealth', plantTypes: ['wheat', 'hedge', 'pitTrap'] },
    flamethrower:{ name: 'Flamethrower', desc: '10s flame burst + hedge stealth', autoAttack: true, plantTypes: ['wheat', 'hedge'] },
    landscaper:  { name: 'Landscaper',   desc: 'Ponds+stones+hedges / destroy on harvest', plantTypes: ['wheat', 'hedge', 'pond', 'placedStone'] },
    grassCutter: { name: 'Grass Cutter', desc: 'Destroy plants on hit + hedge stealth', plantTypes: ['wheat', 'hedge'] },
    // Tier 2: Giant Swing
    combine:     { name: 'Combine',      desc: '3 spinning blades (auto-attack)', autoAttack: true },
    chargeSwing: { name: 'Charge Swing', desc: 'Hold to charge, up to 2x damage', chargeAttack: true },
    reaper:      { name: 'Reaper',       desc: 'Invisible while still on plants' },
    chainSickle: { name: 'Chain Sickle', desc: 'Pull enemy on hit' },
    cavalry:     { name: 'Cavalry',      desc: 'Charge rush (2x speed & dmg, slow after)' },
    // Tier 2: Farmer II (fortress / defense)
    cornFarmer:  { name: 'Corn Farmer',  desc: 'Invisible in corn (2s linger)', plantTypes: ['wheat', 'berry', 'corn'] },
    pondMaker:   { name: 'Irrigator',    desc: 'Place ponds', plantTypes: ['wheat', 'berry', 'pond'] },
    cactusFarmer:{ name: 'Cactus Farmer',desc: 'Cactus: 2x berry contact dmg', plantTypes: ['wheat', 'berry', 'cactus'] },
    flowerFarmer:{ name: 'Flower Farmer',desc: '3 buff flowers (atk/speed/heal)', plantTypes: ['wheat', 'berry', 'flowerRed', 'flowerBlue', 'flowerWhite'] },
    riceFarmer:  { name: 'Rice Farmer',  desc: 'Rice on ponds & land (mud slows)', plantTypes: ['wheat', 'berry', 'rice'] },
    // Tier 2: Slash Throw
    boomerang:   { name: 'Boomerang',    desc: 'Pierce > linger > return (hits both ways)', throwRange: 300 },
    pestControl: { name: 'Pest Control', desc: 'Ultra-range fast slash', throwRange: 500 },
    waterCannon: { name: 'Water Cannon', desc: 'Push back + grow plants', throwRange: 300 },
    fertilizerThrow: { name: 'Fertilizer', desc: 'Explodes on impact (2x dmg)', throwRange: 350 },
    bigSlash:    { name: 'Big Slash',    desc: '3x width slash / 2x CD', throwRange: 300, throwWidth: 90 },
    // Tier 2: Cook
    foodFighter: { name: 'Food Fighter', desc: '10x harvest heal + 1.5x HP' },
    truck:       { name: 'Truck',        desc: 'Body slam (2x on farm) + 1.5x HP', bodySlam: true, plantTypes: ['wheat', 'berry'] },
    chineseChef: { name: 'Wok Master',   desc: 'Stun attack + shield', plantTypes: ['wheat', 'chili'] },
    smoker:      { name: 'Smoker',       desc: 'HP regen + shield + pepper', plantTypes: ['wheat', 'pepper'] },
    brewer:      { name: 'Brewer',       desc: '20 harvests = rage (10s all x2)' },
    alchemist:   { name: 'Alchemist',    desc: 'Poison attack + shield + aconite', plantTypes: ['wheat', 'aconite'] },
  },

  TERRAIN_COLORS: {
    pond:    { fill: 'rgba(30,100,180,0.5)', minimapColor: '#1a6baa' },
    grass:   { fill: 'rgba(34,139,34,0.45)', minimapColor: '#228B22' },
    boulder: { fill: '#5a5a5a', minimapColor: '#555555' },
    rock:    { fill: '#4a4a4a', minimapColor: '#444444' },
  },
};
