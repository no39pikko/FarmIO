'use strict';

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function rectOverlap(a, aSize, b, bSize) {
  return Math.abs(a.x - b.x) < (aSize + bSize) / 2 &&
         Math.abs(a.y - b.y) < (aSize + bSize) / 2;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

// Distance from point (px,py) to nearest edge of axis-aligned box centered at (bx,by) with half-size h
function pointToBoxDist(px, py, bx, by, h) {
  const cx = Math.max(bx - h, Math.min(px, bx + h));
  const cy = Math.max(by - h, Math.min(py, by + h));
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

module.exports = { distance, rectOverlap, clamp, angleDiff, pointToBoxDist };
