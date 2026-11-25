import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return NextResponse.json({ ok: false, skipped: 'Credenziali Telegram mancanti' })
  }

  const body = await request.json()
  const { tipo, clienteNome, clienteTelefono, data, oraInizio, servizio } = body

  const dataFormattata = new Date(`${data}T00:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const testo =
    tipo === 'annullata'
      ? `❌ <b>Prenotazione Annullata</b>\n\n` +
        `👤 <b>Cliente:</b> ${clienteNome}\n` +
        `📞 <b>Telefono:</b> ${clienteTelefono || 'Non inserito'}\n` +
        `📅 <b>Giorno:</b> ${dataFormattata}\n` +
        `🕒 <b>Ora:</b> ${oraInizio}`
      : `✂️ <b>Nuova Prenotazione!</b>\n\n` +
        `👤 <b>Cliente:</b> ${clienteNome}\n` +
        `📞 <b>Telefono:</b> ${clienteTelefono}\n` +
        `💈 <b>Servizio:</b> ${servizio}\n` +
        `📅 <b>Giorno:</b> ${dataFormattata}\n` +
        `🕒 <b>Ora:</b> ${oraInizio}`

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: testo,
      parse_mode: 'HTML',
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}