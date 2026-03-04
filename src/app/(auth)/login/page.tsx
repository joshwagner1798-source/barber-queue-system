'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { loginAction } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await loginAction(email, password)
      if (result.error) {
        setError(result.error)
      } else {
        // Full-page navigation instead of router.push: the App Router client
        // cache can hold a stale RSC payload for /dashboard from before login
        // (which encoded a redirect to /login). router.push would serve that
        // stale payload, re-triggering the redirect. window.location bypasses
        // the Router Cache entirely and issues a fresh HTTP GET with cookies.
        window.location.assign('/dashboard')
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-secondary-900">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-sm text-secondary-600">
            Sign in to manage your appointments
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Input
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <Input
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link
                href="/forgot-password"
                className="text-primary-600 hover:text-primary-500"
              >
                Forgot your password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isPending}
          >
            Sign in
          </Button>

          <p className="text-center text-sm text-secondary-600">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="text-primary-600 hover:text-primary-500 font-medium"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
