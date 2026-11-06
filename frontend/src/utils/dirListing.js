/**
 * LogIndex 目录 HTML 解析 —— 纯函数
 * 与文件名规则（logFileRules）分离：规则可扩展，解析器保持稳定。
 *
 * 目录页（nginx / Apache autoindex 风格）每行末尾自带大小，例如：
 *   <a href="app_info.log">app_info.log</a>  06-Nov-2026 16:14   66K
 * 一并取回后，仪表盘无需再为每个文件发请求探测大小。
 */

const SIZE_AT_END = /(?:^|\s)(-|\d+(?:\.\d+)?\s*[KMGTPE]?i?B?)\s*$/i

/** 取目录行末尾的大小文本；目录项的 "-" 与缺失按空处理 */
function parseSizeText(tail) {
  const m = String(tail || '').match(SIZE_AT_END)
  if (!m) return ''
  const raw = m[1].replace(/\s+/g, '')
  if (raw === '-') return ''
  return /^\d+$/.test(raw) ? `${raw}B` : raw
}

/**
 * 从目录 HTML 提取 .log 文件名与目录页显示的原始大小。
 * @param {string} html
 * @returns {Array<{ name: string, size: string }>}
 */
export function extractLogFilesFromDirHtml(html) {
  if (!html) return []
  const files = []
  const seen = new Set()
  // 局部正则：每次调用从零开始匹配，不共享 lastIndex
  const linkLine = /<a\s+href="([^"]+)"[^>]*>[^<]*<\/a>([^\n<]*)/gi
  for (const m of String(html).matchAll(linkLine)) {
    let name = m[1]
    try {
      name = decodeURIComponent(name)
    } catch {
      /* keep raw */
    }
    name = name.split(/[?#]/)[0].split('/').pop() || ''
    if (!name || !/\.log$/i.test(name) || seen.has(name)) continue
    seen.add(name)
    files.push({ name, size: parseSizeText(m[2]) })
  }
  return files
}

/** 兼容旧调用：只取文件名，去重语义不变 */
export function extractLogNamesFromDirHtml(html) {
  return extractLogFilesFromDirHtml(html).map((f) => f.name)
}
