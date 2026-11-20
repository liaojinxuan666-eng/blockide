/* app.js —— TERMINAL EDITION：渲染 / 拖拽 / 双向同步 / 键盘驱动 */
(function () {
  'use strict';

  const M = window.BlockModel;
  const { DEFS, CATEGORIES, createBlock, defaultProgram, eachBlock, EXAMPLES } = M;
  const { generate } = window.Generators;
  const { run } = window.Engine;
  const { parse } = window.SourceParser;

  const LANGS = [
    { id: 'c', label: 'C', ext: '.c' },
    { id: 'cpp', label: 'C++', ext: '.cpp' },
    { id: 'swift', label: 'SWIFT', ext: '.swift' }
  ];
  const KEYWORDS = new Set([
    'int','float','double','bool','char','const','void','return','if','else','for','while',
    'main','include','using','namespace','std','cout','cin','endl','printf','scanf','func',
    'var','let','in','String','Int','Double','Float','Bool','true','false','print','struct',
    'class','auto','import','Foundation','break','continue','repeating','count','length'
  ]);

  const state = {
    program: null, lang: 'swift', code: '', lineMap: {},
    selected: null, category: 'flow', search: '', editing: false,
    undoStack: [], redoStack: [],
    // 键盘导航
    focusPane: 'canvas', kbCursor: null, kbPalette: 0, kbExample: 0,
    overlay: null
  };

  const $ = s => document.querySelector(s);
  const workspaceEl = $('#workspace'), paletteEl = $('#palette'), catEl = $('#categories');
  const codeEl = $('#code'), codeEditor = $('#codeEditor'), consoleEl = $('#console');
  const statusEl = $('#status'), langEl = $('#langSwitch'), toastEl = $('#toast');
  const overlayEl = $('#overlay'), overlayBox = $('#overlayBox');
  const panes = { palette: $('#panePalette'), canvas: $('#paneCanvas'), code: $('#paneCode') };

  // ---------- 树工具 ----------
  function locate(root, id) {
    let res = null;
    (function walk(b, parent, key, index) {
      if (!b) return false;
      if (b.id === id) { res = { block: b, parent, key, index }; return true; }
      for (const k in b.inputs) { const v = b.inputs[k]; if (v && v.kind === 'block' && walk(v.block, b, 'input:' + k, -1)) return true; }
      for (const k in b.statements) { const arr = b.statements[k] || []; for (let i = 0; i < arr.length; i++) if (walk(arr[i], b, 'stmt:' + k, i)) return true; }
      if (b.next && walk(b.next, b, 'next', -1)) return true;
      return false;
    })(root, null, null, -1);
    return res;
  }
  function detach(root, id) {
    const loc = locate(root, id); if (!loc || !loc.parent) return null;
    const { parent, key, index, block } = loc;
    if (key === 'next') { parent.next = block.next; block.next = null; }
    else if (key.indexOf('input:') === 0) parent.inputs[key.slice(6)] = null;
    else if (key.indexOf('stmt:') === 0) parent.statements[key.slice(5)].splice(index, 1);
    return block;
  }
  function insertBefore(root, targetId, block) {
    const loc = locate(root, targetId); if (!loc || !loc.parent) return false;
    const { parent, key, index } = loc;
    if (key === 'next') { block.next = parent.next; parent.next = block; }
    else if (key.indexOf('stmt:') === 0) parent.statements[key.slice(5)].splice(index, 0, block);
    else return false;
    return true;
  }
  function appendStmt(root, ownerId, slot, block) {
    const loc = locate(root, ownerId); if (!loc || !loc.block.statements[slot]) return false;
    loc.block.statements[slot].push(block); return true;
  }
  function setInput(root, ownerId, slot, block) {
    const loc = locate(root, ownerId); if (!loc || !(slot in loc.block.inputs)) return false;
    loc.block.inputs[slot] = { kind: 'block', block }; return true;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // 收集所有可见积木（文档顺序），供键盘导航
  function visibleBlocks() {
    const out = [];
    (function walk(b) {
      if (!b) return;
      out.push(b);
      for (const k in b.inputs) { const v = b.inputs[k]; if (v && v.kind === 'block') walk(v.block); }
      for (const k in b.statements) (b.statements[k] || []).forEach(walk);
      if (b.next) walk(b.next);
    })(state.program);
    return out;
  }
  function paletteItems() { return [...paletteEl.querySelectorAll('.palette-item')]; }

  // ---------- 撤销 / 重做 ----------
  function snapshot() { return { program: clone(state.program), selected: state.selected }; }
  function pushUndo() {
    state.undoStack.push(snapshot());
    if (state.undoStack.length > 60) state.undoStack.shift();
    state.redoStack = [];
  }
  function undo() {
    if (!state.undoStack.length) { toast('Nothing to undo'); return; }
    state.redoStack.push(snapshot());
    const s = state.undoStack.pop();
    state.program = s.program; state.selected = s.selected; state.kbCursor = s.selected;
    renderWorkspace(); updateCode(); echo('undo: 已撤销上一步');
  }
  function redo() {
    if (!state.redoStack.length) { toast('Nothing to redo'); return; }
    state.undoStack.push(snapshot());
    const s = state.redoStack.pop();
    state.program = s.program; state.selected = s.selected; state.kbCursor = s.selected;
    renderWorkspace(); updateCode(); echo('redo: 已重做');
  }

  // ---------- 渲染 ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fieldControl(block, key, def) {
    const wrap = document.createElement('span'); wrap.className = 'field';
    if (def.label) { const lab = document.createElement('span'); lab.className = 'field-label'; lab.textContent = def.label; wrap.appendChild(lab); }
    let el;
    if (def.kind === 'select') {
      el = document.createElement('select');
      def.options.forEach(([val, text]) => {
        const o = document.createElement('option'); o.value = val; o.textContent = text;
        if (String(block.fields[key]) === String(val)) o.selected = true; el.appendChild(o);
      });
    } else {
      el = document.createElement('input'); el.type = def.kind === 'number' ? 'number' : 'text';
      el.value = block.fields[key]; el.size = Math.max(2, Math.min(14, String(block.fields[key]).length + 2));
    }
    el.dataset.owner = block.id; el.dataset.field = key; wrap.appendChild(el); return wrap;
  }
  function renderSingle(b) {
    const def = DEFS[b.type]; const el = document.createElement('div');
    el.className = 'blk shape-' + def.shape + (b.type === 'program' ? ' root' : '');
    el.dataset.id = b.id; el.style.setProperty('--c', def.color);
    const head = document.createElement('div'); head.className = 'blk-head';
    const label = document.createElement('span'); label.className = 'blk-label'; label.textContent = def.label;
    head.appendChild(label);
    for (const k in def.fields) head.appendChild(fieldControl(b, k, def.fields[k]));
    for (const k in (def.inputs || {})) {
      const lab = def.inputs[k], slot = document.createElement('span'); slot.className = 'input-wrap';
      if (lab) { const l = document.createElement('span'); l.className = 'slot-inline-label'; l.textContent = lab; slot.appendChild(l); }
      const inp = document.createElement('span'); inp.className = 'input-slot'; inp.dataset.owner = b.id; inp.dataset.slot = k;
      const v = b.inputs[k];
      if (v && v.kind === 'block') inp.appendChild(renderSingle(v.block));
      else { const ph = document.createElement('span'); ph.className = 'placeholder'; ph.textContent = lab || 'value'; inp.appendChild(ph); }
      slot.appendChild(inp); head.appendChild(slot);
    }
    if (def.shape !== 'value' && b.type !== 'program') {
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
      del.title = 'delete'; del.dataset.delete = b.id; head.appendChild(del);
    }
    el.appendChild(head);
    for (const k in (def.statements || {})) {
      const slot = document.createElement('div'); slot.className = 'stmt-slot';
      slot.dataset.owner = b.id; slot.dataset.slot = k;
      const lab = document.createElement('div'); lab.className = 'slot-label'; lab.textContent = def.statements[k];
      slot.appendChild(lab);
      (b.statements[k] || []).forEach(ch => slot.appendChild(renderStack(ch)));
      const add = document.createElement('div'); add.className = 'slot-add';
      add.dataset.owner = b.id; add.dataset.slot = k; add.textContent = 'add block'; slot.appendChild(add);
      el.appendChild(slot);
    }
    return el;
  }
  function renderStack(b) {
    const wrap = document.createElement('div'); wrap.className = 'stack';
    const db = document.createElement('div'); db.className = 'drop-before'; db.dataset.insertBefore = b.id;
    wrap.appendChild(db); wrap.appendChild(renderSingle(b));
    if (b.next) wrap.appendChild(renderStack(b.next));
    return wrap;
  }
  function renderWorkspace() {
    workspaceEl.innerHTML = ''; workspaceEl.appendChild(renderSingle(state.program));
    let n = 0; eachBlock(state.program, () => n++);
    $('#canvasCount').textContent = n + ' blocks';
    renderPalette(); applyCursor();
  }
  function renderCategories() {
    catEl.innerHTML = '';
    for (const key in CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'cat' + (state.category === key ? ' active' : '');
      btn.dataset.cat = key; btn.textContent = CATEGORIES[key].label; catEl.appendChild(btn);
    }
  }
  function renderPalette() {
    paletteEl.innerHTML = '';
    const q = state.search.trim().toLowerCase(); let count = 0;
    Object.keys(DEFS).forEach(type => {
      const d = DEFS[type]; if (d.fixed) return;
      if (state.category && d.category !== state.category) return;
      if (q && (type + ' ' + d.label).toLowerCase().indexOf(q) < 0) return;
      count++;
      const item = document.createElement('div'); item.className = 'palette-item';
      item.style.setProperty('--c', d.color); item.dataset.palette = type;
      const dot = document.createElement('span'); dot.className = 'pi-dot';
      const name = document.createElement('span'); name.textContent = d.label;
      item.appendChild(dot); item.appendChild(name); paletteEl.appendChild(item);
    });
    if (!count) { const e = document.createElement('div'); e.className = 'palette-empty'; e.textContent = '-- no matches --'; paletteEl.appendChild(e); }
    $('#paletteCount').textContent = count;
    applyPaletteFocus();
  }

  // ---------- 代码生成 ----------
  function highlight(line) {
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
    out += esc(line.slice(last)); return out || ' ';
  }
  function renderCode() {
    const lines = state.code.split('\n'); codeEl.innerHTML = '';
    lines.forEach((ln, i) => {
      const row = document.createElement('div'); row.className = 'code-line'; row.dataset.line = i;
      row.innerHTML = '<span class="ln">' + (i + 1) + '</span><span class="src">' + highlight(ln) + '</span>';
      codeEl.appendChild(row);
    });
    $('#statusLines').textContent = lines.length + ' LINES';
  }
  function updateCode() {
    if (state.editing) return;
    const res = generate(state.lang, state.program);
    state.code = res.code; state.lineMap = res.lineMap;
    $('#statusLang').textContent = LANGS.find(l => l.id === state.lang).label;
    let n = 0; eachBlock(state.program, () => n++);
    $('#statusBlocks').textContent = n + ' BLOCKS';
    renderCode(); applyHighlight(); save();
  }

  // ---------- 高亮联动 ----------
  function clearHighlights() {
    workspaceEl.querySelectorAll('.blk.selected').forEach(e => e.classList.remove('selected'));
    codeEl.querySelectorAll('.code-line.active').forEach(e => e.classList.remove('active'));
  }
  function applyHighlight() {
    codeEl.querySelectorAll('.code-line.active').forEach(e => e.classList.remove('active'));
    if (!state.selected) return;
    const r = state.lineMap[state.selected]; if (!r) return;
    codeEl.querySelectorAll('.code-line').forEach(row => {
      const i = +row.dataset.line; if (i >= r[0] && i <= r[1]) row.classList.add('active');
    });
    const blk = workspaceEl.querySelector('.blk[data-id="' + state.selected + '"]');
    if (blk) blk.classList.add('selected');
  }
  function selectBlock(id, scroll) {
    state.selected = id; state.kbCursor = id; clearHighlights(); applyHighlight(); applyCursor();
    if (scroll && id) { const blk = workspaceEl.querySelector('.blk[data-id="' + id + '"]'); if (blk) blk.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function blockForLine(line) {
    let best = null, bestSpan = Infinity;
    for (const id in state.lineMap) { const [s, e] = state.lineMap[id]; if (line >= s && line <= e) { const span = e - s; if (span < bestSpan) { bestSpan = span; best = id; } } }
    return best;
  }

  // ---------- 键盘游标渲染 ----------
  function applyCursor() {
    workspaceEl.querySelectorAll('.blk.kb-cursor').forEach(e => e.classList.remove('kb-cursor'));
    if (state.focusPane === 'canvas' && state.kbCursor) {
      const el = workspaceEl.querySelector('.blk[data-id="' + state.kbCursor + '"]');
      if (el) el.classList.add('kb-cursor');
    }
  }
  function applyPaletteFocus() {
    paletteEl.querySelectorAll('.palette-item').forEach(e => e.classList.remove('kb-focus'));
    if (state.focusPane === 'palette') {
      const items = paletteItems();
      if (items.length) {
        state.kbPalette = Math.max(0, Math.min(state.kbPalette, items.length - 1));
        items[state.kbPalette].classList.add('kb-focus');
        items[state.kbPalette].scrollIntoView({ block: 'nearest' });
      }
    }
  }
  function setFocus(pane) {
    state.focusPane = pane;
    Object.keys(panes).forEach(k => panes[k].classList.toggle('active', k === pane));
    if (pane === 'canvas') { if (!state.kbCursor) state.kbCursor = visibleBlocks()[0] && visibleBlocks()[0].id; applyCursor(); }
    else { workspaceEl.querySelectorAll('.blk.kb-cursor').forEach(e => e.classList.remove('kb-cursor')); }
    if (pane === 'palette') applyPaletteFocus();
    const names = { palette: 'BLOCKS', canvas: 'CANVAS', code: 'SOURCE' };
    echo('focus: ' + names[pane]);
  }

  // ---------- 拖拽 ----------
  let drag = null, suppressClickUntil = 0;
  function startDrag(e) {
    if (e.button !== undefined && e.button !== 0) return;
    let block = null, fromPalette = false;
    const pi = e.target.closest('[data-palette]');
    if (pi) { block = createBlock(pi.dataset.palette); fromPalette = true; }
    else {
      const head = e.target.closest('.blk-head'); if (!head) return;
      if (e.target.closest('input,select,button,.input-slot')) return;
      const el = head.closest('.blk'); if (!el || el.classList.contains('root')) return;
      const loc = locate(state.program, el.dataset.id); if (!loc) return; block = loc.block;
    }
    e.preventDefault();
    const def = DEFS[block.type], ghost = document.createElement('div');
    ghost.className = 'drag-ghost'; ghost.style.setProperty('--c', def.color); ghost.textContent = def.label;
    document.body.appendChild(ghost);
    drag = { block, fromPalette, ghost, moved: false, hot: null, sx: e.clientX, sy: e.clientY };
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd, { once: true });
  }
  function moveGhost(x, y) { drag.ghost.style.left = (x + 14) + 'px'; drag.ghost.style.top = (y + 10) + 'px'; }
  function resolveDrop(x, y) {
    const el = document.elementFromPoint(x, y); if (!el) return null;
    const before = el.closest('[data-insert-before]'); if (before) return { kind: 'before', id: before.dataset.insertBefore };
    const add = el.closest('.slot-add'); if (add) return { kind: 'slot', owner: add.dataset.owner, slot: add.dataset.slot };
    const slot = el.closest('.stmt-slot'); if (slot) return { kind: 'slot', owner: slot.dataset.owner, slot: slot.dataset.slot };
    const inp = el.closest('.input-slot'); if (inp) return { kind: 'input', owner: inp.dataset.owner, slot: inp.dataset.slot };
    return null;
  }
  function hotEl(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest('[data-insert-before],.slot-add,.stmt-slot,.input-slot') : null; }
  function onDragMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 5) drag.moved = true;
    moveGhost(e.clientX, e.clientY);
    const el = hotEl(e.clientX, e.clientY);
    if (drag.hot !== el) { if (drag.hot) drag.hot.classList.remove('drop-hot'); drag.hot = el; if (drag.hot) drag.hot.classList.add('drop-hot'); }
  }
  function onDragEnd(e) {
    window.removeEventListener('pointermove', onDragMove); if (!drag) return;
    const d = drag; drag = null;
    if (d.hot) d.hot.classList.remove('drop-hot'); d.ghost.remove();
    const target = resolveDrop(e.clientX, e.clientY), shape = DEFS[d.block.type].shape;
    if (!d.fromPalette) {
      if (target) { const ids = [target.id, target.owner].filter(Boolean); if (ids.some(id => locate(d.block, id))) { renderWorkspace(); updateCode(); return; } }
      detach(state.program, d.block.id);
    }
    let placed = false;
    if (target) {
      if (target.kind === 'before' && shape !== 'value') placed = insertBefore(state.program, target.id, d.block);
      else if (target.kind === 'slot' && shape !== 'value') placed = appendStmt(state.program, target.owner, target.slot, d.block);
      else if (target.kind === 'input' && shape === 'value') placed = setInput(state.program, target.owner, target.slot, d.block);
    }
    if (!placed && shape !== 'value') appendStmt(state.program, state.program.id, 'body', d.block);
    if (d.moved || d.fromPalette) pushUndo();
    state.selected = d.block.id; state.kbCursor = d.block.id;
    renderWorkspace(); updateCode(); applyHighlight();
    echo('added: ' + DEFS[d.block.type].label);
  }

  // ---------- 键盘操作：添加 / 删除 / 编辑字段 ----------
  function addSelectedPaletteBlock() {
    const items = paletteItems(); if (!items.length) return;
    const type = items[state.kbPalette].dataset.palette;
    const block = createBlock(type), shape = DEFS[type].shape;
    pushUndo();
    // 添加到当前光标积木之后（同一容器），否则加到主程序
    let placed = false;
    if (state.kbCursor && shape !== 'value') {
      const loc = locate(state.program, state.kbCursor);
      if (loc && loc.parent && loc.key === 'next') { block.next = loc.block.next; loc.block.next = block; placed = true; }
    }
    if (!placed && shape !== 'value') appendStmt(state.program, state.program.id, 'body', block);
    if (shape === 'value' && state.kbCursor) {
      const loc = locate(state.program, state.kbCursor);
      if (loc && loc.block.inputs) { const slot = Object.keys(loc.block.inputs)[0]; if (slot) { setInput(state.program, loc.block.id, slot, block); placed = true; } }
    }
    state.kbCursor = block.id; state.selected = block.id;
    renderWorkspace(); updateCode(); applyHighlight(); echo('added: ' + DEFS[type].label);
  }
  function deleteCursorBlock() {
    if (!state.kbCursor) return;
    const loc = locate(state.program, state.kbCursor);
    if (!loc || !loc.parent) { toast('cannot delete root'); return; }
    const all = visibleBlocks(), idx = all.findIndex(b => b.id === state.kbCursor);
    const nextCursor = all[idx + 1] ? all[idx + 1].id : (all[idx - 1] ? all[idx - 1].id : null);
    pushUndo(); detach(state.program, state.kbCursor);
    state.kbCursor = nextCursor; state.selected = nextCursor;
    renderWorkspace(); updateCode(); applyHighlight(); echo('deleted block');
  }
  function editCursorField(dir) {
    if (!state.kbCursor) return;
    const el = workspaceEl.querySelector('.blk[data-id="' + state.kbCursor + '"]');
    if (!el) return;
    const controls = [...el.querySelectorAll('input,select')];
    if (!controls.length) { echo('no editable field'); return; }
    controls[0].focus();
    if (controls[0].tagName === 'SELECT') {
      const i = controls[0].selectedIndex;
      controls[0].selectedIndex = Math.max(0, Math.min(controls[0].options.length - 1, i + dir));
      controls[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    echo('editing field');
  }
  function moveCursor(dir) {
    const all = visibleBlocks(); if (!all.length) return;
    let idx = all.findIndex(b => b.id === state.kbCursor);
    if (idx < 0) idx = 0; else idx = Math.max(0, Math.min(all.length - 1, idx + dir));
    state.kbCursor = all[idx].id; state.selected = all[idx].id;
    clearHighlights(); applyHighlight(); applyCursor();
    const el = workspaceEl.querySelector('.blk[data-id="' + state.kbCursor + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
    echo('cursor: ' + DEFS[all[idx].type].label);
  }

  // ---------- 编辑代码 ----------
  function enterEdit() {
    if (state.editing) return;
    setFocus('code'); state.editing = true;
    codeEl.hidden = true; codeEditor.hidden = false; $('#editActions').hidden = false;
    codeEditor.value = state.code;
    codeEditor.style.height = Math.max(200, codeEl.scrollHeight) + 'px';
    codeEditor.focus();
    echo('EDIT MODE — Ctrl+S apply, Esc cancel');
  }
  function exitEdit(apply) {
    if (!state.editing) return;
    if (apply) {
      const code = codeEditor.value;
      try {
        const { program } = parse(code, state.lang);
        if (!program.statements.body.length) throw new Error('empty result');
        pushUndo(); state.program = program; state.selected = null; state.kbCursor = null;
        state.editing = false;
        codeEditor.hidden = true; codeEl.hidden = false; $('#editActions').hidden = true;
        renderWorkspace(); updateCode(); toast('code synced to blocks'); echo('synced code -> blocks');
        return;
      } catch (err) {
        toast('parse error: ' + err.message, true); echo('ERR: ' + err.message); return;
      }
    }
    state.editing = false;
    codeEditor.hidden = true; codeEl.hidden = false; $('#editActions').hidden = true;
    updateCode(); echo('edit cancelled');
  }

  // ---------- 运行 ----------
  function runProgram() {
    if (state.editing) { toast('apply or cancel edit first', true); return; }
    consoleEl.innerHTML = '';
    const res = run(state.program, line => {
      const d = document.createElement('div'); d.className = 'console-line'; d.textContent = line; consoleEl.appendChild(d);
    });
    if (!res.output.length) { const d = document.createElement('div'); d.className = 'console-line muted'; d.textContent = '(no output)'; consoleEl.appendChild(d); }
    consoleEl.scrollTop = consoleEl.scrollHeight;
    echo('run: ' + res.output.length + ' lines, ' + res.ms + 'ms — $? = 0');
  }

  // ---------- 导入导出 / 复制 ----------
  function exportCode() {
    const ext = LANGS.find(l => l.id === state.lang).ext;
    const blob = new Blob([state.code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'program' + ext; a.click(); URL.revokeObjectURL(a.href);
    toast('exported program' + ext); echo('saved: program' + ext);
  }
  function importCode(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { program } = parse(String(reader.result), state.lang);
        if (!program.statements.body.length) throw new Error('no statements');
        pushUndo(); state.program = program; state.selected = null; state.kbCursor = null;
        renderWorkspace(); updateCode(); toast('imported'); echo('imported -> blocks');
      } catch (err) { toast('import error: ' + err.message, true); }
    };
    reader.readAsText(file);
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(state.code); toast('copied'); echo('yanked to clipboard'); }
    catch (e) { toast('copy failed', true); }
  }

  // ---------- 命令栏 / Toast ----------
  function echo(msg) { $('#cmdEcho').innerHTML = esc(msg); }
  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg; toastEl.hidden = false;
    toastEl.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
  }

  // ---------- 浮层（帮助 / 示例） ----------
  function openOverlay(type) {
    state.overlay = type; overlayEl.hidden = false; overlayBox.innerHTML = '';
    if (type === 'help') {
      overlayBox.innerHTML = '<h2>┤ KEYBINDINGS ├</h2>' +
        [['Tab / Shift+Tab', '切换面板'], ['↑ / ↓', '导航积木 / 积木库'], ['Enter', '添加积木 / 编辑字段'],
         ['Space', '从积木库添加选中积木'], ['Delete / Backspace', '删除积木'], ['e', '编辑代码'],
         ['Ctrl+S', '应用代码 / 导出'], ['F5 / r', '运行'], ['u / Ctrl+Z', '撤销'], ['Ctrl+Shift+Z', '重做'],
         ['F2', '切换示例'], ['1 / 2 / 3', '切换语言 C/C++/Swift'], ['c', '复制代码'], ['Esc', '关闭浮层 / 取消编辑']]
        .map(([k, d]) => `<div class="overlay-row"><span class="keys">${k}</span><span class="desc">${d}</span></div>`).join('') +
        '<div class="overlay-close">按 Esc 或任意方向键关闭</div>';
    } else if (type === 'examples') {
      overlayBox.innerHTML = '<h2>┤ EXAMPLES ├</h2>';
      Object.keys(EXAMPLES).forEach((k, i) => {
        const it = document.createElement('div'); it.className = 'overlay-item'; it.dataset.example = k;
        it.textContent = (i + 1) + '. ' + EXAMPLES[k].name;
        if (i === state.kbExample) it.classList.add('kb-focus');
        overlayBox.appendChild(it);
      });
      overlayBox.insertAdjacentHTML('beforeend', '<div class="overlay-close">↑↓ 选择 · Enter 载入 · Esc 关闭</div>');
    }
    state.kbExample = state.kbExample || 0;
  }
  function closeOverlay() { state.overlay = null; overlayEl.hidden = true; }
  function moveOverlay(dir) {
    if (state.overlay !== 'examples') return;
    const items = [...overlayBox.querySelectorAll('.overlay-item')]; if (!items.length) return;
    state.kbExample = Math.max(0, Math.min(items.length - 1, state.kbExample + dir));
    items.forEach((it, i) => it.classList.toggle('kb-focus', i === state.kbExample));
    items[state.kbExample].scrollIntoView({ block: 'nearest' });
  }
  function chooseOverlay() {
    if (state.overlay === 'examples') {
      const key = Object.keys(EXAMPLES)[state.kbExample]; if (!key) return;
      pushUndo(); state.program = EXAMPLES[key].build(); state.selected = null; state.kbCursor = null;
      closeOverlay(); renderWorkspace(); updateCode(); toast('loaded: ' + EXAMPLES[key].name); echo('loaded example: ' + EXAMPLES[key].name);
    }
  }

  // ---------- 键盘总控 ----------
  function onKeydown(e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    // 浮层优先
    if (state.overlay) {
      if (k === 'Escape') { e.preventDefault(); closeOverlay(); }
      else if (k === 'ArrowDown') { e.preventDefault(); moveOverlay(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); moveOverlay(-1); }
      else if (k === 'Enter') { e.preventDefault(); chooseOverlay(); }
      return;
    }
    // 编辑模式
    if (state.editing) {
      if (mod && k.toLowerCase() === 's') { e.preventDefault(); exitEdit(true); }
      else if (k === 'Escape') { e.preventDefault(); exitEdit(false); }
      return; // 其他键交给 textarea
    }
    // 输入框内：只处理 Escape
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      if (k === 'Escape') e.target.blur();
      return;
    }
    // 全局功能键
    if (k === 'F1') { e.preventDefault(); openOverlay('help'); return; }
    if (k === 'F2') { e.preventDefault(); openOverlay('examples'); return; }
    if (k === 'F5') { e.preventDefault(); runProgram(); return; }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); exportCode(); return; }
    if (k === 'Tab') { e.preventDefault(); const order = ['palette','canvas','code']; const i = order.indexOf(state.focusPane); setFocus(order[(i + (e.shiftKey ? -1 : 1) + 3) % 3]); return; }

    // 面板相关
    if (state.focusPane === 'palette') {
      const items = paletteItems();
      if (k === 'ArrowDown') { e.preventDefault(); state.kbPalette = Math.min(items.length - 1, state.kbPalette + 1); applyPaletteFocus(); }
      else if (k === 'ArrowUp') { e.preventDefault(); state.kbPalette = Math.max(0, state.kbPalette - 1); applyPaletteFocus(); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); addSelectedPaletteBlock(); }
    } else if (state.focusPane === 'canvas') {
      if (k === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteCursorBlock(); }
      else if (k === 'Enter') { e.preventDefault(); editCursorField(0); }
      else if (k === ' ' || k === 'i') { e.preventDefault(); setFocus('palette'); }
      else if (k === 'e') { e.preventDefault(); enterEdit(); }
    } else if (state.focusPane === 'code') {
      if (k === 'e') { e.preventDefault(); enterEdit(); }
      else if (k === 'c' && !mod) { e.preventDefault(); copyCode(); }
    }
    // 全局单键快捷键
    if (k === 'r') { e.preventDefault(); runProgram(); }
    else if (k === 'u') { e.preventDefault(); undo(); }
    else if (k === '1') { e.preventDefault(); setLang('c'); }
    else if (k === '2') { e.preventDefault(); setLang('cpp'); }
    else if (k === '3') { e.preventDefault(); setLang('swift'); }
  }
  function setLang(lang) {
    if (state.editing) exitEdit(false);
    state.lang = lang;
    langEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.lang === lang));
    updateCode(); echo('language: ' + LANGS.find(l => l.id === lang).label);
  }

  // ---------- 持久化 ----------
  function save() { try { localStorage.setItem('blockide_state', JSON.stringify({ program: state.program, lang: state.lang })); } catch (e) {} }
  function load() {
    try {
      const raw = localStorage.getItem('blockide_state'); if (!raw) return false;
      const o = JSON.parse(raw);
      if (o.program && o.program.type === 'program' && o.program.statements) { state.program = o.program; state.lang = o.lang || 'swift'; return true; }
    } catch (e) {}
    return false;
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    workspaceEl.addEventListener('pointerdown', startDrag);
    paletteEl.addEventListener('pointerdown', startDrag);
    const onField = e => {
      const f = e.target.closest('[data-field][data-owner]'); if (!f) return;
      const loc = locate(state.program, f.dataset.owner); if (!loc) return;
      if (loc.block.fields[f.dataset.field] === f.value) return;
      pushUndo(); loc.block.fields[f.dataset.field] = f.value; updateCode();
    };
    workspaceEl.addEventListener('input', onField); workspaceEl.addEventListener('change', onField);
    workspaceEl.addEventListener('click', e => {
      if (Date.now() < suppressClickUntil) return;
      const del = e.target.closest('[data-delete]');
      if (del) { pushUndo(); const removed = detach(state.program, del.dataset.delete); if (removed && state.selected === removed.id) state.selected = null; renderWorkspace(); updateCode(); return; }
      const head = e.target.closest('.blk-head');
      if (head && !e.target.closest('input,select,button,.input-slot')) { const blk = head.closest('.blk'); if (blk && !blk.classList.contains('root')) { selectBlock(blk.dataset.id, false); setFocus('canvas'); } }
    });
    catEl.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { state.category = b.dataset.cat; state.kbPalette = 0; renderPalette(); } });
    $('#blockSearch').addEventListener('input', e => { state.search = e.target.value; state.category = state.search ? '' : 'flow'; state.kbPalette = 0; renderCategories(); renderPalette(); });
    langEl.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
    codeEl.addEventListener('click', e => { const row = e.target.closest('.code-line'); if (!row) return; const id = blockForLine(+row.dataset.line); selectBlock(id || null, !!id); setFocus('code'); });
    $('#clearBtn').addEventListener('click', () => { consoleEl.innerHTML = ''; });
    $('#applyEdit').addEventListener('click', () => exitEdit(true));
    $('#cancelEdit').addEventListener('click', () => exitEdit(false));
    menuItems();
    Object.keys(panes).forEach(k => panes[k].addEventListener('pointerdown', () => setFocus(k)));
    overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeOverlay(); const it = e.target.closest('[data-example]'); if (it) { state.kbExample = Object.keys(EXAMPLES).indexOf(it.dataset.example); chooseOverlay(); } });
    document.addEventListener('keydown', onKeydown);
  }
  function menuItems() {
    document.querySelectorAll('.menu-item').forEach(m => m.addEventListener('click', () => {
      if (m.textContent.includes('帮助')) openOverlay('help');
      else if (m.textContent.includes('示例')) openOverlay('examples');
      else if (m.textContent.includes('运行')) runProgram();
    }));
  }

  // ---------- 初始化 ----------
  function init() {
    if (!load()) state.program = defaultProgram();
    langEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
    renderCategories(); renderWorkspace(); updateCode(); bindEvents(); setFocus('canvas');
    echo('ready — ' + Object.keys(EXAMPLES).length + ' examples loaded. F1 for help.');
  }
  init();
})();
