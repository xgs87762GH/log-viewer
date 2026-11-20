import test from 'node:test'
import assert from 'node:assert/strict'
import { isSqlLine } from '../src/utils/logSqlFilter.js'

test('识别常见 SQL 语句', () => {
  assert.equal(isSqlLine('==>  Preparing: SELECT id, name FROM t_user WHERE id = ?'), true)
  assert.equal(isSqlLine('Hibernate: select u.id from user u where u.id=?'), true)
  assert.equal(isSqlLine('2026-11-20 10:00:00 INFO [main] insert into t_log (id) values (?)'), true)
  assert.equal(isSqlLine('UPDATE t_user SET name = ? WHERE id = ?'), true)
  assert.equal(isSqlLine('delete from t_session where expired_at < now()'), true)
})

test('不误伤普通业务日志', () => {
  assert.equal(isSqlLine('2026-11-20 10:00:00 INFO 用户查询完成，耗时 12ms'), false)
  assert.equal(isSqlLine('update finished in 12ms'), false)
  assert.equal(isSqlLine('select the best provider'), false)
  assert.equal(isSqlLine('delete cache key user:1'), false)
  assert.equal(isSqlLine(''), false)
  assert.equal(isSqlLine(null), false)
})

test('过短的行直接跳过', () => {
  assert.equal(isSqlLine('select 1'), false)
  assert.equal(isSqlLine('select a'), false)
})
