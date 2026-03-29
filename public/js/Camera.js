'use strict';

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.smoothing = 0.1;
    this.zoom = 1.0;
    this.targetZoom = 1.0;
  }

  follow(x, y) {
    // Visible area increases when zoomed out
    const w = this.canvas.width / this.zoom;
    const h = this.canvas.height / this.zoom;
    this.targetX = x - w / 2;
    this.targetY = y - h / 2;
  }

  setZoom(z) {
    this.targetZoom = z;
  }

  update() {
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    this.zoom += (this.targetZoom - this.zoom) * this.smoothing;
  }

  // These return unscaled coords — ctx.scale handles zoom
  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  isVisible(wx, wy, margin) {
    margin = margin || 100;
    const sx = wx - this.x;
    const sy = wy - this.y;
    const w = this.canvas.width / this.zoom;
    const h = this.canvas.height / this.zoom;
    return sx > -margin && sx < w + margin &&
           sy > -margin && sy < h + margin;
  }
}
