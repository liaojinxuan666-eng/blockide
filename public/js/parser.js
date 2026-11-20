/* parser.js —— 源码 → 积木树（C / C++ / Swift 子集），用于代码→积木反向同步 */
(function (global) {
  'use strict';
  const M = global.BlockModel;
  const { createBlock, num, ref, bin } = M;

  // ---------- 词法分析（带行号） ----------
  function tokenize(src) {
    const tokens = [];
    let i = 0, line = 1;
    const RE = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\d+\.\d+|\d+)|([A-Za-z_]\w*)|(\.\.<|<<|>>|>=|<=|==|!=|&&|\|\||\+\+|--|->|#|[+\-*/%<>=!(){};,\[\]:.&|])/y;
    while (i < src.length) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      RE.lastIndex = i;
      const m = RE.exec(src);
      if (!m) { i++; continue; }
      if (m[1]) { /* 注释跳过 */ }
      else if (m[2]) tokens.push({ t: 'str', v: m[2].slice(1, -1), line });
      else if (m[3]) tokens.push({ t: 'num', v: m[3], line });
      else if (m[4]) tokens.push({ t: 'id', v: m[4], line });
      else tokens.push({ t: 'op', v: m[5], line });
      i = RE.lastIndex;
    }
    return tokens;
  }

  class Parser {
    constructor(tokens, lang) {
      this.toks = tokens; this.i = 0; this.lang = lang;
    }
    peek(k = 0) { return this.toks[this.i + k] || { t: 'eof', v: '', line: Infinity }; }
    next() { return this.toks[this.i++] || { t: 'eof', v: '', line: Infinity }; }
    match(v) { const t = this.peek(); if (t.v === v) { this.i++; return true; } return false; }
    expect(v) { if (!this.match(v)) throw new Error(`期望 "${v}"，实际 "${this.peek().v}"`); }
    skipLine() {
      const cur = this.peek().line;
      while (this.i < this.toks.length && this.peek().line === cur) this.next();
    }

    // ---------- 表达式 ----------
    parseExpr(minPrec = 0) {
      let left = this.parseUnary();
      while (true) {
        const op = this.peek().v, prec = this.prec(op);
        if (prec < minPrec || prec === 0) break;
        this.next();
        left = bin(op, left, this.parseExpr(prec + 1));
      }
      return left;
    }
    prec(op) {
      return ({ '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4,
        '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 })[op] || 0;
    }
    parseUnary() {
      if (this.match('!')) { const n = createBlock('not'); n.inputs.value = wrap(this.parseUnary()); return n; }
      if (this.match('-')) return bin('-', num(0), this.parseUnary());
      if (this.match('+')) return this.parseUnary();
      return this.parsePrimary();
    }
    parsePrimary() {
      const t = this.next();
      if (t.t === 'num') return num(t.v);
      if (t.t === 'str') { const b = createBlock('str'); b.fields.v = t.v; return b; }
      if (t.v === 'true' || t.v === 'false') { const b = createBlock('boolVal'); b.fields.v = t.v; return b; }
      if (t.v === '(') { const e = this.parseExpr(); this.expect(')'); return e; }
      if (t.t === 'id') {
        if (this.match('(')) {
          const args = [];
          if (!this.match(')')) { do { args.push(this.parseExpr()); } while (this.match(',')); this.expect(')'); }
          const lname = t.v.toLowerCase();
          if (['abs','sqrt','pow','min','max','round'].indexOf(lname) >= 0 && args.length) {
            const b = createBlock('mathFunc'); b.fields.fn = lname; b.inputs.a = wrap(args[0]);
            if (args[1]) b.inputs.b = wrap(args[1]); return b;
          }
          if (['string','str','int','double','float','long'].indexOf(lname) >= 0 && args.length) return args[0];
          return ref(t.v);
        }
        if (this.match('[')) {
          const idx = this.parseExpr(); this.expect(']');
          const arr = createBlock('arrayGet'); arr.fields.name = t.v; arr.inputs.index = wrap(idx); return arr;
        }
        if (this.match('.')) {
          const prop = this.next().v;
          if (prop === 'count' || prop === 'length') { const b = createBlock('arrayLength'); b.fields.name = t.v; return b; }
        }
        return ref(t.v);
      }
      return num(0);
    }

    // ---------- 语句序列 ----------
    parseStatements(stopSet) {
      const list = [];
      while (this.i < this.toks.length) {
        if (stopSet && stopSet.indexOf(this.peek().v) >= 0) break;
        const before = this.i;
        const s = this.parseStatement();
        if (s) list.push(s);
        if (this.i === before) this.next();
        while (this.match(';')) { /* noop */ }
      }
      return chain(list);
    }
    parseBlock() {
      this.expect('{');
      const list = this.parseStatements(['}']);
      this.match('}');
      return list;
    }

    parseStatement() {
      const t = this.peek();
      if (t.v === '{') { this.next(); return this.parseStatements(['}']); }

      // 预处理指令 / using / import：跳过整行
      if (t.v === '#' || t.v === 'using' || t.v === 'import') { this.skipLine(); return null; }

      // C/C++ 函数定义：int main() / int foo(int a)
      if ((t.v === 'int' || t.v === 'void' || t.v === 'double' || t.v === 'bool' || t.v === 'float' || t.v === 'char') && this.peek(1).t === 'id' && this.peek(2).v === '(') {
        this.next(); const name = this.next().v; this.expect('(');
        const params = [];
        while (this.peek().v !== ')') {
          const a = this.next();
          if (a.v === ')') break;
          if (a.t === 'id' && this.peek().t === 'id') { params.push(a.v + ' ' + this.next().v); }
          else params.push(a.v);
          if (!this.match(',')) break;
        }
        this.expect(')');
        const body = this.parseBlock();
        if (name === 'main') return body; // main 的内容作为主程序
        const fn = createBlock('funcDef'); fn.fields.name = name; fn.fields.params = params.join(', ');
        fn.statements.body = asBody(body); return fn;
      }

      // if / else
      if (t.v === 'if') {
        this.next(); this.expect('('); const cond = this.parseExpr(); this.expect(')');
        const body = this.parseBlock();
        if (this.peek().v === 'else') {
          this.next(); const els = this.parseBlock();
          const b = createBlock('ifelse'); b.inputs.cond = wrap(cond);
          b.statements.body = asBody(body); b.statements.els = asBody(els); return b;
        }
        const b = createBlock('if'); b.inputs.cond = wrap(cond); b.statements.body = asBody(body); return b;
      }
      // for
      if (t.v === 'for') {
        this.next();
        if (this.lang === 'swift') {
          const v = this.next().v; this.expect('in');
          const first = this.parseExpr();
          if (this.match('..<') || this.match('..')) {
            const to = this.parseExpr();
            const b = createBlock('for'); b.fields.var = v;
            b.inputs.from = wrap(first); b.inputs.to = wrap(to);
            b.statements.body = asBody(this.parseBlock()); return b;
          }
          const b = createBlock('forEach'); b.fields.var = v; b.inputs.array = wrap(first);
          b.statements.body = asBody(this.parseBlock()); return b;
        }
        // C 风格
        this.expect('(');
        let varName = 'i';
        if (['int','auto'].indexOf(this.peek().v) >= 0) this.next();
        varName = this.next().v;
        this.match('='); const from = this.parseExpr(); this.expect(';');
        const condExpr = this.parseExpr(); this.expect(';');
        const step = this.parseStatement(); this.expect(')');
        const b = createBlock('for'); b.fields.var = varName; b.inputs.from = wrap(from);
        let to = num(10);
        if (condExpr.type === 'binary' && ['<','<='].indexOf(condExpr.fields.op) >= 0) to = condExpr.inputs.b.block;
        b.inputs.to = wrap(to); b.statements.body = asBody(this.parseBlock());
        return b;
      }
      // while
      if (t.v === 'while') {
        this.next(); this.expect('('); const cond = this.parseExpr(); this.expect(')');
        const b = createBlock('while'); b.inputs.cond = wrap(cond); b.statements.body = asBody(this.parseBlock()); return b;
      }
      // return
      if (t.v === 'return') {
        this.next(); const b = createBlock('return');
        if (this.peek().v !== ';' && this.peek().v !== '}') b.inputs.value = wrap(this.parseExpr());
        return b;
      }
      // break / continue
      if (t.v === 'break') { this.next(); return createBlock('break'); }
      if (t.v === 'continue') { this.next(); return createBlock('continue'); }
      // Swift 函数定义
      if (t.v === 'func') {
        this.next(); const name = this.next().v; this.expect('(');
        const params = [];
        while (this.peek().v !== ')') {
          const pn = this.next().v; this.match(':'); const pt = this.next().v;
          params.push(pt + ' ' + pn); if (!this.match(',')) break;
        }
        this.expect(')');
        let ret = 'int'; if (this.match('->')) ret = this.next().v;
        const fn = createBlock('funcDef'); fn.fields.name = name; fn.fields.params = params.join(', ');
        fn.fields.ret = ({ Int:'int',Double:'double',Float:'float',Bool:'bool',String:'string',int:'int' })[ret] || ret;
        fn.statements.body = asBody(this.parseBlock()); return fn;
      }

      // 声明
      const decl = this.tryDeclare(); if (decl) return decl;

      // 打印
      if (t.v === 'printf' || t.v === 'print' || t.v === 'cout') return this.parsePrint();

      // 赋值 / 自增 / 数组赋值 / 函数调用
      if (t.t === 'id') {
        const name = this.next().v;
        if (this.match('++') || this.match('--')) {
          const b = createBlock('inc'); b.fields.name = name; b.fields.op = this.toks[this.i - 1].v; return b;
        }
        if (this.match('[')) {
          const idx = this.parseExpr(); this.expect(']'); this.expect('=');
          const b = createBlock('arraySet'); b.fields.name = name;
          b.inputs.index = wrap(idx); b.inputs.value = wrap(this.parseExpr()); return b;
        }
        if (this.match('=')) {
          const b = createBlock('assign'); b.fields.name = name; b.inputs.value = wrap(this.parseExpr()); return b;
        }
        if (this.match('(')) {
          const args = [];
          while (this.peek().v !== ')') { args.push(this.parseExpr()); if (!this.match(',')) break; }
          this.expect(')');
          const b = createBlock('funcCall'); b.fields.name = name;
          b.inputs.args = { kind: 'text', text: args.map(exprToText).join(', ') }; return b;
        }
      }
      return null;
    }

    tryDeclare() {
      const save = this.i, t = this.peek();
      // Swift: var/let x: Type = expr
      if (t.v === 'var' || t.v === 'let') {
        this.next(); const name = this.next().v; let type = 'int';
        if (this.match(':')) type = this.next().v;
        if (this.match('=')) {
          const val = this.parseExpr();
          const b = createBlock('declare'); b.fields.name = name;
          b.fields.type = swiftType(type); b.inputs.value = wrap(val); return b;
        }
        this.i = save; return null;
      }
      // C/C++: int x = ... / string s = ... / int a[5]
      if (t.v === 'const') this.next();
      const typeTok = this.peek().v, ctype = cType(typeTok);
      if (ctype) {
        this.next();
        if (this.peek().v === '*') this.next();
        const name = this.next().v;
        if (this.match('[')) {
          const size = this.parseExpr(); this.expect(']');
          const b = createBlock('arrayDeclare'); b.fields.name = name; b.fields.type = ctype; b.inputs.size = wrap(size); return b;
        }
        let val = num(0);
        if (this.match('=')) val = this.parseExpr();
        const b = createBlock('declare'); b.fields.name = name; b.fields.type = ctype; b.inputs.value = wrap(val); return b;
      }
      this.i = save; return null;
    }

    parsePrint() {
      const kind = this.next().v;
      if (kind === 'printf') {
        this.expect('(');
        const fmtTok = this.next();
        const fmtStr = fmtTok.t === 'str' ? fmtTok.v : '';
        const args = [];
        while (this.match(',')) args.push(this.parseExpr());
        this.expect(')');
        const b = createBlock('print'); b.inputs.value = wrap(buildPrintExprFromFmt(fmtStr, args)); return b;
      }
      if (kind === 'cout') {
        const parts = [];
        while (this.match('<<')) {
          if (this.peek().v === 'endl') { this.next(); break; }
          parts.push(this.parseUnary());
        }
        const b = createBlock('print');
        b.inputs.value = wrap(parts.length === 1 ? parts[0] : concatBlocks(parts)); return b;
      }
      this.expect('(');
      const expr = this.parseExpr(); this.expect(')');
      const b = createBlock('print'); b.inputs.value = wrap(expr); return b;
    }
  }

  // ---------- 辅助 ----------
  function wrap(b) { return { kind: 'block', block: b }; }
  // 语句体数组规范化：只保留首块，其余靠 next 串联（与示例程序结构一致，避免重复遍历）
  function asBody(arr) { return arr && arr.length ? [arr[0]] : []; }
  function chain(list) {
    const flat = [];
    list.forEach(x => { if (x) Array.isArray(x) ? flat.push(...x) : flat.push(x); });
    for (let i = 0; i < flat.length - 1; i++) flat[i].next = flat[i + 1];
    if (flat.length) flat[flat.length - 1].next = null;
    return flat;
  }
  function cType(t) {
    return ({ int:'int', float:'float', double:'double', bool:'bool', char:'char', string:'string',
      String:'string', long:'int', short:'int', unsigned:'int', auto:'int' })[t] || null;
  }
  function swiftType(t) {
    return ({ Int:'int', Double:'double', Float:'float', Bool:'bool', String:'string', Character:'char' })[t] || 'int';
  }
  function concatBlocks(parts) {
    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) acc = bin('+', acc, parts[i]);
    return acc;
  }
  function buildPrintExprFromFmt(fmt, args) {
    fmt = fmt.replace(/\\n$/, ''); // 去掉生成器追加的末尾换行
    const parts = [];
    let buf = '', last = 0, ai = 0;
    const re = /%[-+0-9.]*[a-z]/gi; let m;
    while ((m = re.exec(fmt))) {
      const seg = fmt.slice(last, m.index).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      if (seg) { const s = createBlock('str'); s.fields.v = seg; parts.push(s); }
      if (ai < args.length) parts.push(args[ai++]);
      last = m.index + m[0].length;
    }
    const tail = fmt.slice(last).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (tail) { const s = createBlock('str'); s.fields.v = tail; parts.push(s); }
    while (ai < args.length) parts.push(args[ai++]);
    if (!parts.length) return num(0);
    return parts.length === 1 ? parts[0] : concatBlocks(parts);
  }
  function exprToText(b) {
    if (!b) return '';
    const f = b.fields;
    if (b.type === 'num') return f.v;
    if (b.type === 'str') return JSON.stringify(f.v);
    if (b.type === 'varRef' || b.type === 'arrayLength') return f.name;
    if (b.type === 'boolVal') return f.v;
    return '0';
  }

  function parse(code, lang) {
    const p = new Parser(tokenize(code), lang);
    const program = createBlock('program');
    const stmts = p.parseStatements(null);
    // 过滤生成器自动添加的末尾 return 0 脚手架（当它是最后一个块且值为 0 时）
    if (stmts.length && stmts[stmts.length - 1].type === 'return') {
      const last = stmts[stmts.length - 1];
      const v = last.inputs.value;
      if (!v || (v.block && v.block.type === 'num' && String(v.block.fields.v) === '0')) {
        stmts.pop();
        for (let i = 0; i < stmts.length - 1; i++) stmts[i].next = stmts[i + 1];
        if (stmts.length) stmts[stmts.length - 1].next = null;
      }
    }
    // body 只保留首块，后续靠 next 串联（与示例程序结构一致）
    program.statements.body = stmts.length ? [stmts[0]] : [];
    return { program };
  }

  global.SourceParser = { parse, tokenize };
})(window);
