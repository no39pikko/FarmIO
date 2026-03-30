'use strict';

class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = { up: false, down: false, left: false, right: false, shift: false };
    this.mouse = { lmb: false, rmb: false, x: 0, y: 0 };
    this.pendingSkills = [];
    this.scrollDelta = 0;
    this.isMobile = false;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    var forcePc = document.getElementById('force-pc-mode');
    var hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    this.isMobile = !(forcePc && forcePc.checked) && !hasFinePointer && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (this.isMobile) {
      this._initMobile(this.canvas);
    } else {
      this._initPC(this.canvas);
    }
  }

  _initPC(canvas) {
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this._scrollCooldown) return;
      this.scrollDelta = e.deltaY > 0 ? 1 : -1;
      this._scrollCooldown = true;
      var self = this;
      setTimeout(function() { self._scrollCooldown = false; }, 200);
    }, { passive: false });
  }

  _initMobile(canvas) {
    // Show mobile UI
    var mobileUI = document.getElementById('mobile-ui');
    if (mobileUI) mobileUI.classList.remove('hidden');

    // Prevent ALL default touch behaviors (zoom, scroll, etc)
    document.addEventListener('touchstart', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('touchend', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
    }, { passive: false });

    // ── Virtual Joystick (left side) ──
    var joystickZone = document.getElementById('joystick-zone');
    if (joystickZone && typeof nipplejs !== 'undefined') {
      var joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        position: { left: '50%', top: '50%' },
        color: 'rgba(255,255,255,0.3)',
        size: 120,
      });
      var self = this;
      joystick.on('move', function(evt, data) {
        var angle = data.angle.radian;
        var force = Math.min(data.force, 1);
        if (force < 0.2) {
          self.keys.up = self.keys.down = self.keys.left = self.keys.right = false;
          return;
        }
        // Convert angle to WASD (nipplejs: 0=right, pi/2=up, pi=left, 3pi/2=down)
        self.keys.right = angle < Math.PI / 4 || angle > 7 * Math.PI / 4;
        self.keys.up = angle > Math.PI / 4 && angle < 3 * Math.PI / 4;
        self.keys.left = angle > 3 * Math.PI / 4 && angle < 5 * Math.PI / 4;
        self.keys.down = angle > 5 * Math.PI / 4 && angle < 7 * Math.PI / 4;
      });
      joystick.on('end', function() {
        self.keys.up = self.keys.down = self.keys.left = self.keys.right = false;
      });
    }

    // ── Attack Zone (right side) ──
    var attackZone = document.getElementById('attack-zone');
    if (attackZone) {
      var self = this;
      attackZone.addEventListener('touchstart', function(e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        self.mouse.lmb = true;
        self.mouse.x = t.clientX;
        self.mouse.y = t.clientY;
      }, { passive: false });
      attackZone.addEventListener('touchmove', function(e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        self.mouse.x = t.clientX;
        self.mouse.y = t.clientY;
      }, { passive: false });
      attackZone.addEventListener('touchend', function(e) {
        e.preventDefault();
        self.mouse.lmb = false;
      }, { passive: false });
    }

    // ── Plant Button ──
    var plantBtn = document.getElementById('mobile-plant-btn');
    if (plantBtn) {
      var self = this;
      plantBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        self.mouse.rmb = true;
      }, { passive: false });
      plantBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        self.mouse.rmb = false;
      }, { passive: false });
    }

    // ── Dash Button ──
    var dashBtn = document.getElementById('mobile-dash-btn');
    if (dashBtn) {
      var self = this;
      dashBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        self.keys.shift = true;
      }, { passive: false });
      dashBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        self.keys.shift = false;
      }, { passive: false });
    }

    // ── Seed Selector (tap to cycle) ──
    var seedSelector = document.getElementById('seed-selector');
    if (seedSelector) {
      var self = this;
      seedSelector.addEventListener('click', function() {
        self.scrollDelta += 100; // simulate scroll to cycle
      });
    }
  }

  onKey(e, down) {
    switch (e.key.toLowerCase()) {
      case 'w': this.keys.up = down; break;
      case 's': this.keys.down = down; break;
      case 'a': this.keys.left = down; break;
      case 'd': this.keys.right = down; break;
      case 'shift': this.keys.shift = down; break;
    }
    if (down && e.key >= '1' && e.key <= '7') {
      this.pendingSkills.push(parseInt(e.key) - 1);
    }
  }

  consumeSkills() {
    var s = this.pendingSkills;
    this.pendingSkills = [];
    return s;
  }

  onMouseDown(e) {
    if (e.button === 0) this.mouse.lmb = true;
    if (e.button === 2) this.mouse.rmb = true;
  }

  onMouseUp(e) {
    if (e.button === 0) this.mouse.lmb = false;
    if (e.button === 2) this.mouse.rmb = false;
  }

  onMouseMove(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  getState() {
    var sd = this.scrollDelta;
    this.scrollDelta = 0;
    return {
      up: this.keys.up,
      down: this.keys.down,
      left: this.keys.left,
      right: this.keys.right,
      shift: this.keys.shift,
      lmb: this.mouse.lmb,
      rmb: this.mouse.rmb,
      mx: this.mouse.x,
      my: this.mouse.y,
      scrollDelta: sd,
    };
  }
}
