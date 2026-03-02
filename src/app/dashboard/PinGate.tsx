'use client'

import { useState } from 'react'

// NOTE: Set NEXT_PUBLIC_OWNER_PIN in your .env.local to change the default PIN.
// Default is '1234' — change this before deploying to production.
const OWNER_PIN = process.env.NEXT_PUBLIC_OWNER_PIN ?? '1234'

interface Props {
  children: React.ReactNode
}

export function PinGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  if (unlocked) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input === OWNER_PIN) {
      setUnlocked(true)
    } else {
      setError('Incorrect PIN')
      setInput('')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="bg-secondary-900 border border-secondary-700 rounded-2xl p-8 w-full max-w-xs shadow-2xl">
        <h2 className="text-white text-xl font-bold mb-1 text-center">Owner Settings</h2>
        <p className="text-secondary-400 text-sm text-center mb-6">Enter your PIN to continue</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={input}
            onChange={(e) => {
              setInput(e.target.value.replace(/\D/g, ''))
              setError('')
            }}
            placeholder="••••"
            autoFocus
            className="w-full bg-secondary-800 border border-secondary-600 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest placeholder:text-secondary-600 focus:outline-none focus:border-primary-400"
          />
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-primary-500 hover:bg-primary-400 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
