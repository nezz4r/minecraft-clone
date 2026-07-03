// Day/night cycle: sun + moon sprites, stars, gradient sky color, fog,
// directional light that follows the sun, and drifting clouds.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const DAY_LENGTH = 60 * 10; // 10 minutes per full day

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = DAY_LENGTH * 0.33; // start mid-morning

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    scene.add(this.sunLight);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(this.ambient);

    // matched to render distance (6 chunks = 96 blocks) to hide chunk pop-in
    scene.fog = new THREE.Fog(0x87ceeb, 52, 92);

    // sun: square sprite, MC-style
    const sunTex = this.makeSquareTexture([255, 240, 150], [255, 220, 80]);
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false }));
    this.sun.scale.set(22, 22, 1);
    scene.add(this.sun);

    const moonTex = this.makeSquareTexture([230, 230, 240], [180, 180, 200]);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
    this.moon.scale.set(14, 14, 1);
    scene.add(this.moon);

    // stars
    const rng = mulberry32(42);
    const starPos = [];
    for (let i = 0; i < 400; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = 180;
      starPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.7, sizeAttenuation: false, fog: false,
      transparent: true, opacity: 0,
    }));
    scene.add(this.stars);

    this.clouds = this.makeClouds();
    scene.add(this.clouds);
  }

  makeSquareTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${outer.join(',')})`;
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = `rgb(${inner.join(',')})`;
    ctx.fillRect(7, 7, 18, 18);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  makeClouds() {
    // flat blobby cloud plane out of merged boxes
    const group = new THREE.Group();
    const rng = mulberry32(7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, fog: false, depthWrite: false,
    });
    const geos = [];
    for (let i = 0; i < 60; i++) {
      const w = 10 + rng() * 26, d = 8 + rng() * 20;
      const g = new THREE.BoxGeometry(w, 3, d);
      g.translate((rng() - 0.5) * 600, 0, (rng() - 0.5) * 600);
      geos.push(g);
    }
    for (const g of geos) {
      const m = new THREE.Mesh(g, mat);
      group.add(m);
    }
    group.position.y = 90;
    return group;
  }

  // t in [0,1): 0 = midnight, 0.25 = sunrise-ish, 0.5 = noon
  get dayFraction() {
    return (this.time % DAY_LENGTH) / DAY_LENGTH;
  }

  update(dt, renderer, cameraPos) {
    this.time += dt;
    const f = this.dayFraction;
    const angle = f * Math.PI * 2 - Math.PI / 2; // sun angle

    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.25).normalize();
    const dist = 170;

    this.sun.position.copy(cameraPos).addScaledVector(sunDir, dist);
    this.moon.position.copy(cameraPos).addScaledVector(sunDir, -dist);
    this.stars.position.copy(cameraPos);
    this.clouds.position.x = (this.time * 0.8) % 600 - 300;
    this.clouds.position.z = cameraPos.z * 0.25;

    // daylight factor: 1 at noon, 0 at night, smooth transitions
    const elev = Math.sin(angle); // -1..1
    const daylight = THREE.MathUtils.clamp((elev + 0.12) * 3, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 5, 0, 1) * (elev > -0.2 ? 1 : 0);

    // sky color: night navy -> day sky blue, with orange dusk tint
    const night = new THREE.Color(0x070b1a);
    const day = new THREE.Color(0x87ceeb);
    const duskCol = new THREE.Color(0xd47b3f);
    const sky = night.clone().lerp(day, daylight);
    sky.lerp(duskCol, dusk * 0.45);

    renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);

    this.sunLight.position.copy(cameraPos).addScaledVector(sunDir, 100);
    this.sunLight.target.position.copy(cameraPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = 0.25 + daylight * 1.05;
    this.sunLight.color.set(0xffffff).lerp(duskCol, dusk * 0.6);
    this.ambient.intensity = 0.18 + daylight * 0.42;

    this.stars.material.opacity = THREE.MathUtils.clamp(1 - daylight * 2.2, 0, 1);
    this.sun.material.opacity = THREE.MathUtils.clamp(daylight * 3, 0, 1);
    this.moon.material.opacity = THREE.MathUtils.clamp(1 - daylight * 1.6, 0, 1);

    return { daylight };
  }

  get clockString() {
    const f = this.dayFraction;
    const mins = Math.floor(f * 24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
