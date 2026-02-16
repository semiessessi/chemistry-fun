// Photon wave packet visualization for electron transitions.
// Represents photon as oscillating wave packet that propagates toward atom center.

import * as THREE from 'three';

/**
 * Converts wavelength (nm) to RGB color using visible spectrum approximation.
 * UV (<380nm) appears violet, IR (>780nm) appears red.
 */
export function wavelengthToRGB(wavelength) {
  let r = 0, g = 0, b = 0;

  if (wavelength < 380) {
    // UV - render as violet
    r = 0.5; g = 0; b = 1;
  } else if (wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength <= 780) {
    r = 1;
    g = 0;
    b = 0;
  } else {
    // IR - render as deep red
    r = 0.8; g = 0; b = 0;
  }

  // Intensity falloff at edges
  let intensity = 1;
  if (wavelength < 380) {
    intensity = 0.3 + 0.7 * (wavelength / 380);
  } else if (wavelength > 700) {
    intensity = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  }

  return new THREE.Color(r * intensity, g * intensity, b * intensity);
}

/**
 * PhotonWavePacket: Shader-based oscillating sphere representing a photon.
 * Propagates from startPosition toward targetPosition with wavelength-based color.
 */
export class PhotonWavePacket {
  constructor(wavelength, startPosition, targetPosition) {
    this.wavelength = wavelength;
    this.color = wavelengthToRGB(wavelength);
    this.position = startPosition.clone();
    this.direction = new THREE.Vector3().subVectors(targetPosition, startPosition).normalize();
    this.phase = 0;
    this.envelope = 0; // 0→1→0 fade in/out
    this.alive = true;

    // Sphere with custom shader for oscillating wave packet
    const geometry = new THREE.SphereGeometry(2.0, 32, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWavelength: { value: wavelength / 100.0 }, // Scale for visual effect
        uColor: { value: this.color },
        uEnvelope: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uWavelength;
        uniform vec3 uColor;
        uniform float uEnvelope;
        varying vec3 vPosition;

        void main() {
          float r = length(vPosition);
          float gaussian = exp(-r * r / 4.0); // Gaussian envelope
          float wave = cos(6.28318 * (r / uWavelength - uTime));
          float alpha = gaussian * uEnvelope * (0.3 + 0.7 * (0.5 + 0.5 * wave));
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.position);
  }

  /**
   * Update photon position and phase.
   * @param {number} dt - Delta time in seconds
   * @param {number} transitionPhase - Overall transition progress (0→1)
   */
  tick(dt, transitionPhase) {
    if (!this.alive) return;

    // Fade in during early transition, fade out at end
    if (transitionPhase < 0.15) {
      this.envelope = transitionPhase / 0.15;
    } else if (transitionPhase > 0.85) {
      this.envelope = (1.0 - transitionPhase) / 0.15;
    } else {
      this.envelope = 1.0;
    }

    // Propagate toward atom center
    this.position.addScaledVector(this.direction, dt * 3.0); // 3 Bohr/s velocity
    this.mesh.position.copy(this.position);

    // Update shader uniforms for oscillation
    this.phase += dt * 10.0;
    this.mesh.material.uniforms.uTime.value = this.phase;
    this.mesh.material.uniforms.uEnvelope.value = this.envelope;

    // Mark as dead if fully faded
    if (this.envelope <= 0) {
      this.alive = false;
    }
  }

  /**
   * Clean up Three.js resources.
   */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
