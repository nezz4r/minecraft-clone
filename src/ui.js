// HUD (hotbar, hearts, bubbles, debug) and the inventory screen:
// Minecraft-style grid crafting (2x2 personal, 3x3 at a crafting table),
// recipe book with tabs + auto-fill, furnace screen, and full slot
// interactions (drag, split, shift-move, double-click gather, Q drop).

import { displayName, ITEMS } from './blocks.js';
import { iconFor } from './textures.js';
import {
  HOTBAR_SIZE, MAIN_SIZE, RECIPES, CATEGORIES,
  canCraft, craft, recipeGridSize, ingredientTotals, matchGrid, consumeGrid,
} from './inventory.js';
import { SMELT_TIME, SMELTING, FUEL_VALUES } from './furnace.js';

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
  paint('#2b0808', 0, 7);
  if (kind === 'full') paint('#e02525', 0, 7);
  else if (kind === 'half') paint('#e02525', 0, 4);
  if (kind !== 'empty') {
    ctx.fillStyle = '#ff6b6b';
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
    this.held = null;          // stack on the cursor
    this.open = false;
    this.mode = 'craft';       // 'craft' | 'furnace'
    this.craftSize = 2;        // 2 = personal grid, 3 = crafting table
    this.craftCells = new Array(9).fill(null);
    this.furnace = null;
    this.hover = null;         // { list, i } currently hovered slot
    this.recipeTab = 'All';
    this.lastClick = { key: '', time: 0 };
    this.onSound = null;       // (name: 'click' | 'craft') => void
    this.onDropItem = null;    // (stack) => void, throws it into the world

    this.hotbarEl = document.getElementById('hotbar');
    this.screenEl = document.getElementById('inventory-screen');
    this.invMainEl = document.getElementById('inv-main');
    this.invHotbarEl = document.getElementById('inv-hotbar');
    this.heldEl = document.getElementById('held-stack');
    this.tooltipEl = document.getElementById('tooltip');
    this.debugEl = document.getElementById('debug');
    this.heartsEl = document.getElementById('hearts');
    this.bubblesEl = document.getElementById('bubbles');
    this.deathScreenEl = document.getElementById('death-screen');
    this.craftGridEl = document.getElementById('craft-grid');
    this.craftResultEl = document.getElementById('craft-result');
    this.craftTitleEl = document.getElementById('craft-title');
    this.recipeTabsEl = document.getElementById('recipe-tabs');
    this.recipeEntriesEl = document.getElementById('recipe-entries');
    this.recipeBookEl = document.getElementById('recipe-book');

    this.heartIcons = { full: heartIcon('full'), half: heartIcon('half'), empty: heartIcon('empty') };
    this.heartImgs = [];
    this.bubbleImgs = [];
    const bubbleUrl = bubbleIcon();
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('img');
      h.src = this.heartIcons.full;
      this.heartsEl.appendChild(h);
      this.heartImgs.push(h);
      const b = document.createElement('img');
      b.src = bubbleUrl;
      this.bubblesEl.appendChild(b);
      this.bubbleImgs.push(b);
    }
    this.lastHp = -1;
    this.lastAir = -1;

    this.buildHotbar();
    inventory.onChange = () => this.refresh();

    document.addEventListener('mousemove', (e) => {
      if (this.held) this.moveHeldEl(e.clientX, e.clientY);
      if (!this.tooltipEl.classList.contains('hidden')) {
        this.tooltipEl.style.left = Math.min(e.clientX + 14, window.innerWidth - 250) + 'px';
        this.tooltipEl.style.top = (e.clientY + 12) + 'px';
      }
    });
  }

  sound(name) {
    if (this.onSound) this.onSound(name);
  }

  // ---------- hotbar HUD ----------

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

  // ---------- open / close ----------

  toggle() {
    if (this.open) this.close();
    else this.openCraft(2);
    return this.open;
  }

  openCraft(size) {
    this.open = true;
    this.mode = 'craft';
    this.craftSize = size;
    this.furnace = null;
    this.screenEl.classList.remove('hidden');
    this.refreshScreen();
  }

  openTable() {
    this.openCraft(3);
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
    this.screenEl.classList.add('hidden');
    this.hideTooltip();
    this.hover = null;
    // return crafting grid contents
    for (let i = 0; i < 9; i++) {
      const c = this.craftCells[i];
      if (!c) continue;
      this.craftCells[i] = null;
      const leftover = this.inv.add(c.id, c.count);
      if (leftover > 0 && this.onDropItem) this.onDropItem({ id: c.id, count: leftover });
    }
    this.dropHeldBack();
  }

  dropHeldBack() {
    if (this.held) {
      const leftover = this.inv.add(this.held.id, this.held.count);
      if (leftover > 0 && this.onDropItem) this.onDropItem({ id: this.held.id, count: leftover });
      this.held = null;
      this.heldEl.classList.add('hidden');
    }
  }

  // ---------- slot routing ----------

  getSlot(list, i) {
    if (list === 'furnace') return this.furnace.slots[i];
    if (list === 'grid') return this.craftCells[i];
    return this.inv[list][i];
  }

  setSlot(list, i, stack) {
    if (list === 'furnace') this.furnace.slots[i] = stack;
    else if (list === 'grid') this.craftCells[i] = stack;
    else {
      this.inv[list][i] = stack;
      this.inv.changed();
      return; // changed() already refreshes
    }
    this.refreshScreen();
  }

  // ---------- interactions ----------

  slotClicked(list, i, button, e) {
    const isOutput = list === 'furnace' && i === 2;
    const cur = this.getSlot(list, i);
    if (cur || this.held) this.sound('click');

    // shift-click: quick move
    if (e && e.shiftKey && !this.held) {
      if (cur) this.quickMove(list, i);
      return;
    }

    // double-click: gather all of this id onto the cursor
    const key = list + ':' + i;
    const now = performance.now();
    const doubled = button === 0 && this.lastClick.key === key && now - this.lastClick.time < 350;
    this.lastClick = { key, time: now };
    if (doubled && this.held) {
      this.gather();
      this.afterSlotChange(e);
      return;
    }

    const right = button === 2;

    if (isOutput) {
      if (cur && (!this.held || this.held.id === cur.id)) {
        if (this.held) this.held.count += cur.count;
        else this.held = cur;
        this.setSlot(list, i, null);
      }
      this.afterSlotChange(e);
      return;
    }

    if (!this.held) {
      if (cur) {
        if (right && cur.count > 1) {
          const half = Math.ceil(cur.count / 2);
          cur.count -= half;
          this.held = { id: cur.id, count: half };
          this.setSlot(list, i, cur);
        } else {
          this.held = cur;
          this.setSlot(list, i, null);
        }
      }
    } else if (right) {
      if (!cur) {
        this.setSlot(list, i, { id: this.held.id, count: 1 });
        this.held.count--;
      } else if (cur.id === this.held.id && cur.count < 64) {
        cur.count++;
        this.held.count--;
        this.setSlot(list, i, cur);
      }
      if (this.held && this.held.count <= 0) this.held = null;
    } else if (!cur) {
      this.setSlot(list, i, this.held);
      this.held = null;
    } else if (cur.id === this.held.id) {
      const move = Math.min(64 - cur.count, this.held.count);
      cur.count += move;
      this.held.count -= move;
      if (this.held.count <= 0) this.held = null;
      this.setSlot(list, i, cur);
    } else {
      this.setSlot(list, i, this.held);
      this.held = cur;
    }
    this.afterSlotChange(e);
  }

  afterSlotChange(e) {
    if (e) this.moveHeldEl(e.clientX, e.clientY);
    this.updateHeldEl();
    this.refreshScreen();
  }

  // shift-click destination logic
  quickMove(list, i) {
    const stack = this.getSlot(list, i);
    if (!stack) return;

    const moveToInv = () => {
      const leftover = this.inv.add(stack.id, stack.count);
      this.setSlot(list, i, leftover > 0 ? { id: stack.id, count: leftover } : null);
    };

    if (list === 'grid' || list === 'furnace') {
      moveToInv();
    } else if (this.mode === 'furnace') {
      // inventory -> matching furnace slot
      const target = SMELTING[stack.id] !== undefined ? 0 : FUEL_VALUES[stack.id] ? 1 : -1;
      if (target < 0) return;
      const dst = this.furnace.slots[target];
      if (!dst) {
        this.furnace.slots[target] = stack;
        this.setSlot(list, i, null);
      } else if (dst.id === stack.id) {
        const move = Math.min(64 - dst.count, stack.count);
        dst.count += move;
        stack.count -= move;
        this.setSlot(list, i, stack.count > 0 ? stack : null);
      }
    } else {
      // hotbar <-> main
      const dstList = list === 'hotbar' ? this.inv.main : this.inv.hotbar;
      let count = stack.count;
      for (let j = 0; j < dstList.length && count > 0; j++) {
        const s = dstList[j];
        if (s && s.id === stack.id && s.count < 64) {
          const take = Math.min(64 - s.count, count);
          s.count += take;
          count -= take;
        }
      }
      for (let j = 0; j < dstList.length && count > 0; j++) {
        if (!dstList[j]) {
          dstList[j] = { id: stack.id, count };
          count = 0;
        }
      }
      this.setSlot(list, i, count > 0 ? { id: stack.id, count } : null);
      this.inv.changed();
    }
    this.refreshScreen();
  }

  // double-click: pull every matching stack onto the cursor (up to 64)
  gather() {
    if (!this.held) return;
    const sources = [['hotbar', this.inv.hotbar], ['main', this.inv.main], ['grid', this.craftCells]];
    for (const [, listArr] of sources) {
      for (let j = 0; j < listArr.length && this.held.count < 64; j++) {
        const s = listArr[j];
        if (s && s.id === this.held.id) {
          const take = Math.min(64 - this.held.count, s.count);
          this.held.count += take;
          s.count -= take;
          if (s.count <= 0) listArr[j] = null;
        }
      }
    }
    this.inv.changed();
  }

  // Q while hovering (or holding): throw the stack into the world
  dropHovered(wholeStack) {
    if (!this.onDropItem) return;
    if (this.held) {
      const n = wholeStack ? this.held.count : 1;
      this.onDropItem({ id: this.held.id, count: n });
      this.held.count -= n;
      if (this.held.count <= 0) this.held = null;
      this.updateHeldEl();
      this.refreshScreen();
      return;
    }
    if (!this.hover) return;
    const stack = this.getSlot(this.hover.list, this.hover.i);
    if (!stack) return;
    const n = wholeStack ? stack.count : 1;
    this.onDropItem({ id: stack.id, count: n });
    stack.count -= n;
    this.setSlot(this.hover.list, this.hover.i, stack.count > 0 ? stack : null);
    this.refreshScreen();
  }

  // press 1-9 while hovering a slot: swap it with that hotbar slot
  digitSwap(n) {
    if (!this.hover || this.hover.list === 'furnace') return;
    const { list, i } = this.hover;
    if (list === 'hotbar' && i === n) return;
    const a = this.getSlot(list, i);
    const b = this.inv.hotbar[n];
    this.inv.hotbar[n] = a;
    this.setSlot(list, i, b);
    this.inv.changed();
    this.sound('click');
  }

  // ---------- crafting grid ----------

  activeCells() {
    // for a 2x2 grid only the first 4 cells are used, mapped into a 2x2 matrix
    const size = this.craftSize;
    const cells = new Array(size * size);
    for (let i = 0; i < size * size; i++) cells[i] = this.craftCells[i];
    return cells;
  }

  currentMatch() {
    return matchGrid(this.activeCells(), this.craftSize);
  }

  resultClicked(button, shiftKey) {
    const r = this.currentMatch();
    if (!r) return;
    this.sound('craft');

    if (shiftKey) {
      // craft everything the grid allows, straight to inventory
      let guard = 0;
      while (this.currentMatch() === r && ++guard < 65) {
        const leftover = this.inv.add(r.out, r.outCount);
        if (leftover > 0 && this.onDropItem) this.onDropItem({ id: r.out, count: leftover });
        consumeGrid(this.craftCells);
      }
    } else {
      if (!this.held) {
        this.held = { id: r.out, count: r.outCount };
      } else if (this.held.id === r.out && this.held.count + r.outCount <= 64) {
        this.held.count += r.outCount;
      } else {
        return;
      }
      consumeGrid(this.craftCells);
    }
    this.updateHeldEl();
    this.refreshScreen();
  }

  // recipe book click: move ingredients from inventory into the grid
  autoFill(recipe) {
    if (recipeGridSize(recipe) > this.craftSize) return false;
    if (!canCraft(recipe, this.inv, this.craftSize)) return false;
    this.sound('click');

    // clear the grid back into the inventory first
    for (let i = 0; i < 9; i++) {
      const c = this.craftCells[i];
      if (c) {
        this.inv.add(c.id, c.count);
        this.craftCells[i] = null;
      }
    }

    const size = this.craftSize;
    if (recipe.pattern) {
      for (let y = 0; y < recipe.pattern.length; y++) {
        for (let x = 0; x < recipe.pattern[y].length; x++) {
          const ch = recipe.pattern[y][x];
          if (ch === ' ') continue;
          const id = recipe.key[ch];
          this.inv.remove(id, 1);
          this.craftCells[y * size + x] = { id, count: 1 };
        }
      }
    } else {
      let i = 0;
      for (const id of recipe.shapeless) {
        this.inv.remove(id, 1);
        this.craftCells[i++] = { id, count: 1 };
      }
    }
    this.refreshScreen();
    return true;
  }

  // ---------- rendering ----------

  bindSlot(el, list, i) {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.slotClicked(list, i, e.button, e);
    });
    el.addEventListener('mouseenter', () => {
      this.hover = { list, i };
      const stack = this.getSlot(list, i);
      if (stack) this.showStackTooltip(stack);
      else this.hideTooltip();
    });
    el.addEventListener('mouseleave', () => {
      if (this.hover && this.hover.list === list && this.hover.i === i) this.hover = null;
      this.hideTooltip();
    });
  }

  buildGrid(container, list, size) {
    container.innerHTML = '';
    for (let i = 0; i < size; i++) {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      this.renderStack(d, this.getSlot(list, i));
      this.bindSlot(d, list, i);
      container.appendChild(d);
    }
  }

  refreshScreen() {
    this.buildGrid(this.invMainEl, 'main', MAIN_SIZE);
    this.buildGrid(this.invHotbarEl, 'hotbar', HOTBAR_SIZE);

    const craftSection = document.getElementById('craft-section');
    const furnaceSection = document.getElementById('furnace-section');
    const isFurnace = this.mode === 'furnace';
    craftSection.classList.toggle('hidden', isFurnace);
    furnaceSection.classList.toggle('hidden', !isFurnace);
    this.recipeBookEl.classList.toggle('hidden', isFurnace);

    if (isFurnace) {
      this.refreshFurnace();
      return;
    }

    // crafting grid
    this.craftTitleEl.textContent = this.craftSize === 3 ? 'Crafting Table' : 'Crafting';
    this.craftGridEl.className = 'size' + this.craftSize;
    this.craftGridEl.innerHTML = '';
    const n = this.craftSize * this.craftSize;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      this.renderStack(d, this.craftCells[i]);
      this.bindSlot(d, 'grid', i);
      this.craftGridEl.appendChild(d);
    }

    // result slot
    const match = this.currentMatch();
    this.craftResultEl.classList.toggle('has-result', !!match);
    this.renderStack(this.craftResultEl, match ? { id: match.out, count: match.outCount } : null);
    const resultClone = this.craftResultEl.cloneNode(true);
    this.craftResultEl.replaceWith(resultClone);
    this.craftResultEl = resultClone;
    resultClone.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.resultClicked(e.button, e.shiftKey);
    });
    resultClone.addEventListener('mouseenter', () => {
      const m = this.currentMatch();
      if (m) this.showRecipeTooltip(m, true);
    });
    resultClone.addEventListener('mouseleave', () => this.hideTooltip());

    this.refreshRecipeBook();
  }

  // ---------- recipe book ----------

  refreshRecipeBook() {
    this.recipeTabsEl.innerHTML = '';
    for (const tab of ['All', ...CATEGORIES]) {
      const t = document.createElement('div');
      t.className = 'recipe-tab' + (tab === this.recipeTab ? ' active' : '');
      t.textContent = tab;
      t.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.recipeTab = tab;
        this.refreshRecipeBook();
      });
      this.recipeTabsEl.appendChild(t);
    }

    this.recipeEntriesEl.innerHTML = '';
    const recipes = RECIPES.filter((r) => this.recipeTab === 'All' || r.category === this.recipeTab);
    // craftable first
    const sorted = [...recipes].sort((a, b) =>
      Number(canCraft(b, this.inv, this.craftSize)) - Number(canCraft(a, this.inv, this.craftSize)));

    for (const r of sorted) {
      const ok = canCraft(r, this.inv, this.craftSize);
      const tooBig = recipeGridSize(r) > this.craftSize;
      const entry = document.createElement('div');
      entry.className = 'recipe-entry' + (ok ? ' craftable' : tooBig ? ' needs-table' : '');

      const img = document.createElement('img');
      img.className = 'slot-icon';
      img.src = iconFor(r.out);
      entry.appendChild(img);
      if (r.outCount > 1) {
        const c = document.createElement('span');
        c.className = 'slot-count';
        c.textContent = r.outCount;
        entry.appendChild(c);
      }

      entry.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button === 2) {
          let guard = 0;
          while (craft(r, this.inv, this.craftSize) && ++guard < 64) { /* craft all */ }
          if (guard > 0) this.sound('craft');
        } else if (e.shiftKey) {
          if (craft(r, this.inv, this.craftSize)) this.sound('craft');
        } else {
          this.autoFill(r);
        }
        this.refreshScreen();
      });
      entry.addEventListener('mouseenter', () => this.showRecipeTooltip(r, false));
      entry.addEventListener('mouseleave', () => this.hideTooltip());

      this.recipeEntriesEl.appendChild(entry);
    }
  }

  // ---------- tooltips ----------

  showTooltipHTML(html) {
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.classList.remove('hidden');
  }

  hideTooltip() {
    this.tooltipEl.classList.add('hidden');
  }

  showStackTooltip(stack) {
    let html = displayName(stack.id);
    const def = ITEMS[stack.id];
    if (def) {
      const bits = [];
      if (def.damage) bits.push(`${def.damage / 2} atk`);
      if (def.speed) bits.push(`${def.speed}x ${def.tool}`);
      if (def.food) bits.push(`+${def.food / 2} hearts`);
      if (bits.length) html += `<div class="tt-sub">${bits.join(' &middot; ')}</div>`;
    }
    this.showTooltipHTML(html);
  }

  showRecipeTooltip(recipe, isResult) {
    let html = `${displayName(recipe.out)}${recipe.outCount > 1 ? ' x' + recipe.outCount : ''}`;
    if (!isResult) {
      const parts = [];
      for (const [id, count] of ingredientTotals(recipe)) {
        const enough = this.inv.countOf(id) >= count;
        parts.push(`<span class="${enough ? '' : 'tt-missing'}">${count} ${displayName(id)}</span>`);
      }
      html += `<div class="tt-sub">${parts.join('<br>')}</div>`;
      if (recipeGridSize(recipe) > this.craftSize) {
        html += `<div class="tt-sub tt-missing">needs a crafting table</div>`;
      }
    }
    this.showTooltipHTML(html);
  }

  // ---------- held stack ----------

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

  // ---------- furnace ----------

  refreshFurnace() {
    const bind = (elId, slotIdx) => {
      const el = document.getElementById(elId);
      const clone = el.cloneNode(false);
      el.replaceWith(clone);
      this.renderStack(clone, this.furnace.slots[slotIdx]);
      clone.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.slotClicked('furnace', slotIdx, e.button, e);
      });
      clone.addEventListener('mouseenter', () => {
        this.hover = { list: 'furnace', i: slotIdx };
        const s = this.furnace.slots[slotIdx];
        if (s) this.showStackTooltip(s);
      });
      clone.addEventListener('mouseleave', () => {
        this.hover = null;
        this.hideTooltip();
      });
    };
    bind('furnace-in', 0);
    bind('furnace-fuel', 1);
    bind('furnace-out', 2);
    this.updateFurnaceBars();
  }

  updateFurnaceBars() {
    if (this.mode !== 'furnace' || !this.furnace || !this.open) return;
    const f = this.furnace;
    document.getElementById('flame-fill').style.height =
      `${Math.round((f.burn > 0 ? f.burn / f.burnMax : 0) * 100)}%`;
    document.getElementById('smelt-fill').style.width =
      `${Math.round((f.progress / SMELT_TIME) * 100)}%`;
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
