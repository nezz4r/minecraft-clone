// Seeded value noise (2D/3D) with fBm, plus integer hashes for deterministic
// per-coordinate randomness (trees, ores, mob variation).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashInt(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return n >>> 0;
}

// Returns [0, 1)
export function hash2(x, y, seed) {
  return hashInt(Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144269)) / 4294967296;
}

export function hash3(x, y, z, seed) {
  return hashInt(
    Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 144269)
  ) / 4294967296;
}

function smooth(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Noise2D {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  // Returns [0, 1)
  sample(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const s = this.seed;
    return lerp(
      lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), u),
      lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), u),
      v
    );
  }

  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.sample(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

export class Noise3D {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  // Returns [0, 1)
  sample(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = smooth(xf), v = smooth(yf), w = smooth(zf);
    const s = this.seed;
    const c000 = hash3(xi, yi, zi, s), c100 = hash3(xi + 1, yi, zi, s);
    const c010 = hash3(xi, yi + 1, zi, s), c110 = hash3(xi + 1, yi + 1, zi, s);
    const c001 = hash3(xi, yi, zi + 1, s), c101 = hash3(xi + 1, yi, zi + 1, s);
    const c011 = hash3(xi, yi + 1, zi + 1, s), c111 = hash3(xi + 1, yi + 1, zi + 1, s);
    return lerp(
      lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
      lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
      w
    );
  }
}
