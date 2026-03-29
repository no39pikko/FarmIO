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
  SKILL_LABELS: ['種回復', '体力', 'CD短縮', '攻撃速度', '攻撃力', '移動速度'],

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
    farmer:      { name: 'Farmer',       desc: '基本クラス', evolveLevel: 8,
                   evolvesTo: ['giantSwing', 'slashThrow', 'cook', 'gardener', 'farmerEvo'] },
    // Tier 1
    giantSwing:  { name: 'Giant Swing',  desc: '鎌のリーチ2倍/CD長め', evolveLevel: 15,
                   evolvesTo: ['combine', 'chargeSwing', 'reaper', 'chainSickle', 'cavalry'] },
    slashThrow:  { name: 'Slash Throw',  desc: '斬撃を遠距離に飛ばす', throwRange: 300, evolveLevel: 15,
                   evolvesTo: ['boomerang', 'pestControl', 'waterCannon', 'fertilizerThrow', 'bigSlash'] },
    cook:        { name: 'Cook',         desc: '収穫3回でシールド/回復3倍', evolveLevel: 15,
                   evolvesTo: ['foodFighter', 'chineseChef', 'smoker', 'brewer', 'alchemist'] },
    gardener:    { name: 'Gardener',     desc: '生け垣設置/生け垣内で隠密', evolveLevel: 15, plantTypes: ['wheat', 'hedge'],
                   evolvesTo: ['flamethrower', 'herbFarmer', 'landscaper', 'digger', 'bugKeeper'] },
    farmerEvo:   { name: 'Farmer II',    desc: '植物上でバフ/ベリー設置/回復3倍', evolveLevel: 15, plantTypes: ['wheat', 'berry'],
                   evolvesTo: ['cornFarmer', 'cactusFarmer', 'flowerFarmer', 'riceFarmer', 'truck'] },
    // Tier 2: Gardener (farming meta / offensive)
    herbFarmer:  { name: 'ハーブ農家',    desc: '3x3ミント+生け垣隠密', plantTypes: ['wheat', 'hedge', 'mint'] },
    bugKeeper:   { name: '虫飼い',       desc: '植物に虫付け+生け垣隠密', plantTypes: ['wheat', 'hedge', 'bug'] },
    digger:      { name: '穴掘り士',     desc: '落とし穴+生け垣隠密', plantTypes: ['wheat', 'hedge', 'pitTrap'] },
    flamethrower:{ name: '焼畑農業',    desc: '10秒火炎放射+生け垣隠密', autoAttack: true, plantTypes: ['wheat', 'hedge'] },
    landscaper:  { name: '造園家',      desc: '池+石+生け垣/収穫で植物破壊/水上等速', plantTypes: ['wheat', 'hedge', 'pond', 'placedStone'] },
    grassCutter: { name: '草刈り屋',     desc: '攻撃で植物破壊+生け垣隠密', plantTypes: ['wheat', 'hedge'] },
    // Tier 2: Giant Swing
    combine:     { name: 'コンバイン',    desc: '3枚の刃が常時回転', autoAttack: true },
    chargeSwing: { name: 'チャージスイング', desc: '長押しチャージで最大2倍', chargeAttack: true },
    reaper:      { name: '死神',         desc: '植物上で停止中に透明化' },
    chainSickle: { name: '鎖鎌使い',     desc: '攻撃ヒット時に引き寄せ' },
    cavalry:     { name: '騎兵',        desc: '突進攻撃(速度2倍/攻撃2倍/突進後減速)' },
    // Tier 2: Farmer II (fortress / defense)
    cornFarmer:  { name: 'コーン農家',   desc: 'コーン内で透明(離脱後2秒持続)', plantTypes: ['wheat', 'berry', 'corn'] },
    pondMaker:   { name: '灌漑農家',     desc: '池を設置', plantTypes: ['wheat', 'berry', 'pond'] },
    cactusFarmer:{ name: 'サボテン農家', desc: 'ベリー2倍ダメージのサボテン設置', plantTypes: ['wheat', 'berry', 'cactus'] },
    flowerFarmer:{ name: '花農家',       desc: '3色バフ花(攻撃/速度/回復)', plantTypes: ['wheat', 'berry', 'flowerRed', 'flowerBlue', 'flowerWhite'] },
    riceFarmer:  { name: '米農家',       desc: '池に米/池を通常速度で通過', plantTypes: ['wheat', 'berry', 'rice'] },
    // Tier 2: Slash Throw
    boomerang:   { name: '鎌ブーメラン', desc: '貫通→滞留→帰還(往復判定)', throwRange: 300 },
    pestControl: { name: '害獣駆除',    desc: '高速・長射程の強化スラッシュ', throwRange: 500 },
    waterCannon: { name: '放水',        desc: '水流で押し返し+植物育成', throwRange: 300 },
    fertilizerThrow: { name: '肥やし投げ', desc: '着弾で爆発する肥やし', throwRange: 350 },
    bigSlash:    { name: 'ビッグスラッシュ', desc: '幅3倍の大斬撃/CD2倍', throwRange: 300, throwWidth: 90 },
    // Tier 2: Cook
    foodFighter: { name: 'フードファイター', desc: '収穫回復10倍+HP1.5倍' },
    truck:       { name: 'トラック',     desc: '体当たり(農地で1.5倍)+HP1.5倍', bodySlam: true, plantTypes: ['wheat', 'berry'] },
    chineseChef: { name: '中華料理人',   desc: 'スタン攻撃+シールド', plantTypes: ['wheat', 'chili'] },
    smoker:      { name: '燻製職人',     desc: 'HP回復+シールド+胡椒設置', plantTypes: ['wheat', 'pepper'] },
    brewer:      { name: '醸造家',       desc: '20収穫で酒乱(10秒全能力2倍)' },
    alchemist:   { name: '調合師',     desc: '毒攻撃+シールド+トリカブト', plantTypes: ['wheat', 'aconite'] },
  },

  TERRAIN_COLORS: {
    pond:    { fill: 'rgba(30,100,180,0.5)', minimapColor: '#1a6baa' },
    grass:   { fill: 'rgba(34,139,34,0.45)', minimapColor: '#228B22' },
    boulder: { fill: '#5a5a5a', minimapColor: '#555555' },
    rock:    { fill: '#4a4a4a', minimapColor: '#444444' },
  },
};
