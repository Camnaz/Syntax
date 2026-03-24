'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      // Admin mode: admin1/SyntaxEpoch bypasses billing for testing/demos
      const isAdminLogin = email.trim().toLowerCase() === 'admin1' && password === 'SyntaxEpoch'
      const effectiveEmail = isAdminLogin ? 'admin1@syntax.oleacomputer.com' : email

      if (isAdminLogin) {
        // Set admin flag before auth — dashboard reads this to bypass all billing/limits
        localStorage.setItem('syntax_admin_mode', 'true')
      } else {
        localStorage.removeItem('syntax_admin_mode')
      }

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: effectiveEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })

        if (error) throw error

        setMessage({
          type: 'success',
          text: 'Account created! You can now sign in.',
        })
        setIsSignUp(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: effectiveEmail,
          password,
        })

        if (error) throw error

        router.push('/dashboard')
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      setMessage({
        type: 'error',
        text: errMsg || 'An error occurred',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-olea-studio-grey text-olea-obsidian flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-olea-obsidian mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="bg-white border border-zinc-200 rounded-xl p-8 shadow-sm">
          <div className="flex justify-center mb-10">
            <Image 
              src="/images/OleaSyntaxLogo2.svg" 
              alt="Olea Syntax" 
              width={200} 
              height={50} 
              className="h-12 w-auto"
              priority
            />
          </div>

          <h2 className="text-3xl font-bold mb-2 text-olea-obsidian">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-zinc-500 mb-8">
            {isSignUp
              ? 'Start with Observer tier (free)'
              : 'Sign in to your account'}
          </p>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                message.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'bg-emerald-50 border border-emerald-200 text-olea-evergreen'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleAuth} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-olea-obsidian">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-olea-paper border border-zinc-200 rounded-lg focus:outline-none focus:border-olea-evergreen transition-colors text-olea-obsidian"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-olea-obsidian">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-olea-paper border border-zinc-200 rounded-lg focus:outline-none focus:border-olea-evergreen transition-colors text-olea-obsidian"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed rounded-lg font-bold transition-all shadow-sm"
            >
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage(null)
              }}
              className="text-zinc-500 hover:text-olea-obsidian transition-colors text-sm font-medium"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
