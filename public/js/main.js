'use strict';

(function () {
  const canvas = document.getElementById('game-canvas');
  const loginScreen = document.getElementById('login-screen');
  const deathScreen = document.getElementById('death-screen');
  const deathMsg = document.getElementById('death-msg');
  const hudEl = document.getElementById('hud');
  const nameInput = document.getElementById('name-input');
  const playBtn = document.getElementById('play-btn');

  const camera = new Camera(canvas);
  const renderer = new Renderer(canvas, camera);
  const gameState = new GameState();
  const input = new InputHandler(canvas);
  const network = new NetworkManager();
  const hud = new HUD();

  let running = false;
  let myId = null;
  let lastInputSend = 0;
  let prevLmb = false;
  let prevRmb = false;
  let lastAttackTime = 0;
  let evolveShown = false;
  let lastEvolveClass = null;
  let localSelectedPlant = 'wheat';
  const localSwings = {}; // playerId → { startTime, duration }

  // BGM (Web Audio API — 2 tracks, crossfade every 10 min)
  const BGM_TRACKS = ['Pikko.wav', 'Pikko2.wav'];
  const BGM_SWITCH_INTERVAL = 10 * 60 * 1000; // 10 minutes
  const BGM_FADE_DURATION = 3; // seconds
  let bgmCtx = null, bgmMasterGain = null;
  let bgmBuffers = [];
  let bgmCurrent = null; // { source, gain }
  let bgmTrackIndex = 0;
  let bgmSwitchTimer = null;
  const volumeSlider = document.getElementById('volume-slider');
  const volumeIcon = document.getElementById('volume-icon');
  let mutedVolume = 0;
  let bgmVolume = 0.3;

  function initBgm() {
    if (bgmCtx) return;
    bgmCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmMasterGain = bgmCtx.createGain();
    bgmMasterGain.gain.value = bgmVolume;
    bgmMasterGain.connect(bgmCtx.destination);
    // Load all tracks
    Promise.all(BGM_TRACKS.map(function(url) {
      return fetch(url).then(function(r) { return r.arrayBuffer(); })
        .then(function(buf) { return bgmCtx.decodeAudioData(buf); });
    })).then(function(decoded) {
      bgmBuffers = decoded;
      bgmTrackIndex = 0;
      startTrack(bgmTrackIndex);
      scheduleSwitchTrack();
    }).catch(function() {});
  }

  function startTrack(index) {
    var gain = bgmCtx.createGain();
    gain.gain.value = 0;
    gain.connect(bgmMasterGain);
    var source = bgmCtx.createBufferSource();
    source.buffer = bgmBuffers[index];
    source.loop = true;
    source.connect(gain);
    source.start(0);
    // Fade in
    gain.gain.linearRampToValueAtTime(1, bgmCtx.currentTime + BGM_FADE_DURATION);
    bgmCurrent = { source: source, gain: gain };
  }

  function scheduleSwitchTrack() {
    bgmSwitchTimer = setTimeout(function() {
      if (!bgmCtx || bgmBuffers.length < 2) return;
      var old = bgmCurrent;
      // Fade out current
      if (old) {
        old.gain.gain.linearRampToValueAtTime(0, bgmCtx.currentTime + BGM_FADE_DURATION);
        setTimeout(function() { try { old.source.stop(); } catch(e) {} }, BGM_FADE_DURATION * 1000 + 500);
      }
      // Start next track with fade in
      bgmTrackIndex = (bgmTrackIndex + 1) % bgmBuffers.length;
      startTrack(bgmTrackIndex);
      scheduleSwitchTrack();
    }, BGM_SWITCH_INTERVAL);
  }

  volumeSlider.addEventListener('input', function() {
    bgmVolume = volumeSlider.value / 100;
    if (bgmMasterGain) bgmMasterGain.gain.value = bgmVolume;
  });
  volumeIcon.addEventListener('click', function() {
    if (bgmVolume > 0) {
      mutedVolume = bgmVolume;
      bgmVolume = 0;
      volumeSlider.value = 0;
    } else {
      bgmVolume = mutedVolume || 0.3;
      volumeSlider.value = Math.round(bgmVolume * 100);
    }
    if (bgmMasterGain) bgmMasterGain.gain.value = bgmVolume;
  });

  function handleResize() { renderer.resize(); }
  window.addEventListener('resize', handleResize);
  handleResize();

  function startGame() {
    const name = nameInput.value.trim() || 'Farmer';
    input.init(); // Initialize input after user selects PC/mobile mode
    initBgm();
    network.connect();
    const waitForSocket = setInterval(() => {
      if (network.socket && network.socket.connected) {
        clearInterval(waitForSocket);
        network.join(name);
      }
    }, 50);
    const waitForId = setInterval(() => {
      if (network.myId) {
        clearInterval(waitForId);
        myId = network.myId;
        loginScreen.classList.add('hidden');
        hudEl.classList.remove('hidden');
        running = true;
        requestAnimationFrame(gameLoop);
      }
    }, 50);
  }

  playBtn.addEventListener('click', startGame);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });

  network.onState = (data) => {
    gameState.applySnapshot(data, myId);
    // Sync plant selection from server (authoritative)
    if (myId && data.players) {
      for (var pi = 0; pi < data.players.length; pi++) {
        if (data.players[pi].id === myId) {
          var serverPlant = data.players[pi].selectedPlantType;
          if (serverPlant && serverPlant !== localSelectedPlant) {
            localSelectedPlant = serverPlant;
          }
          break;
        }
      }
    }
  };
  network.onDeath = (data) => {
    deathMsg.textContent = 'Killed by ' + data.killer;
    deathScreen.classList.remove('hidden');
  };
  network.onKillfeed = (data) => { hud.addKillfeed(data.killer, data.victim); };

  function sendInput(now) {
    if (now - lastInputSend < 1000 / Constants.INPUT_RATE) return;
    lastInputSend = now;
    const state = input.getState();
    // Calculate mouse angle relative to player in world space
    const me = myId ? gameState.getInterpolatedPlayer(myId) : null;
    if (me) {
      const ps = camera.worldToScreen(me.x, me.y);
      const z = camera.zoom || 1;
      const dx = state.mx - ps.x * z;
      const dy = state.my - ps.y * z;
      state.mouseAngle = Math.atan2(dy, dx);
      state.mouseDist = Math.sqrt(dx * dx + dy * dy) / z;
    }

    // Handle plant type switching on client
    if (state.scrollDelta) {
      const me2 = myId ? gameState.players[myId] : null;
      const cls2 = me2 && Constants.CLASSES[me2.className];
      const types = cls2 && cls2.plantTypes;
      if (types && types.length > 1) {
        const idx = types.indexOf(localSelectedPlant);
        const dir = state.scrollDelta > 0 ? 1 : -1;
        const next = (idx < 0 ? 0 : idx + dir + types.length) % types.length;
        localSelectedPlant = types[next];
      }
    }
    state.selectedPlantType = localSelectedPlant;
    delete state.scrollDelta;

    network.sendInput(state);
  }

  // Skill allocation via click/tap
  hud.onSkillClick = function(idx) {
    network.sendSkill(idx);
  };

  // Plant type cycle via click/tap on seed selector
  hud.onPlantCycle = function(dir) {
    var me = myId ? gameState.players[myId] : null;
    var cls = me && Constants.CLASSES[me.className];
    var types = cls && cls.plantTypes;
    if (types && types.length > 1) {
      var idx = types.indexOf(localSelectedPlant);
      var next = (idx < 0 ? 0 : idx + dir + types.length) % types.length;
      localSelectedPlant = types[next];
    }
  };

  function processSkills() {
    const presses = input.consumeSkills();
    for (const idx of presses) {
      network.sendSkill(idx);
    }
  }

  function getMouseAngle() {
    const me = myId ? gameState.getInterpolatedPlayer(myId) : null;
    if (!me) return 0;
    const ps = camera.worldToScreen(me.x, me.y);
    const z = camera.zoom || 1;
    const ms = input.getState();
    return Math.atan2(ms.my - ps.y * z, ms.mx - ps.x * z);
  }

  function checkAttackStart() {
    // All charge/swing display is now driven by server state in the render loop.
    // Just track LMB/RMB for immediate input sends.
    const state = input.getState();
    prevLmb = state.lmb;
    prevRmb = state.rmb;
  }

  function gameLoop() {
    if (!running) return;
    const now = Date.now();

    // Send input immediately on LMB/RMB state change, throttled otherwise
    if (input.mouse.lmb !== prevLmb || input.mouse.rmb !== prevRmb) {
      lastInputSend = 0; // force immediate send
    }
    sendInput(now);
    processSkills();
    gameState.updateInterpolation();
    checkAttackStart();

    const me = myId ? gameState.getInterpolatedPlayer(myId) : null;
    if (me && me.alive) {
      camera.follow(me.x, me.y);
      // SlashThrow branch: zoom out for better range visibility
      const myCls = Constants.CLASSES[me.className];
      camera.setZoom(myCls && myCls.throwRange ? 0.8 : 1.0);
    }
    camera.update();

    renderer.clear();
    var ctx = renderer.ctx;
    var useZoom = Math.abs(camera.zoom - 1) > 0.01;
    if (useZoom) { ctx.save(); ctx.scale(camera.zoom, camera.zoom); }
    renderer.drawGrid();
    renderer.drawTerrain(gameState.terrain);
    renderer.drawBoundary();

    for (const id in gameState.plants) {
      renderer.drawPlant(gameState.plants[id]);
    }

    for (const id in gameState.players) {
      const p = gameState.getInterpolatedPlayer(id);
      if (p) {
        const cls = Constants.CLASSES[p.className];
        const isThrow = cls && cls.throwRange;
        const isMe = p.id === myId;

        // Draw charge indicator from server state (no client prediction)
        if (p.charging) {
          const chargeProg = Math.min((p.chargeElapsed || 0) / (p.chargeDuration || 500), 1);
          if (isThrow) {
            const angle = isMe ? getMouseAngle() : (p.mouseAngle || 0);
            renderer.drawChargeThrow(p, chargeProg, angle, cls.throwRange, cls.throwWidth);
          } else {
            renderer.drawChargeCircle(p, chargeProg, isMe);
          }
        }

        renderer.drawPlayer(p, isMe);

        // Combine: always-spinning 3 scythe blades (manual trig, no save/restore)
        if (p.className === 'combine' && p.combineActive) {
          const cpos = camera.worldToScreen(p.x, p.y);
          const clen = p.scytheLength || Constants.SCYTHE_LENGTH;
          const spinSpeed = Math.max((p.chargeDuration || 500) * 0.6, 60);
          const cbase = Date.now() / spinSpeed;
          const cctx = renderer.ctx;
          for (let ci = 0; ci < 3; ci++) {
            const a = cbase + ci * Math.PI * 2 / 3;
            const ax = Math.cos(a), ay = Math.sin(a);
            const px = -ay, py = ax;
            // Handle (brown stick)
            cctx.strokeStyle = '#8B4513';
            cctx.lineWidth = 4;
            cctx.beginPath();
            cctx.moveTo(cpos.x + ax * 8, cpos.y + ay * 8);
            cctx.lineTo(cpos.x + ax * (clen - 16), cpos.y + ay * (clen - 16));
            cctx.stroke();
            // Blade shaft (grey perpendicular bar at tip)
            var sx = cpos.x + ax * (clen - 12);
            var sy = cpos.y + ay * (clen - 12);
            cctx.strokeStyle = '#C0C0C0';
            cctx.lineWidth = 4;
            cctx.beginPath();
            cctx.moveTo(sx + px * 10, sy + py * 10);
            cctx.lineTo(sx - px * 10, sy - py * 10);
            cctx.stroke();
            // Blade edge (rotation-leading side)
            cctx.fillStyle = '#E0E0E0';
            cctx.beginPath();
            cctx.moveTo(sx - px * 10, sy - py * 10);
            cctx.lineTo(sx - px * 12 - ax * 14, sy - py * 12 - ay * 14);
            cctx.lineTo(sx - px * 4 - ax * 18, sy - py * 4 - ay * 18);
            cctx.lineTo(sx - ax * 6, sy - ay * 6);
            cctx.closePath();
            cctx.fill();
          }
        }

        // Flamethrower: sustained flame cone
        if (p.flaming) {
          const fpos = camera.worldToScreen(p.x, p.y);
          const fa = p.flameAngle || 0;
          const fax = Math.cos(fa), fay = Math.sin(fa);
          const fpx = -fay, fpy = fax;
          const fw = 150, fh = 60;
          const ft = Date.now() / 80;
          const fctx = renderer.ctx;
          // Outer flame
          fctx.fillStyle = '#CC3300';
          fctx.beginPath();
          fctx.moveTo(fpos.x + fax * 12 - fpx * fh * 0.35, fpos.y + fay * 12 - fpy * fh * 0.35);
          fctx.lineTo(fpos.x + fax * (12 + fw * 0.75) - fpx * fh * 0.35, fpos.y + fay * (12 + fw * 0.75) - fpy * fh * 0.35);
          fctx.lineTo(fpos.x + fax * (12 + fw * 0.75) + fpx * fh * 0.35, fpos.y + fay * (12 + fw * 0.75) + fpy * fh * 0.35);
          fctx.lineTo(fpos.x + fax * 12 + fpx * fh * 0.35, fpos.y + fay * 12 + fpy * fh * 0.35);
          fctx.fill();
          // Mid flame
          fctx.fillStyle = '#FF6600';
          fctx.beginPath();
          fctx.moveTo(fpos.x + fax * 8 - fpx * fh * 0.25, fpos.y + fay * 8 - fpy * fh * 0.25);
          fctx.lineTo(fpos.x + fax * (8 + fw * 0.55) - fpx * fh * 0.25, fpos.y + fay * (8 + fw * 0.55) - fpy * fh * 0.25);
          fctx.lineTo(fpos.x + fax * (8 + fw * 0.55) + fpx * fh * 0.25, fpos.y + fay * (8 + fw * 0.55) + fpy * fh * 0.25);
          fctx.lineTo(fpos.x + fax * 8 + fpx * fh * 0.25, fpos.y + fay * 8 + fpy * fh * 0.25);
          fctx.fill();
          // Inner flame
          fctx.fillStyle = '#FFCC00';
          fctx.beginPath();
          fctx.moveTo(fpos.x + fax * 4 - fpx * fh * 0.12, fpos.y + fay * 4 - fpy * fh * 0.12);
          fctx.lineTo(fpos.x + fax * (4 + fw * 0.35) - fpx * fh * 0.12, fpos.y + fay * (4 + fw * 0.35) - fpy * fh * 0.12);
          fctx.lineTo(fpos.x + fax * (4 + fw * 0.35) + fpx * fh * 0.12, fpos.y + fay * (4 + fw * 0.35) + fpy * fh * 0.12);
          fctx.lineTo(fpos.x + fax * 4 + fpx * fh * 0.12, fpos.y + fay * 4 + fpy * fh * 0.12);
          fctx.fill();
          // Flickering particles
          fctx.fillStyle = '#FF4500';
          for (var fj = 0; fj < 8; fj++) {
            var pfx = 20 + ((ft * 3 + fj * 31) % (fw * 0.7));
            var pfy = Math.sin(ft + fj * 1.7) * fh * 0.3;
            var wx = fpos.x + fax * pfx + fpx * pfy;
            var wy = fpos.y + fay * pfx + fpy * pfy;
            fctx.fillRect(wx - 3, wy - 3, 6, 6);
          }
        }

        // Cavalry charge rush indicator
        if (p.cavalryCharging) {
          var cvpos = camera.worldToScreen(p.x, p.y);
          var cva = p.cavalryAngle || 0;
          var cvax = Math.cos(cva), cvay = Math.sin(cva);
          var cvctx = renderer.ctx;
          // Rush trail (red line behind)
          cvctx.strokeStyle = 'rgba(255,30,30,0.6)';
          cvctx.lineWidth = 6;
          cvctx.beginPath();
          cvctx.moveTo(cvpos.x - cvax * 30, cvpos.y - cvay * 30);
          cvctx.lineTo(cvpos.x + cvax * 20, cvpos.y + cvay * 20);
          cvctx.stroke();
          // Direction arrow
          cvctx.fillStyle = 'rgba(255,60,60,0.8)';
          cvctx.beginPath();
          cvctx.moveTo(cvpos.x + cvax * 25, cvpos.y + cvay * 25);
          cvctx.lineTo(cvpos.x + cvax * 15 - cvay * 8, cvpos.y + cvay * 15 + cvax * 8);
          cvctx.lineTo(cvpos.x + cvax * 15 + cvay * 8, cvpos.y + cvay * 15 - cvax * 8);
          cvctx.fill();
        }

        // Draw post-hit swing animation (server-triggered, client-interpolated)
        if (!isThrow && p.className !== 'combine') {
          if (p.swinging && !localSwings[p.id]) {
            // Server says swing started — record local start time for smooth animation
            localSwings[p.id] = { startTime: Date.now() - (p.swingElapsed || 0), duration: p.swingDuration || 300 };
          } else if (!p.swinging) {
            delete localSwings[p.id];
          }
          var ls = localSwings[p.id];
          if (ls) {
            var swingProg = (Date.now() - ls.startTime) / ls.duration;
            if (swingProg >= 1) {
              delete localSwings[p.id];
            } else {
              var sAngle = swingProg * Math.PI * 2;
              var spos = camera.worldToScreen(p.x, p.y);
              var slen = p.scytheLength || Constants.SCYTHE_LENGTH;
              var sax = Math.cos(sAngle), say = Math.sin(sAngle);
              var spx = -say, spy = sax;
              var sctx = renderer.ctx;
              sctx.strokeStyle = '#8B4513';
              sctx.lineWidth = 4;
              sctx.beginPath();
              sctx.moveTo(spos.x + sax * 8, spos.y + say * 8);
              sctx.lineTo(spos.x + sax * (slen - 16), spos.y + say * (slen - 16));
              sctx.stroke();
              var bsx = spos.x + sax * (slen - 12);
              var bsy = spos.y + say * (slen - 12);
              sctx.strokeStyle = '#C0C0C0';
              sctx.lineWidth = 4;
              sctx.beginPath();
              sctx.moveTo(bsx + spx * 10, bsy + spy * 10);
              sctx.lineTo(bsx - spx * 10, bsy - spy * 10);
              sctx.stroke();
              sctx.fillStyle = '#E0E0E0';
              sctx.beginPath();
              sctx.moveTo(bsx - spx * 10, bsy - spy * 10);
              sctx.lineTo(bsx - spx * 12 - sax * 14, bsy - spy * 12 - say * 14);
              sctx.lineTo(bsx - spx * 4 - sax * 18, bsy - spy * 4 - say * 18);
              sctx.lineTo(bsx - sax * 6, bsy - say * 6);
              sctx.closePath();
              sctx.fill();
            }
          }
        }
      }
    }

    // Draw projectiles with client-side extrapolation for smooth movement
    renderer.drawProjectiles(gameState.getInterpolatedProjectiles());

    if (useZoom) ctx.restore(); // end zoom scaling

    const rawMe = myId ? gameState.players[myId] : null;
    if (rawMe) rawMe.selectedPlantType = localSelectedPlant;
    hud.updatePlayer(rawMe);
    hud.updateLeaderboard(gameState.leaderboard);
    renderer.drawMinimap(gameState.players, myId, gameState.terrain, gameState.leaderboard);

    // Evolution UI (dynamic for all tiers)
    const evolvePanel = document.getElementById('evolve-panel');
    if (rawMe) {
      const cls = Constants.CLASSES[rawMe.className];
      const canEvolve = cls && cls.evolvesTo && cls.evolvesTo.length > 0 &&
                        cls.evolveLevel && rawMe.level >= cls.evolveLevel;
      if (canEvolve && lastEvolveClass !== rawMe.className) {
        buildEvolvePanel(cls.evolvesTo);
        lastEvolveClass = rawMe.className;
        evolveShown = false;
      }
      if (canEvolve && !evolveShown) {
        evolvePanel.classList.remove('hidden');
      } else if (!canEvolve) {
        evolvePanel.classList.add('hidden');
      }
    }

    requestAnimationFrame(gameLoop);
  }

  // Build evolve panel buttons dynamically
  const evolvePanel = document.getElementById('evolve-panel');
  function buildEvolvePanel(options) {
    evolvePanel.innerHTML = '';
    options.forEach(function(clsKey) {
      const cls = Constants.CLASSES[clsKey];
      if (!cls) return;
      const btn = document.createElement('button');
      btn.className = 'evolve-btn';
      btn.innerHTML = '<strong>' + cls.name + '</strong><br><span>' + (cls.desc || '') + '</span>';
      btn.addEventListener('click', function() {
        network.sendEvolve(clsKey);
        evolvePanel.classList.add('hidden');
        evolveShown = true;
        localSelectedPlant = 'wheat';
      });
      evolvePanel.appendChild(btn);
    });
  }
  // Build initial tier-1 options
  buildEvolvePanel(Constants.CLASSES.farmer.evolvesTo);

  // Reset evolve state on death
  network.onRespawn = () => {
    deathScreen.classList.add('hidden');
    evolveShown = false;
  };
})();
