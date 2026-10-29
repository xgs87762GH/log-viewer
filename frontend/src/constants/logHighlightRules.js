/**
 * 日志着色规则 —— 唯一配置源（高内聚）
 *
 * 审核 / 增删规则只改本文件；引擎见 utils/logParser.js。
 * 约定：
 *   1. 时间戳单独剥出，正文规则不得再匹配时间戳区域
 *   2. 规则按 order 升序执行；匹配失败不影响显示
 *   3. class 对应 styles/global.css 中的 .ln .xxx
 */

/** 行首时间戳（剥出保护区，不参与后续规则） */
export const TIMESTAMP = {
  id: 'timestamp',
  /** @type {RegExp} */
  re: /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)/,
  className: 'ts',
}

/** 整行特例（优先于分段规则） */
export const LINE_KINDS = {
  stack: {
    id: 'stack',
    test: /^\s+at\s+/,
    className: 'stk',
  },
  exception: {
    id: 'exception',
    test: /(?:^[A-Za-z][\w.$]*Exception\b|^Caused by:)/,
    className: 'exc',
  },
  continuation: {
    id: 'continuation',
    test: /^\s*(Caused by:|\t|at\s)/,
  },
}

/** 级别识别 */
export const LEVEL = {
  aliases: { WARNING: 'WARN' },
  bracket: /\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s*\]/i,
  token: /(?:^|[\s\]\-])(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)(?:[\s\[\-:]|$)/i,
  /** 仅作弱兜底（Exception / ERROR 词） */
  softError: /\bException\b|\bERROR\b/,
  softWarn: /\bWARN(?:ING)?\b/,
}

/**
 * 正文高亮规则（只作用于时间戳之后的文本）
 * type:
 *   - replace: pattern + replace（字符串或 (match,...) => html）
 *   - when: 可选，对「原始正文」的前置条件
 */
export const BODY_RULES = [
  {
    id: 'thread',
    order: 10,
    desc: '线程名 [http-nio-...]，排除 [INFO]/[SQL]',
    pattern: /(\[[^\]\n]{1,80}\])/g,
    replace(full) {
      if (/^\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s*\]$/i.test(full)) return full
      if (/^\[SQL\]$/i.test(full)) return full
      if (/^\[执行结果\]/.test(full) || /^\[执行时间\]/.test(full)) return full
      return '<span class="thr">' + full + '</span>'
    },
  },
  {
    id: 'sql-tag',
    order: 20,
    desc: '[SQL] 标签',
    when: (rawBody) => /\[SQL\]/i.test(rawBody),
    pattern: /\[SQL\]/gi,
    replace: '<span class="sql-tag">[SQL]</span>',
  },
  {
    id: 'sql-str',
    order: 21,
    desc: 'SQL 字符串字面量',
    when: (rawBody) => /\[SQL\]/i.test(rawBody),
    pattern: /'([^']*)'/g,
    replace: '<span class="sql-str">&#39;$1&#39;</span>',
  },
  {
    id: 'sql-kw',
    order: 22,
    desc: 'SQL 关键字',
    when: (rawBody) => /\[SQL\]/i.test(rawBody),
    pattern:
      /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|SET|VALUES|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|ORDER|GROUP|BY|HAVING|LIMIT|OFFSET|AS|IN|NOT|NULL|IS|LIKE|BETWEEN|EXISTS|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END|INDEX|TABLE|CREATE|ALTER|DROP|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|CONSTRAINT|IF|BEGIN|COMMIT|ROLLBACK)\b/gi,
    replace: '<span class="sql-kw">$1</span>',
  },
  {
    id: 'level-mark',
    order: 30,
    desc: '级别着色：[INFO] 或独立 INFO 词（由引擎按当前 level 生成）',
    dynamic: 'levelMark',
  },
  {
    id: 'exec-result',
    order: 40,
    desc: '[执行结果]: N',
    pattern: /(\[执行结果\]:\s*\d+)/g,
    replace: '<span class="res">$1</span>',
  },
  {
    id: 'exec-time',
    order: 41,
    desc: '[执行时间]: N',
    pattern: /(\[执行时间\]:\s*\d+)/g,
    replace: '<span class="res">$1</span>',
  },
  {
    id: 'stack-method',
    order: 50,
    desc: '堆栈方法名 at com.x.Y(File.java:12)',
    pattern: /(at\s+)([\w.$]+\(\S+\.java:\d+\))/g,
    replace: '$1<span class="meth">$2</span>',
  },
  {
    id: 'http-status',
    order: 60,
    desc: 'HTTP 状态码（必须带 status/HTTP 上下文，禁止匹配时间戳毫秒）',
    // 例：HTTP 404 / status=500 / status: 502 —— 绝不能匹配 .468
    pattern: /\b(?:HTTP\/?\d*(?:\.\d+)?\s*|status[=:\s]+)([1-5]\d{2})\b/gi,
    replace(_m, code) {
      const n = Number(code)
      let cls = 'http'
      if (n >= 500) cls += ' http-5'
      else if (n >= 400) cls += ' http-4'
      else if (n >= 200 && n < 300) cls += ' http-2'
      // 保留前缀：整段匹配含前缀，需重写
      return _m.replace(String(code), '<span class="' + cls + '">' + code + '</span>')
    },
  },
]

/** 按 order 排序后的正文规则（引擎直接用） */
export const BODY_RULES_SORTED = BODY_RULES.slice().sort((a, b) => a.order - b.order)

/** CSS class 一览（文档 / 审核用，与 global.css 对齐） */
export const CLASS_CATALOG = {
  ts: '时间戳',
  thr: '线程名',
  kw: '级别关键字',
  stk: '堆栈行',
  exc: '异常类名',
  meth: '堆栈方法',
  'sql-tag': 'SQL 标签',
  'sql-kw': 'SQL 关键字',
  'sql-str': 'SQL 字符串',
  res: '执行结果/时间',
  http: 'HTTP 状态',
  'http-2': '2xx',
  'http-4': '4xx',
  'http-5': '5xx',
  hit: '搜索命中',
}
