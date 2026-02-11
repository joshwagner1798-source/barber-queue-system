import { describe, it, expect } from 'vitest'
import { sanitizePhone, buildDisplayName, submitWalkin } from '../actions'

// ---------------------------------------------------------------------------
// sanitizePhone — strips non-digits
// ---------------------------------------------------------------------------

describe('sanitizePhone', () => {
  it('strips dashes and parens', () => {
    expect(sanitizePhone('(555) 123-4567')).toBe('5551234567')
  })

  it('strips spaces', () => {
    expect(sanitizePhone('555 123 4567')).toBe('5551234567')
  })

  it('passes through clean digits', () => {
    expect(sanitizePhone('5551234567')).toBe('5551234567')
  })

  it('strips all non-digit characters', () => {
    expect(sanitizePhone('+1-555.123.4567')).toBe('15551234567')
  })

  it('returns empty string for no digits', () => {
    expect(sanitizePhone('abc')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildDisplayName — "FirstName L."
// ---------------------------------------------------------------------------

describe('buildDisplayName', () => {
  it('capitalizes first letter, lowercase rest + initial with period', () => {
    expect(buildDisplayName('john', 'D')).toBe('John D.')
  })

  it('handles all-caps input', () => {
    expect(buildDisplayName('MARIA', 'S')).toBe('Maria S.')
  })

  it('handles lowercase initial', () => {
    expect(buildDisplayName('Alex', 'k')).toBe('Alex K.')
  })

  it('trims whitespace', () => {
    expect(buildDisplayName('  sam  ', ' r ')).toBe('Sam R.')
  })

  it('handles single-character first name', () => {
    expect(buildDisplayName('J', 'B')).toBe('J B.')
  })
})

// ---------------------------------------------------------------------------
// submitWalkin — validation (tested without DB; returns early on bad input)
// ---------------------------------------------------------------------------

describe('submitWalkin validation', () => {
  it('rejects empty first name', async () => {
    const result = await submitWalkin({
      firstName: '',
      lastInitial: 'D',
      phone: '5551234567',
      preferenceType: 'ANY',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/first name/i)
  })

  it('rejects whitespace-only first name', async () => {
    const result = await submitWalkin({
      firstName: '   ',
      lastInitial: 'D',
      phone: '5551234567',
      preferenceType: 'ANY',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/first name/i)
  })

  it('rejects multi-character last initial', async () => {
    const result = await submitWalkin({
      firstName: 'John',
      lastInitial: 'Do',
      phone: '5551234567',
      preferenceType: 'ANY',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/last initial/i)
  })

  it('rejects numeric last initial', async () => {
    const result = await submitWalkin({
      firstName: 'John',
      lastInitial: '3',
      phone: '5551234567',
      preferenceType: 'ANY',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/last initial/i)
  })

  it('rejects short phone number', async () => {
    const result = await submitWalkin({
      firstName: 'John',
      lastInitial: 'D',
      phone: '55512',
      preferenceType: 'ANY',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/10 digits/i)
  })

  it('rejects PREFERRED without barber selection', async () => {
    const result = await submitWalkin({
      firstName: 'John',
      lastInitial: 'D',
      phone: '5551234567',
      preferenceType: 'PREFERRED',
      preferredBarberId: null,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/select a barber/i)
  })
})
