'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { generaSlotGiornata, toLocalDateString, SERVIZI, type OrarioLavorativo } from '@/utils/slots'
import type { User } from '@supabase/supabase-js'

interface ProfiloUtente {
  id: string
  nome: string | null
  email: string
  telefono: string | null
  ruolo: string
}

interface Appuntamento {
  id: string
  data: string
  ora_inizio: string
  ora_fine: string
  servizio: string | null
  stato: string
}

interface GiornoCalendario {
  iso: string
  giornoSettimana: number
  labelGiorno: string
  labelNumero: string
}

const MAX_PRENOTAZIONI_ATTIVE = 1

function calcolaProssimiGiorni(oggi: Date): GiornoCalendario[] {
  const lista: GiornoCalendario[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(oggi)
    d.setDate(oggi.getDate() + i)
    lista.push({
      iso: toLocalDateString(d),
      giornoSettimana: d.getDay(),
      labelGiorno: d.toLocaleDateString('it-IT', { weekday: 'short' }),
      labelNumero: d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
    })
  }
  return lista
}

export default function Home() {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const [profilo, setProfilo] = useState<ProfiloUtente | null>(null)
  const [loading, setLoading] = useState(true)

  const [prossimiGiorni, setProssimiGiorni] = useState<GiornoCalendario[]>([])
  const [adesso, setAdesso] = useState<{ oggiIso: string; minuti: number } | null>(null)

  const [orariSettimana, setOrariSettimana] = useState<OrarioLavorativo[]>([])
  const [giorniChiusi, setGiorniChiusi] = useState<string[]>([])
  const [slotOccupati, setSlotOccupati] = useState<string[]>([])
  const [mieiAppuntamenti, setMieiAppuntamenti] = useState<Appuntamento[]>([])

  const [modificaProfilo, setModificaProfilo] = useState(false)
  const [inputNome, setInputNome] = useState('')
  const [inputTelefono, setInputTelefono] = useState('')

  const [dataSelezionata, setDataSelezionata] = useState<string>('')
  const [oraSelezionata, setOraSelezionata] = useState<string>('')
  const [servizio, setServizio] = useState<string>(SERVIZI[0])

  const [invioInCorso, setInvioInCorso] = useState(false)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'err'; testo: string } | null>(null)

  const caricaDatiIniziali = useCallback(async () => {
    const oraCorrente = new Date()
    const oggiIso = toLocalDateString(oraCorrente)
    const giorni = calcolaProssimiGiorni(oraCorrente)
  
    setProssimiGiorni(giorni)
    setAdesso({
      oggiIso,
      minuti: oraCorrente.getHours() * 60 + oraCorrente.getMinutes(),
    })

    const { data: authData } = await supabase.auth.getUser()
    const currentUser = authData.user
    setUser(currentUser)

    const [{ data: orari }, { data: chiusi }] = await Promise.all([
      supabase.from('orari_lavorativi').select('*'),
      supabase.from('giorni_chiusi').select('data_chiusura').gte('data_chiusura', oggiIso),
    ])

    const listaOrari = (orari as OrarioLavorativo[]) || []
    const listaChiusi = (chiusi || []).map((c: { data_chiusura: string }) => c.data_chiusura)
    setOrariSettimana(listaOrari)
    setGiorniChiusi(listaChiusi)

    setDataSelezionata((prev) => {
      if (prev) return prev
      const primoGiornoAperto = giorni.find((g) => {
        const regola = listaOrari.find((o) => o.giorno_settimana === g.giornoSettimana)
        return regola?.aperto && !listaChiusi.includes(g.iso)
      })
      return primoGiornoAperto ? primoGiornoAperto.iso : ''
    })

    if (currentUser) {
      const [{ data: prof }, { data: apps }] = await Promise.all([
        supabase.from('utenti').select('*').eq('id', currentUser.id).single(),
        supabase
          .from('appuntamenti')
          .select('*')
          .eq('utente_id', currentUser.id)
          .eq('stato', 'confermato')
          .gte('data', oggiIso)
          .order('data', { ascending: true })
          .order('ora_inizio', { ascending: true }),
      ])

      if (prof) {
        const p = prof as ProfiloUtente
        setProfilo(p)
        if (p.telefono) {
          setInputNome(p.nome || '')
          setInputTelefono(p.telefono)
        } else {
          setInputNome('')
          setInputTelefono('')
        }
      }
      setMieiAppuntamenti((apps as Appuntamento[]) || [])
    }

    setLoading(false)
  }, [supabase])
  
  useEffect(() => {
    const onFocus = () => {
      caricaDatiIniziali()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [caricaDatiIniziali])
  
  useEffect(() => {
    caricaDatiIniziali()
  }, [caricaDatiIniziali])

  const caricaOccupati = useCallback(async (dataIso: string) => {
    if (!dataIso) return
    const { data } = await supabase
      .from('appuntamenti')
      .select('ora_inizio')
      .eq('data', dataIso)
      .eq('stato', 'confermato')

    setSlotOccupati((data || []).map((r: { ora_inizio: string }) => r.ora_inizio.slice(0, 5)))
  }, [supabase])

  useEffect(() => {
    setOraSelezionata('')
    caricaOccupati(dataSelezionata)
  }, [dataSelezionata, caricaOccupati])

  const slotDisponibili = useMemo(() => {
    if (!dataSelezionata || !adesso || giorniChiusi.includes(dataSelezionata)) return []
    const giornoObj = prossimiGiorni.find((g) => g.iso === dataSelezionata)
    if (!giornoObj) return []

    const regola = orariSettimana.find((o) => o.giorno_settimana === giornoObj.giornoSettimana)
    if (!regola || !regola.aperto) return []

    const tutti = generaSlotGiornata(regola)

    return tutti.map((s) => {
      const [hh, mm] = s.inizio.split(':').map(Number)
      const passato = dataSelezionata === adesso.oggiIso && hh * 60 + mm <= adesso.minuti
      const occupato = slotOccupati.includes(s.inizio)
      return {
        ...s,
        disponibile: !passato && !occupato,
      }
    })
  }, [dataSelezionata, adesso, giorniChiusi, prossimiGiorni, orariSettimana, slotOccupati])
  
  useEffect(() => {
    if (
      oraSelezionata &&
      !slotDisponibili.some((s) => s.inizio === oraSelezionata && s.disponibile)
    ) {
      setOraSelezionata('')
    }
  }, [oraSelezionata, slotDisponibili])

  const handleLoginGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfilo(null)
    setMieiAppuntamenti([])
    setModificaProfilo(false)
  }

  const handleSalvaProfilo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const nomePulito = inputNome.trim()
    const telPulito = inputTelefono.trim()

    if (nomePulito.length < 3) {
      setFeedback({ tipo: 'err', testo: 'Inserisci il tuo nome e cognome.' })
      return
    }
    if (telPulito.length < 8) {
      setFeedback({ tipo: 'err', testo: 'Inserisci un numero di telefono valido.' })
      return
    }

    setInvioInCorso(true)
    setFeedback(null)

    const { error } = await supabase
      .from('utenti')
      .update({ nome: nomePulito, telefono: telPulito })
      .eq('id', user.id)

    if (error) {
      setFeedback({ tipo: 'err', testo: `Errore salvataggio profilo: ${error.message}` })
      setInvioInCorso(false)
      return
    }

    setProfilo((prev) =>
      prev
        ? { ...prev, nome: nomePulito, telefono: telPulito }
        : { id: user.id, nome: nomePulito, email: user.email || '', telefono: telPulito, ruolo: 'cliente' }
    )
    setModificaProfilo(false)
    setInvioInCorso(false)
  }

  const handlePrenota = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !profilo?.telefono || !dataSelezionata || !oraSelezionata) return

    const isAdmin = profilo.ruolo === 'barbiere' || profilo.ruolo === 'admin'
    if (!isAdmin && mieiAppuntamenti.length >= MAX_PRENOTAZIONI_ATTIVE) {
      setFeedback({
        tipo: 'err',
        testo: 'Hai già una prenotazione attiva. Annullala prima di prenotarne una nuova.',
      })
      return
    }

    const slotScelto = slotDisponibili.find((s) => s.inizio === oraSelezionata && s.disponibile)
    if (!slotScelto) {
      setFeedback({ tipo: 'err', testo: 'Questo orario non è più disponibile.' })
      setOraSelezionata('')
      return
    }

    setInvioInCorso(true)
    setFeedback(null)

    const { error } = await supabase.from('appuntamenti').insert({
      utente_id: user.id,
      data: dataSelezionata,
      ora_inizio: slotScelto.inizio,
      ora_fine: slotScelto.fine,
      servizio,
      stato: 'confermato',
    })

    if (error) {
      setFeedback({
        tipo: 'err',
        testo: `Impossibile completare la prenotazione (${error.message}). Riprova.`,
      })
      setInvioInCorso(false)
      await caricaOccupati(dataSelezionata)
      return
    }

    await fetch('/api/notifica-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'nuova',
        clienteNome: profilo.nome || 'Cliente',
        clienteTelefono: profilo.telefono,
        data: dataSelezionata,
        oraInizio: slotScelto.inizio,
        servizio,
      }),
    })

    setOraSelezionata('')
    setFeedback({ tipo: 'ok', testo: 'Prenotazione confermata! Ti aspettiamo in salone.' })
    await Promise.all([caricaOccupati(dataSelezionata), caricaDatiIniziali()])
    setInvioInCorso(false)
  }

  const handleAnnulla = async (app: Appuntamento) => {
    if (!user) return
    setInvioInCorso(true)

    const { error } = await supabase
      .from('appuntamenti')
      .update({ stato: 'annullato' })
      .eq('id', app.id)

    if (!error) {
      await fetch('/api/notifica-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'annullata',
          clienteNome: profilo?.nome || 'Cliente',
          clienteTelefono: profilo?.telefono || '',
          data: app.data,
          oraInizio: app.ora_inizio.slice(0, 5),
        }),
      })
      await Promise.all([caricaOccupati(dataSelezionata), caricaDatiIniziali()])
    }

    setInvioInCorso(false)
  }

  const profiloIncompleto = Boolean(user && profilo && !profilo.telefono)
  const isAdmin = profilo?.ruolo === 'barbiere' || profilo?.ruolo === 'admin'
  const bloccoLimiteRaggiunto = !isAdmin && mieiAppuntamenti.length >= MAX_PRENOTAZIONI_ATTIVE

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-12">
      <header className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Prenotazioni Asto</h1>
            <p className="text-xs text-zinc-400">Mar–Sab · 10:00–13:00 / 15:30–19:00</p>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 font-medium transition"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              >
                Esci
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {loading ? (
          <p className="text-center text-zinc-400 py-12 text-sm">Caricamento orari...</p>
        ) : !user ? (
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">Prenota il tuo taglio in pochi secondi</h2>
            <p className="text-sm text-zinc-400">
              Accedi con il tuo account Google per scegliere giorno e orario disponibile.
            </p>
            <button
              onClick={handleLoginGoogle}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl transition"
            >
              Accedi con Google
            </button>
          </section>
        ) : profiloIncompleto || modificaProfilo ? (
          <form
            onSubmit={handleSalvaProfilo}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="text-lg font-bold">
                {profiloIncompleto ? 'Completa il tuo profilo' : 'Modifica i tuoi dati'}
              </h2>
              <p className="text-xs text-zinc-400">
                Account collegato: <span className="text-zinc-200">{user.email}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Nome e Cognome
              </label>
              <input
                type="text"
                required
                placeholder="Es. Mario Rossi"
                value={inputNome}
                onChange={(e) => setInputNome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Numero di telefono
              </label>
              <input
                type="tel"
                required
                placeholder="Es. 333 1234567"
                value={inputTelefono}
                onChange={(e) => setInputTelefono(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {feedback && (
              <div className="p-3 rounded-xl text-sm border bg-red-950/50 border-red-800 text-red-300">
                {feedback.testo}
              </div>
            )}

            <div className="flex gap-2">
              {!profiloIncompleto && (
                <button
                  type="button"
                  onClick={() => {
                    setModificaProfilo(false)
                    setFeedback(null)
                  }}
                  className="w-1/3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm transition"
                >
                  Annulla
                </button>
              )}
              <button
                type="submit"
                disabled={invioInCorso}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
              >
                {invioInCorso ? 'Salvataggio...' : 'Salva e continua'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-zinc-400">Prenoti come </span>
                <span className="font-semibold text-zinc-100">{profilo?.nome}</span>
                <span className="text-zinc-500"> · {profilo?.telefono}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputNome(profilo?.nome || '')
                  setInputTelefono(profilo?.telefono || '')
                  setFeedback(null)
                  setModificaProfilo(true)
                }}
                className="text-amber-400 hover:underline font-medium"
              >
                Modifica
              </button>
            </div>

            {mieiAppuntamenti.length > 0 && (
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  Il tuo prossimo appuntamento
                </h2>
                <div className="space-y-2">
                  {mieiAppuntamenti.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl p-3"
                    >
                      <div>
                        <p className="font-medium text-sm capitalize">
                          {new Date(`${app.data}T00:00:00`).toLocaleDateString('it-IT', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          · <span className="text-amber-400">{app.ora_inizio.slice(0, 5)}</span>
                        </p>
                        <p className="text-xs text-zinc-400">{app.servizio || 'Taglio'}</p>
                      </div>
                      <button
                        onClick={() => handleAnnulla(app)}
                        disabled={invioInCorso}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-900/60 transition"
                      >
                        Annulla
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <form
              onSubmit={handlePrenota}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5"
            >
              {bloccoLimiteRaggiunto && (
                <div className="p-3 rounded-xl text-xs border bg-amber-950/40 border-amber-700/50 text-amber-200">
                  Hai già una prenotazione attiva. Per prenotare un altro giorno o orario, annulla prima quella attuale.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  1. Scegli il servizio
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SERVIZI.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setServizio(s)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium border transition ${
                        servizio === s
                          ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  2. Scegli il giorno
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {prossimiGiorni.map((g) => {
                    const regola = orariSettimana.find((o) => o.giorno_settimana === g.giornoSettimana)
                    const chiuso = !regola?.aperto || giorniChiusi.includes(g.iso)
                    const attivo = dataSelezionata === g.iso

                    return (
                      <button
                        type="button"
                        key={g.iso}
                        disabled={chiuso}
                        onClick={() => setDataSelezionata(g.iso)}
                        className={`min-w-[72px] py-2.5 px-2 rounded-xl border text-center shrink-0 transition ${
                          chiuso
                            ? 'bg-zinc-950/40 border-zinc-900 text-zinc-600 cursor-not-allowed'
                            : attivo
                            ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold'
                            : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-[11px] uppercase">{g.labelGiorno}</div>
                        <div className="text-sm font-bold mt-0.5">{g.labelNumero}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  3. Orari disponibili (slot 35 min)
                </label>
                {slotDisponibili.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nessuno slot disponibile per questa data.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {slotDisponibili.map((slot) => {
                      const attivo = oraSelezionata === slot.inizio
                      return (
                        <button
                          type="button"
                          key={slot.inizio}
                          disabled={!slot.disponibile || bloccoLimiteRaggiunto}
                          onClick={() => setOraSelezionata(slot.inizio)}
                          className={`py-2.5 rounded-xl text-sm font-medium border transition ${
                            !slot.disponibile || bloccoLimiteRaggiunto
                              ? 'bg-zinc-950/40 border-zinc-900 text-zinc-600 line-through cursor-not-allowed'
                              : attivo
                              ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                              : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {slot.inizio}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-sm border ${
                    feedback.tipo === 'ok'
                      ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                      : 'bg-red-950/50 border-red-800 text-red-300'
                  }`}
                >
                  {feedback.testo}
                </div>
              )}

              <button
                type="submit"
                disabled={!oraSelezionata || invioInCorso || bloccoLimiteRaggiunto}
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold text-sm transition"
              >
                {invioInCorso
                  ? 'Conferma in corso...'
                  : bloccoLimiteRaggiunto
                  ? 'Hai già una prenotazione attiva'
                  : oraSelezionata
                  ? `Conferma alle ${oraSelezionata}`
                  : 'Seleziona un orario'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}