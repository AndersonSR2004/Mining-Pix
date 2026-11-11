
import { useEffect, useState } from 'react'
import Games from './Games.tsx'
import PersistentWalletPanel from './PersistentWalletPanel.tsx'
import PersistentEquipmentShop from './PersistentEquipmentShop.tsx'
import PersistentFacilityPanel from './PersistentFacilityPanel.tsx'
import PersistentMiningPool from './PersistentMiningPool.tsx'
import PersistentProgressPanel from './PersistentProgressPanel.tsx'
import LiveEventsPanel from './LiveEventsPanel.tsx'
import { distributePoolBudget } from './lib/pool.ts'
import { createMissionState, DAILY_REWARDED_AD_LIMIT, getMissionProgress, MISSIONS, recordMissionProgress, refreshMissionState, type MissionState } from './lib/missions.ts'
import './App.css'

type Page =
  | 'Dashboard'
  | 'Equipamentos'
  | 'Loja'
  | 'Carteira'
  | 'VIP'
  | 'Passe de Batalha'
  | 'Missões'
  | 'Jogos'

type VipTier = 0 | 1 | 2 | 3

type Room = {
  id: number
  name: string
  capacity: number
}

type Machine = {
  id: number
  name: string
  type: string
  hashrate: number
  price: number
  roomId: number
}

type Bot = {
  id: number
  name: string
  hashrate: number
  active: boolean
  balance: number
  totalRewards: number
}

type PoolCycle = {
  id: number
  date: string
  reward: number
  participation: number
  playerHashrate: number
  networkHashrate: number
  budget: number
  botCount: number
}

type BattleReward = {
  id: string
  level: number
  track: 'free' | 'premium'
  name: string
  hashrate: number
}

type SavedState = {
  balance: number
  machines: Machine[]
  inventory: Machine[]
  rooms: Room[]
  history: string[]
  vipTier: VipTier
  poolBudget: number
  cycles: number
  totalRewards: number
  poolHistory: PoolCycle[]
  bots: Bot[]
  xp: number
  premiumPass: boolean
  claimedRewards: string[]
  nextCycleAt: number
  missionState: MissionState
  temporaryHash: number
  temporaryHashExpiresAt: number
}

const STORAGE_KEY = 'mining-pix-demo-v1'
const ROOM_CAPACITY = 10
const XP_PER_LEVEL = 1000
const CYCLE_DURATION_MS = 10 * 60 * 1000

const vipPlans = [
  { tier: 0 as VipTier, name: 'FREE', rooms: 1, spaces: 10 },
  { tier: 1 as VipTier, name: 'VIP 1', rooms: 2, spaces: 20 },
  { tier: 2 as VipTier, name: 'VIP 2', rooms: 3, spaces: 30 },
  { tier: 3 as VipTier, name: 'VIP 3', rooms: 4, spaces: 40 },
]

const vipProgramLevels = [
  { tier: 'VIP I', threshold: 'R$ 30', xp: '2x', fee: '50%', recharge: '1/dia', hash: '10%', energy: '—' },
  { tier: 'VIP II', threshold: 'R$ 40', xp: '2,5x', fee: '60%', recharge: '1/dia', hash: '15%', energy: '—' },
  { tier: 'VIP III', threshold: 'R$ 45', xp: '3x', fee: '70%', recharge: '1/dia', hash: '20%', energy: '—' },
  { tier: 'VIP IV', threshold: 'R$ 50', xp: '4x', fee: '75%', recharge: '1/dia', hash: '25%', energy: '—' },
  { tier: 'VIP V', threshold: 'R$ 60', xp: '5x', fee: '80%', recharge: '1/dia', hash: '30%', energy: 'Permanente enquanto ativo' },
]

const initialRooms: Room[] = [
  { id: 1, name: 'Sala Principal', capacity: ROOM_CAPACITY },
]

const initialMachines: Machine[] = [
  {
    id: 1,
    name: 'PIX Miner I',
    type: 'Equipamento básico',
    hashrate: 100,
    price: 1000,
    roomId: 1,
  },
]

const battleRewards: BattleReward[] = [
  { id: 'free-1', level: 1, track: 'free', name: 'PIX Miner BP 01', hashrate: 1 },
  { id: 'premium-2', level: 2, track: 'premium', name: 'PIX Miner BP 02', hashrate: 1 },
  { id: 'premium-3', level: 3, track: 'premium', name: 'PIX Miner BP 03', hashrate: 1 },
  { id: 'premium-4', level: 4, track: 'premium', name: 'PIX Miner BP 04', hashrate: 1 },
  { id: 'free-5', level: 5, track: 'free', name: 'PIX Miner BP 05', hashrate: 1 },
  { id: 'premium-6', level: 6, track: 'premium', name: 'PIX Miner BP 06', hashrate: 1 },
  { id: 'premium-7', level: 7, track: 'premium', name: 'PIX Miner BP 07', hashrate: 1 },
  { id: 'premium-8', level: 8, track: 'premium', name: 'PIX Miner BP 08', hashrate: 1 },
  { id: 'premium-9', level: 9, track: 'premium', name: 'PIX Miner BP 09', hashrate: 1 },
  { id: 'free-10', level: 10, track: 'free', name: 'PIX Miner BP 10', hashrate: 1 },
  { id: 'premium-11', level: 11, track: 'premium', name: 'PIX Miner BP 11', hashrate: 1 },
  { id: 'premium-12', level: 12, track: 'premium', name: 'PIX Miner BP 12', hashrate: 1 },
  { id: 'premium-13', level: 13, track: 'premium', name: 'PIX Miner BP 13', hashrate: 1 },
]

const menu: { name: Page; icon: string }[] = [
  { name: 'Dashboard', icon: '◈' },
  { name: 'Equipamentos', icon: '▤' },
  { name: 'Loja', icon: '♜' },
  { name: 'Passe de Batalha', icon: '⚔' },
  { name: 'Missões', icon: '◎' },
  { name: 'Jogos', icon: '🎮' },
  { name: 'Carteira', icon: '◉' },
  { name: 'VIP', icon: '♛' },
]

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isValidMachine(value: unknown): value is Machine {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    typeof value.hashrate === 'number' &&
    typeof value.price === 'number'
  )
}

function loadSavedState(storageKey: string): SavedState {
  const fallback: SavedState = {
    balance: 10000,
    machines: initialMachines,
    inventory: [],
    rooms: initialRooms,
    history: ['Saldo inicial de demonstração: 10.000 PC'],
    vipTier: 0,
    poolBudget: 0,
    cycles: 0,
    totalRewards: 0,
    poolHistory: [],
    bots: [],
    xp: 0,
    premiumPass: false,
    claimedRewards: [],
    nextCycleAt: Date.now() + CYCLE_DURATION_MS,
    missionState: createMissionState(),
    temporaryHash: 0,
    temporaryHashExpiresAt: 0,
  }

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const validTier =
      typeof parsed.vipTier === 'number' &&
      parsed.vipTier >= 0 &&
      parsed.vipTier <= 3
        ? (parsed.vipTier as VipTier)
        : 0

    const plan = vipPlans[validTier]

    const storedRooms = Array.isArray(parsed.rooms)
      ? parsed.rooms.filter((room): room is Room => {
          if (!isObject(room)) return false
          return (
            typeof room.id === 'number' &&
            typeof room.name === 'string' &&
            typeof room.capacity === 'number'
          )
        })
      : initialRooms

    const rooms = Array.from({ length: plan.rooms }, (_, index) => {
      return (
        storedRooms.find((room) => room.id === index + 1) ?? {
          id: index + 1,
          name: index === 0 ? 'Sala Principal' : `Sala ${index + 1}`,
          capacity: ROOM_CAPACITY,
        }
      )
    })

    const validRoomIds = new Set(rooms.map((room) => room.id))

    const machines = Array.isArray(parsed.machines)
      ? parsed.machines.filter(isValidMachine).map((machine) => ({
          ...machine,
          roomId:
            typeof machine.roomId === 'number' &&
            validRoomIds.has(machine.roomId)
              ? machine.roomId
              : rooms[0].id,
        }))
      : initialMachines

    const inventory = Array.isArray(parsed.inventory)
      ? parsed.inventory.filter(isValidMachine)
      : []

    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((item): item is string => typeof item === 'string')
      : fallback.history

    const poolHistory = Array.isArray(parsed.poolHistory)
      ? parsed.poolHistory.filter((item): item is PoolCycle => {
          if (!isObject(item)) return false
          return (
            typeof item.id === 'number' &&
            typeof item.date === 'string' &&
            typeof item.reward === 'number' &&
            typeof item.participation === 'number' &&
            typeof item.playerHashrate === 'number' &&
            typeof item.networkHashrate === 'number' &&
            typeof item.budget === 'number'
          )
        })
      : []

    const bots = Array.isArray(parsed.bots)
      ? parsed.bots.filter((item): item is Bot => {
          if (!isObject(item)) return false
          return (
            typeof item.id === 'number' &&
            typeof item.name === 'string' &&
            typeof item.hashrate === 'number' &&
            typeof item.active === 'boolean' &&
            typeof item.balance === 'number' &&
            typeof item.totalRewards === 'number'
          )
        })
      : []

    return {
      balance:
        typeof parsed.balance === 'number' && parsed.balance >= 0
          ? parsed.balance
          : fallback.balance,
      machines,
      inventory,
      rooms,
      history,
      vipTier: validTier,
      poolBudget:
        typeof parsed.poolBudget === 'number' && parsed.poolBudget >= 0
          ? parsed.poolBudget
          : 0,
      cycles:
        typeof parsed.cycles === 'number' && parsed.cycles >= 0
          ? parsed.cycles
          : 0,
      totalRewards:
        typeof parsed.totalRewards === 'number' && parsed.totalRewards >= 0
          ? parsed.totalRewards
          : 0,
      poolHistory,
      bots,
      xp: typeof parsed.xp === 'number' && parsed.xp >= 0 ? parsed.xp : 0,
      premiumPass: parsed.premiumPass === true,
      claimedRewards: Array.isArray(parsed.claimedRewards)
        ? parsed.claimedRewards.filter((item): item is string => typeof item === 'string')
        : [],
      nextCycleAt:
        typeof parsed.nextCycleAt === 'number' && parsed.nextCycleAt > 0
          ? parsed.nextCycleAt
          : Date.now() + CYCLE_DURATION_MS,
      missionState: refreshMissionState(
        isObject(parsed.missionState) ? parsed.missionState as unknown as MissionState : createMissionState(),
      ),
      temporaryHash: typeof parsed.temporaryHash === 'number' && parsed.temporaryHash > 0 ? parsed.temporaryHash : 0,
      temporaryHashExpiresAt: typeof parsed.temporaryHashExpiresAt === 'number' && parsed.temporaryHashExpiresAt > 0 ? parsed.temporaryHashExpiresAt : 0,
    }
  } catch {
    return fallback
  }
}

type AppProps = { userId: string; email: string; displayName: string; onSignOut: () => void | Promise<void> }

function App({ userId, email, displayName, onSignOut }: AppProps) {
  const storageKey = `${STORAGE_KEY}:${userId}`
  const [saved] = useState<SavedState>(() => loadSavedState(storageKey))

  const [page, setPage] = useState<Page>('Dashboard')
  const [balance, setBalance] = useState(saved.balance)
  const [machines, setMachines] = useState<Machine[]>(saved.machines)
  const [inventory, setInventory] = useState<Machine[]>(saved.inventory)
  const [rooms, setRooms] = useState<Room[]>(saved.rooms)
  const [history, setHistory] = useState<string[]>(saved.history)
  const [vipTier, setVipTier] = useState<VipTier>(saved.vipTier)

  const [poolBudget] = useState(saved.poolBudget)
  const [cycles] = useState(saved.cycles)
  const [totalRewards] = useState(saved.totalRewards)
  const [poolHistory] = useState<PoolCycle[]>(saved.poolHistory)
  const [bots] = useState<Bot[]>(saved.bots)

  const [xp, setXp] = useState(saved.xp)
  const [premiumPass] = useState(saved.premiumPass)
  const [claimedRewards, setClaimedRewards] = useState<string[]>(saved.claimedRewards)
  const [nextCycleAt] = useState(saved.nextCycleAt)
  const [missionState, setMissionState] = useState(saved.missionState)
  const [temporaryHash] = useState(saved.temporaryHash)
  const [temporaryHashExpiresAt] = useState(saved.temporaryHashExpiresAt)
  const [clockNow, setClockNow] = useState(Date.now())

  const [selectedRoomId, setSelectedRoomId] = useState(1)
  const [message, setMessage] = useState('')

  const currentPlan = vipPlans[vipTier]
  const totalCapacity = currentPlan.spaces

  const activeTemporaryHash = temporaryHashExpiresAt > clockNow ? temporaryHash : 0
  const hashrate = machines.reduce((total, machine) => total + machine.hashrate, 0) + activeTemporaryHash

  const activeBots = bots.filter((bot) => bot.active && bot.hashrate > 0)
  const botsHashrate = activeBots.reduce((total, bot) => total + bot.hashrate, 0)

  // A rede é formada exclusivamente pelos participantes ativos.
  const networkHashrate = hashrate + botsHashrate

  const participation =
    networkHashrate > 0 ? hashrate / networkHashrate : 0

  const poolAllocations = distributePoolBudget(poolBudget, [
    { id: 'player', hashrate },
    ...activeBots.map((bot) => ({ id: `bot-${bot.id}`, hashrate: bot.hashrate })),
  ])
  const estimatedReward = poolAllocations.player ?? 0
  const secondsUntilCycle = Math.max(0, Math.ceil((nextCycleAt - clockNow) / 1000))
  const countdownLabel = `${String(Math.floor(secondsUntilCycle / 60)).padStart(2, '0')}:${String(secondsUntilCycle % 60).padStart(2, '0')}`
  const cycleReady = secondsUntilCycle === 0

  const currentLevel = Math.floor(xp / XP_PER_LEVEL) + 1
  const levelProgress = (xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100
  const nextLevelXp = currentLevel * XP_PER_LEVEL

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]
  const roomMachines = machines.filter((machine) => machine.roomId === selectedRoomId)
  const roomHashrate = roomMachines.reduce((total, machine) => total + machine.hashrate, 0)

  useEffect(() => {
    const data: SavedState = {
      balance,
      machines,
      inventory,
      rooms,
      history,
      vipTier,
      poolBudget,
      cycles,
      totalRewards,
      poolHistory,
      bots,
      xp,
      premiumPass,
      claimedRewards,
      nextCycleAt,
      missionState,
      temporaryHash,
      temporaryHashExpiresAt,
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {
      setMessage('Não foi possível salvar os dados neste navegador.')
    }
  }, [
    balance, machines, inventory, rooms, history, vipTier, poolBudget,
    cycles, totalRewards, poolHistory, bots, xp, premiumPass, claimedRewards, nextCycleAt, missionState, temporaryHash, temporaryHashExpiresAt, userId,
  ])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setMissionState((value) => recordMissionProgress(value, 'daily_login'))
  }, [])

  function logAction(text: string) {
    setHistory((value) => [text, ...value].slice(0, 200))
  }

  function installMachine(machine: Machine) {
    const room = rooms.find((item) => item.id === selectedRoomId)
    if (!room) {
      setMessage('Sala não encontrada.')
      return
    }

    const occupied = machines.filter((item) => item.roomId === room.id).length
    if (occupied >= room.capacity) {
      setMessage(`${room.name} atingiu sua capacidade máxima.`)
      return
    }

    if (!inventory.some((item) => item.id === machine.id)) {
      setMessage('Equipamento não encontrado no inventário.')
      return
    }

    setInventory((value) => value.filter((item) => item.id !== machine.id))
    setMachines((value) => [...value, { ...machine, roomId: room.id }])
    logAction(`Instalação de ${machine.name} em ${room.name}`)
    setMessage(`${machine.name} instalado em ${room.name}!`)
  }

  function uninstallMachine(machine: Machine) {
    setMachines((value) => value.filter((item) => item.id !== machine.id))
    setInventory((value) => [...value, { ...machine, roomId: 0 }])
    logAction(`Desinstalação de ${machine.name}`)
    setMessage(`${machine.name} devolvido ao inventário.`)
  }

  function transferMachine(machine: Machine, destinationId: number) {
    const destination = rooms.find((room) => room.id === destinationId)
    if (!destination) return

    const occupied = machines.filter(
      (item) => item.roomId === destinationId && item.id !== machine.id,
    ).length

    if (occupied >= destination.capacity) {
      setMessage(`${destination.name} está sem espaços disponíveis.`)
      return
    }

    setMachines((value) =>
      value.map((item) => item.id === machine.id ? { ...item, roomId: destinationId } : item),
    )
    logAction(`Transferência de ${machine.name} para ${destination.name}`)
    setMessage(`${machine.name} transferido para ${destination.name}.`)
  }

  function dismantleMachine(machine: Machine, source: 'inventory' | 'installed') {
    const refund = Math.floor(machine.price * 0.9)

    if (source === 'installed') {
      setMachines((value) => value.filter((item) => item.id !== machine.id))
    } else {
      setInventory((value) => value.filter((item) => item.id !== machine.id))
    }

    setBalance((value) => value + refund)
    logAction(`Desmontagem de ${machine.name}: +${refund.toLocaleString('pt-BR')} PC`)
    setMessage(`${machine.name} desmontado. Recuperação: ${refund.toLocaleString('pt-BR')} PC.`)
  }

  function activateVip(tier: VipTier) {
    const plan = vipPlans[tier]

    if (tier === vipTier) {
      setMessage('Este já é o seu plano atual.')
      return
    }

    const newRooms = Array.from({ length: plan.rooms }, (_, index) =>
      rooms.find((room) => room.id === index + 1) ?? {
        id: index + 1,
        name: `Sala ${index + 1}`,
        capacity: ROOM_CAPACITY,
      },
    )

    const removedRoomIds = rooms.filter((room) => room.id > plan.rooms).map((room) => room.id)
    const machinesInRemovedRooms = machines.filter((machine) => removedRoomIds.includes(machine.roomId))

    if (machinesInRemovedRooms.length > 0 || machines.length > plan.spaces) {
      setMessage('Transfira ou desinstale equipamentos das salas adicionais antes de reduzir o VIP.')
      return
    }

    setVipTier(tier)
    setRooms(newRooms)
    if (selectedRoomId > plan.rooms) setSelectedRoomId(1)
    logAction(`Alteração demonstrativa de plano: ${plan.name}`)
    setMessage(`Plano ${plan.name} ativado em modo de demonstração.`)
  }

  function renameRoom(room: Room) {
    const newName = window.prompt('Novo nome da sala:', room.name)
    if (!newName?.trim()) return

    const name = newName.trim().slice(0, 30)
    setRooms((value) => value.map((item) => item.id === room.id ? { ...item, name } : item))
    logAction(`Sala ${room.name} renomeada para ${name}`)
    setMessage('Nome da sala atualizado.')
  }

  function claimMissionReward(missionId: string) {
    const mission = MISSIONS.find((item) => item.id === missionId)
    if (!mission) return
    const current = refreshMissionState(missionState)
    if (current.claimed.includes(missionId) || getMissionProgress(current, mission) < mission.target) {
      setMessage('Missão ainda não concluída ou recompensa já resgatada.')
      return
    }
    setMissionState({ ...current, claimed: [...current.claimed, missionId] })
    setXp((value) => value + mission.rewardXp)
    logAction(`Missão concluída: ${mission.title} · +${mission.rewardXp} XP`)
    setMessage(`Missão resgatada! Você recebeu ${mission.rewardXp} XP.`)
  }

  function nextMachineId() {
    return Math.max(0, ...machines.map((machine) => machine.id), ...inventory.map((machine) => machine.id)) + 1
  }

  function claimBattleReward(reward: BattleReward) {
    if (currentLevel < reward.level) {
      setMessage(`Alcance o nível ${reward.level} para resgatar esta recompensa.`)
      return
    }
    if (claimedRewards.includes(reward.id)) {
      setMessage('Esta recompensa já foi resgatada.')
      return
    }
    if (reward.track === 'premium' && !premiumPass) {
      setMessage('Esta recompensa ainda não está disponível nesta versão demonstrativa.')
      return
    }

    const machine: Machine = {
      id: nextMachineId(),
      name: reward.name,
      type: `Recompensa Passe de Batalha · ${reward.track === 'free' ? 'Free' : 'Premium'}`,
      hashrate: reward.hashrate,
      price: 0,
      roomId: 0,
    }

    setInventory((value) => [...value, machine])
    setClaimedRewards((value) => [...value, reward.id])
    logAction(`Passe de Batalha: recompensa ${reward.name} resgatada`)
    setMessage(`${reward.name} recebido! Enviado ao inventário.`)
  }

  // DASHBOARD — persistent rooms are the primary experience.
  function renderDashboard() {
    return (
      <section className="page-content dashboard-home">
        <section className="welcome dashboard-welcome">
          <div>
            <span className="eyebrow">CENTRAL DE OPERAÇÕES</span>
            <h1>Seu centro de mineração.</h1>
            <p>Suas salas são permanentes. Expanda a infraestrutura, organize seus equipamentos e acompanhe seu poder.</p>
          </div>
          <div className="dashboard-level"><span>MINERADOR</span><strong>{String(currentLevel).padStart(2, '0')}</strong><small>NÍVEL</small></div>
        </section>
        <PersistentFacilityPanel mode="dashboard" onManage={() => setPage('Equipamentos')} />
        <PersistentMiningPool compact />
        <LiveEventsPanel />
      </section>
    )
  }

  // EQUIPAMENTOS — rooms, inventory and installation in one place.
  function renderEquipment() {
    return (
      <section className="page-content">
        <span className="eyebrow">INFRAESTRUTURA PERMANENTE</span>
        <h1>Salas e equipamentos</h1>
        <p className="page-description">Gerencie suas salas, equipamentos instalados e itens disponíveis no inventário sem alternar entre telas redundantes.</p>
        <PersistentFacilityPanel mode="management" />
      </section>
    )
  }

  // LOJA
  function renderShop() {
    return (
      <section className="page-content">
        <span className="eyebrow">EXPANDA SUA OPERAÇÃO</span>
        <h1>Loja de equipamentos</h1>
        <p className="page-description">Catálogo oficial conectado à carteira PIX COIN e ao inventário persistente da sua conta.</p>
        <PersistentEquipmentShop />
      </section>
    )
  }

  // CARTEIRA
  function renderWallet() {
    return (
      <section className="page-content">
        <span className="eyebrow">GESTÃO DE RECURSOS</span>
        <h1>Minha carteira</h1>
        <p className="page-description">Acompanhe separadamente o saldo persistente do servidor e os valores de demonstração locais.</p>
        <PersistentWalletPanel />
        <article className="wallet-summary">
          <span>SALDO DO SANDBOX LOCAL</span>
          <strong>{balance.toLocaleString('pt-BR')} PC</strong>
          <small>PIX COIN · MOEDA VIRTUAL DO JOGO</small>
        </article>
        <div className="stats">
          <article className="stat-card">
            <span>TOTAL DE RECOMPENSAS</span>
            <h2>{totalRewards.toLocaleString('pt-BR')} <small>PC</small></h2>
            <p>MINING POOL</p>
          </article>
          <article className="stat-card">
            <span>CICLOS CONCLUÍDOS</span>
            <h2>{cycles}</h2>
            <p>DISTRIBUIÇÕES SIMULADAS</p>
          </article>
        </div>
        <article className="panel page-panel">
          <h2>Histórico de movimentações</h2>
          {history.map((item, index) => (
            <div className="history-item" key={`${item}-${index}`}>
              <span>{item}</span><small>DEMONSTRAÇÃO</small>
            </div>
          ))}
        </article>
      </section>
    )
  }

  // VIP — five-level qualification program; room ownership is independent.
  function renderVip() {
    return (
      <section className="page-content">
        <span className="eyebrow">PROGRAMA DE BENEFÍCIOS</span>
        <h1>VIP</h1>
        <p className="page-description">A qualificação considera recargas elegíveis confirmadas nos 30 dias imediatamente anteriores. Salas compradas com PC são permanentes e não dependem do nível VIP.</p>
        <div className="finance-notice">
          <strong>Integração de qualificação em andamento.</strong>
          <span>Os cinco níveis e benefícios estão definidos. O nível real será calculado pelo ledger de recargas liquidadas, com reversão de estornos e expiração automática da janela. Não há ativação manual nesta tela.</span>
        </div>
        <div className="panel page-panel">
          <div className="panel-heading"><h2>Níveis e benefícios</h2><span className="equipment-count">JANELA MÓVEL · 30 DIAS</span></div>
          <div className="vip-table-wrap"><table className="vip-level-table">
            <thead><tr><th>Nível</th><th>Recargas elegíveis</th><th>XP de missões</th><th>Desconto na tarifa própria*</th><th>Recarga grátis</th><th>Boost HASH</th><th>Energia</th></tr></thead>
            <tbody>{vipProgramLevels.map(level => <tr key={level.tier}><td><strong>{level.tier}</strong></td><td>{level.threshold}</td><td>{level.xp}</td><td>{level.fee}</td><td>{level.recharge}</td><td>{level.hash}</td><td>{level.energy}</td></tr>)}</tbody>
          </table></div>
          <p className="admin-empty">*Desconto limitado a eventual tarifa própria da plataforma. Multiplicadores XP afetam apenas missões. Boost HASH redistribui participação, sem criar orçamento ou MC. Pagamentos e saques reais continuam desativados.</p>
        </div>
      </section>
    )
  }

  // MISSÕES DIÁRIAS E SEMANAIS
  function renderMissions() {
    const currentMissions = refreshMissionState(missionState)
    const renderGroup = (period: 'daily' | 'weekly') => (
      <div className="panel page-panel">
        <div className="panel-heading">
          <h2>{period === 'daily' ? 'Missões diárias' : 'Missões semanais'}</h2>
          <span className="equipment-count">{period === 'daily' ? 'REINÍCIO DIÁRIO' : 'REINÍCIO SEGUNDA-FEIRA'}</span>
        </div>
        <div className="shop-grid">
          {MISSIONS.filter((mission) => mission.period === period).map((mission) => {
            const progress = Math.min(getMissionProgress(currentMissions, mission), mission.target)
            const completed = progress >= mission.target
            const claimed = currentMissions.claimed.includes(mission.id)
            return (
              <article className="panel shop-card" key={mission.id}>
                <span className="eyebrow">{period === 'daily' ? 'DIÁRIA' : 'SEMANAL'}</span>
                <h2>{mission.title}</h2>
                <p>{mission.description}</p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress / mission.target * 100}%` }} />
                </div>
                <div className="pool-footer">
                  <span>Progresso</span>
                  <strong>{progress} / {mission.target}</strong>
                </div>
                {mission.id === 'daily-rewarded-ad' && (
                  <div className="pool-footer">
                    <span>Anúncios assistidos hoje</span>
                    <strong>{missionState.dailyProgress.rewarded_ads ?? 0} / {DAILY_REWARDED_AD_LIMIT}</strong>
                  </div>
                )}
                <div className="pool-footer">
                  <span>Recompensa</span>
                  <strong>{mission.rewardXp} XP do Passe</strong>
                </div>
                {claimed ? <span className="status">✓ RESGATADA</span> : (
                  <button className="primary-button" disabled={!completed} onClick={() => claimMissionReward(mission.id)}>
                    {completed ? 'RESGATAR XP' : 'EM ANDAMENTO'}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      </div>
    )

    return (
      <section className="page-content">
        <span className="eyebrow">CENTRAL DE OBJETIVOS</span>
        <h1>Missões</h1>
        <p className="page-description">Conclua atividades para receber XP do Passe de Batalha. Cada missão diária concluída conta automaticamente como 1 unidade para as metas semanais, mesmo antes do resgate.</p>
        <div className="stats">
          <article className="stat-card"><span>NÍVEL DO PASSE</span><h2>{currentLevel}</h2></article>
          <article className="stat-card"><span>XP DO PASSE</span><h2>{xp.toLocaleString('pt-BR')}</h2></article>
          <article className="stat-card"><span>MISSÕES DIÁRIAS CONCLUÍDAS NA SEMANA</span><h2>{currentMissions.weeklyCompletedDailyMissions}</h2></article>
        </div>
        {renderGroup('daily')}
        <article className="panel page-panel">
          <div className="panel-heading"><h2>Contador semanal</h2><span className="equipment-count">MISSÕES DIÁRIAS CONCLUÍDAS</span></div>
          <p className="page-description">O contador soma cada missão diária uma única vez por dia. As metas são cumulativas: ao chegar a 50, todas as metas anteriores também estarão concluídas.</p>
          <div className="pool-footer"><span>Total nesta semana</span><strong>{currentMissions.weeklyCompletedDailyMissions} / 50</strong></div>
        </article>
        {renderGroup('weekly')}
        <p className="page-description">Recompensas atuais de XP são valores provisórios de balanceamento do sandbox. O progresso permanece salvo neste navegador.</p>
      </section>
    )
  }

  // BATTLE PASS — campaign content is published from Admin Center.
  function renderBattlePass() {
    return (
      <section className="page-content">
        <span className="eyebrow">TEMPORADAS E PROGRESSÃO</span>
        <h1>Passe de Batalha</h1>
        <PersistentProgressPanel userId={userId} />
        <LiveEventsPanel filter="battle_pass" />
        <p className="page-description">As temporadas são criadas, configuradas e ativadas no Admin Center. A loja de níveis e os resgates serão habilitados quando as regras, preços em PC e recompensas forem homologados. Passe não emite MC.</p>
      </section>
    )
  }

  function renderPage() {
    switch (page) {
      case 'Dashboard': return renderDashboard()
      case 'Equipamentos': return renderEquipment()
      case 'Loja': return renderShop()
      case 'Carteira': return renderWallet()
      case 'VIP': return renderVip()
      case 'Passe de Batalha': return renderBattlePass()
      case 'Missões': return renderMissions()
      case 'Jogos': return <Games userId={userId} onGameComplete={(event) => {
        setMissionState((value) => recordMissionProgress(value, event))
      }} />
      default: return renderDashboard()
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">⛏</span>
          <div><h2>MINING PIX</h2><small>DIGITAL MINING</small></div>
        </div>

        <nav>
          <p className="nav-label">MENU PRINCIPAL</p>
          {menu.slice(0, 6).map((item) => (
            <a
              key={item.name}
              className={page === item.name ? 'active' : ''}
              onClick={() => { setPage(item.name); setMessage('') }}
            >
              {item.icon} {item.name}
            </a>
          ))}

          <p className="nav-label">CONTA</p>
          {menu.slice(6).map((item) => (
            <a
              key={item.name}
              className={page === item.name ? 'active' : ''}
              onClick={() => { setPage(item.name); setMessage('') }}
            >
              {item.icon} {item.name}
            </a>
          ))}
        </nav>

        <div className="profile">
          <div className="avatar">{displayName.trim().charAt(0).toUpperCase() || 'M'}</div>
          <div className="profile-identity"><strong>{displayName}</strong><small>{email || currentPlan.name}</small></div>
          <button className="auth-logout-button" onClick={() => { void onSignOut() }} title="Encerrar sessão">SAIR</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="breadcrumb">MINING PIX /</span><strong> {page.toUpperCase()}</strong></div>
          <div className="topbar-actions"><div className="online"><span className="online-dot" /> CONTA CONECTADA · AMBIENTE DEV</div><button className="auth-logout-button mobile-logout" onClick={() => { void onSignOut() }}>SAIR</button></div>
        </header>

        {message && (
          <div className="game-message">
            {message}
            <button onClick={() => setMessage('')}>×</button>
          </div>
        )}

        {renderPage()}

        <footer>MINING PIX © 2026 · AMBIENTE DE DESENVOLVIMENTO</footer>
      </main>
    </div>
  )
}

export default App
