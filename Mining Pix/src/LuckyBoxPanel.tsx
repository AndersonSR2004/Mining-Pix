import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Cosmetic = { id: string; name: string; description: string; rarity: 'comum' | 'incomum' | 'raro' }
type InventoryRow = { id: string; acquired_at: string; cosmetic: Cosmetic | null }
type ClaimResult = { claimed: boolean; already_claimed: boolean; claim_date: string; reward: Cosmetic }
const rarityLabel: Record<Cosmetic['rarity'], string> = { comum: 'COMUM', incomum: 'INCOMUM', raro: 'RARO' }

export default function LuckyBoxPanel({ userId }: { userId: string }) {
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [claimedToday, setClaimedToday] = useState(false)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastReward, setLastReward] = useState<Cosmetic | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [claims, items] = await Promise.all([
      supabase.from('daily_free_box_claims').select('claim_date').eq('user_id', userId).eq('claim_date', today).maybeSingle(),
      supabase.from('player_cosmetic_inventory').select('id, acquired_at, cosmetic:cosmetic_catalog(id, name, description, rarity)').eq('user_id', userId).order('acquired_at', { ascending: false }).limit(30),
    ])
    if (claims.error) setError('Não foi possível consultar a caixa diária.')
    else setClaimedToday(Boolean(claims.data))
    if (items.error) setError('Não foi possível carregar sua coleção cosmética.')
    else setInventory((items.data ?? []) as unknown as InventoryRow[])
    setLoading(false)
  }, [userId])

  useEffect(() => { void load() }, [load])

  async function claim() {
    if (claiming || claimedToday) return
    setClaiming(true); setError(''); setMessage('')
    const { data, error: rpcError } = await supabase.rpc('claim_daily_free_box')
    if (rpcError) {
      setError('Não foi possível abrir a caixa agora. Tente novamente mais tarde.')
      setClaiming(false)
      return
    }
    const result = data as ClaimResult
    setLastReward(result.reward)
    setClaimedToday(true)
    setMessage(result.already_claimed ? 'A caixa de hoje já havia sido resgatada.' : 'Recompensa adicionada à sua coleção!')
    await load()
    setClaiming(false)
  }

  return (
    <section className="page-content">
      <span className="eyebrow">RECOMPENSA DE PROGRESSÃO</span>
      <h1>Lucky Box</h1>
      <p className="page-description">Uma caixa gratuita por dia. Receba um item cosmético de coleção, sem custo em PIX COIN, sem MINING COIN e sem efeitos sobre o HASH.</p>
      <article className="panel page-panel">
        <div className="panel-heading"><div><span className="eyebrow">CAIXA DIÁRIA GRATUITA</span><h2>Surpresa cosmética</h2></div><span className="status">100% GRATUITA</span></div>
        <div className="pool-footer"><span>Frequência</span><strong>1 resgate por dia UTC</strong></div>
        <div className="pool-footer"><span>Prêmios</span><strong>Somente itens cosméticos</strong></div>
        <div className="pool-footer"><span>Probabilidades</span><strong>Publicadas e fixas</strong></div>
        <div className="pool-footer"><span>Impacto econômico</span><strong>Sem PC, MC ou HASH</strong></div>
        <button className="primary-button" disabled={loading || claiming || claimedToday} onClick={() => void claim()}>
          {loading ? 'CARREGANDO...' : claiming ? 'ABRINDO...' : claimedToday ? 'RESGATADA HOJE' : 'ABRIR CAIXA GRATUITA'}
        </button>
        {message && <p className="page-description" role="status">{message}</p>}
        {error && <p className="page-description" role="alert">{error}</p>}
        {lastReward && <div className="panel shop-card" style={{ marginTop: 16 }}><span className="eyebrow">SUA RECOMPENSA · {rarityLabel[lastReward.rarity]}</span><h2>{lastReward.name}</h2><p>{lastReward.description}</p></div>}
      </article>
      <article className="panel page-panel">
        <div className="panel-heading"><h2>Probabilidades públicas</h2><span className="equipment-count">VERSÃO 1</span></div>
        <div className="pool-footer"><span>Cosmético comum</span><strong>70%</strong></div>
        <div className="pool-footer"><span>Cosmético incomum</span><strong>25%</strong></div>
        <div className="pool-footer"><span>Cosmético raro</span><strong>5%</strong></div>
        <p className="page-description">Cada abertura é processada no servidor. O limite diário é aplicado por conta e pela data UTC. Repetir a solicitação não concede uma segunda recompensa.</p>
      </article>
      <article className="panel page-panel">
        <div className="panel-heading"><h2>Sua coleção</h2><span className="equipment-count">{inventory.length} ITENS RECENTES</span></div>
        {inventory.length === 0 ? <p className="page-description">Sua coleção ainda está vazia. Resgate a caixa diária para começar.</p> : <div className="shop-grid">{inventory.map(item => item.cosmetic && <article className="panel shop-card" key={item.id}><span className="eyebrow">{rarityLabel[item.cosmetic.rarity]}</span><h2>{item.cosmetic.name}</h2><p>{item.cosmetic.description}</p><small>{new Date(item.acquired_at).toLocaleDateString('pt-BR')}</small></article>)}</div>}
      </article>
    </section>
  )
}
