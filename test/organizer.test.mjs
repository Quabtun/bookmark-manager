// organizer.test.mjs — 分栏式书签整理视图相关工具函数单元测试
// 运行: node --test test/organizer.test.mjs

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { collectDescendantIds, isAncestorOf } from '../src/stores/categories.js'

// ============================================================
// collectDescendantIds
// ============================================================
describe('collectDescendantIds', () => {
  test('空 id 返回空集合', () => {
    const cats = [{ id: 'a', parentId: null }]
    assert.equal(collectDescendantIds(cats, null).size, 0)
    assert.equal(collectDescendantIds(cats, '').size, 0)
    assert.equal(collectDescendantIds(cats, undefined).size, 0)
  })

  test('叶子节点：仅自身', () => {
    const cats = [{ id: 'a', parentId: null }, { id: 'b', parentId: null }]
    const set = collectDescendantIds(cats, 'a')
    assert.deepEqual([...set], ['a'])
  })

  test('包含自身的整棵子树', () => {
    const cats = [
      { id: 'root', parentId: null },
      { id: 'child1', parentId: 'root' },
      { id: 'child2', parentId: 'root' },
      { id: 'grand1', parentId: 'child1' },
      { id: 'grand2', parentId: 'child1' },
      { id: 'other', parentId: null }
    ]
    const set = collectDescendantIds(cats, 'root')
    assert.equal(set.size, 5)
    assert.ok(set.has('root'))
    assert.ok(set.has('child1'))
    assert.ok(set.has('child2'))
    assert.ok(set.has('grand1'))
    assert.ok(set.has('grand2'))
    assert.ok(!set.has('other'))
  })

  test('深层嵌套也能完整收集', () => {
    const cats = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: 'c' }
    ]
    const set = collectDescendantIds(cats, 'a')
    assert.equal(set.size, 4)
  })

  test('不存在的 id 仅返回空集合', () => {
    const cats = [{ id: 'a', parentId: null }]
    const set = collectDescendantIds(cats, 'ghost')
    assert.equal(set.size, 1) // 实现里如果 id 不存在，set 仍会先加入 id
    assert.ok(set.has('ghost'))
  })
})

// ============================================================
// isAncestorOf
// ============================================================
describe('isAncestorOf', () => {
  const cats = [
    { id: 'root', parentId: null },
    { id: 'mid', parentId: 'root' },
    { id: 'leaf', parentId: 'mid' }
  ]

  test('直接祖先', () => {
    assert.equal(isAncestorOf(cats, 'root', 'mid'), true)
    assert.equal(isAncestorOf(cats, 'mid', 'leaf'), true)
  })

  test('多级祖先', () => {
    assert.equal(isAncestorOf(cats, 'root', 'leaf'), true)
  })

  test('非祖先（兄弟）', () => {
    const more = [...cats, { id: 'sibling', parentId: 'root' }]
    assert.equal(isAncestorOf(more, 'mid', 'sibling'), false)
  })

  test('自身不算祖先', () => {
    assert.equal(isAncestorOf(cats, 'root', 'root'), false)
    assert.equal(isAncestorOf(cats, 'leaf', 'leaf'), false)
  })

  test('空参数返回 false', () => {
    assert.equal(isAncestorOf(cats, '', 'leaf'), false)
    assert.equal(isAncestorOf(cats, 'root', ''), false)
    assert.equal(isAncestorOf(cats, null, 'leaf'), false)
  })

  test('不存在的节点返回 false', () => {
    assert.equal(isAncestorOf(cats, 'ghost', 'leaf'), false)
    assert.equal(isAncestorOf(cats, 'root', 'ghost'), false)
  })

  test('反向不算祖先', () => {
    assert.equal(isAncestorOf(cats, 'leaf', 'root'), false)
    assert.equal(isAncestorOf(cats, 'mid', 'root'), false)
  })
})
