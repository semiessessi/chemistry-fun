// Base class for frame-based animation controllers (vibration, transition, reaction).
// Provides shared state machine logic, frame caching, and playback control.

import * as THREE from 'three';

export class BaseFrameController {
  constructor() {
    this.state = 'idle';  // idle | building | ready | playing
    this.generation = 0;
    this.frames = [];
    this.framesReady = 0;
    this.phase = 0;
    this.speed = 1;
    this.lastFrameIdx = -1;
  }

  cancel() {
    this.generation++;
    if (this.state === 'playing') this.pause();
    this.disposeCache();
    this.state = 'idle';
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'ready';
      // Hide current frame
      if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
        this.frames[this.lastFrameIdx].group.visible = false;
      }
    }
  }

  play() {
    if (this.state === 'ready') {
      this.state = 'playing';
    }
  }

  disposeCache() {
    for (const frame of this.frames) {
      if (frame && frame.group) {
        if (frame.group.parent) frame.group.parent.remove(frame.group);
        disposeThreeObject(frame.group);
      }
    }
    this.frames = [];
    this.framesReady = 0;
    this.lastFrameIdx = -1;
  }

  tick(dt) {
    if (this.state !== 'playing' || this.frames.length === 0) return false;

    this.phase += dt * this.speed;
    if (this.phase > 1) this.phase -= 1;

    const frameIdx = Math.floor(this.phase * this.frames.length);
    if (frameIdx !== this.lastFrameIdx) {
      this._switchFrame(frameIdx);
      return true;
    }
    return false;
  }

  _switchFrame(frameIdx) {
    if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
      this.frames[this.lastFrameIdx].group.visible = false;
    }
    if (this.frames[frameIdx]) {
      this.frames[frameIdx].group.visible = true;
    }
    this.lastFrameIdx = frameIdx;
  }
}

export function disposeThreeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}
