/* generators.js —— 积木树 → C / C++ / Swift 源码，并生成行号映射 */
(function (global) {
  'use strict';

  const TYPE_MAP = {
    c:      { int: 'int', float: 'float', double: 'double', bool: 'int', string: 'const char*', char: 'char' },
    cpp:    { int: 'int', float: 'float', double: 'double', bool: 'bool', string: 'string', char: 'char' },
    swift:  { int: 'Int', float: 'Float', double: 'Double', bool: 'Bool', string: 'String', char: 'Character' }
  };
  const typeOf = (key, lang) => (TYPE_MAP[lang] || TYPE_MAP.c)[key] || key;

  function formatSpec(type) {
    if (type === 'double' || type === 'float') return '%f';
    if (type === 'char') return '%c';
    if (type === 'string') return '%s';
    return '%d';
  }
  function flattenConcat(input, out) {
    if (input && input.kind === 'block' && input.block.type === 'binary' && input.block.fields.op === '+') {
      flattenConcat(input.block.inputs.a, out); flattenConcat(input.block.inputs.b, out); return out;
    }
    out.push(input); return out;
  }
  function isConcat(input) {
    const leaves = []; flattenConcat(input, leaves);
    return leaves.length > 1 && leaves.some(l => l && l.kind === 'block' && l.block.type === 'str');
  }
  function isStr(input) { return !!(input && input.kind === 'block' && input.block.type === 'str'); }

  function generate(lang, program) {
    const ctx = { lang, lines: [], depth: 0, symbols: new Map(), arrays: new Map(), lineMap: {}, exprOwner: [] };
    ctx.emit = t => ctx.lines.push('  '.repeat(ctx.depth) + t);

    function markStatement(block, start) {
      const range = [start, Math.max(start, ctx.lines.length - 1)];
      ctx.lineMap[block.id] = range;
      ctx.exprOwner.forEach(id => { ctx.lineMap[id] = range; });
      ctx.exprOwner = [];
    }

    function genExpr(input) {
      if (!input) return { code: '0', type: 'int' };
      if (input.kind === 'text') return { code: input.text, type: 'unknown' };
      const b = input.block; if (!b) return { code: '0', type: 'int' };
      ctx.exprOwner.push(b.id);
      const f = b.fields;
      switch (b.type) {
        case 'num': { const v = String(f.v).trim() || '0'; return { code: v, type: v.indexOf('.') >= 0 ? 'double' : 'int' }; }
        case 'str': return { code: JSON.stringify(String(f.v)), type: 'string' };
        case 'boolVal': return lang === 'swift' ? { code: f.v, type: 'bool' } : { code: f.v === 'true' ? '1' : '0', type: 'bool' };
        case 'varRef': return { code: f.name, type: ctx.symbols.get(f.name) || 'unknown' };
        case 'arrayGet': {
          const idx = genExpr(b.inputs.index);
          return { code: `${f.name}[${idx.code}]`, type: ctx.arrays.get(f.name) || 'unknown' };
        }
        case 'arrayLength': {
          const len = ctx.arrayLengths ? ctx.arrayLengths.get(f.name) : null;
          if (lang === 'swift') return { code: `${f.name}.count`, type: 'int' };
          return { code: len || ('sizeof(' + f.name + ')/sizeof(' + f.name + '[0])'), type: 'int' };
        }
        case 'not': {
          const v = genExpr(b.inputs.value);
          return { code: `!${v.code}`, type: 'bool' };
        }
        case 'strlen': {
          const v = genExpr(b.inputs.value);
          if (lang === 'swift') return { code: `${v.code}.count`, type: 'int' };
          if (lang === 'cpp') return { code: `${v.code}.length()`, type: 'int' };
          return { code: `strlen(${v.code})`, type: 'int' };
        }
        case 'mathFunc': {
          const fn = f.fn;
          const a = genExpr(b.inputs.a), bb = genExpr(b.inputs.b);
          if (lang === 'swift') {
            const map = { abs: 'abs', sqrt: 'sqrt', pow: 'pow', min: 'min', max: 'max', round: 'round' };
            return { code: `${map[fn] || fn}(${a.code}${fn === 'pow' || fn === 'min' || fn === 'max' ? ', ' + bb.code : ''})`, type: 'double' };
          }
          const cfn = { abs: 'abs', sqrt: 'sqrt', pow: 'pow', min: 'min', max: 'max', round: 'round' }[fn] || fn;
          if (lang === 'cpp' && fn === 'abs') return { code: `abs(${a.code})`, type: 'double' };
          return { code: `${cfn}(${a.code}${fn === 'pow' || fn === 'min' || fn === 'max' ? ', ' + bb.code : ''})`, type: 'double' };
        }
        case 'binary': {
          const a = genExpr(b.inputs.a), bb = genExpr(b.inputs.b), op = f.op;
          if (op === '+') {
            if (lang === 'swift') return { code: `(${a.code} + ${bb.code})`, type: (a.type === 'string' || bb.type === 'string') ? 'string' : a.type };
            if (a.type === 'string' || bb.type === 'string') return { code: `(${a.code} + ${bb.code})`, type: 'string' };
          }
          const cmp = ['>', '<', '>=', '<=', '==', '!=', '&&', '||'].indexOf(op) >= 0;
          return { code: `(${a.code} ${op} ${bb.code})`, type: cmp ? 'bool' : (a.type === 'double' || bb.type === 'double' ? 'double' : 'int') };
        }
        default: return { code: '0', type: 'int' };
      }
    }

    function genPrint(input) {
      if (lang === 'cpp') {
        if (isConcat(input)) {
          const leaves = []; flattenConcat(input, leaves);
          return 'cout << ' + leaves.map(l => isStr(l) ? JSON.stringify(l.block.fields.v) : genExpr(l).code).join(' << ') + ' << endl;';
        }
        return 'cout << ' + genExpr(input).code + ' << endl;';
      }
      if (lang === 'swift') {
        if (isConcat(input)) {
          const leaves = []; flattenConcat(input, leaves);
          return 'print(' + leaves.map(l => isStr(l) ? JSON.stringify(l.block.fields.v) : `String(${genExpr(l).code})`).join(' + ') + ')';
        }
        return 'print(' + genExpr(input).code + ')';
      }
      if (isConcat(input)) {
        const leaves = []; flattenConcat(input, leaves);
        const fmts = [], args = [];
        leaves.forEach(l => {
          if (isStr(l)) { fmts.push('%s'); args.push(JSON.stringify(l.block.fields.v)); }
          else { const e = genExpr(l); fmts.push(formatSpec(e.type)); args.push(e.code); }
        });
        return `printf("${fmts.join('')}\\n", ${args.join(', ')});`;
      }
      const e = genExpr(input);
      return `printf("${formatSpec(e.type)}\\n", ${e.code});`;
    }

    function genStatements(blocks) { blocks.forEach(genStatement); }
    function cond(input) { const e = genExpr(input); return lang === 'swift' ? e.code : `(${e.code})`; }

    function genStatement(b) {
      const start = ctx.lines.length;
      const f = b.fields;
      switch (b.type) {
        case 'declare': {
          const t = typeOf(f.type, lang), val = genExpr(b.inputs.value);
          if (lang === 'swift') ctx.emit(`var ${f.name}: ${t} = ${val.code}`);
          else if (lang === 'cpp' && f.type === 'string') ctx.emit(`string ${f.name} = ${val.code};`);
          else ctx.emit(`${t} ${f.name} = ${val.code};`);
          ctx.symbols.set(f.name, f.type); break;
        }
        case 'assign': {
          const val = genExpr(b.inputs.value);
          ctx.emit(`${f.name} = ${val.code}${lang === 'swift' ? '' : ';'}`); break;
        }
        case 'inc': ctx.emit(`${f.name}${f.op}${lang === 'swift' ? '' : ';'}`); break;
        case 'print': ctx.emit(genPrint(b.inputs.value)); break;
        case 'comment': ctx.emit(`// ${f.text}`); break;
        case 'break': ctx.emit(`break${lang === 'swift' ? '' : ';'}`); break;
        case 'continue': ctx.emit(`continue${lang === 'swift' ? '' : ';'}`); break;
        case 'if':
          ctx.emit(`if ${cond(b.inputs.cond)} {`);
          ctx.depth++; genStatements(b.statements.body); ctx.depth--; ctx.emit('}'); break;
        case 'ifelse':
          ctx.emit(`if ${cond(b.inputs.cond)} {`);
          ctx.depth++; genStatements(b.statements.body); ctx.depth--;
          ctx.emit('} else {'); ctx.depth++; genStatements(b.statements.els); ctx.depth--; ctx.emit('}'); break;
        case 'for': {
          const v = f.var, from = genExpr(b.inputs.from), to = genExpr(b.inputs.to);
          ctx.symbols.set(v, 'int');
          if (lang === 'swift') ctx.emit(`for ${v} in ${from.code}..<${to.code} {`);
          else ctx.emit(`for (int ${v} = ${from.code}; ${v} < ${to.code}; ${v}++) {`);
          ctx.depth++; genStatements(b.statements.body); ctx.depth--; ctx.emit('}'); break;
        }
        case 'forEach': {
          const v = f.var, arr = genExpr(b.inputs.array);
          if (lang === 'swift') ctx.emit(`for ${v} in ${arr.code} {`);
          else ctx.emit(`for (auto ${v} : ${arr.code}) {`);
          ctx.depth++; genStatements(b.statements.body); ctx.depth--; ctx.emit('}'); break;
        }
        case 'while':
          ctx.emit(`while ${cond(b.inputs.cond)} {`);
          ctx.depth++; genStatements(b.statements.body); ctx.depth--; ctx.emit('}'); break;
        case 'return': {
          const val = genExpr(b.inputs.value);
          ctx.emit(`return ${val.code}${lang === 'swift' ? '' : ';'}`); break;
        }
        case 'funcCall': {
          const args = genInputsCsv(b.inputs.args);
          ctx.emit(`${f.name}(${args})${lang === 'swift' ? '' : ';'}`); break;
        }
        case 'arrayDeclare': {
          const size = genExpr(b.inputs.size), t = typeOf(f.type, lang);
          if (lang === 'swift') ctx.emit(`var ${f.name} = [${t}](repeating: 0, count: ${size.code})`);
          else ctx.emit(`${t} ${f.name}[${size.code}];`);
          ctx.arrays.set(f.name, f.type);
          ctx.arrayLengths = ctx.arrayLengths || new Map(); ctx.arrayLengths.set(f.name, size.code);
          break;
        }
        case 'arraySet': {
          const idx = genExpr(b.inputs.index), val = genExpr(b.inputs.value);
          ctx.emit(`${f.name}[${idx.code}] = ${val.code}${lang === 'swift' ? '' : ';'}`); break;
        }
        case 'input': {
          if (lang === 'swift') ctx.emit(`${f.name} = Int(readLine() ?? "0") ?? 0`);
          else if (lang === 'cpp') ctx.emit(`cin >> ${f.name};`);
          else ctx.emit(`scanf("%d", &${f.name});`);
          break;
        }
        default: ctx.emit(`/* 未知积木: ${b.type} */`);
      }
      markStatement(b, start);
      if (b.next) genStatement(b.next);
    }

    function genInputsCsv(input) {
      if (!input) return '';
      if (input.kind === 'text') return input.text;
      // 允许 args 插槽放一个字符串文本积木，内容是 "1, 2, 3"
      if (input.block && input.block.type === 'str') return input.block.fields.v;
      return genExpr(input).code;
    }

    // ---- 组装 ----
    const body = (program.statements.body || []).slice();
    const funcs = body.filter(b => b.type === 'funcDef');
    const mainBlocks = body.filter(b => b.type !== 'funcDef');

    if (lang === 'c') ctx.emit('#include <stdio.h>\n#include <string.h>\n#include <math.h>');
    else if (lang === 'cpp') { ctx.emit('#include <iostream>'); ctx.emit('#include <cmath>'); ctx.emit('using namespace std;'); }
    else ctx.emit('import Foundation');

    funcs.forEach(fn => {
      const f = fn.fields; ctx.emit('');
      const ret = typeOf(f.ret, lang), params = f.params ? splitParams(f.params, lang) : '';
      ctx.emit(`${lang === 'swift' ? 'func' : ret} ${f.name}(${params})${lang === 'swift' ? ' -> ' + ret : ''} {`);
      ctx.depth++; genStatements(fn.statements.body || []);
      if (lang === 'swift' && f.ret === 'int') ctx.emit('return 0');
      ctx.depth--; ctx.emit('}');
      ctx.lineMap[fn.id] = ctx.lineMap[fn.id] || [0, ctx.lines.length - 1];
    });

    ctx.emit('');
    if (lang === 'swift') genStatements(mainBlocks);
    else {
      ctx.emit('int main() {'); ctx.depth++;
      genStatements(mainBlocks);
      ctx.emit('return 0;'); ctx.depth--; ctx.emit('}');
    }
    ctx.lineMap[program.id] = [0, ctx.lines.length - 1];
    return { code: ctx.lines.join('\n'), lineMap: ctx.lineMap };
  }

  function splitParams(s, lang) {
    return s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
      const m = p.match(/^(.+?)\s+(\w+)$/);
      if (!m) return p;
      return lang === 'swift' ? `${m[2]}: ${typeOf(m[1], lang)}` : `${typeOf(m[1], lang)} ${m[2]}`;
    }).join(', ');
  }

  global.Generators = { generate, TYPE_MAP };
})(window);
