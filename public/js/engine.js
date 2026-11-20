/* engine.js —— 积木树解释器：遍历执行并把输出送到控制台 */
(function (global) {
  'use strict';

  function run(program, onOutput) {
    const env = new Map();
    const out = [];
    let steps = 0;
    const MAX = 200000;

    const emit = s => { const line = String(s); out.push(line); if (onOutput) onOutput(line); };
    const str = v => (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));

    function evalExpr(input) {
      if (!input) return 0;
      if (input.kind === 'text') {
        const t = input.text.trim();
        if (t === '') return 0;
        const n = Number(t);
        return isNaN(n) ? t : n;
      }
      const b = input.block;
      if (!b) return 0;
      const f = b.fields;
      switch (b.type) {
        case 'num': return Number(f.v) || 0;
        case 'str': return String(f.v);
        case 'boolVal': return f.v === 'true';
        case 'varRef': return env.has(f.name) ? env.get(f.name) : 0;
        case 'binary': {
          const a = evalExpr(b.inputs.a), c = evalExpr(b.inputs.b), op = f.op;
          switch (op) {
            case '+': return (typeof a === 'string' || typeof c === 'string') ? str(a) + str(c) : Number(a) + Number(c);
            case '-': return Number(a) - Number(c);
            case '*': return Number(a) * Number(c);
            case '/': return Number(c) === 0 ? 0 : Number(a) / Number(c);
            case '%': return Number(a) % Number(c);
            case '>': return a > c;
            case '<': return a < c;
            case '>=': return a >= c;
            case '<=': return a <= c;
            case '==': return a == c;
            case '!=': return a != c;
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
          case 'print': emit(str(evalExpr(b.inputs.value))); break;
          case 'comment': break;
          case 'if': if (truthy(evalExpr(b.inputs.cond))) execList(b.statements.body); break;
          case 'ifelse': if (truthy(evalExpr(b.inputs.cond))) execList(b.statements.body); else execList(b.statements.els); break;
          case 'while': {
            let guard = 0;
            while (truthy(evalExpr(b.inputs.cond))) {
              execList(b.statements.body);
              if (++guard > 100000) { emit('⚠️ 循环次数过多，已停止'); return; }
            }
            break;
          }
          case 'for': {
            const from = Number(evalExpr(b.inputs.from)) || 0;
            const to = Number(evalExpr(b.inputs.to)) || 0;
            for (let i = from; i < to; i++) {
              env.set(f.var, i);
              execList(b.statements.body);
              if (++steps > MAX) { emit('⚠️ 达到执行步数上限，已停止'); return; }
            }
            break;
          }
          case 'return': return { value: evalExpr(b.inputs.value) };
          case 'funcDef': break;
        }
        b = b.next;
      }
      return null;
    }

    function execList(arr) { (arr || []).forEach(x => exec(x)); }

    const start = Date.now();
    try {
      execList(program.statements.body);
    } catch (e) {
      emit('❌ 运行错误: ' + e.message);
    }
    return { output: out, ms: Date.now() - start };
  }

  global.Engine = { run };
})(window);
