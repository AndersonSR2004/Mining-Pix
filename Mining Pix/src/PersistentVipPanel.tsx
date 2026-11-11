import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type VipStatus = {
  vip_tier: number
  qualifying_topups_brl_cents: number
  window_started_at: string
  window_ends_at: string
  hash_boost_percent: number
  mission_xp_multiplier: number
  next_tier_threshold_brl_cents: number | null
  recalculated_at: string
}
const levels = [
  { tier: 1, name: 'VIP I', threshold: 3000, xp: '2x', fee: '50%', recharge: '1/dia', hash: '10%', energy: '—' },
  { tier: 2, name: 'VIP II', threshold: 4000, xp: '2,5x', fee: '60%', recharge: '1/dia', hash: '15%', energy: '—' },
  { tier: 3, name: 'VIP III', threshold: 4500, xp: '3x', fee: '70%', recharge: '1/dia', hash: '20%', energy: '—' },
  { tier: 4, name: 'VIP IV', threshold: 5000, xp: '4x', fee: '75%', recharge: '1/dia', hash: '25%', energy: '—' },
  { tier: 5, name: 'VIP V', threshold: 6000, xp: '5x', fee: '80%', recharge: '1/dia', hash: '30%', energy: 'Permanente enquanto ativo' },
]
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function PersistentVipPanel() {
  const [status,setStatus] = useState<VipStatus | null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('get_my_vip_status')
    if (rpcError) { setError(rpcError.message); setStatus(null) }
    else setStatus(data as VipStatus)
    setLoading(false)
  },[])
  useEffect(() => { void load() },[load])

  const currentName = status?.vip_tier ? levels[status.vip_tier-1]?.name ?? 'VIP' : 'FREE'
  const progress = status?.next_tier_threshold_brl_cents
    ? Math.min(100,status.qualifying_topups_brl_cents/status.next_tier_threshold_brl_cents*100)
    : 100

  return (
    <section className="panel page-panel persistent-vip-panel">
      <div className="panel-heading"><div><span className="eyebrow">QUALIFICAÇÃO AUTOMÁTICA · 30 DIAS</span><h2>Seu nível VIP</h2></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>ATUALIZAR</button></div>
      {loading && <p className="page-description">Recalculando a janela móvel de recargas...</p>}
      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      {status && !loading && <>
        <div className="vip-current-summary">
          <div><span>NÍVEL ATUAL</span><strong>{currentName}</strong></div>
          <div><span>BOOST HASH ATIVO</span><strong>+{status.hash_boost_percent}%</strong></div>
          <div><span>MULTIPLICADOR XP DE MISSÕES</span><strong>{status.mission_xp_multiplier}x</strong></div>
        </div>
        <div className="pool-footer"><span>Recargas confirmadas na janela</span><strong>{money(status.qualifying_topups_brl_cents)}</strong></div>
        <div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}} /></div>
        <p className="page-description">Janela: últimos 30 dias móveis. Apenas pagamentos confirmados contam; reembolsos e chargebacks são excluídos na próxima atualização.</p>
        <p className="page-description">Próximo nível: {status.next_tier_threshold_brl_cents === null ? 'VIP V máximo' : money(status.next_tier_threshold_brl_cents)}. Recalculado em {new Date(status.recalculated_at).toLocaleString('pt-BR')}.</p>
      </>}
      <div className="admin-empty">A qualificação está conectada ao ledger privado de pagamentos confirmados. O provedor de pagamento ainda não foi conectado; por isso, nenhuma recarga pode ser registrada ou confirmada nesta versão.</div>
      <div className="panel-heading"><h3>Tabela de benefícios</h3><span className="equipment-count">NÍVEIS OFICIAIS</span></div>
      <div className="vip-table-wrap"><table className="vip-level-table">
        <thead><tr><th>Nível</th><th>Recargas elegíveis</th><th>XP de missões</th><th>Desconto tarifa própria*</th><th>Recarga grátis</th><th>Boost HASH</th><th>Energia</th></tr></thead>
        <tbody>{levels.map(level => <tr key={level.tier}><td><strong>{level.name}</strong></td><td>{money(level.threshold)}</td><td>{level.xp}</td><td>{level.fee}</td><td>{level.recharge}</td><td>{level.hash}</td><td>{level.energy}</td></tr>)}</tbody>
      </table></div>
      <p className="admin-empty">*Desconto limitado a eventual tarifa própria da plataforma. Boost HASH redistribui participação já financiada da Pool; não cria MC ou orçamento. Salas permanecem permanentes e independentes do VIP. Benefícios de saque e energia não estão ativos enquanto esses módulos não forem homologados.</p>
    </section>
  )
}
