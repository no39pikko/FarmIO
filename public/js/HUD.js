'use strict';

class HUD {
  constructor() {
    this.hpBar = document.getElementById('hp-bar');
    this.hpText = document.getElementById('hp-text');
    this.xpBar = document.getElementById('xp-bar');
    this.xpText = document.getElementById('xp-text');
    this.levelText = document.getElementById('level-text');
    this.seedBar = document.getElementById('seed-bar');
    this.seedText = document.getElementById('seed-text');
    this.lbList = document.getElementById('lb-list');
    this.killfeed = document.getElementById('killfeed');
    this.skillPanel = document.getElementById('skill-panel');
    this.spText = document.getElementById('sp-text');

    this.blinkBar = document.getElementById('blink-bar');
    this.blinkText = document.getElementById('blink-text');

    this.seedSelector = document.getElementById('seed-selector');
    this.seedSelectorLabel = document.getElementById('seed-selector-label');
    this.onPlantCycle = null; // callback set by main.js

    // Click/tap seed selector to cycle plant type
    if (this.seedSelector) {
      var self = this;
      this.seedSelector.style.cursor = 'pointer';
      this.seedSelector.style.userSelect = 'none';
      this.seedSelector.addEventListener('click', function() {
        if (self.onPlantCycle) self.onPlantCycle(1);
      });
      this.seedSelector.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (self.onPlantCycle) self.onPlantCycle(-1);
      });
    }

    this.skillRows = [];
    // buildSkillPanel called from main.js after input.init() determines isMobile
  }

  buildSkillPanel(isMobile) {
    this.onSkillClick = null;
    this._isMobile = isMobile;
    // Mobile: move skill panel to bottom-left, compact
    if (isMobile) {
      var wrapper = document.getElementById('skill-wrapper');
      if (wrapper) {
        wrapper.style.left = '8px';
        wrapper.style.bottom = '8px';
        wrapper.style.padding = '4px 6px';
        wrapper.style.fontSize = '11px';
      }
    }
    for (let i = 0; i < Constants.SKILL_NAMES.length; i++) {
      const row = document.createElement('div');
      row.className = isMobile ? 'skill-row-mobile' : 'skill-row';
      row.style.cursor = 'pointer';
      row.style.userSelect = 'none';

      const idx = i;
      row.addEventListener('click', () => {
        if (this.onSkillClick) this.onSkillClick(idx);
      });

      if (isMobile) {
        // Mobile: compact "Label: 0" format
        const label = document.createElement('span');
        label.className = 'skill-mobile-label';
        label.textContent = Constants.SKILL_LABELS[i];
        const val = document.createElement('span');
        val.className = 'skill-mobile-val';
        val.textContent = '0';
        row.appendChild(label);
        row.appendChild(val);
        this.skillPanel.appendChild(row);
        this.skillRows.push({ row, valEl: val });
      } else {
        // PC: key + label + block gauge
        const key = document.createElement('span');
        key.className = 'skill-key';
        key.textContent = (i + 1);

        const label = document.createElement('span');
        label.className = 'skill-label';
        label.textContent = Constants.SKILL_LABELS[i];

        const blocks = document.createElement('span');
        blocks.className = 'skill-blocks';
        for (let j = 0; j < Constants.SKILL_MAX; j++) {
          const b = document.createElement('span');
          b.className = 'skill-block empty';
          blocks.appendChild(b);
        }

        row.appendChild(key);
        row.appendChild(label);
        row.appendChild(blocks);
        this.skillPanel.appendChild(row);
        this.skillRows.push({ row, blocks });
      }
    }
  }

  updatePlayer(player) {
    if (!player) return;

    // HP
    const hpPct = (player.hp / player.maxHp) * 100;
    this.hpBar.style.width = hpPct + '%';
    this.hpText.textContent = player.hp + ' / ' + player.maxHp;

    // XP
    const xpCur = player.xp;
    // Approximate thresholds on client (same 1.2x formula)
    const curThresh = this._xpThreshold(player.level);
    const nextThresh = this._xpThreshold(player.level + 1);
    const xpInLevel = xpCur - curThresh;
    const xpNeeded = nextThresh - curThresh;
    const xpPct = xpNeeded > 0 ? (xpInLevel / xpNeeded) * 100 : 100;
    this.xpBar.style.width = Math.min(xpPct, 100) + '%';
    this.xpText.textContent = xpCur + ' XP';

    // Level
    this.levelText.textContent = 'Lv.' + player.level;

    // Brewer harvest counter
    if (player.className === 'brewer') {
      const count = player.rageHarvestCount || 0;
      if (player.raging) {
        this.levelText.textContent += '  RAGE!';
      } else {
        this.levelText.textContent += '  Harvest ' + count + '/20';
      }
    }

    // Seeds
    const full = player.seeds || 0;
    const max = player.maxSeeds || 1;
    const regenPct = player.seedRegenPct || 0;
    const seedPct = ((full + (full < max ? regenPct : 0)) / max) * 100;
    this.seedBar.style.width = Math.min(seedPct, 100) + '%';
    this.seedText.textContent = full + ' / ' + max + ' Seeds';

    // Blink stamina
    var blinkPct = (player.blinkCdPct || 0) * 100;
    this.blinkBar.style.width = Math.min(blinkPct, 100) + '%';
    this.blinkBar.style.background = blinkPct >= 100 ? '#3498db' : '#2070aa';
    this.blinkText.textContent = blinkPct >= 100 ? 'Blink Ready' : 'Blink';

    // Skill points
    const sp = player.skillPoints || 0;
    this.spText.textContent = sp > 0 ? 'SP: ' + sp : '';
    this.spText.style.display = sp > 0 ? 'block' : 'none';

    // Seed selector (classes with multiple plant types)
    const plantType = player.selectedPlantType || 'wheat';
    const cls = Constants.CLASSES[player.className];
    const plantTypes = cls && cls.plantTypes;
    if (plantTypes && plantTypes.length > 1) {
      this.seedSelector.classList.remove('hidden');
      const typeInfo = Constants.PLANT_TYPES[plantType];
      const labels = {
        wheat: 'Wheat', berry: 'Berry', mint: 'Mint',
        bug: 'Bug', pond: 'Pond', pitTrap: 'Pit Trap', hedge: 'Hedge', placedStone: 'Stone',
        chili: 'Chili', pepper: 'Pepper', rice: 'Rice', corn: 'Corn', aconite: 'Aconite',
        grape: 'Grape', cactus: 'Cactus',
        flowerRed: 'Red Flower (ATK)', flowerBlue: 'Blue Flower (SPD)', flowerWhite: 'White Flower (HEAL)',
      };
      const label = labels[plantType] || plantType;
      const color = typeInfo ? typeInfo.matureColor : '#f1c40f';
      this.seedSelectorLabel.textContent = label;
      this.seedSelectorLabel.style.color = color;
      this.seedSelector.style.borderColor = color;
    } else {
      this.seedSelector.classList.add('hidden');
    }

    // Skill bars
    const skills = player.skills || {};
    const names = Constants.SKILL_NAMES;
    for (let i = 0; i < names.length; i++) {
      const val = skills[names[i]] || 0;
      const sr = this.skillRows[i];

      if (this._isMobile) {
        // Mobile: update number
        sr.valEl.textContent = val;
        if (sp > 0 && val < Constants.SKILL_MAX) {
          sr.row.classList.add('upgradeable');
        } else {
          sr.row.classList.remove('upgradeable');
        }
        continue;
      }

      const blockEls = sr.blocks.children;
      for (let j = 0; j < Constants.SKILL_MAX; j++) {
        blockEls[j].className = 'skill-block ' + (j < val ? 'filled' : 'empty');
      }
      // Highlight upgradeable
      if (sp > 0 && val < Constants.SKILL_MAX) {
        sr.row.classList.add('upgradeable');
      } else {
        this.skillRows[i].row.classList.remove('upgradeable');
      }
    }
  }

  _xpThreshold(level) {
    if (level <= 1) return 0;
    let cum = 0, per = 30;
    for (let lv = 2; lv <= level; lv++) {
      cum += Math.floor(per);
      per *= 1.2;
    }
    return cum;
  }

  updateLeaderboard(leaderboard) {
    this.lbList.innerHTML = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + entry.name + ' (Lv' + entry.level + ') ' + entry.xp + 'xp';
      this.lbList.appendChild(li);
    }
  }

  addKillfeed(killer, victim) {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.textContent = killer + ' killed ' + victim;
    this.killfeed.appendChild(msg);
    setTimeout(() => {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 4500);
    while (this.killfeed.children.length > 5) {
      this.killfeed.removeChild(this.killfeed.firstChild);
    }
  }
}
