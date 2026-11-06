/**
 * 本地存储键 —— 唯一来源。
 * 各模块从这里导入（原模块可 re-export 保持调用方不变），避免同一个 key
 * 在两处硬编码后，重命名时另一半静默失配。
 * 纯常量：不依赖 Vue / DOM / 网络。
 */

export const SETTINGS_STORAGE_KEY = 'log_viewer_settings'
export const SETTINGS_INIT_FLAG_KEY = 'log_viewer_settings_init'
export const WORDWRAP_FLAG_KEY = 'log_viewer_wordwrap_on_v1'
export const NAV_L1_KEY = 'log_viewer_nav_l1_collapsed'
export const NAV_L2_KEY = 'log_viewer_nav_l2_collapsed'
export const INDEX_STORAGE_KEY = 'log_viewer_file_index_v1'
export const FILTER_HISTORY_KEY = 'log_viewer_filter_history'
export const DRAWER_STORAGE_KEY = 'log_viewer_tools_drawer_v1'
export const ACCESS_SID_KEY = 'log_viewer_access_sid'
export const VERSION_CHECK_KEY = 'log_viewer_version_check'
