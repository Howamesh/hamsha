// Direct unit tests for the validation layer (no browser). Run: node tests/unit-validate.mjs
import assert from 'node:assert/strict'
import { isIsoDate, validateTaskPatch, validatePart } from '../src/lib/validate.ts'
import { MOCK_KEYS } from '../src/data/mockKeys.ts'

const cases = [
  ['2026-02-30', false], ['2026-02-29', false], ['2028-02-29', true], ['2026-04-31', false],
  ['2026-13-01', false], ['2026-00-10', false], ['2026-10-15', true], ['2026-1-5', false], ['', false], [null, false],
]
for (const [v, expected] of cases) assert.equal(isIsoDate(v), expected, `isIsoDate(${JSON.stringify(v)}) should be ${expected}`)

const task = { id: 't', projectId: 'p', clientId: 'c', title: 'x', type: 'static', start: '2026-10-10', end: '2026-10-12', ownerId: 'u', approval: 'draft', version: 1 }
assert.throws(() => validateTaskPatch({ end: '2026-10-09' }, task), /end before start/)
assert.throws(() => validateTaskPatch({ start: '2026-02-30' }, task), /invalid date for start/)
assert.doesNotThrow(() => validateTaskPatch({ end: '2026-10-20' }, task))
assert.throws(() => validatePart({ taskId: 't', label: 'a', assigneeId: 'u', hours: 4, day: '2026-10-20', done: false, order: 0 }, task), /outside task range/)
assert.throws(() => validatePart({ taskId: 't', label: 'a', assigneeId: 'u', hours: 0, day: '2026-10-10', done: false, order: 0 }, task), /invalid hours/)
assert.throws(() => validatePart({ taskId: 't', label: 'a', assigneeId: 'u', hours: 4, day: '2026-10-10', time: '25:00', done: false, order: 0 }, task), /invalid time/)
assert.doesNotThrow(() => validatePart({ taskId: 't', label: 'a', assigneeId: 'u', hours: 4, day: '2026-10-11', time: '14:00', done: false, order: 0 }, task))

assert.deepEqual(MOCK_KEYS, ['hamsha.mock.v4'], 'reset must only touch the demo data key, never the session')

console.log(`unit-validate: ${cases.length + 8} assertions passed`)
console.log('isIsoDate:', Object.fromEntries(cases.slice(0, 3).map(([v]) => [v, isIsoDate(v)])))

// Arabic plural forms
import { partsCount } from '../src/lib/i18n.ts'
const plural = [[1, 'جزء واحد'], [2, 'جزأين'], [3, '3 أجزاء'], [10, '10 أجزاء'], [11, '11 جزءاً'], [25, '25 جزءاً']]
for (const [n, expected] of plural) assert.equal(partsCount(n, 'ar'), expected)
console.log('partsCount:', plural.map(([n]) => partsCount(n, 'ar')).join(' / '))
