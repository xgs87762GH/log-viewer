/**
 * LogIndex 目录 HTML 解析 —— 纯函数
 * 与文件名规则（logFileRules）分离：规则可扩展，解析器保持稳定。
 */

/**
 * 从目录 HTML 精确提取 .log 文件名（只取 href 值，不做模糊包含）。
 * @param {string} html
 * @returns {string[]}
 */
export function extractLogNamesFromDirHtml(html) {
  if (!html) return []
  const names = []
  const seen = new Set()
  const re = /href="([^"]+)"/gi
  let m
  while ((m = re.exec(html)) !== null) {
    let name = m[1]
    try {
      name = decodeURIComponent(name)
    } catch {
      /* keep raw */
    }
    name = name.split(/[?#]/)[0].split('/').pop() || ''
    if (!name || !/\.log$/i.test(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}
