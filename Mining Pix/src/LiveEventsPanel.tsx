import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type LiveEvent = {
  id: string
  title: string
  description: string
  event_type: 'event' | 'battle_pass'
  starts_at: string
  ends_at: string
  payload: Record<string, unknown>
}

export default function LiveEventsPanel({ filter }: { filter?: 'event' | 'battle_pass' }) {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setError('')
      const now = new Date().toISOString()
      let query = supabase.from('game_events')
        .select('id,title,description,event_type,starts_at,ends_at,payload')
        .eq('status','live').lte('starts_at',now).gt('ends_at',now)
        .order('starts_at',{ascending:true})
      if (filter) query = query.eq('event_type',filter)
      const { data, error: queryError } = await query
      if (!alive) return
      if (queryError) setError(queryError.message)
      else setEvents((data ?? []) as LiveEvent[])
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [filter])

  if (loading) return <section className="panel page-panel live-events-panel"><p className="page-description">Consultando eventos ativos...</p></section>
  if (error) return <section className="panel page-panel live-events-panel"><p className="persistent-store-error">{error}</p></section>
  if (!events.length) return <section className="panel page-panel live-events-panel"><span className="eyebrow">{filter === 'battle_pass' ? 'TEMPORADAS' : 'LIVE OPS'}</span><h2>{filter === 'battle_pass' ? 'Passe de Batalha' : 'Eventos ativos'}</h2><p className="page-description">Nenhuma campanha publicada neste momento. Novos eventos aparecerão aqui quando forem ativados no Admin Center.</p></section>

  return (
    <section className="live-events-panel">
      <div className="panel-heading"><div><span className="eyebrow">LIVE OPS</span><h2>{filter === 'battle_pass' ? 'Temporadas ativas' : 'Eventos em andamento'}</h2></div><span className="status">AO VIVO</span></div>
      <div className="shop-grid">
        {events.map(item => {
          const payload = item.payload ?? {}
          const levelCount = Array.isArray(payload.levels) ? payload.levels.length : Number(payload.level_count ?? 0)
          return <article className="panel shop-card live-event-card" key={item.id}>
            <span className="eyebrow">{item.event_type === 'battle_pass' ? 'PASSE DE BATALHA' : 'EVENTO ESPECIAL'}</span>
            <h2>{item.title}</h2><p>{item.description}</p>
            {item.event_type === 'battle_pass' && <div className="pool-footer"><span>Níveis configurados</span><strong>{levelCount || 'Em configuração'}</strong></div>}
            <div className="pool-footer"><span>Encerra em</span><strong>{new Date(item.ends_at).toLocaleString('pt-BR')}</strong></div>
            {typeof payload.season === 'string' && <small className="shop-attributes">Temporada {payload.season}</small>}
            <span className="status">CAMPANHA ATIVA</span>
          </article>
        })}
      </div>
    </section>
  )
}
