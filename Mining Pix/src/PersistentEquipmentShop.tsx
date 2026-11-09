import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'

type CatalogItem = {
  sku: string
  name: string
  description: string
  equipment_type: string
  hashrate: number
  price_pc: number
}

type OwnedEquipment = {
  id: string
  catalog_sku: string
  purchase_price_pc: number
  acquired_at: string
  equipment_catalog: {
    name: string
    equipment_type: string
    hashrate: number
  } | null
}

type PurchaseResult = {
  success: boolean
  replayed: boolean
  sku: string
  price_pc: number
  balance_after: number
}

function formatPc(value: number | string) {
  return Number(value).toLocaleString('pt-BR')
}

export default function PersistentEquipmentShop() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [owned, setOwned] = useState<OwnedEquipment[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingSku, setPendingSku] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const idempotencyKeys = useRef<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [catalogResult, equipmentResult, walletResult] = await Promise.all([
      supabase.from('equipment_catalog')
        .select('sku,name,description,equipment_type,hashrate,price_pc')
        .eq('active', true)
        .order('display_order', { ascending: true }),
      supabase.from('player_equipment')
        .select('id,catalog_sku,purchase_price_pc,acquired_at,status,room_id,equipment_catalog(name,equipment_type,hashrate)')
        .order('acquired_at', { ascending: false }),
      supabase.from('wallets').select('balance').maybeSingle(),
    ])

    const failure = catalogResult.error || equipmentResult.error || walletResult.error
    if (failure) {
      setError(failure.message)
    } else {
      setCatalog((catalogResult.data ?? []) as CatalogItem[])
      setOwned((equipmentResult.data ?? []) as unknown as OwnedEquipment[])
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
          <span className="eyebrow">ECONOMIA CONECTADA</span>
          <h2>Loja persistente</h2>
          <p>Compras vinculadas à sua conta e registradas no PostgreSQL.</p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading || pendingSku !== null}>
          ATUALIZAR
        </button>
      </div>

      <article className="wallet-summary persistent-store-balance">
        <span>SALDO DA CARTEIRA PERSISTENTE</span>
        <strong>{balance === null ? '—' : `${formatPc(balance)} PC`}</strong>
        <small>Este saldo não utiliza os créditos demonstrativos do sandbox.</small>
      </article>

      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      {notice && <div className="persistent-store-notice" role="status">{notice}</div>}

      {loading ? (
        <p className="page-description">Carregando catálogo e inventário...</p>
      ) : catalog.length === 0 ? (
        <p className="page-description">Nenhum equipamento disponível no catálogo.</p>
      ) : (
        <div className="shop-grid">
          {catalog.map((item) => (
            <article className="panel shop-card" key={item.sku}>
              <div className="machine-icon large">▦</div>
              <span className="eyebrow">CATÁLOGO OFICIAL</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className="shop-hash">{Number(item.hashrate).toLocaleString('pt-BR')} H/s</div>
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

      <div className="persistent-store-inventory">
        <div className="panel-heading">
          <h3>Meu inventário persistente</h3>
          <span className="equipment-count">{owned.length} itens</span>
        </div>
        {loading ? (
          <p className="page-description">Carregando equipamentos...</p>
        ) : owned.length === 0 ? (
          <p className="page-description">Você ainda não possui equipamentos nesta carteira persistente.</p>
        ) : owned.map((item) => (
          <div className="machine" key={item.id}>
            <div className="machine-icon">▦</div>
            <div className="machine-info">
              <strong>{item.equipment_catalog?.name ?? item.catalog_sku}</strong>
              <span>{item.equipment_catalog?.equipment_type ?? 'Equipamento adquirido'}</span>
              <small>{Number(item.equipment_catalog?.hashrate ?? 0).toLocaleString('pt-BR')} H/s · {formatPc(item.purchase_price_pc)} PC</small>
              <small>{item.status === 'installed' ? 'Instalado na infraestrutura' : item.status === 'retired' ? 'Desativado' : 'Disponível para instalação'}</small>
            </div>
            <span className="equipment-count">ADQUIRIDO</span>
          </div>
        ))}
      </div>
      <p className="persistent-store-footnote">
        A instalação, desinstalação e o cálculo de hashrate persistente são gerenciados na tela Equipamentos. A loja sandbox continua independente.
      </p>
    </section>
  )
}
