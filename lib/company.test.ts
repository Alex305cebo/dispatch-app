import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companySettingKey, isOwnerCompany, isWorkspace, newWorkspaceId, seesFleetGps, userCompany } from './company.ts'

test('компания пользователя: витрина по is_demo, пустое — владелец', () => {
  assert.equal(userCompany({ is_demo: true, company_id: 'default' }), 'demo')
  assert.equal(userCompany({ is_demo: 1, company_id: 'wabc' }), 'demo')
  assert.equal(userCompany({ is_demo: false, company_id: null }), 'default')
  assert.equal(userCompany({ is_demo: false, company_id: '  ' }), 'default')
  assert.equal(userCompany({ is_demo: false }), 'default')
  assert.equal(userCompany({ is_demo: 0, company_id: 'w0123' }), 'w0123')
})

test('кабинет — всё, кроме владельца и витрины', () => {
  assert.equal(isWorkspace('default'), false)
  assert.equal(isWorkspace('demo'), false)
  assert.equal(isWorkspace('w1a2b'), true)
  assert.equal(isOwnerCompany('default'), true)
  assert.equal(isOwnerCompany('demo'), false)
  assert.equal(seesFleetGps('default'), true)
  assert.equal(seesFleetGps('demo'), true)
  assert.equal(seesFleetGps('w1a2b'), false)
})

test('новый id кабинета — w + 16 hex, каждый раз свой', () => {
  const a = newWorkspaceId()
  assert.match(a, /^w[0-9a-f]{16}$/)
  assert.notEqual(a, newWorkspaceId())
  assert.equal(isWorkspace(a), true)
})

test('ключи настроек: у кабинета свои реквизиты и заметки, остальное общее', () => {
  assert.equal(companySettingKey('co_name', 'default'), 'co_name')
  assert.equal(companySettingKey('co_name', 'demo'), 'co_name')
  assert.equal(companySettingKey('co_name', 'wab'), 'c:wab:co_name')
  assert.equal(companySettingKey('broker_note:tql', 'wab'), 'c:wab:broker_note:tql')
  assert.equal(companySettingKey('facility_note:x', 'wab'), 'c:wab:facility_note:x')
  assert.equal(companySettingKey('factoring_settings', 'wab'), 'c:wab:factoring_settings')
  assert.equal(companySettingKey('detention_rate_hr', 'wab'), 'c:wab:detention_rate_hr')
  // Ключи установки и кэши — общие.
  assert.equal(companySettingKey('gemini_api_key', 'wab'), 'gemini_api_key')
  assert.equal(companySettingKey('open_access', 'wab'), 'open_access')
  assert.equal(companySettingKey('tiles:overview', 'wab'), 'tiles:overview')
})
