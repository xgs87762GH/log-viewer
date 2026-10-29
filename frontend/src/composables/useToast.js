/**
 * useToast —— 按需封装 Element Plus ElMessage
 * 不注册全量 Element Plus，仅引入 Message 组件与样式。
 */
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

function warn(title, message) {
  const text = message ? `${title}：${message}` : title
  ElMessage({
    type: 'warning',
    message: text,
    duration: 4500,
    showClose: true,
    grouping: true,
  })
}

function info(title, message) {
  const text = message ? `${title}：${message}` : title
  ElMessage({
    type: 'info',
    message: text,
    duration: 3500,
    showClose: true,
    grouping: true,
  })
}

function error(title, message) {
  const text = message ? `${title}：${message}` : title
  ElMessage({
    type: 'error',
    message: text,
    duration: 5000,
    showClose: true,
    grouping: true,
  })
}

function success(title, message) {
  const text = message ? `${title}：${message}` : title
  ElMessage({
    type: 'success',
    message: text,
    duration: 3000,
    showClose: true,
    grouping: true,
  })
}

const instance = { warn, info, error, success, ElMessage }

export function useToast() {
  return instance
}
