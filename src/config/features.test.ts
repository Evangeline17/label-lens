import { describe, expect, it } from 'vitest'
import {
  initialLabelRecognitionBetaEnabled,
  isLabelRecognitionBetaAvailable,
} from './features'

describe('label recognition Beta feature flag', () => {
  it('is disabled by default and only accepts the literal true value', () => {
    expect(isLabelRecognitionBetaAvailable(undefined)).toBe(false)
    expect(isLabelRecognitionBetaAvailable('false')).toBe(false)
    expect(isLabelRecognitionBetaAvailable('TRUE')).toBe(false)
    expect(isLabelRecognitionBetaAvailable('true')).toBe(true)
  })

  it('does not restore an enabled session when the build flag is off', () => {
    expect(initialLabelRecognitionBetaEnabled(false, true)).toBe(false)
    expect(initialLabelRecognitionBetaEnabled(true, false)).toBe(false)
    expect(initialLabelRecognitionBetaEnabled(true, undefined)).toBe(true)
  })
})
