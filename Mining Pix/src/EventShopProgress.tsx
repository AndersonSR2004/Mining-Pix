import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Progress = { points: string; exact_points?: string }
function points(value: string) {
  const [whole, fraction] = value.split('.')
  const formatted = BigInt(whole).toLocaleString('pt-BR')
  return fraction ? `${formatted},${fraction}` : formatted
}

export default function EventShopProgress({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Progress | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    async function fetchScores() {
      setError(false)
      setData(null)
      try {
        const { data: response, error: failure } = await supabase.rpc('get_event_shop_progress', { p_event: eventId })
        if (!alive) return
        if (failure) setError(true)
        else setData(response as Progress)
      } catch { if (alive) setError(true) }
    }
    void fetchScores()
    return () => { alive = false }
  }, [eventId])

  if (error) return <p role="alert">Pontuação do evento indisponível.</p>
  if (!data) return <p role="status">Consultando pontuação…</p>
  return <section>
    <p>Seus pontos na loja: <strong>{points(data.exact_points ?? data.points)}</strong></p>
    <small>1.000 pontos por DePix fictício em equipamentos, racks e salas.</small>

  </section>
}
