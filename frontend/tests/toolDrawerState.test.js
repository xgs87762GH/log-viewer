import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDrawerState,
  serializeDrawerState,
  readPinned,
  writePinned,
  resolveDrawerState,
  shouldAutoCollapse,
} from '../src/utils/toolDrawerState.js'
import { DRAWER_STORAGE_KEY } from '../src/constants/logSearchTools.js'

function createStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

test('parseDrawerState 对空值、脏数据与旧格式安全兜底', () => {
  assert.deepEqual(parseDrawerState(null), { pinned: false })
  assert.deepEqual(parseDrawerState(''), { pinned: false })
  assert.deepEqual(parseDrawerState('{bad json'), { pinned: false })
  assert.deepEqual(parseDrawerState('{"pinned":"true"}'), { pinned: false })
  assert.deepEqual(parseDrawerState('{"pinned":true}'), { pinned: true })
  assert.deepEqual(parseDrawerState('{"open":true}'), { pinned: false })
})

test('serialize / read / write 只持久化固定态', () => {
  assert.equal(serializeDrawerState({ pinned: true, open: false }), '{"pinned":true}')
  assert.equal(serializeDrawerState({}), '{"pinned":false}')
  const storage = createStorage()
  assert.equal(readPinned(storage), false)
  assert.equal(writePinned(true, storage), true)
  assert.equal(storage.getItem(DRAWER_STORAGE_KEY), '{"pinned":true}')
  assert.equal(readPinned(storage), true)
  writePinned(false, storage)
  assert.equal(readPinned(storage), false)
})

test('storage 不可用时读写不抛错', () => {
  assert.equal(readPinned({}), false)
  assert.equal(writePinned(true, {}), true)
})

test('resolveDrawerState 展开 / 固定 / 收起语义一致', () => {
  assert.deepEqual(resolveDrawerState({ open: false, pinned: false }, 'open'), { open: true, pinned: false })
  assert.deepEqual(resolveDrawerState({ open: true, pinned: false }, 'toggle'), { open: false, pinned: false })
  assert.deepEqual(resolveDrawerState({ open: true, pinned: false }, 'pin'), { open: true, pinned: true })
  assert.deepEqual(resolveDrawerState({ open: false, pinned: true }, 'pin'), { open: true, pinned: true })
  assert.deepEqual(resolveDrawerState({ open: true, pinned: true }, 'close'), { open: false, pinned: false })
  assert.deepEqual(resolveDrawerState({ open: true, pinned: true }, 'unpin'), { open: true, pinned: false })
  assert.deepEqual(resolveDrawerState({ open: true, pinned: true }, 'unknown'), { open: true, pinned: true })
})

test('未固定抽屉点击外部或切走视图时自动缩回', () => {
  const temp = { open: true, pinned: false }
  assert.equal(shouldAutoCollapse(temp, { view: 'viewer', inside: false }), true)
  assert.equal(shouldAutoCollapse(temp, { view: 'viewer', inside: true }), false)
  assert.equal(shouldAutoCollapse(temp, { view: 'settings', inside: true }), true)
  assert.equal(shouldAutoCollapse(temp), false)
})

test('固定态、已收起态与脏状态不会自动缩回', () => {
  assert.equal(shouldAutoCollapse({ open: true, pinned: true }, { view: 'viewer', inside: false }), false)
  assert.equal(shouldAutoCollapse({ open: false, pinned: false }, { view: 'viewer', inside: false }), false)
  assert.equal(shouldAutoCollapse(null, { view: 'settings', inside: false }), false)
  assert.equal(shouldAutoCollapse({ open: true, pinned: true }, { view: 'settings' }), false)
})
