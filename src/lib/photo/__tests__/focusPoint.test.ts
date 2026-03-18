import { describe, it, expect } from 'vitest'
import { applyDragDelta } from '../focusPoint'

const container = { w: 100, h: 100 }

describe('applyDragDelta', () => {
  it('returns unchanged values when delta is zero', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 0, dy: 0 }, container)).toEqual({
      x: 50,
      y: 50,
    })
  })

  it('decreases x when dragging right', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 50, dy: 0 }, container)).toEqual({
      x: 0,
      y: 50,
    })
  })

  it('increases x when dragging left', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: -50, dy: 0 }, container)).toEqual({
      x: 100,
      y: 50,
    })
  })

  it('decreases y when dragging down', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 0, dy: 50 }, container)).toEqual({
      x: 50,
      y: 0,
    })
  })

  it('clamps x to 0 when dragging far right', () => {
    expect(applyDragDelta({ x: 10, y: 50 }, { dx: 999, dy: 0 }, container)).toEqual({
      x: 0,
      y: 50,
    })
  })

  it('clamps x to 100 when dragging far left', () => {
    expect(applyDragDelta({ x: 90, y: 50 }, { dx: -999, dy: 0 }, container)).toEqual({
      x: 100,
      y: 50,
    })
  })

  it('clamps y to 0 when dragging far down', () => {
    expect(applyDragDelta({ x: 50, y: 10 }, { dx: 0, dy: 999 }, container)).toEqual({
      x: 50,
      y: 0,
    })
  })

  it('clamps y to 100 when dragging far up', () => {
    expect(applyDragDelta({ x: 50, y: 90 }, { dx: 0, dy: -999 }, container)).toEqual({
      x: 50,
      y: 100,
    })
  })

  it('handles non-square containers', () => {
    expect(applyDragDelta({ x: 60, y: 60 }, { dx: 100, dy: 0 }, { w: 200, h: 100 })).toEqual({
      x: 10,
      y: 60,
    })
  })

  it('returns current values unchanged when container dimension is zero', () => {
    expect(applyDragDelta({ x: 40, y: 60 }, { dx: 10, dy: 10 }, { w: 0, h: 100 })).toEqual({
      x: 40,
      y: 60,
    })
    expect(applyDragDelta({ x: 40, y: 60 }, { dx: 10, dy: 10 }, { w: 100, h: 0 })).toEqual({
      x: 40,
      y: 60,
    })
  })
})
