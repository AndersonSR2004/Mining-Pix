import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Room = { id: string; room_number: number; name: string; installed_count: number; total_hashrate: number | string; capacity: number }
type Equipment = {
  id: string; catalog_sku: string; status: 'inventory' | 'installed' | 'retired'
  room_id: string | null; purchase_price_pc: number | string
  equipment_catalog: { name: string; equipment_type: string; hashrate: number | string } | null
}
type MiningSummary = { total_hashrate: number | string; installed_equipment_count: number; room_count: number; total_room_capacity: number }
type Props = { mode?: 'management' | 'summary' }
const fmt = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export default function PersistentFacilityPanel({ mode = 'management' }: Props) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [summary, setSummary] = useState<MiningSummary | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const keys = useRef<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [r, e, s] = await Promise.all([
      supabase.rpc('get_player_room_summaries'),
      supabase.from('player_equipment').select('id,catalog_sku,status,room_id,purchase_price_pc,equipment_catalog(name,equipment_type,hashrate)').order('acquired_at'),
      supabase.rpc('get_player_mining_summary'),
    ])
    const failure = r.error || e.error || s.error
    if (failure) setError(failure.message)
    else {
      const nextRooms = (r.data ?? []) as Room[]
      setRooms(nextRooms)
      setEquipment((e.data ?? []) as unknown as Equipment[])
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

  if (mode === 'summary') return (
    <section className="persistent-facility persistent-facility-summary">
      <div className="persistent-facility-heading">
        <div><span className="eyebrow">DADOS DO POSTGRESQL</span><h2>Mineração persistente</h2><p>Hashrate calculado no backend a partir dos equipamentos instalados.</p></div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>ATUALIZAR</button>
      </div>
      {error && <div className="persistent-store-error" role="alert">{error}</div>}
      <div className="stats">
        <article className="stat-card"><span>HASHRATE PERSISTENTE</span><h2>{loading || !summary ? '—' : <>{fmt(summary.total_hashrate)} <small>H/s</small></>}</h2></article>
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
        <article className="stat-card"><span>HASHRATE PERSISTENTE</span><h2>{loading || !summary ? '—' : <>{fmt(summary.total_hashrate)} <small>H/s</small></>}</h2></article>
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
                <small>{fmt(item.equipment_catalog?.hashrate ?? 0)} H/s · {fmt(item.purchase_price_pc)} PC</small>
                <small>{isInstalled ? `Instalado: ${room?.name ?? 'Sala'}` : item.status === 'retired' ? 'Desativado' : 'No inventário'}</small>
              </div>
              {isInstalled
                ? <button className="secondary-button" onClick={() => void operate('uninstall', item)} disabled={pendingId !== null}>{pendingId === item.id ? 'PROCESSANDO...' : 'DESINSTALAR'}</button>
                : item.status === 'inventory'
                  ? <button className="primary-button" onClick={() => void operate('install', item, selectedRoomId)} disabled={pendingId !== null || !selectedRoomId || rooms.every(room => roomOccupancy(room.id) >= room.capacity)}>{pendingId === item.id ? 'PROCESSANDO...' : 'INSTALAR'}</button>
                  : <span className="equipment-count">INDISPONÍVEL</span>}
            </div>
          })}
      </div>
      <p className="persistent-store-footnote">Limite atual: 10 equipamentos por sala. A quantidade de salas é provisionada conforme o VIP registrado no banco. A loja sandbox local não altera esta infraestrutura.</p>
    </section>
  )
}
