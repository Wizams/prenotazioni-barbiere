export interface OrarioLavorativo {
  giorno_settimana: number
  aperto: boolean
  ora_inizio: string
  ora_fine: string
  pausa_inizio: string | null
  pausa_fine: string | null
  durata_slot_minuti: number
}

export interface SlotOrario {
  inizio: string
  fine: string
}

export const SERVIZI = ['Taglio', 'Taglio + Barba', 'Barba']

function toMinuti(ora: string): number {
  const [hh, mm] = ora.slice(0, 5).split(':').map(Number)
  return hh * 60 + mm
}

function toOraString(minuti: number): string {
  const hh = String(Math.floor(minuti / 60)).padStart(2, '0')
  const mm = String(minuti % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function generaSlotGiornata(orario: OrarioLavorativo): SlotOrario[] {
  if (!orario.aperto) return []

  const inizio = toMinuti(orario.ora_inizio)
  const fine = toMinuti(orario.ora_fine)
  const durata = orario.durata_slot_minuti || 45

  const pausaInizio = orario.pausa_inizio ? toMinuti(orario.pausa_inizio) : null
  const pausaFine = orario.pausa_fine ? toMinuti(orario.pausa_fine) : null

  const slots: SlotOrario[] = []
  let corrente = inizio

  while (corrente + durata <= fine) {
    if (pausaInizio !== null && pausaFine !== null) {
      if (corrente < pausaInizio && corrente + durata > pausaInizio) {
        corrente = pausaFine
        continue
      }
      if (corrente >= pausaInizio && corrente < pausaFine) {
        corrente = pausaFine
        continue
      }
    }

    slots.push({
      inizio: toOraString(corrente),
      fine: toOraString(corrente + durata),
    })

    corrente += durata
  }

  return slots
}

export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatWhatsAppUrl(telefono: string, testo?: string): string {
  const cifre = telefono.replace(/\D/g, '')
  const numero = cifre.startsWith('39') ? cifre : `39${cifre}`
  const query = testo ? `?text=${encodeURIComponent(testo)}` : ''
  return `https://wa.me/${numero}${query}`
}