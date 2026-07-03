// First-person viewmodel: bare arm, held block (mini cube), or held item
// (flat icon), rendered in an overlay scene so it never clips into walls.
// Bobs while walking and swings while mining/placing.

import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { setBoxTileUVs, itemTexture } from './textures.js';

export class Hand {
  constructor(atlasTexture, aspect) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 10);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambient);
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.dirLight.position.set(-0.6, 1, 0.8);
    this.scene.add(this.dirLight);

    this.atlas = atlasTexture;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.basePos = new THREE.Vector3(0.58, -0.52, -0.9);
    this.baseRot = new THREE.Euler(0.15, -0.35, 0);

    this.currentKey = undefined;
    this.swing = 0;          // 1 -> 0, drives the swing arc
    this.bobPhase = 0;

    this.rebuild(null);
  }

  rebuild(stack) {
    const key = stack ? stack.id : null;
    if (key === this.currentKey) return;
    this.currentKey = key;

    this.group.clear();

    if (!stack) {
      // Steve-ish bare arm: fist up toward screen center, elbow off the
      // bottom-right corner. Aim the box's +z axis along that diagonal.
      const armGroup = new THREE.Group();
      const skin = new THREE.MeshLambertMaterial({ color: 0xd8a377 });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.1), skin);
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x00a8a8 })
      );
      sleeve.position.z = -0.42; // elbow end
      armGroup.add(arm, sleeve);
      const fistDir = new THREE.Vector3(-0.5, 0.55, -0.25).normalize();
      armGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fistDir);
      armGroup.rotateZ(0.7); // roll so a flat face, not an edge, faces the camera
      armGroup.position.set(0.09, -0.04, 0.26);
      this.group.add(armGroup);
    } else if (stack.id < 100) {
      // held block as a mini cube
      const def = BLOCKS[stack.id];
      const geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
      setBoxTileUVs(geo, def.tiles);
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas, alphaTest: 0.5 });
      const cube = new THREE.Mesh(geo, mat);
      cube.rotation.set(0.12, Math.PI / 4 + 0.1, 0);
      cube.position.set(-0.05, 0.1, 0);
      this.group.add(cube);
    } else {
      // held item as a flat pixel-art quad
      const tex = itemTexture(stack.id);
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 })
      );
      quad.rotation.set(-0.1, -0.6, 0.25);
      this.group.add(quad);
    }
  }

  swingOnce() {
    this.swing = 1;
  }

  update(dt, { stack, moving, mining, daylight }) {
    this.rebuild(stack);

    // lighting follows time of day
    this.ambient.intensity = 0.35 + daylight * 0.45;
    this.dirLight.intensity = 0.3 + daylight * 0.7;

    // walk bob
    this.bobPhase += dt * (moving ? 9 : 0);
    const bobX = Math.sin(this.bobPhase) * 0.018;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.022;

    // swing: retrigger continuously while mining
    if (mining && this.swing <= 0) this.swing = 1;
    this.swing = Math.max(0, this.swing - dt * 3.2);
    const s = Math.sin(this.swing * Math.PI); // 0 -> 1 -> 0 arc

    this.group.position.set(
      this.basePos.x + bobX - s * 0.18,
      this.basePos.y + bobY - s * 0.10,
      this.basePos.z - s * 0.22
    );
    this.group.rotation.set(
      this.baseRot.x - s * 1.1,
      this.baseRot.y + s * 0.35,
      this.baseRot.z - s * 0.3
    );
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
