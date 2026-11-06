/**
 * 高亮词集合 —— 纯函数。
 *
 * 词条整串按字面量保存：逗号、空格、引号等都只是普通字符，不做任何分词。
 * 添加由「回车」触发，重复词按大小写不敏感去重。
 */

export function normalizeHighlightTerm(raw) {
  return String(raw ?? '').trim()
}

/** @returns {{terms: string[], added: boolean}} */
export function addHighlightTerm(terms, raw) {
  const list = Array.isArray(terms) ? terms : []
  const term = normalizeHighlightTerm(raw)
  if (!term) return { terms: list, added: false }
  if (list.some((t) => t.toLowerCase() === term.toLowerCase())) {
    return { terms: list, added: false }
  }
  return { terms: [...list, term], added: true }
}

export function removeHighlightTerm(terms, raw) {
  const list = Array.isArray(terms) ? terms : []
  const term = normalizeHighlightTerm(raw)
  return list.filter((t) => t !== term)
}
