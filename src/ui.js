// HUD (hotbar, debug) and inventory/crafting screen with click-to-move stacks.

import { displayName } from './blocks.js';
import { iconFor } from './textures.js';
import { HOTBAR_SIZE, MAIN_SIZE, RECIPES, CATEGORIES, canCraft, craft } from './inventory.js';
import { SMELT_TIME } from './furnace.js';

// ---------- pixel-art status icons ----------

function heartIcon(kind) { // 'full' | 'half' | 'empty'
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const ctx = c.getContext('2d');
  const shape = [
    '.XX.XX.',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ];
  const paint = (color, fromX, toX) => {
    ctx.fillStyle = color;
    for (let y = 0; y < shape.length; y++) {
      for (let x = fromX; x < toX; x++) {
        if (shape[y][x] === 'X') ctx.fillRect(x + 1, y + 2, 1, 1);
      }
    }
  };
  // dark backing (outline-ish)
  ctx.fillStyle = '#2b0808';
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < 7; x++) {
      if (shape[y][x] === 'X') ctx.fillRect(x + 1, y + 2, 1, 1);
    }
  }
  if (kind === 'full') paint('#e02525', 0, 7);
  else if (kind === 'half') paint('#e02525', 0, 4);
  if (kind !== 'empty') {
    ctx.fillStyle = '#ff6b6b'; // highlight
    ctx.fillRect(2, 3, 1, 1);
  }
  return c.toDataURL();
}

function bubbleIcon() {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3e6df0';
  ctx.fillRect(2, 1, 4, 1); ctx.fillRect(1, 2, 6, 4);
  ctx.fillRect(2, 6, 4, 1); ctx.fillRect(3, 7, 2, 1);
  ctx.fillStyle = '#9db9ff';
  ctx.fillRect(2, 2, 2, 2);
  return c.toDataURL();
}

export class UI {
  constructor(inventory) {
    this.inv = inventory;
    this.held = null;            // stack being dragged in the inventory screen
    this.open = false;
    this.hasTableNearby = false;

    this.hotbarEl = document.getElementById('hotbar');
    this.screenEl = document.getElementById('inventory-screen');
    this.invMainEl = document.getElementById('inv-main');
    this.invHotbarEl = document.getElementById('inv-hotbar');
    this.craftListEl = document.getElementById('craft-list');
    this.heldEl = document.getElementById('held-stack');
    this.tableStatusEl = document.getElementById('table-status');
    this.debugEl = document.getElementById('debug');
    this.heartsEl = document.getElementById('hearts');
    this.bubblesEl = document.getElementById('bubbles');
    this.deathScreenEl = document.getElementById('death-screen');
    this.deathCauseEl = document.getElementById('death-cause');

    this.heartIcons = { full: heartIcon('full'), half: heartIcon('half'), empty: heartIcon('empty') };
    this.bubbleIconUrl = bubbleIcon();
    this.heartImgs = [];
    this.bubbleImgs = [];
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('img');
      h.src = this.heartIcons.full;
      this.heartsEl.appendChild(h);
      this.heartImgs.push(h);
      const b = document.createElement('img');
      b.src = this.bubbleIconUrl;
      this.bubblesEl.appendChild(b);
      this.bubbleImgs.push(b);
    }
    this.lastHp = -1;
    this.lastAir = -1;

    this.buildHotbar();
    inventory.onChange = () => this.refresh();

    document.addEventListener('mousemove', (e) => {
      if (this.held) {
        this.heldEl.style.left = e.clientX + 'px';
        this.heldEl.style.top = e.clientY + 'px';
      }
    });
  }

  buildHotbar() {
    this.hotbarEl.innerHTML = '';
    this.hotbarSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const d = document.createElement('div');
      d.className = 'hotbar-slot';
      this.hotbarEl.appendChild(d);
      this.hotbarSlots.push(d);
    }
    this.refresh();
  }

  renderStack(el, stack) {
    el.innerHTML = '';
    if (!stack) return;
    const img = document.createElement('img');
    img.className = 'slot-icon';
    img.src = iconFor(stack.id);
    img.title = displayName(stack.id);
    el.appendChild(img);
    if (stack.count > 1) {
      const n = document.createElement('span');
      n.className = 'slot-count';
      n.textContent = stack.count;
      el.appendChild(n);
    }
  }

  refresh() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = this.hotbarSlots[i];
      el.classList.toggle('selected', i === this.inv.selected);
      this.renderStack(el, this.inv.hotbar[i]);
    }
    if (this.open) this.refreshScreen();
  }

  // ---------- inventory screen ----------
  // mode: 'craft' (default, E key) or 'furnace' (right-click a furnace)

  toggle(hasTableNearby) {
    this.open = !this.open;
    this.mode = 'craft';
    this.furnace = null;
    this.hasTableNearby = hasTableNearby;
    this.screenEl.classList.toggle('hidden', !this.open);
    if (this.open) this.refreshScreen();
    else this.dropHeldBack();
    return this.open;
  }

  openFurnace(furnaceState) {
    this.open = true;
    this.mode = 'furnace';
    this.furnace = furnaceState;
    this.screenEl.classList.remove('hidden');
    this.refreshScreen();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.mode = 'craft';
    this.furnace = null;
    this.screenEl.classList.add('hidden');
    this.dropHeldBack();
  }

  dropHeldBack() {
    if (this.held) {
      this.inv.add(this.held.id, this.held.count);
      this.held = null;
      this.heldEl.classList.add('hidden');
    }
  }

  // Slot routing: 'hotbar'/'main' live on the inventory, 'furnace' on the
  // open furnace (0 = input, 1 = fuel, 2 = output).
  getSlot(list, i) {
    if (list === 'furnace') return this.furnace.slots[i];
    return this.inv.getSlot(list, i);
  }

  setSlot(list, i, stack) {
    if (list === 'furnace') this.furnace.slots[i] = stack;
    else this.inv.setSlot(list, i, stack);
  }

  // Left click: pick up / place / merge / swap whole stacks.
  // Right click: pick up half / place a single item (like Minecraft).
  slotClicked(list, i, button, e) {
    const cur = this.getSlot(list, i);
    const right = button === 2;
    const isOutput = list === 'furnace' && i === 2;

    if (isOutput) {
      // output slot: take only
      if (cur && (!this.held || this.held.id === cur.id)) {
        if (this.held) this.held.count += cur.count;
        else this.held = cur;
        this.setSlot(list, i, null);
      }
      if (e) this.moveHeldEl(e.clientX, e.clientY);
      this.updateHeldEl();
      this.refreshScreen();
      return;
    }

    if (!this.held) {
      if (cur) {
        if (right && cur.count > 1) {
          const half = Math.ceil(cur.count / 2);
          cur.count -= half;
          this.held = { id: cur.id, count: half };
          this.inv.changed();
        } else {
          this.held = cur;
          this.setSlot(list, i, null);
        }
      }
    } else if (right) {
      // place exactly one
      if (!cur) {
        this.setSlot(list, i, { id: this.held.id, count: 1 });
        this.held.count--;
      } else if (cur.id === this.held.id && cur.count < 64) {
        cur.count++;
        this.held.count--;
        this.inv.changed();
      }
      if (this.held && this.held.count <= 0) this.held = null;
    } else if (!cur) {
      this.setSlot(list, i, this.held);
      this.held = null;
    } else if (cur.id === this.held.id) {
      const room = 64 - cur.count;
      const move = Math.min(room, this.held.count);
      cur.count += move;
      this.held.count -= move;
      if (this.held.count <= 0) this.held = null;
      this.inv.changed();
    } else {
      this.setSlot(list, i, this.held);
      this.held = cur;
    }
    if (e) this.moveHeldEl(e.clientX, e.clientY);
    this.updateHeldEl();
    this.refreshScreen();
  }

  moveHeldEl(x, y) {
    this.heldEl.style.left = x + 'px';
    this.heldEl.style.top = y + 'px';
  }

  updateHeldEl() {
    if (this.held) {
      this.heldEl.classList.remove('hidden');
      this.heldEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = iconFor(this.held.id);
      this.heldEl.appendChild(img);
      if (this.held.count > 1) {
        const n = document.createElement('span');
        n.className = 'slot-count';
        n.textContent = this.held.count;
        this.heldEl.appendChild(n);
      }
    } else {
      this.heldEl.classList.add('hidden');
    }
  }

  buildGrid(container, list, size) {
    container.innerHTML = '';
    for (let i = 0; i < size; i++) {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      this.renderStack(d, this.getSlot(list, i));
      d.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.slotClicked(list, i, e.button, e);
      });
      container.appendChild(d);
    }
  }

  refreshScreen() {
    this.buildGrid(this.invMainEl, 'main', MAIN_SIZE);
    this.buildGrid(this.invHotbarEl, 'hotbar', HOTBAR_SIZE);

    const craftSection = document.getElementById('craft-section');
    const furnaceSection = document.getElementById('furnace-section');
    craftSection.classList.toggle('hidden', this.mode === 'furnace');
    furnaceSection.classList.toggle('hidden', this.mode !== 'furnace');

    if (this.mode === 'furnace') {
      this.refreshFurnace();
      return;
    }

    this.tableStatusEl.textContent = this.hasTableNearby ? '(crafting table nearby)' : '(2x2 - stand near a table for more)';
    this.craftListEl.innerHTML = '';

    for (const category of CATEGORIES) {
      const recipes = RECIPES.filter((r) => r.category === category);
      if (!recipes.length) continue;

      const header = document.createElement('div');
      header.className = 'craft-category';
      header.textContent = category;
      this.craftListEl.appendChild(header);

      // craftable recipes first within each category
      const sorted = [...recipes].sort((a, b) =>
        Number(canCraft(b, this.inv, this.hasTableNearby)) - Number(canCraft(a, this.inv, this.hasTableNearby))
      );

      for (const r of sorted) {
        const ok = canCraft(r, this.inv, this.hasTableNearby);
        const row = document.createElement('div');
        row.className = 'craft-row' + (ok ? '' : ' disabled');

        const img = document.createElement('img');
        img.className = 'slot-icon';
        img.src = iconFor(r.out);
        row.appendChild(img);

        const name = document.createElement('div');
        name.className = 'craft-name';
        name.textContent = `${displayName(r.out)}${r.outCount > 1 ? ' x' + r.outCount : ''}`;
        row.appendChild(name);

        const cost = document.createElement('div');
        cost.className = 'craft-cost';
        cost.innerHTML = r.cost.map(([id, n]) => `${n} ${displayName(id)}`).join('<br>') +
          (r.needsTable ? '<br>needs table' : '');
        row.appendChild(cost);

        if (ok) {
          row.title = 'Click: craft once - Shift/right click: craft all';
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button === 2 || e.shiftKey) {
              let guard = 0;
              while (craft(r, this.inv, this.hasTableNearby) && ++guard < 64) { /* craft all */ }
            } else {
              craft(r, this.inv, this.hasTableNearby);
            }
            this.refreshScreen();
          });
        }
        this.craftListEl.appendChild(row);
      }
    }
  }

  // ---------- furnace ----------

  refreshFurnace() {
    const bind = (elId, slotIdx) => {
      const el = document.getElementById(elId);
      const clone = el.cloneNode(false); // strip old listeners
      el.replaceWith(clone);
      this.renderStack(clone, this.furnace.slots[slotIdx]);
      clone.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.slotClicked('furnace', slotIdx, e.button, e);
      });
    };
    bind('furnace-in', 0);
    bind('furnace-fuel', 1);
    bind('furnace-out', 2);
    this.updateFurnaceBars();
  }

  // called every frame while the furnace UI is open
  updateFurnaceBars() {
    if (this.mode !== 'furnace' || !this.furnace) return;
    const f = this.furnace;
    document.getElementById('flame-fill').style.height =
      `${Math.round((f.burn > 0 ? f.burn / f.burnMax : 0) * 100)}%`;
    document.getElementById('smelt-fill').style.width =
      `${Math.round((f.progress / SMELT_TIME) * 100)}%`;
    // output can appear while the UI is open
    const outEl = document.getElementById('furnace-out');
    const shown = outEl.querySelector('.slot-count')?.textContent || (outEl.children.length ? '1' : '');
    const actual = f.slots[2] ? String(f.slots[2].count) : '';
    if (shown !== actual) this.refreshFurnace();
  }

  // ---------- status bars ----------

  updateStatus(player) {
    if (player.hp !== this.lastHp) {
      this.lastHp = player.hp;
      for (let i = 0; i < 10; i++) {
        const kind = player.hp >= (i + 1) * 2 ? 'full' : player.hp === i * 2 + 1 ? 'half' : 'empty';
        this.heartImgs[i].src = this.heartIcons[kind];
      }
    }
    const air = Math.ceil(player.air);
    if (air !== this.lastAir) {
      this.lastAir = air;
      const show = player.air < player.maxAir - 0.01;
      for (let i = 0; i < 10; i++) {
        this.bubbleImgs[i].style.visibility = show && i < air ? 'visible' : 'hidden';
      }
    }
  }

  showDeath(visible) {
    this.deathScreenEl.classList.toggle('hidden', !visible);
  }

  // ---------- debug ----------

  setDebug(visible, text) {
    this.debugEl.classList.toggle('hidden', !visible);
    if (visible) this.debugEl.textContent = text;
  }
}
