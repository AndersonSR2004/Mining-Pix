import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'
import { formatDepix } from './lib/depixSandbox'

type Offer = { sku: string; family: 'vip' | 'rack'; title: string; tier: number; bonus: number; price: string }
type Installed = { id: string; room_id: string; equipment_catalog: { name: string } | null }
type Rack = { id: string; title: string; bonus: number; room_id: string | null }
type Snapshot = {
  offers: Offer[]
  racks: Rack[]
  mounts: Record<string, string>
}

export default function RoyaltyPanel({ onDisassembled }: { onDisassembled: () => void }) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [installed, setInstalled] = useState<Installed[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requests = useRef(new Map<string, string>())

  async function load() {
    const [snapshot, equipment] = await Promise.all([
      supabase.rpc('royalty_snapshot'),
      supabase.from('player_equipment').select('id,room_id,equipment_catalog(name)').eq('status', 'installed'),
    ])
    if (snapshot.error || equipment.error) {
      setError(snapshot.error?.message || equipment.error?.message || 'Falha ao consultar benefícios.')
      return
    }
    setData(snapshot.data as Snapshot)
    setInstalled((equipment.data ?? []) as unknown as Installed[])
  }
  useEffect(() => { void load() }, [])

  async function purchase(offer: Offer) {
    if (busy) return
    setBusy(true)
    setError('')
    const key = `${offer.sku}:${offer.price}`
    const id = requests.current.get(key) ?? crypto.randomUUID()
    requests.current.set(key, id)
    try {
      const { error: failure } = await supabase.rpc('royalty_purchase', {
        p_request_id: id, p_sku: offer.sku, p_price: offer.price,
      })
      if (failure) { setError(failure.message); return }
      requests.current.delete(key)
      await load()
    } finally { setBusy(false) }
  }

  async function mount(equipment: string, rack: string) {
    setBusy(true)
    setError('')
    try {
      const result = await supabase.rpc('royalty_mount', { p_equipment: equipment, p_rack: rack || null })
      if (result.error) { setError(result.error.message); return }
      await load()
    } finally { setBusy(false) }
  }

  async function disassemble(rack: Rack) {
    if (!window.confirm('Desmontar este rack por 10 CPU, 10 GPU e 10 Parts de placa-mãe? A desmontagem é irreversível.')) return
    setBusy(true)
    setError('')
    try {
      const { error: failure } = await supabase.rpc('genesis_disassemble', { p_kind: 'rack', p_item: rack.id })
      if (failure) { setError(failure.message); return }
      onDisassembled()
      await load()
    } finally { setBusy(false) }
  }

  return <section className="persistent-store" aria-busy={busy || (!data && !error)}>
    <h2>Racks de mineração</h2>
    {error && <p role="alert">{error}</p>}
    <div className="shop-grid">{data?.offers.filter(offer => offer.family === 'rack').map(offer => (
      <article className="panel shop-card" key={offer.sku}>
        <h3>{offer.title}</h3>
        <p>HASH +{offer.bonus}%</p>
        <strong>{formatDepix(offer.price)} fictício</strong>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void purchase(offer)}>Comprar no sandbox</button>
      </article>
    ))}</div>
    {data && <>
      <h3>Racks no inventário ({data.racks.length})</h3>
      {data.racks.map(rack => <p key={rack.id}>
        {rack.title}{' '}
        <button type="button" className="secondary-button" disabled={busy || Boolean(rack.room_id)}
          onClick={() => void disassemble(rack)}>Desmontar rack</button>
      </p>)}
      {installed.length === 0 && <p>Instale uma máquina em uma sala para conectar um rack.</p>}
      {installed.map(machine => <p key={machine.id}>
        <label>{machine.equipment_catalog?.name ?? 'Máquina'}{' '}
          <select disabled={busy} value={data.mounts[machine.id] ?? ''} onChange={event => void mount(machine.id, event.target.value)}>
            <option value="">Sem rack</option>
            {data.racks.filter(rack => !rack.room_id || rack.room_id === machine.room_id).map((rack, index) => (
              <option key={rack.id} value={rack.id}>{rack.title} · +{rack.bonus}% · unidade {index + 1}</option>
            ))}
          </select>
        </label>
      </p>)}
    </>}
  </section>
}
