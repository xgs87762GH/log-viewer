/**
 * LogIndex 目录 HTML 解析 —— 纯函数
 * 与文件名规则（logFileRules）分离：规则可扩展，解析器保持稳定。
 *
 * 目录页（nginx / Apache autoindex 风格）每行末尾自带大小，例如：
 *   <a href="app_info.log">app_info.log</a>  06-Nov-2026 16:14   66K
 * 一并取回后，仪表盘无需再为每个文件发请求探测大小；
 * 时间只到「分」（目录页不提供秒），用于列表展示更新时间。
 */

const SIZE_AT_END = /(?:^|\s)(-|\d+(?:\.\d+)?\s*[KMGTPE]?i?B?)\s*$/i
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** 取目录行末尾的大小文本；目录项的 "-" 与缺失按空处理 */
function parseSizeText(tail) {
  const m = String(tail || '').match(SIZE_AT_END)
  if (!m) return ''
  const raw = m[1].replace(/\s+/g, '')
  if (raw === '-') return ''
  return /^\d+$/.test(raw) ? `${raw}B` : raw
}

/**
 * 解析目录行里的时间，统一成 `YYYY-MM-DD HH:MM`。
 * 兼容 `06-Nov-2026 16:14`（Apache）与 `2026-11-06 16:14`（nginx）两种写法；
 * 解析不到时返回空串，由调用方回退到文件名里的日期。
 */
export function parseDirMtime(text) {
  const s = String(text || '')
  let m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()]
    if (mon) {
      const day = String(m[1]).padStart(2, '0')
      const hour = String(m[4]).padStart(2, '0')
      return `${m[3]}-${mon}-${day} ${hour}:${m[5]}`
    }
  }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (m) {
    const hour = String(m[4]).padStart(2, '0')
    return `${m[1]}-${m[2]}-${m[3]} ${hour}:${m[5]}`
  }
  return ''
}

/**
 * 从目录 HTML 提取 .log 文件名、目录页显示的原始大小与更新时间。
 * @param {string} html
 * @returns {Array<{ name: string, size: string, mtime: string }>}
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
    files.push({
      name,
      size: parseSizeText(m[2]),
      mtime: parseDirMtime(m[2]),
    })
  }
  return files
}

/** 兼容旧调用：只取文件名，去重语义不变 */
export function extractLogNamesFromDirHtml(html) {
  return extractLogFilesFromDirHtml(html).map((f) => f.name)
}
