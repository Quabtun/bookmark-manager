import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mapValidationResults } from '../electron/main/validator-logic.js'

describe('mapValidationResults', () => {
  test('重复 URL 复用唯一校验结果并保持原始顺序', () => {
    const urls = ['https://one.example', 'https://two.example', 'https://one.example']
    const uniqueUrls = ['https://one.example', 'https://two.example']
    const results = [
      { status: 'ok', finalUrl: 'https://one.example' },
      { status: 'warn', finalUrl: 'https://two.example' }
    ]

    assert.deepEqual(mapValidationResults(urls, uniqueUrls, results), [
      results[0],
      results[1],
      results[0]
    ])
  })

  test('缺失的唯一结果返回 unknown 占位', () => {
    const [result] = mapValidationResults(['https://missing.example'], [], [])
    assert.equal(result.status, 'unknown')
    assert.equal(result.finalUrl, 'https://missing.example')
  })
})
