import { formatDepix } from './lib/depixSandbox'
import { useCallback, useEffect, useRef, useState } from 'react'
import PersistentEquipmentShop from './PersistentEquipmentShop'
import { supabase } from './lib/supabase/client'

type Parts = { cpu: string; gpu: string; motherboard: string }
type Room = { id: string; room_number: number; name: string; installed_count: number; total_hashrate: number | string; capacity: number }
type Equipment = {
  id: string; catalog_sku: string; status: 'inventory' | 'installed' | 'retired'
  forge_level: number; room_id: string | null; blessing_percent: number | string
  equipment_catalog: { name: string; equipment_type: string; hashrate: number | string; tier: number | null; overclock_percent: number | string } | null
}
type MiningSummary = { total_hashrate: number | string; installed_equipment_count: number; room_count: number; total_room_capacity: number }
type Props = { mode?: 'management' | 'summary' | 'dashboard'; onManage?: () => void; partsRevision?: number }
const fmt = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export default function PersistentFacilityPanel({ mode = 'management', onManage, partsRevision }: Props) {
  const [parts, setParts] = useState<Parts | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [summary, setSummary] = useState<MiningSummary | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [playerLevel, setPlayerLevel] = useState(1)
  const keys = useRef<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [r, e, s, progress] = await Promise.all([
      supabase.rpc('get_player_room_summaries'),
      supabase.from('player_equipment').select('id,catalog_sku,status,room_id,blessing_percent,forge_level,equipment_catalog(name,equipment_type,hashrate,tier,overclock_percent)').neq('status', 'retired').order('acquired_at'),
      supabase.rpc('get_player_mining_summary'),
      supabase.from('player_progress').select('level').maybeSingle(),
    ])
    const failure = r.error || e.error || s.error || progress.error
    if (failure) setError(failure.message)
    else {
      const nextRooms = (r.data ?? []) as Room[]
      setRooms(nextRooms)
      setEquipment((e.data ?? []) as unknown as Equipment[])
      setPlayerLevel(Number(progress.data?.level ?? 1))
      const rows = (s.data ?? []) as MiningSummary[]
      setSummary(rows[0] ?? { total_hashrate: 0, installed_equipment_count: 0, room_count: nextRooms.length, total_room_capacity: nextRooms.length * 10 })
      setSelectedRoomId(current => nextRooms.some(room => room.id === current) ? current : (nextRooms[0]?.id ?? ''))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function operate(operation: 'install' | 'uninstall', item: Equipment, roomId?: string) {
    const signature = [operation, item.id, roomId ?? 'none'].join(':')
    const key = keys.current[signature] ?? crypto.randomUUID()
    keys.current[signature] = key
    setPendingId(item.id); setError(''); setNotice('')
    const result = operation === 'install'
      ? await supabase.rpc('install_player_equipment', { p_equipment_id: item.id, p_room_id: roomId, p_idempotency_key: key })
      : await supabase.rpc('uninstall_player_equipment', { p_equipment_id: item.id, p_idempotency_key: key })
    if (result.error) { setError(result.error.message); setPendingId(null); return }
    delete keys.current[signature]
    setNotice(operation === 'install' ? 'Equipamento instalado na sala selecionada.' : 'Equipamento devolvido ao inventário.')
    await refresh()
    setPendingId(null)
  }

  const loadParts = useCallback(async () => {
    const { data, error: failure } = await supabase.rpc('genesis_parts_inventory')
    if (failure) setError(failure.message)
    else setParts(data as Parts)
  }, [])

  useEffect(() => {
    if (mode === 'management') void loadParts()
  }, [mode, loadParts, partsRevision])

  async function disassemble(item: Equipment) {
    if (!window.confirm('Desmontar esta máquina por 10 CPU, 10 GPU e 10 Parts de placa-mãe? A desmontagem é irreversível.')) return
    setPendingId(item.id)
    setError('')
    setNotice('')
    try {
      const { data, error: failure } = await supabase.rpc('genesis_disassemble', { p_kind: 'machine', p_item: item.id })
      if (failure) { setError(failure.message); return }
      setNotice(data ? 'Máquina desmontada. Parts creditadas.' : 'Esta máquina já foi desmontada.')
      await refresh()
      await loadParts()
    } finally { setPendingId(null) }
  }

  async function forge(item: Equipment) {
    setPendingId(item.id)
    setError('')
    setNotice('')
    try {
      const { data: quote, error: quoteError } = await supabase.rpc('genesis_forge_quote', { p_item: item.id })
      if (quoteError) { setError(quoteError.message); return }
      if (!window.confirm(`Forjar para +${quote.level} por ${quote.parts} Parts de cada material e ${formatDepix(quote.fee)} sandbox?`)) return
      const signature = `forge:${item.id}:${quote.level}:${quote.fee}`
      const request = keys.current[signature] ?? crypto.randomUUID()
      keys.current[signature] = request
      const { error: failure } = await supabase.rpc('genesis_forge', {
        p_request: request, p_item: item.id, p_level: quote.level, p_fee: quote.fee,
      })
      if (failure) { setError(failure.message); return }
      delete keys.current[signature]
      setNotice(`Máquina aprimorada para +${quote.level}.`)
      await refresh()
      await loadParts()
    } finally { setPendingId(null) }
  }

  async function renameRoom(room: Room) {
    const entered = window.prompt('Novo nome da sala (até 30 caracteres):', room.name)
    if (entered === null) return
    const name = entered.trim()
    if (!name || name.length > 30) { setError('O nome deve conter entre 1 e 30 caracteres.'); return }
    const { error: renameError } = await supabase.rpc('rename_player_room', { p_room_id: room.id, p_name: name })
    if (renameError) setError(renameError.message)
    else { setNotice('Nome da sala atualizado.'); await refresh() }
  }

  const inventory = equipment.filter(item => item.status === 'inventory')
  const installed = equipment.filter(item => item.status === 'installed')
  const roomHash = (id: string) => Number(rooms.find(room => room.id === id)?.total_hashrate ?? 0)
  const roomOccupancy = (id: string) => Number(rooms.find(room => room.id === id)?.installed_count ?? 0)
  const effectiveHash = (item: Equipment) => {
    const base = Number(item.equipment_catalog?.hashrate ?? 0)
    const overclock = Number(item.equipment_catalog?.overclock_percent ?? 0)
    const blessing = Number(item.blessing_percent ?? 0)
    return base * (1 + overclock / 100 + blessing / 100 + item.forge_level * 0.05)
  }

  if (mode === 'dashboard') return (
    <section className="persistent-facility persistent-facility-dashboard">
      <div className="persistent-facility-heading">
        <div><span className="eyebrow">SUA INFRAESTRUTURA</span><h2>Suas salas</h2><p>Infraestrutura permanente, de propriedade da sua conta.</p></div>
        {onManage && <button className="secondary-button" onClick={onManage}>GERENCIAR INFRAESTRUTURA</button>}
      </div>
      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      {notice && <div className="persistent-store-notice" role="status">{notice}</div>}
      <div className="stats persistent-room-stats">
        <article className="stat-card"><span>PODER TOTAL</span><h2>{loading || !summary ? '—' : <>{fmt(summary.total_hashrate)} <small>H/s</small></>}</h2></article>
        <article className="stat-card"><span>SALAS PERMANENTES</span><h2>{loading ? '—' : rooms.length}</h2></article>
        <article className="stat-card"><span>NÍVEL DO JOGADOR</span><h2>{loading ? '—' : playerLevel}</h2></article>
      </div>
      <div className="persistent-room-grid persistent-room-grid-featured">
        {rooms.map(room => {
          const occupied = roomOccupancy(room.id)
          return <article className="panel persistent-room-card" key={room.id}>
            <div className="machine-icon large">▦</div><span className="eyebrow">SALA {room.room_number}</span>
            <h3>{room.name}</h3><strong>{occupied} / {room.capacity} equipamentos</strong>
            <span>{fmt(roomHash(room.id))} H/s</span>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${occupied / room.capacity * 100}%` }} /></div>
            <small className="persistent-store-footnote">PERMANENTE · SALA PERMANENTE</small>
          </article>
        })}
        {!loading && rooms.length === 0 && <p className="page-description">Sua primeira sala está sendo provisionada. Atualize em instantes.</p>}
      </div>
    </section>
  )

  if (mode === 'summary') return (
    <section className="persistent-facility persistent-facility-summary">
      <div className="persistent-facility-heading">
        <div><span className="eyebrow">DADOS DO POSTGRESQL</span><h2>Mineração persistente</h2><p>Hashrate efetivo calculado no backend, incluindo Overclock, Benção individual e bônus temporários ativos.</p></div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>ATUALIZAR</button>
      </div>
      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      <div className="stats">
        <article className="stat-card"><span>HASHRATE EFETIVO TOTAL</span><h2>{loading || !summary ? '—' : <>{fmt(summary.total_hashrate)} <small>H/s</small></>}</h2></article>
        <article className="stat-card"><span>EQUIPAMENTOS INSTALADOS</span><h2>{loading || !summary ? '—' : summary.installed_equipment_count}</h2></article>
        <article className="stat-card"><span>SALAS E ESPAÇOS</span><h2>{loading || !summary ? '—' : <>{summary.room_count} <small>/ {summary.total_room_capacity} espaços</small></>}</h2></article>
      </div>
    </section>
  )

  return (
    <section className="persistent-facility">
      <div className="persistent-facility-heading">
        <div><span className="eyebrow">INFRAESTRUTURA DA CONTA</span><h2>Salas e equipamentos persistentes</h2><p>Instalações, limites e hashrate validados pelo PostgreSQL.</p></div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading || pendingId !== null}>ATUALIZAR</button>
      </div>
      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      {notice && <div className="persistent-store-notice" role="status">{notice}</div>}
      <div className="stats">
        <article className="stat-card"><span>HASHRATE EFETIVO TOTAL</span><h2>{loading || !summary ? '—' : <>{fmt(summary.total_hashrate)} <small>H/s</small></>}</h2></article>
        <article className="stat-card"><span>EQUIPAMENTOS INSTALADOS</span><h2>{loading || !summary ? '—' : summary.installed_equipment_count}</h2></article>
        <article className="stat-card"><span>ESPAÇOS DISPONÍVEIS</span><h2>{loading || !summary ? '—' : Math.max(0, summary.total_room_capacity - summary.installed_equipment_count)}</h2></article>
      </div>
      <div className="persistent-room-grid">
        {rooms.map(room => {
          const occupied = roomOccupancy(room.id)
          return <article className="panel persistent-room-card" key={room.id}>
            <div className="machine-icon large">▦</div><span className="eyebrow">SALA {room.room_number}</span>
            <h3>{room.name}</h3><strong>{occupied} / {room.capacity} equipamentos</strong><span>{fmt(roomHash(room.id))} H/s</span>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${occupied / room.capacity * 100}%` }} /></div>
            <button className="secondary-button" onClick={() => void renameRoom(room)} disabled={loading || pendingId !== null}>RENOMEAR SALA</button>
          </article>
        })}
        {!loading && rooms.length === 0 && <p className="page-description">Nenhuma sala persistente foi provisionada para esta conta.</p>}
      </div>
      {!loading && rooms.length < 4 && <PersistentEquipmentShop category="room" onPurchased={refresh} />}
      {parts && <p>Parts · CPU {parts.cpu} · GPU {parts.gpu} · Placa-mãe {parts.motherboard}</p>}
      <div className="persistent-facility-inventory">
        <div className="panel-heading"><h3>Inventário e instalação</h3><span className="equipment-count">{inventory.length} disponíveis · {installed.length} instalados</span></div>
        {inventory.length > 0 && <div className="persistent-install-target">
          <label htmlFor="persistent-room-select">Sala de destino</label>
          <select id="persistent-room-select" value={selectedRoomId} onChange={event => setSelectedRoomId(event.target.value)}>
            {rooms.map(room => <option key={room.id} value={room.id} disabled={roomOccupancy(room.id) >= room.capacity}>{room.name} ({roomOccupancy(room.id)}/{room.capacity})</option>)}
          </select>
        </div>}
        {loading ? <p className="page-description">Carregando infraestrutura da conta...</p> : equipment.length === 0
          ? <p className="page-description">Seu inventário persistente está vazio. Equipamentos adquiridos na loja aparecerão aqui.</p>
          : equipment.map(item => {
            const isInstalled = item.status === 'installed'
            const room = rooms.find(candidate => candidate.id === item.room_id)
            return <div className="machine persistent-machine" key={item.id}>
              <div className="machine-icon">▦</div>
              <div className="machine-info">
                <strong>{item.equipment_catalog?.name ?? item.catalog_sku}</strong>
                <span>{item.equipment_catalog?.equipment_type ?? 'Equipamento'}</span>
                <small>{fmt(item.equipment_catalog?.hashrate ?? 0)} H/s base → {fmt(effectiveHash(item))} H/s efetivos</small>
                <small>Tier {item.equipment_catalog?.tier ?? '—'} · Overclock +{fmt(item.equipment_catalog?.overclock_percent ?? 0)}% · Benção +{fmt(item.blessing_percent)}% · Forja +{item.forge_level}</small>
                <small>{isInstalled ? `Instalado: ${room?.name ?? 'Sala'}` : item.status === 'retired' ? 'Desativado' : 'No inventário'}</small>
              </div>
              {isInstalled
                ? <button className="secondary-button" onClick={() => void operate('uninstall', item)} disabled={pendingId !== null}>{pendingId === item.id ? 'PROCESSANDO...' : 'DESINSTALAR'}</button>
                : item.status === 'inventory'
                  ? <button className="primary-button" onClick={() => void operate('install', item, selectedRoomId)} disabled={pendingId !== null || !selectedRoomId || rooms.every(room => roomOccupancy(room.id) >= room.capacity)}>{pendingId === item.id ? 'PROCESSANDO...' : 'INSTALAR'}</button>
                  : <span className="equipment-count">INDISPONÍVEL</span>}
              {item.forge_level < 10 && <button type="button" className="secondary-button" disabled={pendingId !== null}
                onClick={() => void forge(item)}>Forjar +{item.forge_level + 1}</button>}
              {item.status === 'inventory' && <button type="button" className="secondary-button"
                disabled={pendingId !== null} onClick={() => void disassemble(item)}>Desmontar</button>}
            </div>
          })}
      </div>
      <p className="persistent-store-footnote">Cada jogador pode ter até quatro salas permanentes, com dez equipamentos por sala.</p>
    </section>
  )
}
