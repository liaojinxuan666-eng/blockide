/* app.js —— 交互主控：渲染 / 拖拽 / 联动 / 运行 */
(function () {
  'use strict';

  const { DEFS, CATEGORIES, createBlock, defaultProgram, eachBlock } = window.BlockModel;
  const { generate } = window.Generators;
  const { run } = window.Engine;

  const LANGS = [
    { id: 'c', label: 'C', ext: '.c' },
    { id: 'cpp', label: 'C++', ext: '.cpp' },
    { id: 'swift', label: 'Swift', ext: '.swift' }
  ];
  const KEYWORDS = new Set([
    'int', 'float', 'double', 'bool', 'char', 'const', 'void', 'return', 'if', 'else',
    'for', 'while', 'main', 'include', 'using', 'namespace', 'std', 'cout', 'endl',
    'printf', 'func', 'var', 'let', 'in', 'String', 'Int', 'Double', 'Float', 'Bool',
    'true', 'false', 'print', 'struct', 'class', 'auto'
  ]);

  const state = {
    program: null,
    lang: 'swift',
    code: '',
    lineMap: {},
    selected: null,
    category: 'flow'
  };

  const $ = s => document.querySelector(s);
  const workspaceEl = $('#workspace');
  const paletteEl = $('#palette');
  const codeEl = $('#code');
  const consoleEl = $('#console');
  const statusEl = $('#status');
  const langEl = $('#langSwitch');
  const catEl = $('#categories');

  // ---------- 树定位工具 ----------
  function locate(root, id) {
    let res = null;
    (function walk(b, parent, key, index) {
      if (!b) return false;
      if (b.id === id) { res = { block: b, parent, key, index }; return true; }
      for (const k in b.inputs) {
        const v = b.inputs[k];
        if (v && v.kind === 'block' && walk(v.block, b, 'input:' + k, -1)) return true;
      }
      for (const k in b.statements) {
        const arr = b.statements[k] || [];
        for (let i = 0; i < arr.length; i++) if (walk(arr[i], b, 'stmt:' + k, i)) return true;
      }
      if (b.next && walk(b.next, b, 'next', -1)) return true;
      return false;
    })(root, null, null, -1);
    return res;
  }

  function detach(root, id) {
    const loc = locate(root, id);
    if (!loc || !loc.parent) return null;
    const { parent, key, index, block } = loc;
    if (key === 'next') { parent.next = block.next; block.next = null; }
    else if (key.indexOf('input:') === 0) parent.inputs[key.slice(6)] = null;
    else if (key.indexOf('stmt:') === 0) parent.statements[key.slice(5)].splice(index, 1);
    return block;
  }

  function insertBefore(root, targetId, block) {
    const loc = locate(root, targetId);
    if (!loc || !loc.parent) return false;
    const { parent, key, index } = loc;
    if (key === 'next') { block.next = parent.next; parent.next = block; }
    else if (key.indexOf('stmt:') === 0) parent.statements[key.slice(5)].splice(index, 0, block);
    else return false;
    return true;
  }

  function appendStmt(root, ownerId, slot, block) {
    const loc = locate(root, ownerId);
    if (!loc || !loc.block.statements[slot]) return false;
    loc.block.statements[slot].push(block);
    return true;
  }

  function setInput(root, ownerId, slot, block) {
    const loc = locate(root, ownerId);
    if (!loc || !(slot in loc.block.inputs)) return false;
    loc.block.inputs[slot] = { kind: 'block', block };
    return true;
  }

  // ---------- 渲染 ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fieldControl(block, key, def) {
    const wrap = document.createElement('span');
    wrap.className = 'field';
    if (def.label) { const lab = document.createElement('span'); lab.className = 'field-label'; lab.textContent = def.label; wrap.appendChild(lab); }
    let el;
    if (def.kind === 'select') {
      el = document.createElement('select');
      def.options.forEach(([val, text]) => {
        const o = document.createElement('option'); o.value = val; o.textContent = text;
        if (String(block.fields[key]) === String(val)) o.selected = true;
        el.appendChild(o);
      });
    } else {
      el = document.createElement('input');
      el.type = def.kind === 'number' ? 'number' : 'text';
      el.value = block.fields[key];
      el.size = Math.max(2, Math.min(12, String(block.fields[key]).length + 2));
    }
    el.dataset.owner = block.id;
    el.dataset.field = key;
    wrap.appendChild(el);
    return wrap;
  }

  function renderSingle(b) {
    const def = DEFS[b.type];
    const el = document.createElement('div');
    el.className = 'blk shape-' + def.shape + (b.type === 'program' ? ' root' : '');
    el.dataset.id = b.id;
    el.style.setProperty('--c', def.color);

    const head = document.createElement('div');
    head.className = 'blk-head';
    const label = document.createElement('span');
    label.className = 'blk-label';
    label.textContent = def.label;
    head.appendChild(label);

    for (const k in def.fields) head.appendChild(fieldControl(b, k, def.fields[k]));

    // 输入插槽（表达式）
    for (const k in (def.inputs || {})) {
      const lab = def.inputs[k];
      const slot = document.createElement('span');
      slot.className = 'input-wrap';
      if (lab) { const l = document.createElement('span'); l.className = 'slot-inline-label'; l.textContent = lab; slot.appendChild(l); }
      const inp = document.createElement('span');
      inp.className = 'input-slot';
      inp.dataset.owner = b.id;
      inp.dataset.slot = k;
      const v = b.inputs[k];
      if (v && v.kind === 'block') inp.appendChild(renderSingle(v.block));
      else { const ph = document.createElement('span'); ph.className = 'placeholder'; ph.textContent = lab || '值'; inp.appendChild(ph); }
      slot.appendChild(inp);
      head.appendChild(slot);
    }

    if (def.shape !== 'value' && b.type !== 'program') {
      const del = document.createElement('button');
      del.className = 'del'; del.textContent = '×'; del.title = '删除积木';
      del.dataset.delete = b.id;
      head.appendChild(del);
    }
    el.appendChild(head);

    // 语句槽
    for (const k in (def.statements || {})) {
      const slot = document.createElement('div');
      slot.className = 'stmt-slot';
      slot.dataset.owner = b.id;
      slot.dataset.slot = k;
      const lab = document.createElement('div');
      lab.className = 'slot-label';
      lab.textContent = def.statements[k];
      slot.appendChild(lab);
      (b.statements[k] || []).forEach(ch => slot.appendChild(renderStack(ch)));
      const add = document.createElement('div');
      add.className = 'slot-add';
      add.dataset.owner = b.id;
      add.dataset.slot = k;
      add.textContent = '＋ 拖入积木';
      slot.appendChild(add);
      el.appendChild(slot);
    }
    return el;
  }

  function renderStack(b) {
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    const db = document.createElement('div');
    db.className = 'drop-before';
    db.dataset.insertBefore = b.id;
    wrap.appendChild(db);
    wrap.appendChild(renderSingle(b));
    if (b.next) wrap.appendChild(renderStack(b.next));
    return wrap;
  }

  function renderWorkspace() {
    workspaceEl.innerHTML = '';
    workspaceEl.appendChild(renderSingle(state.program));
    renderPalette();
  }

  function renderPalette() {
    catEl.innerHTML = '';
    for (const key in CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'cat' + (state.category === key ? ' active' : '');
      btn.dataset.cat = key;
      btn.style.setProperty('--c', CATEGORIES[key].color);
      btn.textContent = CATEGORIES[key].label;
      catEl.appendChild(btn);
    }
    paletteEl.innerHTML = '';
    Object.keys(DEFS).forEach(type => {
      const d = DEFS[type];
      if (d.category !== state.category || d.fixed) return;
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.style.setProperty('--c', d.color);
      item.dataset.palette = type;
      const dot = document.createElement('span'); dot.className = 'pi-dot';
      const name = document.createElement('span'); name.textContent = d.label;
      item.appendChild(dot); item.appendChild(name);
      paletteEl.appendChild(item);
    });
  }

  // ---------- 代码生成与语法高亮 ----------
  function highlight(line, lang) {
    const re = /("(?:[^"\\]|\\.)*")|(\/\/.*$)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
    let out = '', last = 0, m;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index));
      if (m[1]) out += '<span class="tk-str">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tk-com">' + esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tk-num">' + m[3] + '</span>';
      else if (KEYWORDS.has(m[4])) out += '<span class="tk-kw">' + m[4] + '</span>';
      else out += esc(m[4]);
      last = m.index + m[0].length;
    }
    out += esc(line.slice(last));
    return out || ' ';
  }

  function renderCode() {
    const lines = state.code.split('\n');
    codeEl.innerHTML = '';
    lines.forEach((ln, i) => {
      const row = document.createElement('div');
      row.className = 'code-line';
      row.dataset.line = i;
      row.innerHTML = '<span class="ln">' + (i + 1) + '</span><span class="src">' + highlight(ln, state.lang) + '</span>';
      codeEl.appendChild(row);
    });
  }

  function updateCode() {
    const res = generate(state.lang, state.program);
    state.code = res.code;
    state.lineMap = res.lineMap;
    $('#codeLang').textContent = LANGS.find(l => l.id === state.lang).label;
    renderCode();
    applyHighlight();
    const n = countBlocks();
    statusEl.textContent = `${n} 块积木 · ${state.code.split('\n').length} 行代码`;
    save();
  }

  function countBlocks() { let n = 0; eachBlock(state.program, () => n++); return n; }

  // ---------- 高亮联动 ----------
  function clearHighlights() {
    workspaceEl.querySelectorAll('.blk.selected').forEach(e => e.classList.remove('selected'));
    codeEl.querySelectorAll('.code-line.active').forEach(e => e.classList.remove('active'));
  }

  function applyHighlight() {
    codeEl.querySelectorAll('.code-line.active').forEach(e => e.classList.remove('active'));
    if (!state.selected) return;
    const r = state.lineMap[state.selected];
    if (!r) return;
    codeEl.querySelectorAll('.code-line').forEach(row => {
      const i = +row.dataset.line;
      if (i >= r[0] && i <= r[1]) row.classList.add('active');
    });
    const blk = workspaceEl.querySelector('.blk[data-id="' + state.selected + '"]');
    if (blk) blk.classList.add('selected');
  }

  function selectBlock(id, scroll) {
    state.selected = id;
    clearHighlights();
    applyHighlight();
    if (scroll) {
      const blk = workspaceEl.querySelector('.blk[data-id="' + id + '"]');
      if (blk) blk.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function blockForLine(line) {
    let best = null, bestSpan = Infinity;
    for (const id in state.lineMap) {
      const [s, e] = state.lineMap[id];
      if (line >= s && line <= e) {
        const span = e - s;
        if (span < bestSpan) { bestSpan = span; best = id; }
      }
    }
    return best;
  }

  // ---------- 拖拽（Pointer Events，兼容触屏） ----------
  let drag = null;
  let suppressClickUntil = 0;

  function startDrag(e) {
    if (e.button !== undefined && e.button !== 0) return;
    let block = null, fromPalette = false;
    const pi = e.target.closest('[data-palette]');
    if (pi) { block = createBlock(pi.dataset.palette); fromPalette = true; }
    else {
      const head = e.target.closest('.blk-head');
      if (!head) return;
      if (e.target.closest('input,select,button,.input-slot')) return;
      const el = head.closest('.blk');
      if (!el || el.classList.contains('root')) return;
      const loc = locate(state.program, el.dataset.id);
      if (!loc) return;
      block = loc.block;
    }
    e.preventDefault();
    const def = DEFS[block.type];
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.setProperty('--c', def.color);
    ghost.textContent = def.label;
    document.body.appendChild(ghost);
    drag = { block, fromPalette, ghost, moved: false, hot: null, sx: e.clientX, sy: e.clientY };
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = (x + 14) + 'px';
    drag.ghost.style.top = (y + 10) + 'px';
  }

  function resolveDrop(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const before = el.closest('[data-insert-before]');
    if (before) return { kind: 'before', id: before.dataset.insertBefore };
    const add = el.closest('.slot-add');
    if (add) return { kind: 'slot', owner: add.dataset.owner, slot: add.dataset.slot };
    const slot = el.closest('.stmt-slot');
    if (slot) return { kind: 'slot', owner: slot.dataset.owner, slot: slot.dataset.slot };
    const inp = el.closest('.input-slot');
    if (inp) return { kind: 'input', owner: inp.dataset.owner, slot: inp.dataset.slot };
    return null;
  }

  function hotEl(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('[data-insert-before],.slot-add,.stmt-slot,.input-slot');
  }

  function onDragMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 5) drag.moved = true;
    moveGhost(e.clientX, e.clientY);
    const el = hotEl(e.clientX, e.clientY);
    if (drag.hot !== el) {
      if (drag.hot) drag.hot.classList.remove('drop-hot');
      drag.hot = el;
      if (drag.hot) drag.hot.classList.add('drop-hot');
    }
  }

  function onDragEnd(e) {
    window.removeEventListener('pointermove', onDragMove);
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.hot) d.hot.classList.remove('drop-hot');
    d.ghost.remove();
    const target = resolveDrop(e.clientX, e.clientY);
    const shape = DEFS[d.block.type].shape;

    if (!d.fromPalette) {
      // 防止把积木拖进自己的子树
      if (target) {
        const ids = [target.id, target.owner].filter(Boolean);
        if (ids.some(id => locate(d.block, id))) { renderWorkspace(); updateCode(); return; }
      }
      detach(state.program, d.block.id);
    }

    let placed = false;
    if (target) {
      if (target.kind === 'before' && shape !== 'value') placed = insertBefore(state.program, target.id, d.block);
      else if (target.kind === 'slot' && shape !== 'value') placed = appendStmt(state.program, target.owner, target.slot, d.block);
      else if (target.kind === 'input' && shape === 'value') placed = setInput(state.program, target.owner, target.slot, d.block);
    }
    if (!placed && shape !== 'value') appendStmt(state.program, state.program.id, 'body', d.block);

    if (d.moved) suppressClickUntil = Date.now() + 120;
    state.selected = d.block.id;
    renderWorkspace();
    updateCode();
    applyHighlight();
  }

  // ---------- 事件绑定 ----------
  workspaceEl.addEventListener('pointerdown', startDrag);
  paletteEl.addEventListener('pointerdown', startDrag);

  workspaceEl.addEventListener('input', onFieldChange);
  workspaceEl.addEventListener('change', onFieldChange);
  function onFieldChange(e) {
    const f = e.target.closest('[data-field][data-owner]');
    if (!f) return;
    const loc = locate(state.program, f.dataset.owner);
    if (!loc) return;
    if (loc.block.fields[f.dataset.field] === f.value) return;
    loc.block.fields[f.dataset.field] = f.value;
    updateCode();
  }

  workspaceEl.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) return;
    const del = e.target.closest('[data-delete]');
    if (del) {
      const removed = detach(state.program, del.dataset.delete);
      if (removed && state.selected === removed.id) state.selected = null;
      renderWorkspace(); updateCode(); return;
    }
    const head = e.target.closest('.blk-head');
    if (head && !e.target.closest('input,select,button,.input-slot')) {
      const blk = head.closest('.blk');
      if (blk && !blk.classList.contains('root')) selectBlock(blk.dataset.id, false);
    }
  });

  catEl.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) { state.category = b.dataset.cat; renderPalette(); }
  });

  langEl.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    state.lang = b.dataset.lang;
    langEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    updateCode();
  });

  codeEl.addEventListener('click', e => {
    const row = e.target.closest('.code-line');
    if (!row) return;
    const id = blockForLine(+row.dataset.line);
    selectBlock(id || null, !!id);
  });

  $('#runBtn').addEventListener('click', () => {
    consoleEl.innerHTML = '';
    const res = run(state.program, line => {
      const d = document.createElement('div');
      d.className = 'console-line';
      d.textContent = line;
      consoleEl.appendChild(d);
    });
    if (!res.output.length) {
      const d = document.createElement('div');
      d.className = 'console-line muted';
      d.textContent = '（程序无输出）';
      consoleEl.appendChild(d);
    }
    consoleEl.scrollTop = consoleEl.scrollHeight;
    statusEl.textContent = `${res.output.length} 行输出 · ${res.ms}ms · 运行完成`;
  });

  $('#clearBtn').addEventListener('click', () => { consoleEl.innerHTML = ''; });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('恢复示例程序？当前积木会被替换。')) return;
    state.program = defaultProgram();
    state.selected = null;
    renderWorkspace(); updateCode();
  });

  $('#copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      $('#copyBtn').textContent = '已复制 ✓';
      setTimeout(() => { $('#copyBtn').textContent = '复制代码'; }, 1200);
    } catch (e) { alert('复制失败，请手动选择代码复制'); }
  });

  // ---------- 持久化 ----------
  function save() {
    try { localStorage.setItem('blockide_state', JSON.stringify({ program: state.program, lang: state.lang })); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem('blockide_state');
      if (raw) {
        const o = JSON.parse(raw);
        if (o.program && o.program.type === 'program' && o.program.statements) {
          state.program = o.program;
          state.lang = o.lang || 'swift';
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // ---------- 初始化 ----------
  function init() {
    if (!load()) state.program = defaultProgram();
    langEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
    renderWorkspace();
    updateCode();
  }
  init();
})();
