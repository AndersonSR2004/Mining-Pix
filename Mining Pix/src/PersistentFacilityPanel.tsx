import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Room = { id: string; room_number: number; name: string; installed_count: number; total_hashrate: number | string; capacity: number }
type Equipment = {
  id: string; catalog_sku: string; status: 'inventory' | 'installed' | 'retired'
  room_id: string | null; purchase_price_pc: number | string; blessing_percent: number | string
  equipment_catalog: { name: string; equipment_type: string; hashrate: number | string; tier: number | null; overclock_percent: number | string } | null
}
type MiningSummary = { total_hashrate: number | string; installed_equipment_count: number; room_count: number; total_room_capacity: number }
type Props = { mode?: 'management' | 'summary' | 'dashboard'; onManage?: () => void }
const fmt = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export default function PersistentFacilityPanel({ mode = 'management', onManage }: Props) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [summary, setSummary] = useState<MiningSummary | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [vipTier, setVipTier] = useState(0)
  const [playerLevel, setPlayerLevel] = useState(1)
  const [buyingRoom, setBuyingRoom] = useState(false)
  const keys = useRef<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [r, e, s, wallet, progress] = await Promise.all([
      supabase.rpc('get_player_room_summaries'),
      supabase.from('player_equipment').select('id,catalog_sku,status,room_id,purchase_price_pc,blessing_percent,equipment_catalog(name,equipment_type,hashrate,tier,overclock_percent)').order('acquired_at'),
      supabase.rpc('get_player_mining_summary'),
      supabase.from('wallets').select('balance').maybeSingle(),
      supabase.from('player_progress').select('vip_tier,level').maybeSingle(),
    ])
    const failure = r.error || e.error || s.error || wallet.error || progress.error
    if (failure) setError(failure.message)
    else {
      const nextRooms = (r.data ?? []) as Room[]
      setRooms(nextRooms)
      setEquipment((e.data ?? []) as unknown as Equipment[])
      setWalletBalance(wallet.data ? Number(wallet.data.balance) : 0)
      setVipTier(Number(progress.data?.vip_tier ?? 0))
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

  async function purchaseRoom() {
    if (buyingRoom) return
    setBuyingRoom(true); setError(''); setNotice('')
    const signature = 'purchase-room'
    const key = keys.current[signature] ?? crypto.randomUUID()
    keys.current[signature] = key
    const { data, error: purchaseError } = await supabase.rpc('purchase_player_room', { p_idempotency_key: key })
    if (purchaseError) {
      setError(purchaseError.message)
    } else {
      delete keys.current[signature]
      const result = data as { replayed?: boolean; room_number?: number }
      setNotice(result.replayed ? 'Desbloqueio já confirmado anteriormente.' : `Sala ${result.room_number ?? ''} desbloqueada permanentemente por 10.000 PC.`)
      await refresh()
    }
    setBuyingRoom(false)
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
    return base * (1 + overclock / 100 + blessing / 100)
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
        <article className="stat-card"><span>VIP</span><h2>{loading ? '—' : vipTier === 0 ? 'FREE' : `VIP ${['','I','II','III','IV','V'][vipTier] ?? vipTier}`}</h2></article>
        <article className="stat-card"><span>NÍVEL DO JOGADOR</span><h2>{loading ? '—' : playerLevel}</h2></article>
        <article className="stat-card"><span>PIX COIN</span><h2>{loading || walletBalance === null ? '—' : <>{fmt(walletBalance)} <small>PC</small></>}</h2></article>
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
      <div className="persistent-room-unlock">
        <div><strong>Expandir infraestrutura</strong><span>Desbloqueio permanente de nova sala · 10.000 PC</span></div>
        <button className="primary-button" onClick={() => void purchaseRoom()} disabled={loading || buyingRoom || walletBalance === null || walletBalance < 10000 || rooms.length >= 50}>{buyingRoom ? 'PROCESSANDO...' : 'DESBLOQUEAR SALA · 10.000 PC'}</button>
      </div>
      <p className="persistent-store-footnote">A manutenção está definida em 1,5% dos ganhos da Mining Pool por jogador. A cobrança recorrente ainda depende da definição final da unidade de cobrança; nenhuma taxa está sendo debitada nesta prévia.</p>
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
      <div className="persistent-room-unlock"><div><strong>Desbloquear nova sala permanente</strong><span>10.000 PC · Salas independentes do nível VIP</span></div><button className="primary-button" onClick={() => void purchaseRoom()} disabled={loading || buyingRoom || walletBalance === null || walletBalance < 10000 || rooms.length >= 50}>{buyingRoom ? 'PROCESSANDO...' : 'DESBLOQUEAR · 10.000 PC'}</button></div>
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
                <small>{fmt(item.equipment_catalog?.hashrate ?? 0)} H/s base → {fmt(effectiveHash(item))} H/s efetivos · {fmt(item.purchase_price_pc)} PC</small>
                <small>Tier {item.equipment_catalog?.tier ?? '—'} · Overclock +{fmt(item.equipment_catalog?.overclock_percent ?? 0)}% · Benção +{fmt(item.blessing_percent)}%</small>
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
      <p className="persistent-store-footnote">Limite atual: 10 equipamentos por sala. As salas são permanentes e adquiridas por 10.000 PC; não dependem do VIP. O HASH efetivo inclui Overclock e Benção individuais calculados no backend.</p>
    </section>
  )
}
