import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { formatSandboxUnits } from '../lib/depixSandbox'

type Overview = {
  captured_at: string
  players: number
  active_players_7d: number
  sandbox_payers: number
  eligible_topups: string
  vip_counts: { label: string; count: number }[]
  circulation: string
  withdrawal_queue: string
  network_hashrate: string
  top_decile_share: number | null
  live_events: number
  pool_distributed: string
  pool_budget_today: string | null
}

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export default function GameMasterOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [machineHash, setMachineHash] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: response, error: failure } = await supabase.rpc('game_master_overview')
        if (failure || !response) throw failure
        if (active) setData(response as Overview)
      } catch {
        if (active) setError(true)
      }
    }
    void load()
    return () => { active = false }
  }, [revision])

  const hash = Number(machineHash)
  const units = Number(quantity)
  const cost = Number(price)
  const network = Number(data?.network_hashrate)
  const added = hash * units
  const valid = hash > 0 && cost > 0 && Number.isSafeInteger(units) && units > 0
    && Number.isFinite(added) && Number.isFinite(network + added) && Number.isFinite(hash / cost)

  return <section className="admin-panel" aria-busy={!data && !error}>
    <div className="admin-panel-heading"><h2>Dashboard Executivo</h2>
      <button type="button" className="admin-secondary" onClick={() => {
        setData(null)
        setError(false)
        setRevision(previous => previous + 1)
      }}>Atualizar indicadores</button>
    </div>
    {error && <p role="alert">Não foi possível consultar os indicadores executivos.</p>}
    {!data && !error && <p role="status">Consultando indicadores…</p>}
    {data && <>
      <h3>Atividade e mineração no DEV</h3>
      <div className="admin-stat-grid">
        <article className="admin-stat"><span>Jogadores cadastrados</span><strong>{decimal.format(data.players)}</strong></article>
        <article className="admin-stat"><span>Jogadores com atividade em 7 dias</span><strong>{decimal.format(data.active_players_7d)}</strong></article>
        <article className="admin-stat"><span>HASH elegível</span><strong>{decimal.format(network)} H/s</strong></article>
        <article className="admin-stat"><span>Participação dos 10% com maior HASH</span><strong>{data.top_decile_share === null ? 'Indisponível' : `${decimal.format(data.top_decile_share)}%`}</strong></article>
        <article className="admin-stat"><span>Eventos e campanhas ativos</span><strong>{decimal.format(data.live_events)}</strong></article>
      </div>
      <h3>Economia DePix simulada</h3>
      <div className="admin-stat-grid">
        <article className="admin-stat"><span>Jogadores com recarga líquida elegível</span><strong>{decimal.format(data.sandbox_payers)}</strong></article>
        <article className="admin-stat"><span>Recargas líquidas elegíveis</span><strong>{formatSandboxUnits(data.eligible_topups)}</strong></article>
        <article className="admin-stat"><span>Em circulação</span><strong>{formatSandboxUnits(data.circulation)}</strong></article>
        <article className="admin-stat"><span>Saques simulados em fila</span><strong>{formatSandboxUnits(data.withdrawal_queue)}</strong></article>
        <article className="admin-stat"><span>Distribuído pela pool</span><strong>{formatSandboxUnits(data.pool_distributed)}</strong></article>
        <article className="admin-stat"><span>Orçamento aprovado para hoje (UTC)</span><strong>{data.pool_budget_today === null ? 'Sem aprovação' : formatSandboxUnits(data.pool_budget_today)}</strong></article>
      </div>
      <h3>Jogadores por categoria VIP</h3>
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th scope="col">Categoria</th><th scope="col">Jogadores</th></tr></thead>
        <tbody>{data.vip_counts.map(tier => <tr key={tier.label}><th scope="row">{tier.label}</th><td>{decimal.format(tier.count)}</td></tr>)}</tbody>
      </table></div>
      <p>Receita real, reserva e cobertura de saques reais indisponíveis neste painel DEV.</p>
      <h3>Simulador de lançamento de máquina</h3>
      <p>Projeção sobre o HASH elegível atual, com orçamento da pool fixo e sem bônus adicionais de VIP, rack ou forja.</p>
      <div className="admin-directory-search">
        <label>HASH base (H/s)<input type="number" min="0" step="any" value={machineHash} onChange={e => setMachineHash(e.target.value)} /></label>
        <label>Preço (DePix)<input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} /></label>
        <label>Máquinas instaladas<input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      </div>
      {valid && <p role="status">{decimal.format(hash / cost)} H/s por DePix · +{decimal.format(added)} H/s na rede · {decimal.format(100 * (added / (network + added)))}% do HASH projetado viria dessas máquinas.</p>}
      <p className="admin-generated">Dados de {new Date(data.captured_at).toLocaleString('pt-BR')} · Supabase DEV</p>
    </>}
  </section>
}
