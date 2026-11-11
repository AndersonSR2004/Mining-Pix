import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'

type CatalogItem = {
  sku: string
  name: string
  description: string
  equipment_type: string
  hashrate: number
  price_pc: number
  tier: number | null
  overclock_percent: number
  blessing_min_percent: number | null
  blessing_max_percent: number | null
}

type PurchaseResult = {
  success: boolean
  replayed: boolean
  sku: string
  price_pc: number
  balance_after: number
  blessing_percent: number
}

function formatPc(value: number | string) {
  return Number(value).toLocaleString('pt-BR')
}

export default function PersistentEquipmentShop() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingSku, setPendingSku] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const idempotencyKeys = useRef<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [catalogResult, walletResult] = await Promise.all([
      supabase.from('equipment_catalog')
        .select('sku,name,description,equipment_type,hashrate,price_pc,tier,overclock_percent,blessing_min_percent,blessing_max_percent')
        .eq('active', true)
        .order('display_order', { ascending: true }),
      supabase.from('wallets').select('balance').maybeSingle(),
    ])

    const failure = catalogResult.error || walletResult.error
    if (failure) {
      setError(failure.message)
    } else {
      setCatalog((catalogResult.data ?? []) as CatalogItem[])
      setBalance(walletResult.data ? Number(walletResult.data.balance) : 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function buy(item: CatalogItem) {
    setPendingSku(item.sku)
    setError('')
    setNotice('')
    const idempotencyKey = idempotencyKeys.current[item.sku] ?? crypto.randomUUID()
    idempotencyKeys.current[item.sku] = idempotencyKey

    const { data, error: purchaseError } = await supabase.rpc('purchase_equipment', {
      p_sku: item.sku,
      p_idempotency_key: idempotencyKey,
    })

    if (purchaseError) {
      setError(purchaseError.message.includes('Saldo insuficiente')
        ? 'Saldo persistente insuficiente para esta compra.'
        : purchaseError.message)
      setPendingSku(null)
      return
    }

    const result = data as PurchaseResult
    delete idempotencyKeys.current[item.sku]
    setNotice(result.replayed
      ? 'Compra já processada anteriormente. Nenhum novo débito foi realizado.'
      : `${item.name} adquirido! O equipamento foi adicionado ao seu inventário persistente.`)
    await refresh()
    setPendingSku(null)
  }

  return (
    <section className="persistent-store">
      <div className="persistent-store-heading">
        <div>
          <span className="eyebrow">ECONOMIA CONECTADA · PROGRESSÃO FREE</span>
          <h2>Loja de equipamentos</h2>
          <p>Adquira equipamentos disponíveis no catálogo atual. Cada unidade recebe sua própria Benção de Potência no momento da compra.</p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading || pendingSku !== null}>
          ATUALIZAR
        </button>
      </div>

      <article className="wallet-summary persistent-store-balance">
        <span>SALDO DA CARTEIRA PERSISTENTE</span>
        <strong>{balance === null ? '—' : `${formatPc(balance)} PC`}</strong>
        <small>Compras debitam a carteira persistente por operação atômica no servidor.</small>
      </article>

      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      {notice && <div className="persistent-store-notice" role="status">{notice}</div>}

      {loading ? (
        <p className="page-description">Carregando catálogo...</p>
      ) : catalog.length === 0 ? (
        <p className="page-description">Nenhum equipamento disponível no catálogo.</p>
      ) : (
        <div className="shop-grid">
          {catalog.map((item) => (
            <article className="panel shop-card" key={item.sku}>
              <div className="machine-icon large">▦</div>
              <span className="eyebrow">{item.tier === 0 ? 'INICIAL · TIER 0' : item.tier ? `TIER ${item.tier}` : 'CATÁLOGO OFICIAL'}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className="shop-hash">{Number(item.hashrate).toLocaleString('pt-BR')} H/s base</div>
              <small className="shop-attributes">Overclock: +{Number(item.overclock_percent).toFixed(0)}% · Benção sorteada: {item.blessing_min_percent === null ? 'não definida' : `0–${Number(item.blessing_max_percent).toFixed(0)}%`}</small>
              <strong className="shop-price">{formatPc(item.price_pc)} PC</strong>
              <button
                className="primary-button"
                onClick={() => void buy(item)}
                disabled={pendingSku !== null || balance === null || balance < Number(item.price_pc)}
              >
                {pendingSku === item.sku ? 'PROCESSANDO...' : 'COMPRAR COM CARTEIRA'}
              </button>
            </article>
          ))}
        </div>
      )}

      <p className="persistent-store-footnote">
        A Benção é sorteada uma única vez no backend na compra e fica vinculada à unidade. O HASH efetivo é calculado pelo servidor. O inventário e a instalação são gerenciados na tela Salas e equipamentos.
      </p>
    </section>
  )
}
