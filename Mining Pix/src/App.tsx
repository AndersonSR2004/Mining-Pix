
import { useEffect, useState } from 'react'
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
  | 'Administração'

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
  { name: 'Equipamentos', icon: '▤' },
  { name: 'Inventário', icon: '▦' },
  { name: 'Loja', icon: '♜' },
  { name: 'Passe de Batalha', icon: '⚔' },
  { name: 'Missões', icon: '◎' },
  { name: 'Carteira', icon: '◉' },
  { name: 'VIP', icon: '♛' },
  { name: 'Administração', icon: '⚙' },
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

function loadSavedState(): SavedState {
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
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
    }
  } catch {
    return fallback
  }
}

function App() {
  const [saved] = useState<SavedState>(loadSavedState)

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
  const [clockNow, setClockNow] = useState(Date.now())

  const [selectedRoomId, setSelectedRoomId] = useState(1)
  const [message, setMessage] = useState('')

  const [adminBalance, setAdminBalance] = useState(String(saved.balance))
  const [adminBalanceMode, setAdminBalanceMode] = useState<'set' | 'add' | 'remove'>('add')
  const [adminVip, setAdminVip] = useState(String(saved.vipTier))
  const [adminXp, setAdminXp] = useState('1000')
  const [adminMachineName, setAdminMachineName] = useState('PIX Miner Admin')
  const [adminMachineHash, setAdminMachineHash] = useState('100')
  const [adminMachinePrice, setAdminMachinePrice] = useState('0')

  const [botName, setBotName] = useState('')
  const [botHashrate, setBotHashrate] = useState('100')
  const [editingBotId, setEditingBotId] = useState<number | null>(null)

  const currentPlan = vipPlans[vipTier]
  const totalCapacity = currentPlan.spaces

  const hashrate = machines.reduce((total, machine) => total + machine.hashrate, 0)

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
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      setMessage('Não foi possível salvar os dados neste navegador.')
    }
  }, [
    balance, machines, inventory, rooms, history, vipTier, poolBudget,
    cycles, totalRewards, poolHistory, bots, xp, premiumPass, claimedRewards, nextCycleAt, missionState,
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

  function updatePoolBudget(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    setPoolBudget(Math.floor(value))
  }

  // Simula a distribuição para o jogador e para todos os bots ativos.
  function simulateMiningCycle() {
    if (networkHashrate <= 0) {
      setMessage('A rede não possui participantes com hashrate ativo.')
      return
    }
    if (poolBudget <= 0) {
      setMessage('Defina um orçamento de recompensas maior que zero.')
      return
    }

    const allocations = distributePoolBudget(poolBudget, [
      { id: 'player', hashrate },
      ...activeBots.map((bot) => ({ id: `bot-${bot.id}`, hashrate: bot.hashrate })),
    ])
    const playerReward = allocations.player ?? 0
    const updatedBots = bots.map((bot) => {
      if (!bot.active || bot.hashrate <= 0) return bot
      const reward = allocations[`bot-${bot.id}`] ?? 0
      return {
        ...bot,
        balance: bot.balance + reward,
        totalRewards: bot.totalRewards + reward,
      }
    })

    const nextCycle = cycles + 1
    const cycle: PoolCycle = {
      id: nextCycle,
      date: new Date().toLocaleString('pt-BR'),
      reward: playerReward,
      participation: participation * 100,
      playerHashrate: hashrate,
      networkHashrate,
      budget: poolBudget,
      botCount: activeBots.length,
    }

    setBalance((value) => value + playerReward)
    setBots(updatedBots)
    setCycles(nextCycle)
    setTotalRewards((value) => value + playerReward)
    setPoolHistory((value) => [cycle, ...value])
    setNextCycleAt(Date.now() + CYCLE_DURATION_MS)
    setClockNow(Date.now())
    const xpEarned = hashrate > 0 ? 100 : 0
    if (xpEarned > 0) {
      setXp((value) => value + xpEarned)
    }
    logAction(`Ciclo ${nextCycle}: +${playerReward.toLocaleString('pt-BR')} PC pela Mining Pool`)
    setMessage(`Ciclo ${nextCycle} concluído! Você recebeu ${playerReward.toLocaleString('pt-BR')} PC.${xpEarned > 0 ? ' XP +100.' : ' Sem XP: instale um equipamento para participar da mineração.'}`)
  }

  // PAINEL ADMINISTRATIVO — controles exclusivos deste sandbox local.
  function applyAdminBalance() {
    const amount = Number(adminBalance)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Informe um valor válido para o saldo.')
      return
    }

    if (adminBalanceMode === 'set') {
      setBalance(amount)
      logAction(`[ADMIN] Saldo definido para ${amount.toLocaleString('pt-BR')} PC`)
    } else if (adminBalanceMode === 'add') {
      setBalance((value) => value + amount)
      logAction(`[ADMIN] Adicionado ${amount.toLocaleString('pt-BR')} PC`)
    } else {
      setBalance((value) => Math.max(0, value - amount))
      logAction(`[ADMIN] Removido até ${amount.toLocaleString('pt-BR')} PC`)
    }

    setMessage('Saldo administrativo atualizado.')
  }

  function applyAdminVip() {
    const tier = Number(adminVip) as VipTier
    if (![0, 1, 2, 3].includes(tier)) return
    activateVip(tier)
  }

  function applyAdminXp() {
    const amount = Number(adminXp)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Informe uma quantidade válida de XP.')
      return
    }
    setXp(amount)
    logAction(`[ADMIN] XP definido para ${amount.toLocaleString('pt-BR')}`)
    setMessage('XP atualizado.')
  }

  function addAdminMachine() {
    const name = adminMachineName.trim()
    const power = Number(adminMachineHash)
    const price = Number(adminMachinePrice)

    if (!name || !Number.isFinite(power) || power <= 0 || !Number.isFinite(price) || price < 0) {
      setMessage('Informe nome, hashrate positivo e preço válido.')
      return
    }

    const machine: Machine = {
      id: nextMachineId(),
      name,
      type: 'Equipamento administrativo',
      hashrate: power,
      price,
      roomId: 0,
    }

    setInventory((value) => [...value, machine])
    logAction(`[ADMIN] ${name} (${power} H/s) adicionado ao inventário`)
    setMessage(`${name} adicionado ao inventário.`)
  }

  function togglePremiumPass() {
    setPremiumPass((value) => !value)
    logAction(`[ADMIN] Passe premium ${premiumPass ? 'desativado' : 'ativado'}`)
    setMessage(`Passe premium ${premiumPass ? 'desativado' : 'ativado'} no sandbox.`)
  }

  function resetSandbox() {
    if (!window.confirm('Isso apagará o progresso local e restaurará o sandbox. Continuar?')) return

    setBalance(10000)
    setMachines(initialMachines)
    setInventory([])
    setRooms(initialRooms)
    setHistory(['Sandbox restaurado. Saldo inicial: 10.000 PC'])
    setVipTier(0)
    setPoolBudget(0)
    setCycles(0)
    setTotalRewards(0)
    setPoolHistory([])
    setBots([])
    setXp(0)
    setPremiumPass(false)
    setClaimedRewards([])
    setMissionState(createMissionState())
    setNextCycleAt(Date.now() + CYCLE_DURATION_MS)
    setClockNow(Date.now())
    setSelectedRoomId(1)
    setMessage('Sandbox restaurado.')
  }

  // BOTS
  function saveBot() {
    const name = botName.trim()
    const power = Number(botHashrate)

    if (!name || !Number.isFinite(power) || power <= 0) {
      setMessage('Informe um nome e um hashrate maior que zero.')
      return
    }

    if (editingBotId !== null) {
      setBots((value) => value.map((bot) =>
        bot.id === editingBotId ? { ...bot, name, hashrate: power } : bot,
      ))
      logAction(`[ADMIN] Bot ${name} atualizado para ${power} H/s`)
      setMessage('Bot atualizado.')
    } else {
      const bot: Bot = {
        id: Date.now(),
        name,
        hashrate: power,
        active: true,
        balance: 0,
        totalRewards: 0,
      }
      setBots((value) => [...value, bot])
      logAction(`[ADMIN] Bot ${name} criado com ${power} H/s`)
      setMessage(`Bot ${name} criado e ativado.`)
    }

    setBotName('')
    setBotHashrate('100')
    setEditingBotId(null)
  }

  function editBot(bot: Bot) {
    setEditingBotId(bot.id)
    setBotName(bot.name)
    setBotHashrate(String(bot.hashrate))
  }

  function deleteBot(bot: Bot) {
    if (!window.confirm(`Excluir o bot ${bot.name}?`)) return
    setBots((value) => value.filter((item) => item.id !== bot.id))
    logAction(`[ADMIN] Bot ${bot.name} excluído`)
    setMessage(`Bot ${bot.name} excluído.`)
    if (editingBotId === bot.id) {
      setEditingBotId(null)
      setBotName('')
      setBotHashrate('100')
    }
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
        <p className="page-description">A rede é calculada automaticamente pela soma dos participantes ativos.</p>

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
          <button className="primary-button" onClick={simulateMiningCycle}>
            SIMULAR DISTRIBUIÇÃO DO CICLO
          </button>
          <p className="page-description">
            A simulação credita sua parte no saldo e registra a parte de cada bot em sua carteira simulada.
            O ciclo equivale a 10 minutos, mas não é executado automaticamente.
          </p>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading">
            <h2>Orçamento da Mining Pool</h2>
            <span className="status">SANDBOX</span>
          </div>
          <div className="history-item">
            <span>Orçamento total por ciclo (PC)</span>
            <input
              type="number"
              min="0"
              step="100"
              value={poolBudget}
              onChange={(event) => updatePoolBudget(Number(event.target.value))}
            />
          </div>
          <p className="page-description">
            O orçamento é um valor fixo definido para o ciclo. O hashrate apenas determina
            a proporção distribuída entre os participantes.
          </p>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading">
            <h2>Participantes da rede</h2>
            <span className="equipment-count">{activeBots.length + 1} participantes</span>
          </div>
          <div className="history-item">
            <div><strong>Você</strong><small>Jogador principal</small></div>
            <strong>{hashrate.toLocaleString('pt-BR')} H/s · {(participation * 100).toFixed(2)}%</strong>
          </div>
          {activeBots.map((bot) => {
            const share = networkHashrate > 0 ? bot.hashrate / networkHashrate * 100 : 0
            return (
              <div className="history-item" key={bot.id}>
                <div><strong>{bot.name}</strong><small>Bot ativo</small></div>
                <strong>{bot.hashrate.toLocaleString('pt-BR')} H/s · {share.toFixed(2)}%</strong>
              </div>
            )
          })}
          {activeBots.length === 0 && (
            <p className="page-description">Nenhum bot ativo. Se você for o único participante com hashrate, terá 100% da rede.</p>
          )}
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
        <p className="page-description">Selecione uma sala para administrar seus equipamentos.</p>

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
        <p className="page-description">Adquira máquinas e encontre-as no inventário.</p>
        <article className="wallet-summary">
          <span>SEU SALDO DISPONÍVEL</span>
          <strong>{balance.toLocaleString('pt-BR')} PC</strong>
        </article>
        <div className="shop-grid">
          {shopMachines.map((machine) => (
            <article className="panel shop-card" key={machine.id}>
              <div className="machine-icon large">▦</div>
              <span className="eyebrow">EQUIPAMENTO DE MINERAÇÃO</span>
              <h2>{machine.name}</h2>
              <p>{machine.type}</p>
              <div className="shop-hash">{machine.hashrate} H/s</div>
              <strong className="shop-price">{machine.price.toLocaleString('pt-BR')} PC</strong>
              <button className="primary-button" onClick={() => buyMachine(machine)}>COMPRAR EQUIPAMENTO</button>
            </article>
          ))}
        </div>
      </section>
    )
  }

  // CARTEIRA
  function renderWallet() {
    return (
      <section className="page-content">
        <span className="eyebrow">GESTÃO DE RECURSOS</span>
        <h1>Minha carteira</h1>
        <p className="page-description">Consulte seu saldo e o histórico de movimentações.</p>
        <article className="wallet-summary">
          <span>SALDO DISPONÍVEL</span>
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

  // ADMINISTRAÇÃO
  function renderAdmin() {
    return (
      <section className="page-content">
        <span className="eyebrow">AMBIENTE DE DESENVOLVIMENTO</span>
        <h1>Painel administrativo</h1>
        <p className="page-description">
          Ferramentas locais para testar saldo, VIP, progressão, equipamentos e cenários da rede.
          As alterações são salvas somente neste navegador.
        </p>

        <div className="stats">
          <article className="stat-card">
            <span>SALDO DO JOGADOR</span>
            <h2>{balance.toLocaleString('pt-BR')} <small>PC</small></h2>
          </article>
          <article className="stat-card">
            <span>HASHRATE DA REDE</span>
            <h2>{networkHashrate.toLocaleString('pt-BR')} <small>H/s</small></h2>
          </article>
          <article className="stat-card">
            <span>BOTS ATIVOS</span>
            <h2>{activeBots.length} <small>/ {bots.length}</small></h2>
          </article>
          <article className="stat-card">
            <span>NÍVEL / XP</span>
            <h2>{currentLevel} <small>· {xp} XP</small></h2>
          </article>
        </div>

        <article className="panel page-panel">
          <div className="panel-heading"><h2>Controle do jogador</h2><span className="status">ADMIN</span></div>
          <div className="history-item">
            <span>Operação de saldo</span>
            <select value={adminBalanceMode} onChange={(event) => setAdminBalanceMode(event.target.value as 'set' | 'add' | 'remove')}>
              <option value="add">Adicionar saldo</option>
              <option value="remove">Remover saldo</option>
              <option value="set">Definir saldo exato</option>
            </select>
          </div>
          <div className="history-item">
            <span>Valor em PC</span>
            <input type="number" min="0" value={adminBalance} onChange={(event) => setAdminBalance(event.target.value)} />
          </div>
          <button className="primary-button" onClick={applyAdminBalance}>APLICAR ALTERAÇÃO DE SALDO</button>

          <div className="history-item">
            <span>Alterar plano VIP</span>
            <select value={adminVip} onChange={(event) => setAdminVip(event.target.value)}>
              {vipPlans.map((plan) => <option key={plan.tier} value={plan.tier}>{plan.name}</option>)}
            </select>
          </div>
          <button className="primary-button" onClick={applyAdminVip}>APLICAR VIP</button>

          <div className="history-item">
            <span>Definir XP total</span>
            <input type="number" min="0" value={adminXp} onChange={(event) => setAdminXp(event.target.value)} />
          </div>
          <button className="primary-button" onClick={applyAdminXp}>ATUALIZAR XP E NÍVEL</button>

          <div className="history-item">
            <span>Passe de batalha premium</span>
            <strong>{premiumPass ? 'ATIVADO' : 'DESATIVADO'}</strong>
          </div>
          <button className="secondary-button" onClick={togglePremiumPass}>
            {premiumPass ? 'DESATIVAR PASSE PREMIUM' : 'ATIVAR PASSE PREMIUM'}
          </button>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading"><h2>Adicionar equipamento</h2><span className="equipment-count">INVENTÁRIO</span></div>
          <div className="history-item">
            <span>Nome do equipamento</span>
            <input value={adminMachineName} onChange={(event) => setAdminMachineName(event.target.value)} />
          </div>
          <div className="history-item">
            <span>Hashrate (H/s)</span>
            <input type="number" min="1" value={adminMachineHash} onChange={(event) => setAdminMachineHash(event.target.value)} />
          </div>
          <div className="history-item">
            <span>Preço-base (PC)</span>
            <input type="number" min="0" value={adminMachinePrice} onChange={(event) => setAdminMachinePrice(event.target.value)} />
          </div>
          <button className="primary-button" onClick={addAdminMachine}>ADICIONAR AO INVENTÁRIO</button>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">SIMULADOR MULTIPLAYER</span><h2>Gerenciamento de bots</h2></div>
            <span className="equipment-count">{bots.length} bots</span>
          </div>
          <p className="page-description">Crie participantes artificiais para simular concorrência na rede. Bots ativos entram no cálculo do hashrate e recebem sua parcela do orçamento.</p>

          <div className="history-item">
            <span>Nome do bot</span>
            <input value={botName} placeholder="Ex.: Bot 01" onChange={(event) => setBotName(event.target.value)} />
          </div>
          <div className="history-item">
            <span>Hashrate do bot (H/s)</span>
            <input type="number" min="1" value={botHashrate} onChange={(event) => setBotHashrate(event.target.value)} />
          </div>
          <button className="primary-button" onClick={saveBot}>
            {editingBotId === null ? 'CRIAR BOT' : 'SALVAR ALTERAÇÕES DO BOT'}
          </button>
          {editingBotId !== null && (
            <button className="secondary-button" onClick={() => { setEditingBotId(null); setBotName(''); setBotHashrate('100') }}>
              CANCELAR EDIÇÃO
            </button>
          )}

          {bots.length === 0 ? (
            <p className="page-description">Nenhum bot cadastrado. Crie seu primeiro participante para testar a rede.</p>
          ) : bots.map((bot) => {
            const share = networkHashrate > 0 && bot.active ? bot.hashrate / networkHashrate * 100 : 0
            return (
              <div className="panel" key={bot.id} style={{ marginTop: 12, padding: 16 }}>
                <div className="panel-heading">
                  <div><strong>{bot.name}</strong><p className="page-description">{bot.hashrate.toLocaleString('pt-BR')} H/s · {bot.active ? `${share.toFixed(2)}% da rede` : 'INATIVO'}</p></div>
                  <span className={bot.active ? 'status' : 'equipment-count'}>{bot.active ? '● ATIVO' : '○ INATIVO'}</span>
                </div>
                <div className="pool-footer">
                  <span>Saldo simulado do bot</span>
                  <strong>{bot.balance.toLocaleString('pt-BR')} PC</strong>
                </div>
                <div className="pool-footer">
                  <span>Total recebido</span>
                  <strong>{bot.totalRewards.toLocaleString('pt-BR')} PC</strong>
                </div>
                <button className="secondary-button" onClick={() => setBots((value) => value.map((item) => item.id === bot.id ? { ...item, active: !item.active } : item))}>
                  {bot.active ? 'DESATIVAR BOT' : 'ATIVAR BOT'}
                </button>
                <button className="secondary-button" onClick={() => editBot(bot)}>EDITAR</button>
                <button className="dismantle-button" onClick={() => deleteBot(bot)}>EXCLUIR BOT</button>
              </div>
            )
          })}
        </article>

        <article className="panel page-panel">
          <div className="panel-heading"><h2>Parâmetros da simulação</h2><span className="status">REDE DINÂMICA</span></div>
          <div className="pool-footer"><span>Hashrate do jogador</span><strong>{hashrate.toLocaleString('pt-BR')} H/s</strong></div>
          <div className="pool-footer"><span>Hashrate dos bots ativos</span><strong>{botsHashrate.toLocaleString('pt-BR')} H/s</strong></div>
          <div className="pool-footer"><span>Hashrate total calculado</span><strong>{networkHashrate.toLocaleString('pt-BR')} H/s</strong></div>
          <div className="pool-footer"><span>Participação do jogador</span><strong>{(participation * 100).toFixed(4)}%</strong></div>
          <div className="history-item">
            <span>Orçamento total por ciclo (PC)</span>
            <input type="number" min="0" value={poolBudget} onChange={(event) => updatePoolBudget(Number(event.target.value))} />
          </div>
          <button className="primary-button" onClick={simulateMiningCycle}>EXECUTAR CICLO DE SIMULAÇÃO</button>
          <p className="page-description">O orçamento é distribuído integralmente entre os participantes elegíveis pelo método dos maiores restos. As recompensas simuladas não representam pagamentos reais.</p>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading"><h2>Simulador de eventos das missões</h2><span className="status">SANDBOX / QA</span></div>
          <p className="page-description">Use estes controles apenas para testar o progresso. Eles simulam eventos concluídos; não substituem partidas reais, anúncios validados, recargas ou pagamentos.</p>
          <button className="secondary-button" onClick={() => recordMissionEvent('flappy_games')}>SIMULAR 1 PARTIDA CONCLUÍDA — FLAPPY BIRD</button>
          <button className="secondary-button" onClick={() => recordMissionEvent('snake_games')}>SIMULAR 1 PARTIDA CONCLUÍDA — COBRINHA</button>
          <button className="secondary-button" onClick={() => recordMissionEvent('ad_lucky_boxes')}>SIMULAR 1 LUCKY BOX OBTIDA POR ANÚNCIO E ABERTA</button>
          <button className="secondary-button" onClick={() => recordMissionEvent('room_energy_recharges')}>SIMULAR 1 RECARGA DE ENERGIA CONCLUÍDA</button>
          <button className="secondary-button" onClick={() => recordMissionEvent('pix_coin_purchased', 100)}>SIMULAR COMPRA CONFIRMADA DE 100 PIX COIN</button>
          <button className="secondary-button" onClick={simulatePaidLuckyBoxPurchase}>SIMULAR COMPRA DE LUCKY BOX PAGA — 100 PC</button>
          <button className="secondary-button" onClick={simulateRewardedAd}>SIMULAR ANÚNCIO RECOMPENSADO — +10 PC (MÁX. 5/DIA)</button>
          <p className="page-description">O login diário é registrado automaticamente ao abrir o jogo. Os dois controles novos simulam compras e anúncios; não representam transações ou publicidade reais.</p>
        </article>

        <article className="panel page-panel">
          <div className="panel-heading"><h2>Ferramentas de manutenção</h2><span className="status">CUIDADO</span></div>
          <p className="page-description">Restaurar o sandbox apaga saldo, equipamentos, bots, XP, VIP e histórico armazenados neste navegador.</p>
          <button className="dismantle-button" onClick={resetSandbox}>RESTAURAR SANDBOX COMPLETO</button>
        </article>
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
      case 'Administração': return renderAdmin()
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
          <div className="avatar">A</div>
          <div><strong>Minerador</strong><small>{currentPlan.name}</small></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="breadcrumb">MINING PIX /</span><strong> {page.toUpperCase()}</strong></div>
          <div className="online"><span className="online-dot" /> SISTEMA ONLINE</div>
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
