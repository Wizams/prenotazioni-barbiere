'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import {
  generaSlotGiornata,
  toLocalDateString,
  formatWhatsAppUrl,
  SERVIZI,
  type OrarioLavorativo,
} from '@/utils/slots'

interface AppuntamentoAdmin {
  id: string
  data: string
  ora_inizio: string
  ora_fine: string
  servizio: string | null
  stato: string
  cliente_manuale_nome: string | null
  cliente_manuale_telefono: string | null
  utenti: {
    nome: string | null
    email: string
    telefono: string | null
  } | null
}

interface GiornoChiuso {
  data_chiusura: string
  motivo?: string | null
}

const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

export default function AdminPage() {
  const [supabase] = useState(() => createClient())
  const [adminUserId, setAdminUserId] = useState<string>('')
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'agenda' | 'chiusure' | 'orari'>('agenda')

  const [oggiIso, setOggiIso] = useState<string>('')
  const [giorniRapidi, setGiorniRapidi] = useState<{ iso: string; label: string; sub: string }[]>([])
  const [dataFiltro, setDataFiltro] = useState<string>('')
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoAdmin[]>([])
  const [giorniChiusi, setGiorniChiusi] = useState<GiornoChiuso[]>([])
  const [orari, setOrari] = useState<OrarioLavorativo[]>([])

  const [slotManuale, setSlotManuale] = useState<{ inizio: string; fine: string } | null>(null)
  const [nomeManuale, setNomeManuale] = useState('')
  const [telManuale, setTelManuale] = useState('')
  const [servizioManuale, setServizioManuale] = useState(SERVIZI[0])

  const [nuovaDataChiusa, setNuovaDataChiusa] = useState('')
  const [motivoChiusura, setMotivoChiusura] = useState('')
  const [salvataggio, setSalvataggio] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  useEffect(() => {
    const oggiDate = new Date()
    const oggi = toLocalDateString(oggiDate)
    setOggiIso(oggi)
    setDataFiltro((prev) => prev || oggi)

    const lista: { iso: string; label: string; sub: string }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(oggiDate)
      d.setDate(oggiDate.getDate() + i)
      lista.push({
        iso: toLocalDateString(d),
        label:
          i === 0
            ? 'Oggi'
            : i === 1
            ? 'Domani'
            : d.toLocaleDateString('it-IT', { weekday: 'short' }),
        sub: d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      })
    }
    setGiorniRapidi(lista)
  }, [])

  const verificaAccesso = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAutorizzato(false)
      return
    }
    setAdminUserId(user.id)

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
      .select(
        'id, data, ora_inizio, ora_fine, servizio, stato, cliente_manuale_nome, cliente_manuale_telefono, utenti(nome, email, telefono)'
      )
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
        .gte('data_chiusura', daData)
        .order('data_chiusura', { ascending: true }),
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

  const timelineGiorno = useMemo(() => {
    if (!dataFiltro || orari.length === 0) return []
    const d = new Date(`${dataFiltro}T00:00:00`)
    const regola = orari.find((o) => o.giorno_settimana === d.getDay())
    const chiusoStraordinario = giorniChiusi.some((c) => c.data_chiusura === dataFiltro)
    if (!regola || !regola.aperto || chiusoStraordinario) return []

    const tuttiSlot = generaSlotGiornata(regola)
    return tuttiSlot.map((s) => {
      const app = appuntamenti.find((a) => a.ora_inizio.slice(0, 5) === s.inizio)
      return { ...s, appuntamento: app || null }
    })
  }, [dataFiltro, orari, giorniChiusi, appuntamenti])

  const riepilogoGiorno = useMemo(() => {
    const liberi = timelineGiorno.filter((s) => !s.appuntamento).length
    return {
      prenotati: appuntamenti.length,
      liberi,
    }
  }, [appuntamenti, timelineGiorno])

  const creaPrenotazioneManuale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slotManuale || !adminUserId || !nomeManuale.trim()) return

    setSalvataggio(true)
    await supabase.from('appuntamenti').insert({
      utente_id: adminUserId,
      data: dataFiltro,
      ora_inizio: slotManuale.inizio,
      ora_fine: slotManuale.fine,
      servizio: servizioManuale,
      stato: 'confermato',
      cliente_manuale_nome: nomeManuale.trim(),
      cliente_manuale_telefono: telManuale.trim() || null,
    })

    setSlotManuale(null)
    setNomeManuale('')
    setTelManuale('')
    await caricaAgenda(dataFiltro)
    setSalvataggio(false)
  }

  const annullaAppuntamento = async (app: AppuntamentoAdmin) => {
    setSalvataggio(true)
    const { error } = await supabase
      .from('appuntamenti')
      .update({ stato: 'annullato' })
      .eq('id', app.id)

    if (!error) {
      const nome = app.cliente_manuale_nome || app.utenti?.nome || 'Cliente'
      const tel = app.cliente_manuale_telefono || app.utenti?.telefono || ''
      await fetch('/api/notifica-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'annullata',
          clienteNome: `${nome} (annullato da Admin)`,
          clienteTelefono: tel,
          data: app.data,
          oraInizio: app.ora_inizio.slice(0, 5),
        }),
      })
      await caricaAgenda(dataFiltro)
    }
    setSalvataggio(false)
  }

  const aggiungiGiornoChiuso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuovaDataChiusa) return
    setSalvataggio(true)
    setMessaggio(null)

    const { error } = await supabase.from('giorni_chiusi').upsert({
      data_chiusura: nuovaDataChiusa,
      motivo: motivoChiusura.trim() || null,
    })

    if (error) {
      setMessaggio(`Errore salvataggio chiusura: ${error.message}`)
      setSalvataggio(false)
      return
    }

    setNuovaDataChiusa('')
    setMotivoChiusura('')
    setMessaggio('Giorno chiuso salvato.')
    await caricaConfigurazione(oggiIso)
    setSalvataggio(false)
  }

  const rimuoviGiornoChiuso = async (dataIso: string) => {
    setSalvataggio(true)
    setMessaggio(null)

    const { error } = await supabase.from('giorni_chiusi').delete().eq('data_chiusura', dataIso)
    if (error) {
      setMessaggio(`Errore riapertura giorno: ${error.message}`)
      setSalvataggio(false)
      return
    }

    setMessaggio('Giorno riaperto.')
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
      const { error } = await supabase
        .from('orari_lavorativi')
        .update({
          aperto: r.aperto,
          ora_inizio: r.ora_inizio,
          ora_fine: r.ora_fine,
          pausa_inizio: r.pausa_inizio || null,
          pausa_fine: r.pausa_fine || null,
          durata_slot_minuti: Number(r.durata_slot_minuti) || 35,
        })
        .eq('giorno_settimana', r.giorno_settimana)

      if (error) {
        setMessaggio(`Errore salvataggio giorno ${NOMI_GIORNI[r.giorno_settimana]}: ${error.message}`)
        setSalvataggio(false)
        return
      }
    }

    await caricaConfigurazione(oggiIso)
    setMessaggio('Orari settimanali salvati nel database.')
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
            ← Vista Cliente
          </Link>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-3 grid grid-cols-3 gap-2">
          {(['agenda', 'chiusure', 'orari'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setMessaggio(null)
                setTab(t)
              }}
              className={`py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
                tab === t
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-950 text-zinc-400 border border-zinc-800'
              }`}
            >
              {t === 'agenda' ? 'Agenda' : t === 'chiusure' ? 'Ferie / Chiusure' : 'Orari'}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {tab === 'agenda' && (
          <section className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {giorniRapidi.map((g) => {
                const attivo = dataFiltro === g.iso
                return (
                  <button
                    key={g.iso}
                    onClick={() => setDataFiltro(g.iso)}
                    className={`min-w-[72px] py-2 px-2.5 rounded-xl border text-center shrink-0 transition ${
                      attivo
                        ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-[10px] uppercase">{g.label}</div>
                    <div className="text-xs font-bold mt-0.5">{g.sub}</div>
                  </button>
                )
              })}
              <input
                type="date"
                value={dataFiltro}
                onChange={(e) => setDataFiltro(e.target.value)}
                aria-label="Scegli un'altra data"
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 shrink-0"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
                <p className="text-xs text-zinc-400">Clienti prenotati</p>
                <p className="text-xl font-bold text-white mt-0.5">{riepilogoGiorno.prenotati}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
                <p className="text-xs text-zinc-400">Slot ancora liberi</p>
                <p className="text-xl font-bold text-emerald-400 mt-0.5">{riepilogoGiorno.liberi}</p>
              </div>
            </div>

            {timelineGiorno.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-1">
                <p className="font-semibold text-sm text-zinc-200">Salone chiuso in questa data</p>
                <p className="text-xs text-zinc-400">
                  Seleziona un altro giorno oppure riapri la data dalla scheda Ferie / Chiusure.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {timelineGiorno.map((slot) => {
                  const app = slot.appuntamento
                  if (!app) {
                    return (
                      <div
                        key={slot.inizio}
                        className="flex items-center justify-between bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-zinc-500">{slot.inizio}</span>
                          <span className="text-xs text-zinc-500">Slot libero</span>
                        </div>
                        <button
                          onClick={() => setSlotManuale({ inizio: slot.inizio, fine: slot.fine })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 font-medium transition"
                        >
                          + Inserisci cliente
                        </button>
                      </div>
                    )
                  }

                  const nome = app.cliente_manuale_nome || app.utenti?.nome || app.utenti?.email || 'Cliente'
                  const tel = app.cliente_manuale_telefono || app.utenti?.telefono || ''

                  return (
                    <div
                      key={slot.inizio}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 font-bold text-sm">
                            {slot.inizio}
                          </span>
                          <span className="text-xs text-zinc-400">{app.servizio || 'Taglio'}</span>
                          {app.cliente_manuale_nome && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              Manuale
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-sm text-white">{nome}</p>
                        {tel && <p className="text-xs text-zinc-400">{tel}</p>}
                      </div>

                      <div className="flex items-center gap-2">
                        {tel && (
                          <>
                            <a
                              href={`tel:${tel}`}
                              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                            >
                              Chiama
                            </a>
                            <a
                              href={formatWhatsAppUrl(
                                tel,
                                `Ciao ${nome}, ti ricordo l'appuntamento da Asto alle ${slot.inizio}.`
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-800/60 transition"
                            >
                              WhatsApp
                            </a>
                          </>
                        )}
                        <button
                          onClick={() => annullaAppuntamento(app)}
                          disabled={salvataggio}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-900/60 transition"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'chiusure' && (
          <section className="space-y-4">
            <div className="px-1">
              <h2 className="text-sm font-semibold text-white">Blocca giorni di ferie o festivi</h2>
              <p className="text-xs text-zinc-400">
                I giorni aggiunti qui diventano subito non prenotabili sul calendario dei clienti.
              </p>
            </div>

            <form
              onSubmit={aggiungiGiornoChiuso}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
            >
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
                  placeholder="Motivo (es. Ferie estive)"
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
                Chiudi questa data
              </button>
            </form>

            {messaggio && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs">
                {messaggio}
              </div>
            )}

            <div className="space-y-2">
              {giorniChiusi.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">
                  Nessuna chiusura straordinaria programmata.
                </p>
              ) : (
                giorniChiusi.map((g) => (
                  <div
                    key={g.data_chiusura}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3.5"
                  >
                    <div>
                      <p className="font-medium text-sm capitalize">
                        {new Date(`${g.data_chiusura}T00:00:00`).toLocaleDateString('it-IT', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      {g.motivo && <p className="text-xs text-zinc-400">{g.motivo}</p>}
                    </div>
                    <button
                      onClick={() => rimuoviGiornoChiuso(g.data_chiusura)}
                      disabled={salvataggio}
                      className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    >
                      Riapri
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {tab === 'orari' && (
          <section className="space-y-4">
            <div className="px-1">
              <h2 className="text-sm font-semibold text-white">Orari settimanali del salone</h2>
              <p className="text-xs text-zinc-400">
                Modifica apertura, pausa pranzo o chiusura: gli slot da 35 minuti si ricalcolano in automatico.
              </p>
            </div>

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
              {salvataggio ? 'Salvataggio...' : 'Salva orari settimanali'}
            </button>
          </section>
        )}
      </div>

      {slotManuale && (
        <div className="fixed inset-0 z-30 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={creaPrenotazioneManuale}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Prenotazione manuale · {slotManuale.inizio}
              </h3>
              <button
                type="button"
                onClick={() => setSlotManuale(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Chiudi
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Nome cliente
              </label>
              <input
                type="text"
                required
                placeholder="Es. Luca Bianchi"
                value={nomeManuale}
                onChange={(e) => setNomeManuale(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Telefono (opzionale)
              </label>
              <input
                type="tel"
                placeholder="Es. 333 9876543"
                value={telManuale}
                onChange={(e) => setTelManuale(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Servizio</label>
              <select
                value={servizioManuale}
                onChange={(e) => setServizioManuale(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
              >
                {SERVIZI.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={salvataggio}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
            >
              {salvataggio ? 'Salvataggio...' : 'Blocca orario'}
            </button>
          </form>
        </div>
      )}
    </main>
  )
}