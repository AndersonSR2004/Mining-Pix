import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Category = 'equipment' | 'room' | 'vip' | 'pass'
type Offer = {
  product: string
  category: Category
  name: string
  price: string
  description: string | null
  hashrate: number | null
  tier: number | null
  valid_until: string | null
}

function formatPrice(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return `${BigInt(whole).toLocaleString('pt-BR')},${fraction.replace(/0+$/, '').padEnd(2, '0')} DePix fictícios`
}

export default function PersistentEquipmentShop({ category = 'equipment', onPurchased }: { category?: Category; onPurchased?: () => Promise<void> }) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [available, setAvailable] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requests = useRef(new Map<string, string>())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [catalog, wallet] = await Promise.all([
        supabase.rpc('depix_sandbox_shop_snapshot'),
        supabase.rpc('depix_sandbox_wallet_snapshot'),
      ])
      const failure = catalog.error || wallet.error
      if (failure) throw failure
      setOffers((catalog.data as { offers: Offer[] }).offers)
      setAvailable((wallet.data as { available: string }).available)
    } catch {
      setError('Não foi possível consultar as ofertas ou o saldo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function buy(offer: Offer) {
    if (pending !== null) return
    setPending(offer.product)
    setError('')
    setNotice('')
    const signature = `${offer.product}:${offer.price}`
    const requestId = requests.current.get(signature) ?? crypto.randomUUID()
    requests.current.set(signature, requestId)
    try {
      const { data, error: failure } = await supabase.rpc('depix_sandbox_purchase', {
        p_request_id: requestId,
        p_product: offer.product,
        p_expected_price: offer.price,
      })
      if (failure) {
        setError(failure.message)
        return
      }
      requests.current.delete(signature)
      setNotice((data as { replayed: boolean }).replayed
        ? 'Compra já confirmada.'
        : `${offer.name}: compra simulada confirmada.`)
      await refresh()
      await onPurchased?.()
    } catch {
      setError('Não foi possível confirmar a compra. Tente novamente.')
    } finally {
      setPending(null)
    }
  }

  const products = offers.filter(offer => offer.category === category)
  return (
    <section className="persistent-store" aria-busy={loading}>
      <div className="persistent-store-heading">
        <div>
          <h2>Ofertas de demonstração</h2>
          {available !== null && <p>Saldo disponível: {formatPrice(available)}</p>}
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading || pending !== null}>Atualizar</button>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="persistent-store-notice" role="status">{notice}</p>}
      {loading ? <p role="status">Carregando ofertas...</p> : (
        <div className="shop-grid">
          {products.map(offer => (
            <article className="panel shop-card" key={offer.product}>
              <h3>{offer.name}</h3>
              {offer.description && <p>{offer.description}</p>}
              {offer.hashrate !== null && <p>{offer.hashrate.toLocaleString('pt-BR')} H/s base</p>}
              <strong className="shop-price">{formatPrice(offer.price)}</strong>
              {offer.valid_until && <p>Ativo até {new Date(offer.valid_until).toLocaleDateString('pt-BR')}.</p>}
              <button className="primary-button" disabled={pending !== null || Boolean(offer.valid_until) || Boolean(error && available === null)} onClick={() => void buy(offer)}>
                {pending === offer.product ? 'Processando...' : 'Comprar no sandbox'}
              </button>
            </article>
          ))}
          {products.length === 0 && !error && <p>Nenhuma oferta disponível.</p>}
        </div>
      )}
    </section>
  )
}
