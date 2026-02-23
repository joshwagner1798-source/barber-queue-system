'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync state with actual fullscreen changes (e.g. user presses ESC)
  useEffect(() => {
    const onFsChange = () => {
      const active = !!document.fullscreenElement
      setIsFullscreen(active)
      if (active) {
        document.body.classList.add('fullscreen-mode')
      } else {
        document.body.classList.remove('fullscreen-mode')
        // Restore cursor when leaving fullscreen
        document.body.style.cursor = ''
        if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Hide cursor after 3s of inactivity while in fullscreen
  const resetCursorTimer = useCallback(() => {
    if (!document.fullscreenElement) return
    document.body.style.cursor = ''
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    cursorTimerRef.current = setTimeout(() => {
      if (document.fullscreenElement) document.body.style.cursor = 'none'
    }, 3000)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return
    window.addEventListener('mousemove', resetCursorTimer)
    resetCursorTimer()
    return () => {
      window.removeEventListener('mousemove', resetCursorTimer)
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    }
  }, [isFullscreen, resetCursorTimer])

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen()
    } catch { /* user denied or unsupported */ }
  }, [])

  const exit = useCallback(async () => {
    try {
      await document.exitFullscreen()
    } catch { /* already exited */ }
  }, [])

  return (
    <button
      onClick={isFullscreen ? exit : enter}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors border border-white/10 hover:border-white/20 select-none"
      title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Open Fullscreen'}
    >
      {isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
    </button>
  )
}
