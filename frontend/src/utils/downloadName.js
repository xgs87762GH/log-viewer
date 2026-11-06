/**
 * 下载文件命名 —— 纯函数，不依赖 Vue / DOM。
 *
 * 规范：{中文环境标签}_{项目展示名}_{级别}.log，例：测试环境_订单服务_INFO.log
 * 环境取 config 里的 environments[key].label（缺失回退环境 key），
 * 项目取服务配置的 module（缺失回退 app），级别取日志级别。
 * 只做字符清洗，不拼接上游原文件名：下载的是整份活跃日志，名字应能一眼看出
 * 来自哪个环境、哪个项目，而不是复述服务端的文件名。
 * 非法字符集与 120 字上限同 server.py::_safe_download_name（响应头的最后防线），
 * 改动时需两处同步；三段命名、空格折叠等展示规范只在这里定义。
 */

const MAX_SEGMENT = 40
const MAX_NAME = 120
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g

/** 保留中文与常见可读字符；路径分隔符、Windows 非法字符、控制字符一律替换 */
function cleanSegment(value, fallback) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(ILLEGAL, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_SEGMENT)
    .replace(/_+$/g, '')
  return cleaned || fallback
}

export function buildDownloadName({ env, module, level } = {}) {
  const base = [
    cleanSegment(env, 'ENV'),
    cleanSegment(module, 'APP'),
    cleanSegment(level, 'LOG'),
  ].join('_') + '.log'
  return base.length > MAX_NAME ? `${base.slice(0, MAX_NAME - 4).replace(/_+$/g, '')}.log` : base
}
