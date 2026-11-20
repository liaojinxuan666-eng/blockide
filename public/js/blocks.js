/* blocks.js —— 积木模型定义、分类与默认程序 */
(function (global) {
  'use strict';

  let seq = 0;
  const uid = () => 'b' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

  // 语言无关的类型 key，生成器各自映射
  const TYPES = [
    ['int', '整数 int'], ['float', 'float'], ['double', 'double'],
    ['bool', '布尔 bool'], ['string', '字符串 string'], ['char', '字符 char']
  ];

  // ---------- 积木定义 ----------
  // shape: hat(顶部) / statement(语句,有 next) / value(表达式,可嵌入)
  const DEFS = {
    program: {
      shape: 'hat', category: 'flow', label: '程序', color: '#5b6cff',
      statements: { body: '主程序' }, fixed: true
    },
    funcDef: {
      shape: 'hat', category: 'func', label: '定义函数', color: '#8b5cf6',
      fields: {
        name: { kind: 'text', default: 'myFunc', label: '名称' },
        ret: { kind: 'select', default: 'int', options: TYPES, label: '返回' },
        params: { kind: 'text', default: '', label: '参数' }
      },
      statements: { body: '函数体' }
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
    print: {
      shape: 'statement', category: 'io', label: '打印', color: '#10b981',
      inputs: { value: '' }
    },
    if: {
      shape: 'statement', category: 'control', label: '如果', color: '#f59e0b',
      inputs: { cond: '条件' },
      statements: { body: '就' }
    },
    ifelse: {
      shape: 'statement', category: 'control', label: '如果 / 否则', color: '#f59e0b',
      inputs: { cond: '条件' },
      statements: { body: '就', els: '否则' }
    },
    for: {
      shape: 'statement', category: 'control', label: '重复', color: '#f59e0b',
      fields: { var: { kind: 'text', default: 'i', label: '变量' } },
      inputs: { from: '从', to: '到' },
      statements: { body: '执行' }
    },
    while: {
      shape: 'statement', category: 'control', label: '当条件成立', color: '#f59e0b',
      inputs: { cond: '条件' },
      statements: { body: '执行' }
    },
    return: {
      shape: 'statement', category: 'func', label: '返回', color: '#8b5cf6',
      inputs: { value: '' }
    },
    comment: {
      shape: 'statement', category: 'flow', label: '注释', color: '#64748b',
      fields: { text: { kind: 'text', default: '写点注释…', label: '' } }
    },

    // 表达式积木
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
    varRef: {
      shape: 'value', category: 'var', label: '变量', color: '#0ea5e9',
      fields: { name: { kind: 'text', default: 'x', label: '' } }
    },
    binary: {
      shape: 'value', category: 'op', label: '运算', color: '#ec4899',
      fields: {
        op: { kind: 'select', default: '+', options: [['+', '+'], ['-', '-'], ['*', '×'], ['/', '÷'], ['%', '%'], ['>', '>'], ['<', '<'], ['>=', '>='], ['<=', '<='], ['==', '=='], ['!=', '!=']], label: '' }
      },
      inputs: { a: '', b: '' }
    }
  };

  const CATEGORIES = {
    flow: { label: '流程', color: '#5b6cff' },
    io: { label: '输入 / 输出', color: '#10b981' },
    var: { label: '变量', color: '#0ea5e9' },
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

  // 默认示例程序：求 1+2+...+5 并打印
  function defaultProgram() {
    const prog = createBlock('program');
    const sum = createBlock('declare');
    sum.fields.type = 'int'; sum.fields.name = 'sum';
    sum.inputs.value = { kind: 'block', block: num(0) };

    const loop = createBlock('for');
    loop.fields.var = 'i';
    loop.inputs.from = { kind: 'block', block: num(1) };
    loop.inputs.to = { kind: 'block', block: num(5) };

    const add = createBlock('assign');
    add.fields.name = 'sum';
    const plus = createBlock('binary');
    plus.fields.op = '+';
    plus.inputs.a = { kind: 'block', block: createBlock('varRef') };
    plus.inputs.a.block.fields.name = 'sum';
    plus.inputs.b = { kind: 'block', block: createBlock('varRef') };
    plus.inputs.b.block.fields.name = 'i';
    add.inputs.value = { kind: 'block', block: plus };
    loop.statements.body.push(add);

    const show = createBlock('print');
    const concat = createBlock('binary');
    concat.fields.op = '+';
    const txt = createBlock('str'); txt.fields.v = '总和 = ';
    concat.inputs.a = { kind: 'block', block: txt };
    const ref = createBlock('varRef'); ref.fields.name = 'sum';
    concat.inputs.b = { kind: 'block', block: ref };
    show.inputs.value = { kind: 'block', block: concat };

    prog.statements.body.push(sum, loop, show);
    return prog;
  }

  function num(v) { const b = createBlock('num'); b.fields.v = String(v); return b; }

  // 遍历工具
  function eachBlock(root, fn) {
    function walk(b) {
      if (!b) return;
      fn(b);
      for (const k in b.inputs) {
        const v = b.inputs[k];
        if (v && v.kind === 'block') walk(v.block);
      }
      for (const k in b.statements) (b.statements[k] || []).forEach(walk);
      if (b.next) walk(b.next);
    }
    walk(root);
  }

  global.BlockModel = { DEFS, CATEGORIES, TYPES, uid, createBlock, defaultProgram, eachBlock, num };
})(window);
