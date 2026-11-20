/**
 * 服务的主机列表 —— 纯函数。
 *
 * 配置里 `host` 是默认主机，`hosts` 是可选的多实例列表（同一服务部署在多台机器）。
 * 返回去重后的主机顺序：默认 host 优先，其余按配置顺序。
 */

export function getServiceHosts(svc) {
  const primary = String(svc?.host || '').trim()
  const out = []
  if (primary) out.push(primary)
  for (const item of Array.isArray(svc?.hosts) ? svc.hosts : []) {
    const host = String(item || '').trim()
    if (host && !out.includes(host)) out.push(host)
  }
  return out
}

/** 某台主机是否属于该服务（多实例时 host 可能不是默认值） */
export function serviceMatchesHost(svc, host) {
  return getServiceHosts(svc).includes(String(host || '').trim())
}
