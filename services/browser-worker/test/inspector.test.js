import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

import { extractFields } from '../inspector.js'

test('extracts bounded application field metadata without current values', async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.setContent(`
      <form>
        <label for="name">Full name</label>
        <input id="name" name="name" value="Private Candidate" required />

        <label>Email <input type="email" name="email" value="private@example.com" autocomplete="email" /></label>

        <label for="country">Country</label>
        <select id="country" name="country">
          <option value="IN">India</option>
          <option value="US">United States</option>
        </select>

        <input type="hidden" name="csrf" value="secret" />
      </form>
    `)

    const fields = await extractFields(page)
    assert.equal(fields.length, 3)
    assert.equal(fields[0].label, 'Full name')
    assert.equal(fields[0].required, true)
    assert.equal(fields[1].type, 'email')
    assert.equal(fields[1].autocomplete, 'email')
    assert.deepEqual(fields[2].options, [
      { value: 'IN', label: 'India' },
      { value: 'US', label: 'United States' },
    ])
    for (const field of fields) assert.equal(Object.hasOwn(field, 'value'), false)
  } finally {
    await context.close()
    await browser.close()
  }
})
