/* engine.js —— 积木树解释器：遍历执行并把输出送到控制台 */
(function (global) {
  'use strict';

  function run(program, onOutput, inputProvider) {
    const env = new Map(), arrays = new Map(), out = [];
    let steps = 0, flow = null;
    const MAX = 300000;

    const emit = s => { const line = String(s); out.push(line); if (onOutput) onOutput(line); };
    const str = v => (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));

    function evalExpr(input) {
      if (!input) return 0;
      if (input.kind === 'text') {
        const t = input.text.trim(); if (t === '') return 0;
        const n = Number(t); return isNaN(n) ? t : n;
      }
      const b = input.block; if (!b) return 0;
      const f = b.fields;
      switch (b.type) {
        case 'num': return Number(f.v) || 0;
        case 'str': return String(f.v);
        case 'boolVal': return f.v === 'true';
        case 'varRef': return env.has(f.name) ? env.get(f.name) : 0;
        case 'arrayGet': {
          const arr = arrays.get(f.name) || [];
          return arr[Math.floor(Number(evalExpr(b.inputs.index)) || 0)] ?? 0;
        }
        case 'arrayLength': return (arrays.get(f.name) || []).length;
        case 'not': return !truthy(evalExpr(b.inputs.value));
        case 'strlen': return str(evalExpr(b.inputs.value)).length;
        case 'mathFunc': {
          const a = Number(evalExpr(b.inputs.a)) || 0, c = Number(evalExpr(b.inputs.b)) || 0;
          switch (f.fn) {
            case 'abs': return Math.abs(a);
            case 'sqrt': return Math.sqrt(a);
            case 'pow': return Math.pow(a, c);
            case 'min': return Math.min(a, c);
            case 'max': return Math.max(a, c);
            case 'round': return Math.round(a);
          }
          return a;
        }
        case 'binary': {
          const a = evalExpr(b.inputs.a), c = evalExpr(b.inputs.b), op = f.op;
          switch (op) {
            case '+': return (typeof a === 'string' || typeof c === 'string') ? str(a) + str(c) : Number(a) + Number(c);
            case '-': return Number(a) - Number(c);
            case '*': return Number(a) * Number(c);
            case '/': return Number(c) === 0 ? 0 : Number(a) / Number(c);
            case '%': return Number(a) % Number(c);
            case '>': return a > c; case '<': return a < c;
            case '>=': return a >= c; case '<=': return a <= c;
            case '==': return a == c; case '!=': return a != c;
            case '&&': return truthy(a) && truthy(c);
            case '||': return truthy(a) || truthy(c);
          }
          return 0;
        }
      }
      return 0;
    }

    function truthy(v) { return typeof v === 'boolean' ? v : Number(v) !== 0 && v !== '' && v !== false; }

    function exec(b) {
      while (b) {
        if (++steps > MAX) { emit('⚠️ 达到执行步数上限，已停止（可能有死循环）'); return; }
        const f = b.fields;
        switch (b.type) {
          case 'declare': env.set(f.name, evalExpr(b.inputs.value)); break;
          case 'assign': env.set(f.name, evalExpr(b.inputs.value)); break;
          case 'inc': env.set(f.name, (Number(env.get(f.name)) || 0) + (f.op === '++' ? 1 : -1)); break;
          case 'print': emit(str(evalExpr(b.inputs.value))); break;
          case 'input': {
            const v = inputProvider ? inputProvider(f.name) : null;
            env.set(f.name, v === null || v === undefined || v === '' ? 0 : (Number(v) || v));
            break;
          }
          case 'comment': case 'funcDef': case 'funcCall': break;
          case 'arrayDeclare': {
            const n = Math.max(0, Math.floor(Number(evalExpr(b.inputs.size)) || 0));
            arrays.set(f.name, new Array(n).fill(0)); break;
          }
          case 'arraySet': {
            const arr = arrays.get(f.name) || [];
            arr[Math.floor(Number(evalExpr(b.inputs.index)) || 0)] = evalExpr(b.inputs.value);
            arrays.set(f.name, arr); break;
          }
          case 'break': flow = 'break'; return;
          case 'continue': flow = 'continue'; return;
          case 'if': if (truthy(evalExpr(b.inputs.cond))) execList(b.statements.body); break;
          case 'ifelse':
            if (truthy(evalExpr(b.inputs.cond))) execList(b.statements.body);
            else execList(b.statements.els);
            break;
          case 'while': {
            let guard = 0;
            while (truthy(evalExpr(b.inputs.cond))) {
              execList(b.statements.body);
              if (flow === 'break') { flow = null; break; }
              if (flow === 'continue') flow = null;
              if (++guard > 100000) { emit('⚠️ 循环次数过多，已停止'); return; }
            }
            break;
          }
          case 'for': {
            const from = Number(evalExpr(b.inputs.from)) || 0, to = Number(evalExpr(b.inputs.to)) || 0;
            for (let i = from; i < to; i++) {
              env.set(f.var, i);
              execList(b.statements.body);
              if (flow === 'break') { flow = null; break; }
              if (flow === 'continue') flow = null;
              if (++steps > MAX) { emit('⚠️ 达到执行步数上限，已停止'); return; }
            }
            break;
          }
          case 'forEach': {
            const arr = arrays.get(evalExpr(b.inputs.array) || '') || [];
            for (const v of arr) {
              env.set(f.var, v);
              execList(b.statements.body);
              if (flow === 'break') { flow = null; break; }
              if (flow === 'continue') flow = null;
            }
            break;
          }
          case 'return': return { value: evalExpr(b.inputs.value) };
        }
        b = b.next;
      }
      return null;
    }

    function execList(arr) { (arr || []).forEach(x => { exec(x); if (flow) return; }); }

    const start = Date.now();
    try { execList(program.statements.body); }
    catch (e) { emit('❌ 运行错误: ' + e.message); }
    return { output: out, ms: Date.now() - start };
  }

  global.Engine = { run };
})(window);
