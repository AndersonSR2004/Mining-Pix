import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Progress = { points: string; ranking: { name: string; points: string; position: number; is_you: boolean }[] }
const points = (value: string) => BigInt(value).toLocaleString('pt-BR')

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

  if (error) return <p role="alert">Ranking do evento indisponível.</p>
  if (!data) return <p role="status">Consultando pontuação…</p>
  return <section>
    <p>Seus pontos na loja: <strong>{points(data.points)}</strong></p>
    <small>1.000 pontos por DePix fictício em equipamentos, racks e salas.</small>
    {data.ranking.length ? <table>
      <thead><tr><th>Posição</th><th>Jogador</th><th>Pontos</th></tr></thead>
      <tbody>{data.ranking.map((entry, index) => <tr key={index}>
        <td>{entry.position}</td><td>{entry.name}{entry.is_you ? ' (você)' : ''}</td><td>{points(entry.points)}</td>
      </tr>)}</tbody>
    </table> : <p>Nenhum jogador pontuou.</p>}
  </section>
}
