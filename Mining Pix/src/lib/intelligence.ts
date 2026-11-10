export type EconomyBot = {
  id: number
  name: string
  hashrate: number
  active: boolean
  balance: number
  totalRewards: number
}

export type EconomyCycle = {
  id: number
  date: string
  reward: number
  participation: number
  playerHashrate: number
  networkHashrate: number
  budget: number
  botCount: number
}

export type EconomySnapshot = {
  balance: number
  totalRewards: number
  bots: EconomyBot[]
  poolHistory: EconomyCycle[]
}

export type EconomyMetrics = {
  visibleWalletSupply: number
  botWalletSupply: number
  playerWalletShare: number
  recordedPoolBudget: number
  recordedDistributedRewards: number
  averageCycleBudget: number
  latestCycleBudget: number
  cyclesAnalyzed: number
  activeBots: number
  largestBotBalanceShare: number
}

export type IntegrityIssue = {
  id: string
  severity: 'error' | 'warning'
  title: string
  detail: string
}

export type IntegritySnapshot = {
  balance: number
  machines: Array<{ id: number; name: string; hashrate: number; price: number; roomId: number }>
  inventory: Array<{ id: number; name: string; hashrate: number; price: number; roomId: number }>
  rooms: Array<{ id: number; name: string; capacity: number }>
  bots: EconomyBot[]
  poolHistory: EconomyCycle[]
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/** Describes only the balances and events visible in this browser's sandbox. */
export function analyzeEconomy(snapshot: EconomySnapshot): EconomyMetrics {
  const botWalletSupply = snapshot.bots.reduce(
    (sum, bot) => sum + (isNonNegativeFinite(bot.balance) ? bot.balance : 0),
    0,
  )
  const visibleWalletSupply = (isNonNegativeFinite(snapshot.balance) ? snapshot.balance : 0) + botWalletSupply
  const playerBalance = isNonNegativeFinite(snapshot.balance) ? snapshot.balance : 0
  const recordedPoolBudget = snapshot.poolHistory.reduce(
    (sum, cycle) => sum + (isNonNegativeFinite(cycle.budget) ? cycle.budget : 0),
    0,
  )
  const botRewards = snapshot.bots.reduce(
    (sum, bot) => sum + (isNonNegativeFinite(bot.totalRewards) ? bot.totalRewards : 0),
    0,
  )
  const recordedDistributedRewards =
    (isNonNegativeFinite(snapshot.totalRewards) ? snapshot.totalRewards : 0) + botRewards
  const averageCycleBudget = snapshot.poolHistory.length
    ? recordedPoolBudget / snapshot.poolHistory.length
    : 0
  const largestBotBalance = snapshot.bots.reduce(
    (largest, bot) => Math.max(largest, isNonNegativeFinite(bot.balance) ? bot.balance : 0),
    0,
  )

  return {
    visibleWalletSupply,
    botWalletSupply,
    playerWalletShare: visibleWalletSupply > 0 ? playerBalance / visibleWalletSupply * 100 : 0,
    recordedPoolBudget,
    recordedDistributedRewards,
    averageCycleBudget,
    latestCycleBudget: snapshot.poolHistory[0]?.budget ?? 0,
    cyclesAnalyzed: snapshot.poolHistory.length,
    activeBots: snapshot.bots.filter((bot) => bot.active && bot.hashrate > 0).length,
    largestBotBalanceShare: botWalletSupply > 0 ? largestBotBalance / botWalletSupply * 100 : 0,
  }
}

/** Static consistency checks for sandbox data; this is not a server-side security boundary. */
export function runSandboxIntegrityChecks(snapshot: IntegritySnapshot): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const add = (id: string, severity: IntegrityIssue['severity'], title: string, detail: string) => {
    issues.push({ id, severity, title, detail })
  }

  if (!isNonNegativeFinite(snapshot.balance)) {
    add('player-balance', 'error', 'Saldo do jogador inválido', 'O saldo precisa ser um número finito e não negativo.')
  }

  const allMachines = [...snapshot.machines, ...snapshot.inventory]
  const machineIds = new Set<number>()
  for (const machine of allMachines) {
    if (machineIds.has(machine.id)) {
      add('duplicate-machine-id', 'error', 'ID de equipamento duplicado', `O equipamento ${machine.name} compartilha o ID ${machine.id} com outro item.`)
    }
    machineIds.add(machine.id)
    if (!isNonNegativeFinite(machine.hashrate) || machine.hashrate === 0 || !isNonNegativeFinite(machine.price)) {
      add(`machine-values-${machine.id}`, 'error', 'Dados de equipamento inválidos', `${machine.name}: hashrate deve ser positivo e preço não negativo.`)
    }
  }

  const roomIds = new Set(snapshot.rooms.map((room) => room.id))
  for (const machine of snapshot.machines) {
    if (!roomIds.has(machine.roomId)) {
      add(`machine-room-${machine.id}`, 'warning', 'Equipamento em sala inexistente', `${machine.name} aponta para a sala ${machine.roomId}.`)
    }
  }
  for (const room of snapshot.rooms) {
    const installed = snapshot.machines.filter((machine) => machine.roomId === room.id).length
    if (!Number.isSafeInteger(room.capacity) || room.capacity < 0 || installed > room.capacity) {
      add(`room-capacity-${room.id}`, 'error', 'Capacidade de sala excedida', `${room.name}: ${installed} equipamento(s) instalado(s), capacidade configurada ${room.capacity}.`)
    }
  }

  const botIds = new Set<number>()
  for (const bot of snapshot.bots) {
    if (botIds.has(bot.id)) {
      add('duplicate-bot-id', 'error', 'ID de bot duplicado', `Mais de um bot usa o ID ${bot.id}.`)
    }
    botIds.add(bot.id)
    if (!isNonNegativeFinite(bot.hashrate) || !isNonNegativeFinite(bot.balance) || !isNonNegativeFinite(bot.totalRewards)) {
      add(`bot-values-${bot.id}`, 'error', 'Dados de bot inválidos', `${bot.name}: hashrate, saldo e recompensas precisam ser finitos e não negativos.`)
    }
  }

  const cycleIds = new Set<number>()
  for (const cycle of snapshot.poolHistory) {
    if (cycleIds.has(cycle.id)) {
      add('duplicate-cycle-id', 'warning', 'Ciclo duplicado no histórico', `O ciclo ${cycle.id} aparece mais de uma vez.`)
    }
    cycleIds.add(cycle.id)
    if (
      !isNonNegativeFinite(cycle.budget) ||
      !isNonNegativeFinite(cycle.reward) ||
      cycle.reward > cycle.budget ||
      !isNonNegativeFinite(cycle.playerHashrate) ||
      !isNonNegativeFinite(cycle.networkHashrate) ||
      cycle.networkHashrate < cycle.playerHashrate ||
      !Number.isFinite(cycle.participation) ||
      cycle.participation < 0 ||
      cycle.participation > 100
    ) {
      add(`cycle-values-${cycle.id}`, 'error', 'Registro de ciclo inconsistente', `O ciclo ${cycle.id} contém orçamento, recompensa, hashrate ou participação fora dos limites esperados.`)
    }
  }

  if (issues.length === 0) {
    add('sandbox-clean', 'warning', 'Nenhuma inconsistência encontrada', 'As verificações locais passaram. Isso não comprova segurança contra manipulação do navegador ou ataques externos.')
  }

  return issues
}
