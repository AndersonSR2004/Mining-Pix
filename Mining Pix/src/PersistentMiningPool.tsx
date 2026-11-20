import { useCallback, useEffect, useState } from 'react'
import { formatSandboxUnits } from './lib/depixSandbox'
import { supabase } from './lib/supabase/client'

type PoolDashboard = {
  player_hashrate: string
  network_hashrate: string
  participation: string
  latest_cycle: {
    cycle_date: string
    settled_at: string
    distributed_units: string
    participants: number
  } | null
  history: { cycle_date: string; hashrate: string; reward_units: string }[]
}

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' })

export default function PersistentMiningPool() {
  const [data, setData] = useState<PoolDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await supabase.rpc('get_my_depix_pool')
      if (result.error || !result.data) throw result.error ?? new Error('Pool indisponível')
      setData(result.data as PoolDashboard)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const cycle = data?.latest_cycle
  return (
    <section className="persistent-pool panel page-panel" aria-busy={loading}>
      <div className="panel-heading">
        <div>
          <h2>Pool de mineração · Sandbox</h2>
          <p>Distribuição diária em DePix fictício, conforme o orçamento e o poder elegível.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>
          Atualizar
        </button>
      </div>
      {loading && <p role="status">Consultando a pool…</p>}
      {error && <p className="persistent-store-error" role="alert">Não foi possível consultar a pool.</p>}
      {!loading && !error && data && (
        <>
          <div className="stats">
            <article className="stat-card">
              <span>Seu poder elegível</span>
              <h3>{number.format(Number(data.player_hashrate))} H/s</h3>
            </article>
            <article className="stat-card">
              <span>Poder elegível da rede</span>
              <h3>{number.format(Number(data.network_hashrate))} H/s</h3>
            </article>
            <article className="stat-card">
              <span>Sua participação atual</span>
              <h3>{number.format(Number(data.participation) * 100)}%</h3>
            </article>
          </div>

          {cycle ? (
            <>
              <div className="pool-footer">
                <span>Último ciclo (UTC)</span>
                <strong>{date.format(new Date(cycle.cycle_date))}</strong>
              </div>
              <div className="pool-footer">
                <span>Distribuído no ciclo</span>
                <strong>{formatSandboxUnits(cycle.distributed_units)}</strong>
              </div>
            </>
          ) : <p>Nenhum ciclo liquidado até agora.</p>}

          <h3>Suas recompensas simuladas</h3>
          {data.history.length === 0 ? (
            <p>Nenhum registro de participação até agora.</p>
          ) : data.history.map((item) => (
            <div className="history-item" key={item.cycle_date}>
              <span>
                <strong>{date.format(new Date(item.cycle_date))}</strong>
                <small>{number.format(Number(item.hashrate))} H/s no ciclo</small>
              </span>
              <strong>{formatSandboxUnits(item.reward_units)}</strong>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
