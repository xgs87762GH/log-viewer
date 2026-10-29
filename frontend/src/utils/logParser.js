/**
 * 日志解析引擎 —— 只负责执行规则，不内嵌业务正则
 *
 * 规则唯一来源：constants/logHighlightRules.js
 * 原则：
 *   1. 匹配失败 / 抛错 → 回退 escapeHtml，一条不丢
 *   2. 时间戳先剥出再着色，正文规则碰不到毫秒
 *   3. 搜索/过滤用原始文本；本模块只产出展示 HTML
 */

import {
  TIMESTAMP,
  LINE_KINDS,
  LEVEL,
  BODY_RULES_SORTED,
} from '../constants/logHighlightRules.js'

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeLevel(raw) {
  if (!raw) return ''
  const up = String(raw).toUpperCase()
  return LEVEL.aliases[up] || up
}

/**
 * @returns {'INFO'|'WARN'|'ERROR'|'DEBUG'|'TRACE'|''}
 */
export function detectLevel(line) {
  if (line == null || line === '') return ''
  try {
    const m1 = line.match(LEVEL.bracket)
    if (m1) return normalizeLevel(m1[1])
    const m2 = line.match(LEVEL.token)
    if (m2) return normalizeLevel(m2[1])
    if (LINE_KINDS.stack.test.test(line) || LINE_KINDS.exception.test.test(line)) return ''
    if (LEVEL.softError.test(line)) return 'ERROR'
    if (LEVEL.softWarn.test(line)) return 'WARN'
    return ''
  } catch {
    return ''
  }
}

export function isContinuation(line) {
  try {
    if (line == null || line === '') return false
    if (LINE_KINDS.stack.test.test(line)) return true
    if (LINE_KINDS.continuation.test.test(line)) return true
    // Exception / Caused by 归入上一条，便于整段堆栈按「一条」折叠
    if (LINE_KINDS.exception.test.test(line)) return true
    // 缩进续行（空格或 Tab）
    if (/^[ \t]/.test(line)) return true
    // "... 72 more"
    if (/^\s*\.\.\.\s*\d+\s+more/.test(line)) return true
    return false
  } catch {
    return false
  }
}

/** 只在未包裹 HTML 标签的文本片段上执行 replace，避免破坏已有 span */
function replaceOutsideTags(html, pattern, replacer) {
  const parts = html.split(/(<[^>]+>)/g)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue
    parts[i] = parts[i].replace(pattern, replacer)
  }
  return parts.join('')
}

function buildLevelRules(level) {
  if (!level) return []
  const lv = escapeRegExp(level === 'WARN' ? 'WARN(?:ING)?' : level)
  return [
    {
      pattern: new RegExp('\\[(' + lv + ')\\s*\\]', 'gi'),
      replace: '[<span class="kw">$1</span>]',
    },
    {
      pattern: new RegExp('([\\s\\]>\\-])(' + lv + ')(?=[\\s\\[\\-:<])', 'gi'),
      replace: '$1<span class="kw">$2</span>',
    },
  ]
}

function applyBodyRules(escapedBody, rawBody, level) {
  let s = escapedBody
  for (const rule of BODY_RULES_SORTED) {
    try {
      if (typeof rule.when === 'function' && !rule.when(rawBody)) continue

      if (rule.dynamic === 'levelMark') {
        for (const dyn of buildLevelRules(level)) {
          s = replaceOutsideTags(s, dyn.pattern, dyn.replace)
        }
        continue
      }

      if (!rule.pattern) continue
      // 每次新建 flags，避免 lastIndex 残留
      const re = new RegExp(rule.pattern.source, rule.pattern.flags)
      s = replaceOutsideTags(s, re, rule.replace)
    } catch (e) {
      console.warn('highlight rule skipped:', rule.id, e)
    }
  }
  return s
}

/**
 * 生成单行高亮 HTML。时间戳保护区 + 正文规则。
 * @param {string|string[]} search 包含条件（高亮）；排除条件不高亮
 */
export function highlightLine(line, level, search = '') {
  const raw = line == null ? '' : String(line)
  try {
    // 整行特例
    if (LINE_KINDS.stack.test.test(raw)) {
      let s = '<span class="' + LINE_KINDS.stack.className + '">' + escapeHtml(raw) + '</span>'
      const meth = BODY_RULES_SORTED.find((r) => r.id === 'stack-method')
      if (meth) {
        const re = new RegExp(meth.pattern.source, meth.pattern.flags)
        s = s.replace(re, meth.replace)
      }
      return applySearch(s, search)
    }
    if (LINE_KINDS.exception.test.test(raw)) {
      return applySearch(
        '<span class="' + LINE_KINDS.exception.className + '">' + escapeHtml(raw) + '</span>',
        search,
      )
    }

    // 时间戳剥出：后续规则只跑 body，毫秒不会被 HTTP/数字规则误伤
    const tsMatch = raw.match(TIMESTAMP.re)
    const ts = tsMatch ? tsMatch[1] : ''
    const rawBody = ts ? raw.slice(ts.length) : raw

    const tsHtml = ts
      ? '<span class="' + TIMESTAMP.className + '">' + escapeHtml(ts) + '</span>'
      : ''
    const bodyHtml = applyBodyRules(escapeHtml(rawBody), rawBody, level)

    return applySearch(tsHtml + bodyHtml, search)
  } catch (e) {
    console.warn('highlightLine fallback:', e)
    return applySearch(escapeHtml(raw), search)
  }
}

function normalizeSearchTerms(search) {
  if (!search) return []
  if (Array.isArray(search)) {
    return search.map((s) => String(s ?? '').trim()).filter(Boolean)
  }
  const one = String(search).trim()
  return one ? [one] : []
}

function applySearch(html, search) {
  const terms = normalizeSearchTerms(search)
  if (!terms.length) return html
  try {
    // 长词优先，减少短词先标后拆坏长词
    const sorted = [...terms].sort((a, b) => b.length - a.length)
    const sre = new RegExp('(' + sorted.map(escapeRegExp).join('|') + ')', 'gi')
    const mark = '<mark class="hit">$1</mark>'
    return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
      if (tag) return tag
      return text.replace(sre, mark)
    })
  } catch {
    return html
  }
}
