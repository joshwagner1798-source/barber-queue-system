'use client'

import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-secondary-700 mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            block w-full px-3 py-2 border rounded-lg shadow-sm
            placeholder-secondary-400 text-secondary-900
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            disabled:bg-secondary-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : 'border-secondary-300'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
