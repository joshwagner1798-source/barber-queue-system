'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Default shop ID for single-shop setup
const DEFAULT_SHOP_ID = '00000000-0000-0000-0000-000000000001'

export default function SignupPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    const supabase = createClient()

    // Sign up with Supabase Auth
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setIsLoading(false)
      return
    }

    // Create user record in our users table
    if (authData.user) {
      const { error: insertError } = await supabase.from('users').insert({
        auth_id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        shop_id: DEFAULT_SHOP_ID,
        role: 'customer',
      })

      if (insertError) {
        console.error('Error creating user record:', insertError)
        // Don't block signup if user record creation fails
        // The user can still log in and we can sync later
      }
    }

    router.push('/login?message=Check your email to confirm your account')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-secondary-900">
            Create an account
          </h1>
          <p className="mt-2 text-center text-sm text-secondary-600">
            Join us to book appointments online
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="firstName"
                label="First name"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />

              <Input
                id="lastName"
                label="Last name"
                type="text"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>

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
              id="phone"
              label="Phone number (optional)"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />

            <Input
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />

            <Input
              id="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isLoading}
          >
            Create account
          </Button>

          <p className="text-center text-sm text-secondary-600">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary-600 hover:text-primary-500 font-medium"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
