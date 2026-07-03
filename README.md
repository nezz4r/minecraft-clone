# Minecraft Clone

A browser-based Minecraft clone built from scratch with [Three.js](https://threejs.org/). No external assets — every texture is procedurally generated pixel art.

## Features

- Infinite procedurally generated world (hills, mountains, caves, ores, trees, lakes) with chunk streaming
- Break and place blocks with hold-to-mine timing, block hardness, and tool speed bonuses (pickaxe/axe/shovel)
- Five tool tiers (wood, stone, iron, gold, diamond) with Minecraft-style pick gating:
  stone needs a wooden pick, iron ore a stone pick, gold/diamond ore an iron pick; gold tools are fastest but weak
- Furnace with real smelting: iron/gold ore into ingots, sand into glass, porkchops into cooked porkchops;
  coal/logs/planks as fuel, per-furnace state with flame and progress bars, keeps smelting while closed
- Floating item drops: mined blocks and mob loot pop out, bob, and magnetize to you
- Health system: 10 hearts, fall damage, drowning (air bubbles), zombie hits, death screen with inventory drop and respawn
- Combat: swords, knockback, red hurt flash on mobs; pigs drop porkchops, sheep wool, zombies sometimes gold
- Zombies spawn at night, chase you, and crumble at dawn
- First-person controller: walking, sprinting (FOV kick), jumping, swimming; first-person hand/held item
- Day/night cycle with sun, moon, stars, drifting clouds, dusk tints, and matched fog
- 31 recipes in a categorized crafting screen; transparent glass, stone bricks, and iron/gold/diamond blocks
- Baked ambient occlusion, per-face directional shading, F3 debug overlay

## Run

```bash
npm install
npm run dev
```

Then open the printed URL (default http://localhost:5173).

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Space | Jump / swim up |
| Double-tap W (or Ctrl + W) | Sprint |
| Left click (hold) | Mine block (keep holding until it breaks) / attack mob |
| Right click | Place block / eat food / open furnace |
| In inventory: right click | Split stack / place one item |
| On recipe: shift or right click | Craft as many as possible |
| 1-9 / wheel | Select hotbar slot |
| E | Inventory & crafting |
| F3 | Debug overlay |
| Esc | Pause / release mouse |

The Play button enters fullscreen and locks the keyboard (Chrome/Edge), so browser shortcuts like Ctrl+W are captured by the game instead of closing the tab. If you exit fullscreen and play windowed, prefer double-tap W to sprint — Ctrl+W closes the tab there.
