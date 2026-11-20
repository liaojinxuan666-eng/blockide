/* blocks.js —— 积木模型定义、分类、示例程序 */
(function (global) {
  'use strict';

  let seq = 0;
  const uid = () => 'b' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

  const TYPES = [
    ['int', '整数 int'], ['float', 'float'], ['double', 'double'],
    ['bool', '布尔 bool'], ['string', '字符串 string'], ['char', '字符 char']
  ];

  const OPS = [
    ['+', '+'], ['-', '-'], ['*', '×'], ['/', '÷'], ['%', '%'],
    ['>', '>'], ['<', '<'], ['>=', '>='], ['<=', '<='],
    ['==', '=='], ['!=', '!='], ['&&', '且 &&'], ['||', '或 ||']
  ];
  const MATH_FUNCS = [
    ['abs', '绝对值 abs'], ['sqrt', '平方根 sqrt'], ['pow', '幂 pow'],
    ['min', '最小 min'], ['max', '最大 max'], ['round', '四舍五入 round']
  ];

  // shape: hat / statement / value
  const DEFS = {
    program: {
      shape: 'hat', category: 'flow', label: '程序', color: '#5b6cff',
      statements: { body: '主程序' }, fixed: true
    },
    comment: {
      shape: 'statement', category: 'flow', label: '注释', color: '#64748b',
      fields: { text: { kind: 'text', default: '写点注释…', label: '' } }
    },
    break: { shape: 'statement', category: 'flow', label: '跳出循环 break', color: '#64748b' },
    continue: { shape: 'statement', category: 'flow', label: '继续下一轮 continue', color: '#64748b' },

    funcDef: {
      shape: 'hat', category: 'func', label: '定义函数', color: '#8b5cf6',
      fields: {
        name: { kind: 'text', default: 'myFunc', label: '名称' },
        ret: { kind: 'select', default: 'int', options: TYPES, label: '返回' },
        params: { kind: 'text', default: '', label: '参数' }
      },
      statements: { body: '函数体' }
    },
    funcCall: {
      shape: 'statement', category: 'func', label: '调用函数', color: '#8b5cf6',
      fields: { name: { kind: 'text', default: 'myFunc', label: '函数' } },
      inputs: { args: '参数(逗号分隔)' }
    },
    return: {
      shape: 'statement', category: 'func', label: '返回', color: '#8b5cf6',
      inputs: { value: '' }
    },

    declare: {
      shape: 'statement', category: 'var', label: '声明变量', color: '#0ea5e9',
      fields: {
        type: { kind: 'select', default: 'int', options: TYPES, label: '类型' },
        name: { kind: 'text', default: 'x', label: '名称' }
      },
      inputs: { value: '初始值' }
    },
    assign: {
      shape: 'statement', category: 'var', label: '赋值', color: '#0ea5e9',
      fields: { name: { kind: 'text', default: 'x', label: '变量' } },
      inputs: { value: '为' }
    },
    inc: {
      shape: 'statement', category: 'var', label: '自增/自减', color: '#0ea5e9',
      fields: {
        name: { kind: 'text', default: 'i', label: '变量' },
        op: { kind: 'select', default: '++', options: [['++', '++'], ['--', '--']], label: '' }
      }
    },
    varRef: {
      shape: 'value', category: 'var', label: '变量', color: '#0ea5e9',
      fields: { name: { kind: 'text', default: 'x', label: '' } }
    },

    print: {
      shape: 'statement', category: 'io', label: '打印', color: '#10b981',
      inputs: { value: '' }
    },
    input: {
      shape: 'statement', category: 'io', label: '读入到变量', color: '#10b981',
      fields: { name: { kind: 'text', default: 'x', label: '变量' } }
    },

    arrayDeclare: {
      shape: 'statement', category: 'array', label: '声明数组', color: '#14b8a6',
      fields: {
        type: { kind: 'select', default: 'int', options: TYPES, label: '类型' },
        name: { kind: 'text', default: 'arr', label: '名称' }
      },
      inputs: { size: '长度' }
    },
    arraySet: {
      shape: 'statement', category: 'array', label: '设置数组元素', color: '#14b8a6',
      fields: { name: { kind: 'text', default: 'arr', label: '数组' } },
      inputs: { index: '下标', value: '为' }
    },
    arrayGet: {
      shape: 'value', category: 'array', label: '数组元素', color: '#14b8a6',
      fields: { name: { kind: 'text', default: 'arr', label: '' } },
      inputs: { index: '下标' }
    },
    arrayLength: {
      shape: 'value', category: 'array', label: '数组长度', color: '#14b8a6',
      fields: { name: { kind: 'text', default: 'arr', label: '' } }
    },

    if: {
      shape: 'statement', category: 'control', label: '如果', color: '#f59e0b',
      inputs: { cond: '条件' }, statements: { body: '就' }
    },
    ifelse: {
      shape: 'statement', category: 'control', label: '如果 / 否则', color: '#f59e0b',
      inputs: { cond: '条件' }, statements: { body: '就', els: '否则' }
    },
    for: {
      shape: 'statement', category: 'control', label: '重复', color: '#f59e0b',
      fields: { var: { kind: 'text', default: 'i', label: '变量' } },
      inputs: { from: '从', to: '到' }, statements: { body: '执行' }
    },
    forEach: {
      shape: 'statement', category: 'control', label: '遍历数组', color: '#f59e0b',
      fields: { var: { kind: 'text', default: 'v', label: '元素' } },
      inputs: { array: '数组' }, statements: { body: '执行' }
    },
    while: {
      shape: 'statement', category: 'control', label: '当条件成立', color: '#f59e0b',
      inputs: { cond: '条件' }, statements: { body: '执行' }
    },

    num: {
      shape: 'value', category: 'op', label: '数字', color: '#ec4899',
      fields: { v: { kind: 'number', default: '0', label: '' } }
    },
    str: {
      shape: 'value', category: 'op', label: '文本', color: '#ec4899',
      fields: { v: { kind: 'text', default: 'hello', label: '' } }
    },
    boolVal: {
      shape: 'value', category: 'op', label: '布尔', color: '#ec4899',
      fields: { v: { kind: 'select', default: 'true', options: [['true', 'true'], ['false', 'false']], label: '' } }
    },
    binary: {
      shape: 'value', category: 'op', label: '运算', color: '#ec4899',
      fields: { op: { kind: 'select', default: '+', options: OPS, label: '' } },
      inputs: { a: '', b: '' }
    },
    not: {
      shape: 'value', category: 'op', label: '非 !', color: '#ec4899',
      inputs: { value: '' }
    },
    mathFunc: {
      shape: 'value', category: 'op', label: '数学函数', color: '#ec4899',
      fields: { fn: { kind: 'select', default: 'abs', options: MATH_FUNCS, label: '' } },
      inputs: { a: '', b: '' }
    },
    strlen: {
      shape: 'value', category: 'op', label: '字符串长度', color: '#ec4899',
      inputs: { value: '' }
    }
  };

  const CATEGORIES = {
    flow: { label: '流程', color: '#5b6cff' },
    io: { label: '输入输出', color: '#10b981' },
    var: { label: '变量', color: '#0ea5e9' },
    array: { label: '数组', color: '#14b8a6' },
    control: { label: '控制', color: '#f59e0b' },
    op: { label: '运算', color: '#ec4899' },
    func: { label: '函数', color: '#8b5cf6' }
  };

  function createBlock(type) {
    const def = DEFS[type];
    if (!def) throw new Error('未知积木类型: ' + type);
    const b = { id: uid(), type, fields: {}, inputs: {}, statements: {}, next: null };
    for (const k in def.fields) b.fields[k] = def.fields[k].default;
    for (const k in (def.inputs || {})) b.inputs[k] = null;
    for (const k in (def.statements || {})) b.statements[k] = [];
    return b;
  }

  function num(v) { const b = createBlock('num'); b.fields.v = String(v); return b; }
  function ref(name) { const b = createBlock('varRef'); b.fields.name = name; return b; }
  function bin(op, a, b) {
    const x = createBlock('binary'); x.fields.op = op;
    x.inputs.a = { kind: 'block', block: a };
    x.inputs.b = { kind: 'block', block: b };
    return x;
  }
  function textInput(block, slot, value) { block.inputs[slot] = { kind: 'block', block: value }; }

  // ---------- 示例程序 ----------
  const EXAMPLES = {
    sum: {
      name: '累加求和',
      build: function () {
        const p = createBlock('program');
        const sum = createBlock('declare'); sum.fields.name = 'sum'; textInput(sum, 'value', num(0));
        const loop = createBlock('for'); loop.fields.var = 'i'; textInput(loop, 'from', num(1)); textInput(loop, 'to', num(6));
        const add = createBlock('assign'); add.fields.name = 'sum'; textInput(add, 'value', bin('+', ref('sum'), ref('i')));
        loop.statements.body.push(add);
        const show = createBlock('print');
        const txt = createBlock('str'); txt.fields.v = '1..5 总和 = ';
        textInput(show, 'value', bin('+', txt, ref('sum')));
        p.statements.body.push(sum, loop, show);
        return p;
      }
    },
    factorial: {
      name: '阶乘',
      build: function () {
        const p = createBlock('program');
        const r = createBlock('declare'); r.fields.name = 'r'; textInput(r, 'value', num(1));
        const loop = createBlock('for'); loop.fields.var = 'i'; textInput(loop, 'from', num(1)); textInput(loop, 'to', num(6));
        const mul = createBlock('assign'); mul.fields.name = 'r'; textInput(mul, 'value', bin('*', ref('r'), ref('i')));
        loop.statements.body.push(mul);
        const show = createBlock('print');
        const txt = createBlock('str'); txt.fields.v = '5! = ';
        textInput(show, 'value', bin('+', txt, ref('r')));
        p.statements.body.push(r, loop, show);
        return p;
      }
    },
    array: {
      name: '数组与遍历',
      build: function () {
        const p = createBlock('program');
        const arr = createBlock('arrayDeclare'); arr.fields.name = 'a'; arr.fields.type = 'int'; textInput(arr, 'size', num(5));
        const loop = createBlock('for'); loop.fields.var = 'i'; textInput(loop, 'from', num(0)); textInput(loop, 'to', num(5));
        const set = createBlock('arraySet'); set.fields.name = 'a'; textInput(set, 'index', ref('i')); textInput(set, 'value', bin('*', ref('i'), ref('i')));
        loop.statements.body.push(set);
        const show = createBlock('print');
        const txt = createBlock('str'); txt.fields.v = '平方数组: ';
        textInput(show, 'value', bin('+', txt, createBlock('arrayGet')));
        show.inputs.value.block.fields.name = 'a'; textInput(show.inputs.value.block, 'index', num(3));
        p.statements.body.push(arr, loop, show);
        return p;
      }
    },
    fibonacci: {
      name: '斐波那契',
      build: function () {
        const p = createBlock('program');
        const a = createBlock('declare'); a.fields.name = 'a'; textInput(a, 'value', num(0));
        const b = createBlock('declare'); b.fields.name = 'b'; textInput(b, 'value', num(1));
        const show0 = createBlock('print'); textInput(show0, 'value', ref('a'));
        const loop = createBlock('for'); loop.fields.var = 'i'; textInput(loop, 'from', num(0)); textInput(loop, 'to', num(8));
        const show = createBlock('print'); textInput(show, 'value', ref('b'));
        const t = createBlock('declare'); t.fields.name = 't'; t.fields.type = 'int'; textInput(t, 'value', ref('b'));
        const add = createBlock('assign'); add.fields.name = 'b'; textInput(add, 'value', bin('+', ref('a'), ref('b')));
        const seta = createBlock('assign'); seta.fields.name = 'a'; textInput(seta, 'value', ref('t'));
        loop.statements.body.push(show, t, add, seta);
        p.statements.body.push(a, b, show0, loop);
        return p;
      }
    },
    logic: {
      name: '逻辑与比较',
      build: function () {
        const p = createBlock('program');
        const x = createBlock('declare'); x.fields.name = 'x'; textInput(x, 'value', num(7));
        const cond = bin('&&', bin('>', ref('x'), num(5)), createBlock('not'));
        cond.inputs.b.block.inputs.value = { kind: 'block', block: bin('==', ref('x'), num(8)) };
        const iff = createBlock('ifelse'); iff.inputs.cond = { kind: 'block', block: cond };
        const y1 = createBlock('print'); const s1 = createBlock('str'); s1.fields.v = 'x>5 且 x≠8'; textInput(y1, 'value', s1);
        const y2 = createBlock('print'); const s2 = createBlock('str'); s2.fields.v = '条件不成立'; textInput(y2, 'value', s2);
        iff.statements.body.push(y1); iff.statements.els.push(y2);
        p.statements.body.push(x, iff);
        return p;
      }
    }
  };

  function defaultProgram() { return EXAMPLES.sum.build(); }

  function eachBlock(root, fn) {
    (function walk(b) {
      if (!b) return;
      fn(b);
      for (const k in b.inputs) { const v = b.inputs[k]; if (v && v.kind === 'block') walk(v.block); }
      for (const k in b.statements) (b.statements[k] || []).forEach(walk);
      if (b.next) walk(b.next);
    })(root);
  }

  global.BlockModel = { DEFS, CATEGORIES, TYPES, OPS, MATH_FUNCS, EXAMPLES, uid, createBlock, defaultProgram, eachBlock, num, ref, bin };
})(window);
