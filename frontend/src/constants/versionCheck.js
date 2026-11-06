/**
 * GitHub 版本检查 —— 只读公开端点与展示链接。
 * 纯常量：不依赖 Vue / DOM / 网络；不发送任何内网信息。
 */

export const GITHUB_REPO = 'xgs87762GH/log-viewer'
export const GITHUB_TAGS_API = `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=10`
export const GITHUB_TAGS_PAGE = `https://github.com/${GITHUB_REPO}/tags`
