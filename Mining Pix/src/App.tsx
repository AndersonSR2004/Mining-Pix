
import { useEffect, useState } from 'react'
import Games from './Games.tsx'
import PersistentWalletPanel from './PersistentWalletPanel.tsx'
import PersistentEquipmentShop from './PersistentEquipmentShop.tsx'
import PersistentFacilityPanel from './PersistentFacilityPanel.tsx'
import PersistentMiningPool from './PersistentMiningPool.tsx'
import { distributePoolBudget } from './lib/pool.ts'
import { createMissionState, DAILY_REWARDED_AD_LIMIT, getMissionProgress, MISSIONS, PAID_LUCKY_BOX_PRICE, recordMissionProgress, refreshMissionState, REWARDED_AD_PC_REWARD, type MissionEvent, type MissionState } from './lib/missions.ts'
import './App.css'

type Page =
  | 'Dashboard'
  | 'Mineração'
  | 'Equipamentos'
  | 'Inventário'
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

const shopMachines = [
  {
    id: 2,
    name: 'PIX Miner II',
    type: 'Equipamento intermediário',
    hashrate: 250,
    price: 2500,
  },
  {
    id: 3,
    name: 'PIX Miner III',
    type: 'Equipamento avançado',
    hashrate: 600,
    price: 5000,
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
  { name: 'Mineração', icon: '▣' },
  { name: 'Jogos', icon: '🎮' },
  { name: 'Equipamentos', icon: '▤' },
  { name: 'Inventário', icon: '▦' },
  { name: 'Loja', icon: '♜' },
  { name: 'Passe de Batalha', icon: '⚔' },
  { name: 'Missões', icon: '◎' },
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

  const [poolBudget, setPoolBudget] = useState(saved.poolBudget)
  const [cycles, setCycles] = useState(saved.cycles)
  const [totalRewards, setTotalRewards] = useState(saved.totalRewards)
  const [poolHistory, setPoolHistory] = useState<PoolCycle[]>(saved.poolHistory)
  const [bots, setBots] = useState<Bot[]>(saved.bots)

  const [xp, setXp] = useState(saved.xp)
  const [premiumPass, setPremiumPass] = useState(saved.premiumPass)
  const [claimedRewards, setClaimedRewards] = useState<string[]>(saved.claimedRewards)
  const [nextCycleAt, setNextCycleAt] = useState(saved.nextCycleAt)
  const [missionState, setMissionState] = useState(saved.missionState)
  const [temporaryHash, setTemporaryHash] = useState(saved.temporaryHash)
  const [temporaryHashExpiresAt, setTemporaryHashExpiresAt] = useState(saved.temporaryHashExpiresAt)
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

  function nextMachineId() {
    return Math.max(Date.now(), ...[...machines, ...inventory].map((item) => item.id + 1))
  }

  function buyMachine(machine: (typeof shopMachines)[number]) {
    if (balance < machine.price) {
      setMessage('Saldo insuficiente para esta compra.')
      return
    }

    const newMachine: Machine = { ...machine, id: nextMachineId(), roomId: 0 }
    setBalance((value) => value - machine.price)
    setInventory((value) => [...value, newMachine])
    logAction(`Compra de ${machine.name}: -${machine.price.toLocaleString('pt-BR')} PC`)
    setMessage(`${machine.name} adquirido e enviado ao inventário!`)
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

  function recordMissionEvent(event: MissionEvent, amount = 1) {
    setMissionState((value) => recordMissionProgress(value, event, amount))
    setMessage('Evento de missão registrado no sandbox. Confira o progresso na página Missões.')
  }

  function simulatePaidLuckyBoxPurchase() {
    if (balance < PAID_LUCKY_BOX_PRICE) {
      setMessage(`Saldo insuficiente. Uma Lucky Box paga custa ${PAID_LUCKY_BOX_PRICE} PC.`)
      return
    }
    setBalance((value) => value - PAID_LUCKY_BOX_PRICE)
    recordMissionEvent('paid_lucky_boxes')
    logAction(`Compra simulada de Lucky Box paga: -${PAID_LUCKY_BOX_PRICE} PC`)
    setMessage('Compra simulada concluída: -100 PC. A missão de Lucky Box paga foi atualizada.')
  }

  function simulateRewardedAd() {
    if ((missionState.dailyProgress.rewarded_ads ?? 0) >= DAILY_REWARDED_AD_LIMIT) {
      setMessage('Limite diário de 5 anúncios atingido.')
      return
    }
    setBalance((value) => value + REWARDED_AD_PC_REWARD)
    recordMissionEvent('rewarded_ads')
    logAction(`Anúncio recompensado simulado: +${REWARDED_AD_PC_REWARD} PC`)
    setMessage(`Anúncio simulado concluído: +${REWARDED_AD_PC_REWARD} PC. Limite diário: ${DAILY_REWARDED_AD_LIMIT} anúncios.`)
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
      setMessage('Esta recompensa está bloqueada. Ative o passe premium no painel administrativo.')
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

  // DASHBOARD
  function renderDashboard() {
    return (
      <>
        <section className="welcome">
          <div>
            <span className="eyebrow">CENTRAL DE OPERAÇÕES</span>
            <h1>Bem-vindo à mineração.</h1>
            <p>Gerencie seus equipamentos e acompanhe sua participação na rede.</p>
          </div>
          <div className="level">
            <span>NÍVEL DO MINERADOR</span>
            <strong>{String(currentLevel).padStart(2, '0')}</strong>
            <small>MINERADOR</small>
          </div>
        </section>

        <section className="stats">
          <article className="stat-card">
            <span>SALDO DISPONÍVEL</span>
            <h2>{balance.toLocaleString('pt-BR')} <small>PC</small></h2>
            <p>PIX COIN</p>
          </article>
          <article className="stat-card">
            <span>PODER DE MINERAÇÃO</span>
            <h2>{hashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
            <p>HASHRATE DO JOGADOR</p>
          </article>
          <article className="stat-card">
            <span>EQUIPAMENTOS</span>
            <h2>{machines.length} <small>/ {totalCapacity}</small></h2>
            <p>ESPAÇOS OCUPADOS</p>
          </article>
          <article className="stat-card">
            <span>PLANO ATUAL</span>
            <h2>{currentPlan.name}</h2>
            <p>{rooms.length} SALA(S) DISPONÍVEL(IS)</p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">REDE GLOBAL</span>
                <h2>Mining Pool</h2>
              </div>
              <span className="status">● SANDBOX</span>
            </div>
            <div className="pool-value">
              <span>SUA PARTICIPAÇÃO NA REDE</span>
              <h2>{(participation * 100).toFixed(4)} <small>%</small></h2>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${participation * 100}%` }} />
            </div>
            <div className="pool-footer">
              <span>Recompensa estimada</span>
              <strong>{estimatedReward.toLocaleString('pt-BR')} PC</strong>
            </div>
            <div className="pool-footer">
              <span>Hashrate total da rede</span>
              <strong>{networkHashrate.toLocaleString('pt-BR')} H/s</strong>
            </div>
            <div className="pool-footer">
              <span>Próximo ciclo de referência</span>
              <strong>{cycleReady ? 'CICLO DISPONÍVEL' : countdownLabel}</strong>
            </div>
            <button className="primary-button" onClick={() => setPage('Mineração')}>
              ACESSAR MINERAÇÃO →
            </button>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SUA INFRAESTRUTURA</span>
                <h2>Salas de mineração</h2>
              </div>
              <span className="equipment-count">{rooms.length} / 4</span>
            </div>
            {rooms.map((room) => {
              const list = machines.filter((item) => item.roomId === room.id)
              const power = list.reduce((total, item) => total + item.hashrate, 0)
              return (
                <div className="machine" key={room.id}>
                  <div className="machine-icon">▦</div>
                  <div className="machine-info">
                    <strong>{room.name}</strong>
                    <span>{list.length} / {room.capacity} espaços</span>
                    <small>{power.toLocaleString('pt-BR')} H/s</small>
                  </div>
                  <span className="machine-status">ATIVA</span>
                </div>
              )
            })}
            <button className="secondary-button" onClick={() => setPage('Equipamentos')}>
              GERENCIAR SALAS →
            </button>
          </article>
        </section>
      </>
    )
  }

  // MINERAÇÃO
  function renderMining() {
    return (
      <section className="page-content">
        <span className="eyebrow">REDE GLOBAL</span>
        <h1>Central de mineração</h1>
        <p className="page-description">Os dados do simulador local e da infraestrutura persistente são apresentados separadamente.</p>
        <PersistentFacilityPanel mode="summary" />
        <PersistentMiningPool />

        <div className="sandbox-section-label">
          <span className="eyebrow">SIMULADOR LOCAL · SANDBOX</span>
          <p className="page-description">As métricas abaixo pertencem ao ambiente demonstrativo deste navegador.</p>
        </div>
        <div className="stats">
          <article className="stat-card">
            <span>HASHRATE DO JOGADOR</span>
            <h2>{hashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
          </article>
          <article className="stat-card">
            <span>HASHRATE DOS BOTS</span>
            <h2>{botsHashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
          </article>
          <article className="stat-card">
            <span>HASHRATE DA REDE</span>
            <h2>{networkHashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
          </article>
          <article className="stat-card">
            <span>SUA PARTICIPAÇÃO</span>
            <h2>{(participation * 100).toFixed(2)} <small>%</small></h2>
          </article>
        </div>

        <article className="panel page-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DISTRIBUIÇÃO COLETIVA</span>
              <h2>Mining Pool</h2>
            </div>
            <span className="status">● SIMULAÇÃO</span>
          </div>
          <div className="pool-value">
            <span>SUA PARTICIPAÇÃO ESTIMADA</span>
            <h2>{(participation * 100).toFixed(4)} <small>%</small></h2>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${participation * 100}%` }} />
          </div>
          <div className="pool-footer">
            <span>Seu poder computacional</span>
            <strong>{hashrate.toLocaleString('pt-BR')} H/s</strong>
          </div>
          <div className="pool-footer">
            <span>Poder dos bots ativos</span>
            <strong>{botsHashrate.toLocaleString('pt-BR')} H/s</strong>
          </div>
          <div className="pool-footer">
            <span>Poder total da rede</span>
            <strong>{networkHashrate.toLocaleString('pt-BR')} H/s</strong>
          </div>
          <div className="pool-footer">
            <span>Orçamento por ciclo</span>
            <strong>{poolBudget.toLocaleString('pt-BR')} PC</strong>
          </div>
          <div className="pool-footer">
            <span>Recompensa estimada para você</span>
            <strong>{estimatedReward.toLocaleString('pt-BR')} PC</strong>
          </div>
          <div className="pool-footer">
            <span>Próximo ciclo de referência</span>
            <strong>{cycleReady ? 'CICLO DISPONÍVEL' : countdownLabel}</strong>
          </div>
          <p className="page-description">A distribuição desta rede demonstrativa não emite recompensas nesta tela. O saldo persistente e os ciclos oficiais são consultados separadamente acima.</p>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading">
            <h2>Histórico da Mining Pool</h2>
            <span className="equipment-count">{poolHistory.length} ciclos</span>
          </div>
          {poolHistory.length === 0 ? (
            <p className="page-description">Nenhuma distribuição realizada ainda.</p>
          ) : poolHistory.slice(0, 20).map((cycle) => (
            <div className="history-item" key={cycle.id}>
              <div>
                <strong>Ciclo #{cycle.id}</strong>
                <small>{cycle.date} · {cycle.botCount} bots</small>
              </div>
              <div>
                <strong>+{cycle.reward.toLocaleString('pt-BR')} PC</strong>
                <small>{cycle.participation.toFixed(4)}% · rede {cycle.networkHashrate.toLocaleString('pt-BR')} H/s</small>
              </div>
            </div>
          ))}
        </article>
      </section>
    )
  }

  // EQUIPAMENTOS
  function renderEquipment() {
    return (
      <section className="page-content">
        <span className="eyebrow">SUA INFRAESTRUTURA</span>
        <h1>Gerenciamento de salas</h1>
        <p className="page-description">A infraestrutura da conta é administrada no PostgreSQL. O simulador local permanece separado.</p>
        <PersistentFacilityPanel mode="management" />

        <div className="sandbox-section-label">
          <span className="eyebrow">GERENCIAMENTO LOCAL · SANDBOX</span>
          <p className="page-description">Salas e máquinas abaixo pertencem apenas ao simulador demonstrativo deste navegador.</p>
        </div>
        <div className="stats">
          <article className="stat-card">
            <span>HASHRATE DO JOGADOR</span>
            <h2>{hashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
          </article>
          <article className="stat-card">
            <span>SALAS DISPONÍVEIS</span>
            <h2>{rooms.length} <small>/ 4</small></h2>
          </article>
          <article className="stat-card">
            <span>ESPAÇOS OCUPADOS</span>
            <h2>{machines.length} <small>/ {totalCapacity}</small></h2>
          </article>
        </div>

        <article className="panel page-panel">
          <div className="panel-heading">
            <h2>Minhas salas</h2>
            <span className="status">{currentPlan.name}</span>
          </div>
          <div className="shop-grid">
            {rooms.map((room) => {
              const list = machines.filter((item) => item.roomId === room.id)
              const power = list.reduce((total, item) => total + item.hashrate, 0)
              const selected = selectedRoomId === room.id
              return (
                <article className="panel shop-card" key={room.id} style={{ border: selected ? '1px solid #37d67a' : undefined }}>
                  <div className="machine-icon large">▦</div>
                  <span className="eyebrow">SALA DE MINERAÇÃO</span>
                  <h2>{room.name}</h2>
                  <div className="shop-hash">{list.length} / {room.capacity} espaços</div>
                  <p>{power.toLocaleString('pt-BR')} H/s</p>
                  <button className={selected ? 'primary-button' : 'secondary-button'} onClick={() => setSelectedRoomId(room.id)}>
                    {selected ? 'SALA SELECIONADA' : 'GERENCIAR SALA'}
                  </button>
                  <button className="secondary-button" onClick={() => renameRoom(room)}>RENOMEAR SALA</button>
                </article>
              )
            })}
          </div>
        </article>

        {selectedRoom && (
          <>
            <article className="panel page-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">SALA SELECIONADA</span><h2>{selectedRoom.name}</h2></div>
                <span className="equipment-count">{roomMachines.length} / {selectedRoom.capacity}</span>
              </div>
              <div className="pool-value">
                <span>HASHRATE DA SALA</span>
                <h2>{roomHashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(roomMachines.length / selectedRoom.capacity * 100, 100)}%` }} />
              </div>
            </article>

            <div className="machine-list">
              {roomMachines.length === 0 ? (
                <article className="panel">
                  <p className="page-description">Esta sala ainda não possui equipamentos instalados.</p>
                  <button className="primary-button" onClick={() => setPage('Inventário')}>ABRIR INVENTÁRIO →</button>
                </article>
              ) : roomMachines.map((machine) => (
                <article className="panel machine-card" key={machine.id}>
                  <div className="machine-icon large">▦</div>
                  <div className="machine-info">
                    <strong>{machine.name}</strong>
                    <span>{machine.type}</span>
                    <small>{machine.hashrate} H/s</small>
                  </div>
                  <select value={machine.roomId} onChange={(event) => transferMachine(machine, Number(event.target.value))}>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                  <button className="secondary-button" onClick={() => uninstallMachine(machine)}>DESINSTALAR</button>
                  <button className="dismantle-button" onClick={() => dismantleMachine(machine, 'installed')}>DESMONTAR</button>
                </article>
              ))}
            </div>
          </>
        )}
        <button className="primary-button page-action" onClick={() => setPage('Inventário')}>INSTALAR EQUIPAMENTOS →</button>
      </section>
    )
  }

  // INVENTÁRIO
  function renderInventory() {
    return (
      <section className="page-content">
        <span className="eyebrow">GERENCIAMENTO</span>
        <h1>Inventário</h1>
        <p className="page-description">Seus equipamentos disponíveis para instalação.</p>
        <article className="panel page-panel">
          <div className="panel-heading">
            <h2>Equipamentos disponíveis</h2>
            <span className="equipment-count">{inventory.length} itens</span>
          </div>
          {inventory.length === 0 ? (
            <p className="page-description">Seu inventário está vazio. Visite a loja para adquirir equipamentos.</p>
          ) : (
            <>
              <div className="history-item">
                <span>Selecionar sala de instalação</span>
                <select value={selectedRoomId} onChange={(event) => setSelectedRoomId(Number(event.target.value))}>
                  {rooms.map((room) => {
                    const occupied = machines.filter((item) => item.roomId === room.id).length
                    return <option key={room.id} value={room.id}>{room.name} ({occupied}/{room.capacity})</option>
                  })}
                </select>
              </div>
              {inventory.map((machine) => (
                <div className="machine" key={machine.id}>
                  <div className="machine-icon">▦</div>
                  <div className="machine-info">
                    <strong>{machine.name}</strong>
                    <span>{machine.type}</span>
                    <small>{machine.hashrate} H/s</small>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => installMachine(machine)}
                    disabled={!selectedRoom || machines.filter((item) => item.roomId === selectedRoomId).length >= selectedRoom.capacity}
                  >
                    INSTALAR EQUIPAMENTO
                  </button>
                  <button className="dismantle-button" onClick={() => dismantleMachine(machine, 'inventory')}>DESMONTAR</button>
                </div>
              ))}
            </>
          )}
        </article>
      </section>
    )
  }

  // LOJA
  function renderShop() {
    return (
      <section className="page-content">
        <span className="eyebrow">EXPANDA SUA OPERAÇÃO</span>
        <h1>Loja de equipamentos</h1>
        <p className="page-description">Compras oficiais usam a carteira persistente; o sandbox permanece separado.</p>
        <PersistentEquipmentShop />
        <section className="sandbox-store">
          <span className="eyebrow">AMBIENTE DE TESTES</span>
          <h2>Loja demonstrativa (sandbox)</h2>
          <p className="page-description">Estas compras alteram somente o saldo e o inventário locais deste navegador. Não geram transações persistentes.</p>
          <article className="wallet-summary">
            <span>SALDO DEMONSTRATIVO DO SANDBOX</span>
            <strong>{balance.toLocaleString('pt-BR')} PC</strong>
          </article>
          <div className="shop-grid">
            {shopMachines.map((machine) => (
              <article className="panel shop-card" key={machine.id}>
                <div className="machine-icon large">▦</div>
                <span className="eyebrow">EQUIPAMENTO DE TESTE</span>
                <h3>{machine.name}</h3>
                <p>{machine.type}</p>
                <div className="shop-hash">{machine.hashrate} H/s</div>
                <strong className="shop-price">{machine.price.toLocaleString('pt-BR')} PC</strong>
                <button className="primary-button" onClick={() => buyMachine(machine)}>COMPRAR NO SANDBOX</button>
              </article>
            ))}
          </div>
        </section>
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

  // VIP
  function renderVip() {
    return (
      <section className="page-content">
        <span className="eyebrow">PROGRESSÃO PREMIUM</span>
        <h1>VIP e benefícios</h1>
        <p className="page-description">A ativação abaixo é demonstrativa.</p>
        <article className="wallet-summary">
          <span>SEU PLANO ATUAL</span>
          <strong>{currentPlan.name}</strong>
          <small>{currentPlan.rooms} salas · {currentPlan.spaces} espaços</small>
        </article>
        <div className="shop-grid">
          {vipPlans.map((plan) => {
            const active = vipTier === plan.tier
            return (
              <article className="panel shop-card" key={plan.tier} style={{ border: active ? '1px solid #37d67a' : undefined }}>
                <span className="eyebrow">{plan.tier === 0 ? 'PLANO GRATUITO' : 'PLANO PREMIUM'}</span>
                <h2>{plan.name}</h2>
                <div className="shop-hash">{plan.rooms} salas</div>
                <p>{plan.spaces} espaços totais</p>
                <p>10 equipamentos por sala</p>
                {active ? <span className="status">● PLANO ATUAL</span> : (
                  <button className="primary-button" onClick={() => activateVip(plan.tier)}>TESTAR ESTE PLANO</button>
                )}
              </article>
            )
          })}
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

  // PASSE DE BATALHA
  function renderBattlePass() {
    return (
      <section className="page-content">
        <span className="eyebrow">TEMPORADA DE TESTES</span>
        <h1>Passe de Batalha</h1>
        <p className="page-description">Avance de nível, acumule XP e desbloqueie equipamentos nas duas trilhas.</p>

        <article className="panel page-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">SUA PROGRESSÃO</span><h2>Nível {currentLevel}</h2></div>
            <span className="equipment-count">{xp.toLocaleString('pt-BR')} XP</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${levelProgress}%` }} />
          </div>
          <div className="pool-footer">
            <span>Progresso para o próximo nível</span>
            <strong>{(xp % XP_PER_LEVEL).toLocaleString('pt-BR')} / {XP_PER_LEVEL} XP</strong>
          </div>
          <div className="pool-footer">
            <span>XP restante</span>
            <strong>{Math.max(0, nextLevelXp - xp).toLocaleString('pt-BR')}</strong>
          </div>
          <div className="pool-footer">
            <span>Trilha premium</span>
            <strong>{premiumPass ? 'ATIVADA' : 'BLOQUEADA'}</strong>
          </div>
          <p className="page-description">Cada ciclo simulado da Mining Pool concede 100 XP nesta versão de testes.</p>
        </article>

        <div className="panel page-panel">
          <div className="panel-heading">
            <h2>Trilha gratuita</h2>
            <span className="status">FREE · 3 MÁQUINAS</span>
          </div>
          <div className="shop-grid">
            {battleRewards.filter((reward) => reward.track === 'free').map((reward) => {
              const claimed = claimedRewards.includes(reward.id)
              const unlocked = currentLevel >= reward.level
              return (
                <article className="panel shop-card" key={reward.id}>
                  <span className="eyebrow">NÍVEL {reward.level}</span>
                  <div className="machine-icon large">▦</div>
                  <h2>{reward.name}</h2>
                  <div className="shop-hash">{reward.hashrate} H/s</div>
                  <p>Equipamento gratuito</p>
                  {claimed ? <span className="status">✓ RESGATADO</span> : (
                    <button className="primary-button" disabled={!unlocked} onClick={() => claimBattleReward(reward)}>
                      {unlocked ? 'RESGATAR' : 'BLOQUEADO'}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </div>

        <div className="panel page-panel">
          <div className="panel-heading">
            <h2>Trilha premium</h2>
            <span className="equipment-count">PREMIUM · 10 MÁQUINAS</span>
          </div>
          {!premiumPass && (
            <p className="page-description">As recompensas desta trilha ficam bloqueadas para jogadores Free. No sandbox, o administrador pode ativar o passe.</p>
          )}
          <div className="shop-grid">
            {battleRewards.filter((reward) => reward.track === 'premium').map((reward) => {
              const claimed = claimedRewards.includes(reward.id)
              const unlocked = currentLevel >= reward.level
              return (
                <article className="panel shop-card" key={reward.id} style={{ opacity: premiumPass ? 1 : 0.7 }}>
                  <span className="eyebrow">NÍVEL {reward.level}</span>
                  <div className="machine-icon large">{premiumPass ? '▦' : '🔒'}</div>
                  <h2>{reward.name}</h2>
                  <div className="shop-hash">{reward.hashrate} H/s</div>
                  <p>Recompensa premium</p>
                  {claimed ? <span className="status">✓ RESGATADO</span> : (
                    <button
                      className="primary-button"
                      disabled={!premiumPass || !unlocked}
                      onClick={() => claimBattleReward(reward)}
                    >
                      {!premiumPass ? 'PASSE BLOQUEADO' : unlocked ? 'RESGATAR' : 'NÍVEL BLOQUEADO'}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  function renderPage() {
    switch (page) {
      case 'Dashboard': return renderDashboard()
      case 'Mineração': return renderMining()
      case 'Equipamentos': return renderEquipment()
      case 'Inventário': return renderInventory()
      case 'Loja': return renderShop()
      case 'Carteira': return renderWallet()
      case 'VIP': return renderVip()
      case 'Passe de Batalha': return renderBattlePass()
      case 'Missões': return renderMissions()
      case 'Jogos': return <Games userId={userId} onGameComplete={(event, won) => {
        setMissionState((value) => recordMissionProgress(value, event))
        const now = Date.now()
        if (won) {
          setBalance((value) => value + 1)
          setTemporaryHash(activeTemporaryHash + 1)
          logAction(`Vitória em ${event}: +1 PC e +1 H/s temporário`)
          setMessage('Vitória! +1 PIX COIN e +1 H/s temporário por 24 horas.')
        } else {
          logAction(`Partida concluída em ${event}: sem recompensa de vitória`)
          setMessage('Partida concluída. A missão foi atualizada; não houve recompensa de vitória.')
        }
        if (activeTemporaryHash > 0 || won) setTemporaryHashExpiresAt(now + 24 * 60 * 60 * 1000)
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
          {menu.slice(0, 7).map((item) => (
            <a
              key={item.name}
              className={page === item.name ? 'active' : ''}
              onClick={() => { setPage(item.name); setMessage('') }}
            >
              {item.icon} {item.name}
            </a>
          ))}

          <p className="nav-label">CONTA</p>
          {menu.slice(7).map((item) => (
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
          <div className="topbar-actions"><div className="online"><span className="online-dot" /> CONTA CONECTADA · SANDBOX LOCAL</div><button className="auth-logout-button mobile-logout" onClick={() => { void onSignOut() }}>SAIR</button></div>
        </header>

        {message && (
          <div className="game-message">
            {message}
            <button onClick={() => setMessage('')}>×</button>
          </div>
        )}

        {renderPage()}

        <footer>MINING PIX © 2026 · AMBIENTE DE DESENVOLVIMENTO · SANDBOX</footer>
      </main>
    </div>
  )
}

export default App
