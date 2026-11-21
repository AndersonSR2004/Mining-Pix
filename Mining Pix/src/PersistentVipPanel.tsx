import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'
import { formatSandboxUnits } from './lib/depixSandbox'

type VipLevel = {
  tier: number
  label: string
  threshold: string
  hash_bonus: number
  xp_bonus: number
  forge_discount: number
}

type VipStatus = {
  vip_tier: number
  qualifying_units: string
  levels: VipLevel[]
}

export default function PersistentVipPanel({ onOpenWallet }: { onOpenWallet: () => void }) {
  const [status, setStatus] = useState<VipStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data, error: failure } = await supabase.rpc('get_my_vip_status')
      if (failure) throw failure
      setStatus(data as VipStatus)
    } catch {
      setStatus(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const current = status?.levels.find(level => level.tier === status.vip_tier)
  const next = status?.levels.find(level => level.tier === status.vip_tier + 1)

  return <section className="panel page-panel persistent-vip-panel" aria-busy={loading}>
    <div className="panel-heading">
      <h2>VIP permanente</h2>
      <button className="secondary-button" onClick={() => void load()} disabled={loading}>Atualizar</button>
    </div>
    <p>Seu nível sobe automaticamente conforme o total histórico de recargas DePix liquidadas no sandbox. O nível não expira. Estornos reduzem o total elegível.</p>
    <button className="primary-button" onClick={onOpenWallet}>Ir para a carteira DePix</button>
    {loading && <p role="status">Consultando suas recargas elegíveis…</p>}
    {error && <p role="alert">Falha ao consultar o nível VIP.</p>}
    {status && current && !loading && <>
      <div className="vip-current-summary">
        <div><span>Nível atual</span><strong>{current.label}</strong></div>
        <div><span>HASH</span><strong>+{current.hash_bonus}%</strong></div>
        <div><span>XP</span><strong>+{current.xp_bonus}%</strong></div>
      </div>
      <div className="pool-footer"><span>Recargas elegíveis</span><strong>{formatSandboxUnits(status.qualifying_units)}</strong></div>
      <p>{next ? `Próximo nível: ${next.label} com ${formatSandboxUnits(next.threshold)} em recargas.` : 'Nível máximo alcançado.'}</p>
      <div className="vip-table-wrap"><table className="vip-level-table">
        <thead><tr><th>Nível</th><th>Recargas acumuladas</th><th>HASH</th><th>XP</th><th>Desconto na taxa DePix da forja</th></tr></thead>
        <tbody>{status.levels.map(level => <tr key={level.tier}>
          <th scope="row">{level.label}</th><td>{formatSandboxUnits(level.threshold)}</td><td>+{level.hash_bonus}%</td><td>+{level.xp_bonus}%</td><td>{level.forge_discount}%</td>
        </tr>)}</tbody>
      </table></div>
      <p>O desconto na forja depende da ativação desse módulo.</p>
    </>}
  </section>
}
