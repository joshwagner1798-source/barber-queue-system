import { describe, it, expect } from 'vitest'
import { canFitWalkin } from '../capacity_check'
import { NOW } from './fixtures'

describe('canFitWalkin', () => {
  const defaultBuffer = 5

  // Test 1: No commitment (null) → always fits, windowMinutes = Infinity
  it('returns fits=true with Infinity window when nextCommitmentAt is null', () => {
    const result = canFitWalkin(NOW, null, 30, defaultBuffer)
    expect(result.fits).toBe(true)
    expect(result.windowMinutes).toBe(Infinity)
    expect(result.nextCommitmentAt).toBe(null)
  })

  // Test 2: Appointment in 25 min with duration=30, buffer=5 → does NOT fit (25 < 35)
  it('does not fit when window (25) < required (30+5)', () => {
    const nextCommitment = new Date(NOW.getTime() + 25 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(false)
    if (!result.fits) expect(result.reason).toBe('appointment_too_soon')
    expect(result.windowMinutes).toBe(25)
    expect(result.nextCommitmentAt).toEqual(nextCommitment)
  })

  // Test 3: Appointment in exactly 35 min → does NOT fit (must be strictly greater than 35)
  it('does not fit when window (35) equals required (30+5)', () => {
    const nextCommitment = new Date(NOW.getTime() + 35 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(false)
    if (!result.fits) expect(result.reason).toBe('appointment_too_soon')
    expect(result.windowMinutes).toBe(35)
  })

  // Test 4: Appointment in 36 min → fits (36 > 35)
  it('fits when window (36) > required (30+5)', () => {
    const nextCommitment = new Date(NOW.getTime() + 36 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(true)
    expect(result.windowMinutes).toBe(36)
    expect(result.nextCommitmentAt).toEqual(nextCommitment)
  })

  // Test 5: Appointment in 60 min → fits, windowMinutes ≈ 60
  it('fits when window is well beyond required time', () => {
    const nextCommitment = new Date(NOW.getTime() + 60 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(true)
    expect(result.windowMinutes).toBe(60)
  })

  // Test 6: Non-fitting result includes correct windowMinutes (not 0 — the actual window)
  it('returns actual windowMinutes in negative result, not 0', () => {
    const nextCommitment = new Date(NOW.getTime() + 20 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(false)
    expect(result.windowMinutes).toBe(20)
    expect(result.windowMinutes).not.toBe(0)
  })

  // Test 7: Custom buffer: duration=20, buffer=10 → need 30; 29min fails, 31min passes
  it('respects custom transition buffer - fails at 29 min (20+10)', () => {
    const nextCommitment = new Date(NOW.getTime() + 29 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 20, 10)
    expect(result.fits).toBe(false)
    expect(result.windowMinutes).toBe(29)
  })

  it('respects custom transition buffer - passes at 31 min (20+10)', () => {
    const nextCommitment = new Date(NOW.getTime() + 31 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 20, 10)
    expect(result.fits).toBe(true)
    expect(result.windowMinutes).toBe(31)
  })

  // Test 8: Commitment in the past → does NOT fit (negative window)
  it('does not fit when commitment is in the past', () => {
    const nextCommitment = new Date(NOW.getTime() - 10 * 60_000)
    const result = canFitWalkin(NOW, nextCommitment, 30, defaultBuffer)
    expect(result.fits).toBe(false)
    expect(result.windowMinutes).toBe(-10)
    if (!result.fits) expect(result.reason).toBe('appointment_too_soon')
  })
})
