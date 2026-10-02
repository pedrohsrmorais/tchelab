'use strict';

/**
 * FormulaParserService
 *
 * Parser seguro de fórmulas customizadas via AST + whitelist.
 * NUNCA usa eval() ou new Function().
 *
 * Suporte inicial: expressões matemáticas com operadores aritméticos,
 * funções de uma whitelist (abs, sqrt, log, exp, sin, cos, tan, ceil, floor, round),
 * e referências a variáveis declaradas.
 *
 * Exemplo: "sqrt(A) + B * 2.5 - log(C + 1)"
 */

const ALLOWED_FUNCTIONS = new Set([
  'abs', 'sqrt', 'log', 'log2', 'log10', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'ceil', 'floor', 'round', 'sign', 'pow', 'min', 'max',
]);

const ALLOWED_OPERATORS = new Set(['+', '-', '*', '/', '**', '%']);

class FormulaParserService {
  /**
   * Valida uma fórmula e retorna a AST ou lança erro.
   *
   * @param {string} formula   Ex: "sqrt(A) + B * 2.5"
   * @param {string[]} allowedVars  Variáveis permitidas na fórmula
   * @returns {{ valid: true, ast: object } | { valid: false, error: string }}
   */
  validate(formula, allowedVars = []) {
    if (!formula || typeof formula !== 'string') {
      return { valid: false, error: 'Fórmula deve ser uma string não-vazia.' };
    }

    const trimmed = formula.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Fórmula vazia.' };
    }

    // Bloqueia padrões perigosos antes de qualquer análise
    const dangerous = [
      /require\s*\(/,
      /import\s+/,
      /process\./,
      /__proto__/,
      /constructor/,
      /prototype/,
      /\beval\b/,
      /\bFunction\b/,
      /\bsetTimeout\b/,
      /\bsetInterval\b/,
    ];
    for (const pattern of dangerous) {
      if (pattern.test(trimmed)) {
        return { valid: false, error: 'Fórmula contém padrão não permitido.' };
      }
    }

    try {
      const ast = this._parse(trimmed, new Set(allowedVars));
      return { valid: true, ast };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Avalia a fórmula com valores concretos (escalares).
   * Retorna o resultado ou lança erro.
   *
   * @param {string} formula
   * @param {object} vars  Ex: { A: 1.5, B: 2.3 }
   */
  evaluate(formula, vars = {}) {
    const result = this.validate(formula, Object.keys(vars));
    if (!result.valid) throw new Error(result.error);
    return this._evalNode(result.ast, vars);
  }

  // ─── Parser recursivo descendente ──────────────────────────────────────────

  _parse(src, allowedVars) {
    const tokens = this._tokenize(src);
    const state = { tokens, pos: 0 };
    const ast = this._parseExpr(state, allowedVars);
    if (state.pos < state.tokens.length) {
      throw new Error(`Token inesperado: "${state.tokens[state.pos].value}".`);
    }
    return ast;
  }

  _tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      // Espaço
      if (/\s/.test(src[i])) { i++; continue; }
      // Número (incluindo decimal e notação científica)
      if (/[\d.]/.test(src[i])) {
        let num = '';
        while (i < src.length && /[\d.eE+\-]/.test(src[i])) num += src[i++];
        tokens.push({ type: 'NUMBER', value: num });
        continue;
      }
      // Identificador (variável ou função)
      if (/[a-zA-Z_]/.test(src[i])) {
        let id = '';
        while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
        tokens.push({ type: 'IDENT', value: id });
        continue;
      }
      // Operadores dois caracteres
      if (i + 1 < src.length && src.slice(i, i + 2) === '**') {
        tokens.push({ type: 'OP', value: '**' }); i += 2; continue;
      }
      // Operadores um caractere
      if ('+-*/%'.includes(src[i])) {
        tokens.push({ type: 'OP', value: src[i++] }); continue;
      }
      if (src[i] === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
      if (src[i] === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
      if (src[i] === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }
      throw new Error(`Caractere não permitido: "${src[i]}".`);
    }
    return tokens;
  }

  _peek(state) { return state.tokens[state.pos]; }
  _consume(state) { return state.tokens[state.pos++]; }

  // expr = term (('+' | '-') term)*
  _parseExpr(state, vars) {
    let node = this._parseTerm(state, vars);
    while (this._peek(state) && this._peek(state).type === 'OP' && ['+', '-'].includes(this._peek(state).value)) {
      const op = this._consume(state).value;
      const right = this._parseTerm(state, vars);
      node = { type: 'BinaryOp', op, left: node, right };
    }
    return node;
  }

  // term = power (('*' | '/' | '%') power)*
  _parseTerm(state, vars) {
    let node = this._parsePower(state, vars);
    while (this._peek(state) && this._peek(state).type === 'OP' && ['*', '/', '%'].includes(this._peek(state).value)) {
      const op = this._consume(state).value;
      const right = this._parsePower(state, vars);
      node = { type: 'BinaryOp', op, left: node, right };
    }
    return node;
  }

  // power = unary ('**' unary)*
  _parsePower(state, vars) {
    let node = this._parseUnary(state, vars);
    while (this._peek(state) && this._peek(state).type === 'OP' && this._peek(state).value === '**') {
      this._consume(state);
      const right = this._parseUnary(state, vars);
      node = { type: 'BinaryOp', op: '**', left: node, right };
    }
    return node;
  }

  // unary = ('-')? primary
  _parseUnary(state, vars) {
    if (this._peek(state) && this._peek(state).type === 'OP' && this._peek(state).value === '-') {
      this._consume(state);
      return { type: 'UnaryOp', op: '-', operand: this._parsePrimary(state, vars) };
    }
    return this._parsePrimary(state, vars);
  }

  // primary = NUMBER | IDENT ('(' args ')')? | '(' expr ')'
  _parsePrimary(state, vars) {
    const tok = this._peek(state);
    if (!tok) throw new Error('Expressão incompleta.');

    if (tok.type === 'NUMBER') {
      this._consume(state);
      return { type: 'Number', value: parseFloat(tok.value) };
    }

    if (tok.type === 'LPAREN') {
      this._consume(state);
      const node = this._parseExpr(state, vars);
      if (!this._peek(state) || this._peek(state).type !== 'RPAREN') {
        throw new Error('Faltando ")" na expressão.');
      }
      this._consume(state);
      return node;
    }

    if (tok.type === 'IDENT') {
      this._consume(state);
      // Chamada de função?
      if (this._peek(state) && this._peek(state).type === 'LPAREN') {
        if (!ALLOWED_FUNCTIONS.has(tok.value)) {
          throw new Error(`Função "${tok.value}" não é permitida. Funções aceitas: ${[...ALLOWED_FUNCTIONS].join(', ')}.`);
        }
        this._consume(state); // '('
        const args = [];
        while (this._peek(state) && this._peek(state).type !== 'RPAREN') {
          args.push(this._parseExpr(state, vars));
          if (this._peek(state) && this._peek(state).type === 'COMMA') this._consume(state);
        }
        if (!this._peek(state)) throw new Error('Faltando ")" após argumentos da função.');
        this._consume(state); // ')'
        return { type: 'Call', name: tok.value, args };
      }
      // Variável
      if (!vars.has(tok.value)) {
        throw new Error(`Variável "${tok.value}" não foi declarada. Variáveis disponíveis: ${[...vars].join(', ') || 'nenhuma'}.`);
      }
      return { type: 'Var', name: tok.value };
    }

    throw new Error(`Token inesperado: "${tok.value}".`);
  }

  // ─── Avaliação da AST ──────────────────────────────────────────────────────

  _evalNode(node, vars) {
    if (node.type === 'Number') return node.value;
    if (node.type === 'Var') {
      if (!(node.name in vars)) throw new Error(`Variável "${node.name}" não definida.`);
      return vars[node.name];
    }
    if (node.type === 'UnaryOp') {
      const v = this._evalNode(node.operand, vars);
      return node.op === '-' ? -v : v;
    }
    if (node.type === 'BinaryOp') {
      const l = this._evalNode(node.left, vars);
      const r = this._evalNode(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new Error('Divisão por zero.');
          return l / r;
        case '%': return l % r;
        case '**': return Math.pow(l, r);
        default: throw new Error(`Operador desconhecido: "${node.op}".`);
      }
    }
    if (node.type === 'Call') {
      const args = node.args.map((a) => this._evalNode(a, vars));
      const fn = Math[node.name];
      if (!fn) throw new Error(`Função "${node.name}" não disponível em Math.`);
      return fn(...args);
    }
    throw new Error(`Nó de AST desconhecido: "${node.type}".`);
  }
}

module.exports = new FormulaParserService();
