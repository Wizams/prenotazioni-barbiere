'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Home() {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
  }, [supabase])

  const handleLoginGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold">Prenotazioni Asto</h1>
        <p className="text-sm text-zinc-400">Test collegamento Google OAuth + Supabase</p>

        {loading ? (
          <p className="text-zinc-400 text-sm">Verifica sessione...</p>
        ) : user ? (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-sm">
              <p className="text-emerald-400 font-medium">Accesso effettuato!</p>
              <p className="text-zinc-300 mt-1">{user.user_metadata?.full_name || user.email}</p>
              <p className="text-zinc-500 text-xs">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition"
            >
              Esci
            </button>
          </div>
        ) : (
          <button
            onClick={handleLoginGoogle}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition"
          >
            Accedi con Google
          </button>
        )}
      </div>
    </main>
  )
}