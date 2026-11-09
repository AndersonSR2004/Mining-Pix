import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type PoolAllocation = {
  cycle_key: string
  amount_pc: number | string
  hashrate_snapshot: number | string
  share: number | string
  created_at: string
}
type PoolCycle = {
  id: string
  cycle_key: string
  status: 'open'
  budget_pc: number | string
  opened_at: string
  total_hashrate: number | string
  participant_count: number
}
type PoolDashboard = {
  player_hashrate: number | string
  network_hashrate: number | string
  participation: number | string
  current_cycle: PoolCycle | null
  history: PoolAllocation[]
}
const number = (value: number | string) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export default function PersistentMiningPool() {
  const [data, setData] = useState<PoolDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: result, error: requestError } = await supabase.rpc('get_pool_dashboard')
    if (requestError) setError(requestError.message)
    else setData(result as PoolDashboard)
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const cycle = data?.current_cycle ?? null
  const history = data?.history ?? []

  return (
    <section className="persistent-pool panel page-panel">
      <div className="persistent-facility-heading">
        <div>
          <span className="eyebrow">ECONOMIA SERVER-SIDE · POSTGRESQL</span>
          <h2>Mining Pool persistente</h2>
          <p>Participação calculada com equipamentos instalados e registrados na sua conta.</p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>ATUALIZAR</button>
      </div>

      {error && <div className="persistent-store-error" role="alert">{error}</div>}

      <div className="stats">
        <article className="stat-card">
          <span>SEU HASHRATE ELEGÍVEL</span>
          <h2>{loading || !data ? '—' : <>{number(data.player_hashrate)} <small>H/s</small></>}</h2>
        </article>
        <article className="stat-card">
          <span>HASHRATE GLOBAL ELEGÍVEL</span>
          <h2>{loading || !data ? '—' : <>{number(data.network_hashrate)} <small>H/s</small></>}</h2>
        </article>
        <article className="stat-card">
          <span>SUA PARTICIPAÇÃO ATUAL</span>
          <h2>{loading || !data ? '—' : <>{(Number(data.participation) * 100).toFixed(4)} <small>%</small></>}</h2>
        </article>
      </div>

      <div className="pool-footer">
        <span>Status do ciclo</span>
        <strong>{loading ? 'CONSULTANDO...' : cycle ? 'CICLO ABERTO' : 'AGUARDANDO PRÓXIMO CICLO'}</strong>
      </div>
      {cycle && (
        <>
          <div className="pool-footer"><span>Orçamento aprovado para o ciclo</span><strong>{number(cycle.budget_pc)} PC</strong></div>
          <div className="pool-footer"><span>Identificador</span><strong>{cycle.cycle_key}</strong></div>
        </>
      )}

      <div className="panel-heading"><h3>Suas últimas distribuições</h3><span className="equipment-count">{history.length} registros</span></div>
      {loading ? <p className="page-description">Consultando a Mining Pool...</p> : history.length === 0
        ? <p className="page-description">Nenhuma distribuição persistente registrada. Recompensas locais do simulador não aparecem neste histórico.</p>
        : history.map((item) => (
          <div className="history-item" key={item.cycle_key}>
            <div><strong>{item.cycle_key}</strong><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small></div>
            <strong>+{number(item.amount_pc)} PC</strong>
          </div>
        ))}

      <p className="persistent-store-footnote">
        Apenas equipamentos persistentes participam. Bots locais, orçamento do sandbox e hashrate temporário de jogos são ignorados.
        A liquidação e o crédito de PC ocorrem atomicamente no backend; este painel não simula nem credita recompensas.
      </p>
    </section>
  )
}
