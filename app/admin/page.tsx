'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { toLocalDateString, type OrarioLavorativo } from '@/utils/slots'

interface AppuntamentoAdmin {
  id: string
  data: string
  ora_inizio: string
  ora_fine: string
  servizio: string | null
  stato: string
  utenti: {
    nome: string | null
    email: string
    telefono: string | null
  } | null
}

interface GiornoChiuso {
  data: string
  motivo?: string | null
}

const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

export default function AdminPage() {
  const [supabase] = useState(() => createClient())
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'agenda' | 'chiusure' | 'orari'>('agenda')

  const [oggiIso, setOggiIso] = useState<string>('')
  const [dataFiltro, setDataFiltro] = useState<string>('')
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoAdmin[]>([])
  const [giorniChiusi, setGiorniChiusi] = useState<GiornoChiuso[]>([])
  const [orari, setOrari] = useState<OrarioLavorativo[]>([])

  const [nuovaDataChiusa, setNuovaDataChiusa] = useState('')
  const [motivoChiusura, setMotivoChiusura] = useState('')
  const [salvataggio, setSalvataggio] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  useEffect(() => {
    const oggi = toLocalDateString(new Date())
    setOggiIso(oggi)
    setDataFiltro((prev) => prev || oggi)
  }, [])

  const verificaAccesso = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAutorizzato(false)
      return
    }

    const { data: prof } = await supabase
      .from('utenti')
      .select('ruolo')
      .eq('id', user.id)
      .single()

    setAutorizzato(prof?.ruolo === 'barbiere' || prof?.ruolo === 'admin')
  }, [supabase])

  const caricaAgenda = useCallback(async (giorno: string) => {
    if (!giorno) return
    const { data } = await supabase
      .from('appuntamenti')
      .select('id, data, ora_inizio, ora_fine, servizio, stato, utenti(nome, email, telefono)')
      .eq('data', giorno)
      .eq('stato', 'confermato')
      .order('ora_inizio', { ascending: true })

    setAppuntamenti((data as unknown as AppuntamentoAdmin[]) || [])
  }, [supabase])

  const caricaConfigurazione = useCallback(async (daData: string) => {
    if (!daData) return
    const [{ data: chiusi }, { data: listaOrari }] = await Promise.all([
      supabase
        .from('giorni_chiusi')
        .select('*')
        .gte('data', daData)
        .order('data', { ascending: true }),
      supabase
        .from('orari_lavorativi')
        .select('*')
        .order('giorno_settimana', { ascending: true }),
    ])

    setGiorniChiusi((chiusi as GiornoChiuso[]) || [])
    setOrari((listaOrari as OrarioLavorativo[]) || [])
  }, [supabase])

  useEffect(() => {
    verificaAccesso()
  }, [verificaAccesso])

  useEffect(() => {
    if (autorizzato && dataFiltro) {
      caricaAgenda(dataFiltro)
    }
  }, [autorizzato, dataFiltro, caricaAgenda])

  useEffect(() => {
    if (autorizzato && oggiIso) {
      caricaConfigurazione(oggiIso)
    }
  }, [autorizzato, oggiIso, caricaConfigurazione])

  const annullaAppuntamento = async (id: string) => {
    setSalvataggio(true)
    await supabase.from('appuntamenti').update({ stato: 'annullato' }).eq('id', id)
    await caricaAgenda(dataFiltro)
    setSalvataggio(false)
  }

  const aggiungiGiornoChiuso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuovaDataChiusa) return
    setSalvataggio(true)

    await supabase.from('giorni_chiusi').upsert({
      data: nuovaDataChiusa,
      motivo: motivoChiusura.trim() || null,
    })

    setNuovaDataChiusa('')
    setMotivoChiusura('')
    await caricaConfigurazione(oggiIso)
    setSalvataggio(false)
  }

  const rimuoviGiornoChiuso = async (dataIso: string) => {
    setSalvataggio(true)
    await supabase.from('giorni_chiusi').delete().eq('data', dataIso)
    await caricaConfigurazione(oggiIso)
    setSalvataggio(false)
  }

  const aggiornaCampoOrario = (
    giorno: number,
    campo: keyof OrarioLavorativo,
    valore: string | number | boolean | null
  ) => {
    setOrari((prev) =>
      prev.map((r) => (r.giorno_settimana === giorno ? { ...r, [campo]: valore } : r))
    )
  }

  const salvaOrari = async () => {
    setSalvataggio(true)
    setMessaggio(null)

    for (const r of orari) {
      await supabase
        .from('orari_lavorativi')
        .update({
          aperto: r.aperto,
          ora_inizio: r.ora_inizio,
          ora_fine: r.ora_fine,
          pausa_inizio: r.pausa_inizio || null,
          pausa_fine: r.pausa_fine || null,
          durata_slot_minuti: Number(r.durata_slot_minuti) || 45,
        })
        .eq('giorno_settimana', r.giorno_settimana)
    }

    setMessaggio('Orari aggiornati correttamente.')
    setSalvataggio(false)
  }

  if (autorizzato === null) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
        Verifica permessi in corso...
      </main>
    )
  }

  if (!autorizzato) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-lg font-semibold">Accesso riservato al barbiere</p>
        <Link
          href="/"
          className="px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm"
        >
          Torna alle prenotazioni
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-12">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Gestione Salone · Asto</h1>
            <p className="text-xs text-zinc-400">Pannello Barbiere</p>
          </div>
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Vista Cliente
          </Link>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-3 grid grid-cols-3 gap-2">
          {(['agenda', 'chiusure', 'orari'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
                tab === t
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-950 text-zinc-400 border border-zinc-800'
              }`}
            >
              {t === 'agenda' ? 'Agenda' : t === 'chiusure' ? 'Giorni Chiusi' : 'Orari'}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {tab === 'agenda' && (
          <section className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase text-zinc-400">Giorno:</label>
              <input
                type="date"
                value={dataFiltro}
                onChange={(e) => setDataFiltro(e.target.value)}
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
              />
            </div>

            {appuntamenti.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-sm text-zinc-400">
                Nessun appuntamento confermato per questa data.
              </div>
            ) : (
              <div className="space-y-3">
                {appuntamenti.map((app) => (
                  <div
                    key={app.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 font-bold text-sm">
                          {app.ora_inizio.slice(0, 5)}
                        </span>
                        <span className="text-xs text-zinc-400">{app.servizio || 'Taglio'}</span>
                      </div>
                      <p className="font-semibold text-sm">
                        {app.utenti?.nome || app.utenti?.email || 'Cliente'}
                      </p>
                      {app.utenti?.telefono && (
                        <a
                          href={`tel:${app.utenti.telefono}`}
                          className="inline-block text-xs text-emerald-400 hover:underline"
                        >
                          📞 {app.utenti.telefono}
                        </a>
                      )}
                    </div>

                    <button
                      onClick={() => annullaAppuntamento(app.id)}
                      disabled={salvataggio}
                      className="text-xs px-3 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-900/60 transition"
                    >
                      Annulla
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'chiusure' && (
          <section className="space-y-4">
            <form
              onSubmit={aggiungiGiornoChiuso}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
            >
              <h2 className="text-sm font-semibold">Blocca un giorno (ferie / chiusura straordinaria)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="date"
                  required
                  min={oggiIso || undefined}
                  value={nuovaDataChiusa}
                  onChange={(e) => setNuovaDataChiusa(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Motivo (opzionale, es. Ferie)"
                  value={motivoChiusura}
                  onChange={(e) => setMotivoChiusura(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                disabled={salvataggio}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
              >
                Aggiungi chiusura
              </button>
            </form>

            <div className="space-y-2">
              {giorniChiusi.map((g) => (
                <div
                  key={g.data}
                  className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3.5"
                >
                  <div>
                    <p className="font-medium text-sm capitalize">
                      {new Date(`${g.data}T00:00:00`).toLocaleDateString('it-IT', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    {g.motivo && <p className="text-xs text-zinc-400">{g.motivo}</p>}
                  </div>
                  <button
                    onClick={() => rimuoviGiornoChiuso(g.data)}
                    disabled={salvataggio}
                    className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    Riapri
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'orari' && (
          <section className="space-y-4">
            <div className="space-y-3">
              {orari.map((r) => (
                <div
                  key={r.giorno_settimana}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{NOMI_GIORNI[r.giorno_settimana]}</span>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={r.aperto}
                        onChange={(e) =>
                          aggiornaCampoOrario(r.giorno_settimana, 'aperto', e.target.checked)
                        }
                        className="accent-amber-500 w-4 h-4"
                      />
                      {r.aperto ? 'Aperto' : 'Chiuso'}
                    </label>
                  </div>

                  {r.aperto && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-400 block mb-1">Apertura</span>
                        <input
                          type="time"
                          value={r.ora_inizio.slice(0, 5)}
                          onChange={(e) =>
                            aggiornaCampoOrario(r.giorno_settimana, 'ora_inizio', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-400 block mb-1">Inizio pausa</span>
                        <input
                          type="time"
                          value={(r.pausa_inizio || '').slice(0, 5)}
                          onChange={(e) =>
                            aggiornaCampoOrario(
                              r.giorno_settimana,
                              'pausa_inizio',
                              e.target.value || null
                            )
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-400 block mb-1">Fine pausa</span>
                        <input
                          type="time"
                          value={(r.pausa_fine || '').slice(0, 5)}
                          onChange={(e) =>
                            aggiornaCampoOrario(
                              r.giorno_settimana,
                              'pausa_fine',
                              e.target.value || null
                            )
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-400 block mb-1">Chiusura</span>
                        <input
                          type="time"
                          value={r.ora_fine.slice(0, 5)}
                          onChange={(e) =>
                            aggiornaCampoOrario(r.giorno_settimana, 'ora_fine', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {messaggio && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm">
                {messaggio}
              </div>
            )}

            <button
              onClick={salvaOrari}
              disabled={salvataggio}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
            >
              {salvataggio ? 'Salvataggio...' : 'Salva modifiche orari'}
            </button>
          </section>
        )}
      </div>
    </main>
  )
}