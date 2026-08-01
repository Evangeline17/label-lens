import { describe, expect, it } from 'vitest'
import { LABEL_RECOGNITION_BETA_AVAILABLE } from './features'

describe('label recognition Beta availability', () => {
  it('is always enabled in the production application', () => {
    expect(LABEL_RECOGNITION_BETA_AVAILABLE).toBe(true)
  })
})
