/* app.js —— 交互主控：渲染 / 拖拽 / 双向同步 / 撤销重做 / 体验增强 */
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
    { id: 'swift', label: 'Swift', ext: '.swift' }
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
    undoStack: [], redoStack: []
  };

  const $ = s => document.querySelector(s);
  const workspaceEl = $('#workspace'), paletteEl = $('#palette'), catEl = $('#categories');
  const codeEl = $('#code'), codeEditor = $('#codeEditor'), consoleEl = $('#console');
  const statusEl = $('#status'), langEl = $('#langSwitch'), toastEl = $('#toast');

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

  // ---------- 撤销 / 重做 ----------
  function snapshot() { return { program: clone(state.program), selected: state.selected }; }
  function pushUndo() {
    state.undoStack.push(snapshot());
    if (state.undoStack.length > 60) state.undoStack.shift();
    state.redoStack = [];
    updateUndoButtons();
  }
  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(snapshot());
    const s = state.undoStack.pop();
    state.program = s.program; state.selected = s.selected;
    renderWorkspace(); updateCode(); updateUndoButtons(); toast('已撤销');
  }
  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(snapshot());
    const s = state.redoStack.pop();
    state.program = s.program; state.selected = s.selected;
    renderWorkspace(); updateCode(); updateUndoButtons(); toast('已重做');
  }
  function updateUndoButtons() {
    $('#undoBtn').disabled = !state.undoStack.length;
    $('#redoBtn').disabled = !state.redoStack.length;
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
      else { const ph = document.createElement('span'); ph.className = 'placeholder'; ph.textContent = lab || '值'; inp.appendChild(ph); }
      slot.appendChild(inp); head.appendChild(slot);
    }
    if (def.shape !== 'value' && b.type !== 'program') {
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
      del.title = '删除积木'; del.dataset.delete = b.id; head.appendChild(del);
    }
    el.appendChild(head);
    for (const k in (def.statements || {})) {
      const slot = document.createElement('div'); slot.className = 'stmt-slot';
      slot.dataset.owner = b.id; slot.dataset.slot = k;
      const lab = document.createElement('div'); lab.className = 'slot-label'; lab.textContent = def.statements[k];
      slot.appendChild(lab);
      (b.statements[k] || []).forEach(ch => slot.appendChild(renderStack(ch)));
      const add = document.createElement('div'); add.className = 'slot-add';
      add.dataset.owner = b.id; add.dataset.slot = k; add.textContent = '＋ 拖入积木'; slot.appendChild(add);
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
    workspaceEl.innerHTML = ''; workspaceEl.appendChild(renderSingle(state.program)); renderPalette();
  }

  function renderCategories() {
    catEl.innerHTML = '';
    for (const key in CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'cat' + (state.category === key ? ' active' : '');
      btn.dataset.cat = key; btn.style.setProperty('--c', CATEGORIES[key].color);
      btn.textContent = CATEGORIES[key].label; catEl.appendChild(btn);
    }
  }
  function renderPalette() {
    paletteEl.innerHTML = '';
    const q = state.search.trim().toLowerCase();
    let count = 0;
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
    if (!count) { const e = document.createElement('div'); e.className = 'palette-empty'; e.textContent = '没有匹配的积木'; paletteEl.appendChild(e); }
  }

  // ---------- 代码生成 / 高亮 ----------
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
  }
  function updateCode() {
    if (state.editing) return;
    const res = generate(state.lang, state.program);
    state.code = res.code; state.lineMap = res.lineMap;
    $('#codeLang').textContent = LANGS.find(l => l.id === state.lang).label;
    renderCode(); applyHighlight();
    let n = 0; eachBlock(state.program, () => n++);
    statusEl.textContent = `${n} 块积木 · ${state.code.split('\n').length} 行代码`;
    save();
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
    state.selected = id; clearHighlights(); applyHighlight();
    if (scroll && id) { const blk = workspaceEl.querySelector('.blk[data-id="' + id + '"]'); if (blk) blk.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function blockForLine(line) {
    let best = null, bestSpan = Infinity;
    for (const id in state.lineMap) { const [s, e] = state.lineMap[id]; if (line >= s && line <= e) { const span = e - s; if (span < bestSpan) { bestSpan = span; best = id; } } }
    return best;
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
    if (d.moved) { pushUndo(); suppressClickUntil = Date.now() + 120; }
    else if (d.fromPalette) pushUndo();
    state.selected = d.block.id; renderWorkspace(); updateCode(); applyHighlight();
  }

  // ---------- 编辑代码 ↔ 积木 ----------
  function enterEdit() {
    if (state.editing) return;
    state.editing = true;
    codeEl.hidden = true; codeEditor.hidden = false;
    $('#editHint').hidden = false; $('#editActions').hidden = false;
    $('#editToggle').textContent = '✎ 编辑中'; $('#editToggle').classList.add('active');
    codeEditor.value = state.code;
    codeEditor.style.height = Math.max(200, codeEl.scrollHeight) + 'px';
    codeEditor.focus();
    statusEl.textContent = '编辑模式：修改代码后点击「应用」';
  }
  function exitEdit(apply) {
    if (!state.editing) return;
    if (apply) {
      const code = codeEditor.value;
      try {
        const { program } = parse(code, state.lang);
        if (!program.statements.body.length) throw new Error('解析结果为空');
        pushUndo();
        state.program = program; state.selected = null;
        state.editing = false;
        codeEditor.hidden = true; codeEl.hidden = false;
        $('#editHint').hidden = true; $('#editActions').hidden = true;
        $('#editToggle').textContent = '✎ 编辑'; $('#editToggle').classList.remove('active');
        renderWorkspace(); updateCode(); toast('✓ 代码已同步回积木');
        return;
      } catch (err) {
        toast('✗ 解析失败：' + err.message, true);
        statusEl.textContent = '解析失败：' + err.message + '（保留编辑内容，可继续修改）';
        return;
      }
    }
    state.editing = false;
    codeEditor.hidden = true; codeEl.hidden = false;
    $('#editHint').hidden = true; $('#editActions').hidden = true;
    $('#editToggle').textContent = '✎ 编辑'; $('#editToggle').classList.remove('active');
    updateCode();
  }

  // ---------- 运行 / 控制台 ----------
  function runProgram() {
    if (state.editing) { toast('请先应用或取消代码编辑', true); return; }
    consoleEl.innerHTML = '';
    const res = run(state.program, line => {
      const d = document.createElement('div'); d.className = 'console-line'; d.textContent = line; consoleEl.appendChild(d);
    });
    if (!res.output.length) { const d = document.createElement('div'); d.className = 'console-line muted'; d.textContent = '（程序无输出）'; consoleEl.appendChild(d); }
    consoleEl.scrollTop = consoleEl.scrollHeight;
    statusEl.textContent = `${res.output.length} 行输出 · ${res.ms}ms · 运行完成`;
  }

  // ---------- 导入导出 ----------
  function exportCode() {
    const ext = LANGS.find(l => l.id === state.lang).ext;
    const blob = new Blob([state.code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'program' + ext; a.click(); URL.revokeObjectURL(a.href);
    toast('已导出 program' + ext);
  }
  function importCode(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const code = String(reader.result);
      try {
        const { program } = parse(code, state.lang);
        if (!program.statements.body.length) throw new Error('未识别到有效语句');
        pushUndo(); state.program = program; state.selected = null;
        renderWorkspace(); updateCode(); toast('✓ 已导入并转换为积木');
      } catch (err) { toast('✗ 导入失败：' + err.message, true); }
    };
    reader.readAsText(file);
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg; toastEl.hidden = false;
    toastEl.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
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
      if (head && !e.target.closest('input,select,button,.input-slot')) { const blk = head.closest('.blk'); if (blk && !blk.classList.contains('root')) selectBlock(blk.dataset.id, false); }
    });
    catEl.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { state.category = b.dataset.cat; renderPalette(); } });
    $('#blockSearch').addEventListener('input', e => { state.search = e.target.value; if (state.search) state.category = ''; else state.category = 'flow'; renderCategories(); renderPalette(); });
    langEl.addEventListener('click', e => {
      const b = e.target.closest('[data-lang]'); if (!b) return;
      if (state.editing) exitEdit(false);
      state.lang = b.dataset.lang;
      langEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      updateCode();
    });
    codeEl.addEventListener('click', e => { const row = e.target.closest('.code-line'); if (!row) return; const id = blockForLine(+row.dataset.line); selectBlock(id || null, !!id); });
    $('#runBtn').addEventListener('click', runProgram);
    $('#clearBtn').addEventListener('click', () => { consoleEl.innerHTML = ''; });
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    $('#editToggle').addEventListener('click', () => state.editing ? exitEdit(true) : enterEdit());
    $('#applyEdit').addEventListener('click', () => exitEdit(true));
    $('#cancelEdit').addEventListener('click', () => exitEdit(false));
    $('#copyBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(state.code); toast('已复制代码'); } catch (e) { toast('复制失败，请手动复制', true); }
    });
    $('#exportBtn').addEventListener('click', exportCode);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importCode(e.target.files[0]); e.target.value = ''; });
    const exSel = $('#exampleSelect');
    Object.keys(EXAMPLES).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = EXAMPLES[k].name; exSel.appendChild(o); });
    exSel.addEventListener('change', () => {
      if (!confirm('切换示例会替换当前积木，确定吗？')) { exSel.value = exSel.dataset.prev || 'sum'; return; }
      pushUndo(); state.program = EXAMPLES[exSel.value].build(); state.selected = null;
      renderWorkspace(); updateCode(); exSel.dataset.prev = exSel.value; toast('已加载示例：' + EXAMPLES[exSel.value].name);
    });
    exSel.dataset.prev = 'sum';
    // 键盘快捷键
    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportCode(); }
      else if (e.key === 'Escape' && state.editing) exitEdit(false);
    });
  }

  // ---------- 初始化 ----------
  function init() {
    if (!load()) state.program = defaultProgram();
    langEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
    renderCategories(); renderWorkspace(); updateCode(); bindEvents(); updateUndoButtons();
  }
  init();
})();
