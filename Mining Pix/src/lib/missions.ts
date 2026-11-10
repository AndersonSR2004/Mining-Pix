export type MissionEvent =
  | 'flappy_games'
  | 'snake_games'
  | 'coin_catch_games'
  | 'ad_lucky_boxes'
  | 'room_energy_recharges'
  | 'pix_coin_purchased'
  | 'paid_lucky_boxes'
  | 'daily_login'
  | 'rewarded_ads'

export type MissionPeriod = 'daily' | 'weekly'

export type MissionDefinition = {
  id: string
  title: string
  description: string
  period: MissionPeriod
  event: MissionEvent | 'daily_missions_completed'
  target: number
  rewardXp: number
}

export type MissionState = {
  dailyPeriod: string
  weeklyPeriod: string
  dailyProgress: Record<MissionEvent, number>
  weeklyCompletedDailyMissions: number
  completedDailyMissionIds: string[]
  claimed: string[]
}

export const DAILY_REWARDED_AD_LIMIT = 5
export const PAID_LUCKY_BOX_PRICE = 100

export const MISSIONS: MissionDefinition[] = [
  { id: 'daily-flappy', title: 'Pequeno piloto', description: 'Conclua 10 partidas de Flappy Bird.', period: 'daily', event: 'flappy_games', target: 10, rewardXp: 100 },
  { id: 'daily-snake', title: 'Mestre da cobrinha', description: 'Conclua 10 partidas da cobrinha.', period: 'daily', event: 'snake_games', target: 10, rewardXp: 100 },
  { id: 'daily-coin-catch', title: 'Caçador de moedas', description: 'Conclua 10 partidas de Coin Catch.', period: 'daily', event: 'coin_catch_games', target: 10, rewardXp: 100 },
  { id: 'daily-ad-boxes', title: 'Caçador de recompensas', description: 'Obtenha por anúncios e abra 10 Lucky Boxes.', period: 'daily', event: 'ad_lucky_boxes', target: 10, rewardXp: 100 },
  { id: 'daily-energy', title: 'Manutenção preventiva', description: 'Conclua uma recarga de energia da sala.', period: 'daily', event: 'room_energy_recharges', target: 1, rewardXp: 100 },
  { id: 'daily-pix-coin', title: 'Investidor', description: 'Compre um total de 100 PIX COIN.', period: 'daily', event: 'pix_coin_purchased', target: 100, rewardXp: 100 },
  { id: 'daily-paid-box', title: 'Colecionador', description: 'Compre 1 Lucky Box paga por 100 PIX COIN.', period: 'daily', event: 'paid_lucky_boxes', target: 1, rewardXp: 100 },
  { id: 'daily-login', title: 'Presença diária', description: 'Faça login no Mining Pix uma vez hoje.', period: 'daily', event: 'daily_login', target: 1, rewardXp: 100 },
  { id: 'daily-rewarded-ad', title: 'Apoie o Mining Pix', description: 'Assista a 1 anúncio recompensado para apoiar o projeto. Limite de 5 anúncios por dia.', period: 'daily', event: 'rewarded_ads', target: 1, rewardXp: 100 },
  { id: 'weekly-10', title: 'Consistência I', description: 'Conclua 10 missões diárias nesta semana.', period: 'weekly', event: 'daily_missions_completed', target: 10, rewardXp: 300 },
  { id: 'weekly-20', title: 'Consistência II', description: 'Conclua 20 missões diárias nesta semana.', period: 'weekly', event: 'daily_missions_completed', target: 20, rewardXp: 300 },
  { id: 'weekly-30', title: 'Consistência III', description: 'Conclua 30 missões diárias nesta semana.', period: 'weekly', event: 'daily_missions_completed', target: 30, rewardXp: 300 },
  { id: 'weekly-40', title: 'Consistência IV', description: 'Conclua 40 missões diárias nesta semana.', period: 'weekly', event: 'daily_missions_completed', target: 40, rewardXp: 300 },
  { id: 'weekly-50', title: 'Elite semanal', description: 'Conclua 50 missões diárias nesta semana.', period: 'weekly', event: 'daily_missions_completed', target: 50, rewardXp: 300 },
]

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMissionPeriods(now = new Date()): { daily: string; weekly: string } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekday = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - weekday)
  return { daily: dateKey(now), weekly: dateKey(monday) }
}

function emptyDailyProgress(): Record<MissionEvent, number> {
  return {
    flappy_games: 0,
    snake_games: 0,
    coin_catch_games: 0,
    ad_lucky_boxes: 0,
    room_energy_recharges: 0,
    pix_coin_purchased: 0,
    paid_lucky_boxes: 0,
    daily_login: 0,
    rewarded_ads: 0,
  }
}

export function createMissionState(now = new Date()): MissionState {
  const periods = getMissionPeriods(now)
  return {
    dailyPeriod: periods.daily,
    weeklyPeriod: periods.weekly,
    dailyProgress: emptyDailyProgress(),
    weeklyCompletedDailyMissions: 0,
    completedDailyMissionIds: [],
    claimed: [],
  }
}

export function refreshMissionState(state: MissionState, now = new Date()): MissionState {
  const periods = getMissionPeriods(now)
  const dailyChanged = state.dailyPeriod !== periods.daily
  const weeklyChanged = state.weeklyPeriod !== periods.weekly
  const storedProgress = state.dailyProgress && typeof state.dailyProgress === 'object'
    ? state.dailyProgress
    : emptyDailyProgress()
  const normalized: MissionState = {
    dailyPeriod: periods.daily,
    weeklyPeriod: periods.weekly,
    dailyProgress: { ...emptyDailyProgress(), ...storedProgress },
    weeklyCompletedDailyMissions: Number.isFinite(state.weeklyCompletedDailyMissions)
      ? Math.max(0, state.weeklyCompletedDailyMissions)
      : 0,
    completedDailyMissionIds: Array.isArray(state.completedDailyMissionIds)
      ? state.completedDailyMissionIds.filter((id) => typeof id === 'string')
      : [],
    claimed: Array.isArray(state.claimed) ? state.claimed.filter((id) => typeof id === 'string') : [],
  }
  if (!dailyChanged && !weeklyChanged) return normalized
  return {
    ...normalized,
    dailyProgress: dailyChanged ? emptyDailyProgress() : normalized.dailyProgress,
    weeklyCompletedDailyMissions: weeklyChanged ? 0 : normalized.weeklyCompletedDailyMissions,
    completedDailyMissionIds: dailyChanged ? [] : normalized.completedDailyMissionIds,
    claimed: normalized.claimed.filter((id) => {
      const mission = MISSIONS.find((item) => item.id === id)
      return mission?.period === 'daily' ? !dailyChanged : mission?.period === 'weekly' ? !weeklyChanged : false
    }),
  }
}

export function recordMissionProgress(
  state: MissionState,
  event: MissionEvent,
  amount = 1,
  now = new Date(),
): MissionState {
  const current = refreshMissionState(state, now)
  if (!Number.isFinite(amount) || amount <= 0) return current
  const dailyMission = MISSIONS.find((mission) => mission.period === 'daily' && mission.event === event)
  if (!dailyMission) return current

  const previous = current.dailyProgress[event] ?? 0
  if (event === 'rewarded_ads' && previous >= DAILY_REWARDED_AD_LIMIT) return current
  const next = event === 'rewarded_ads'
    ? Math.min(DAILY_REWARDED_AD_LIMIT, previous + Math.floor(amount))
    : previous + amount
  const reachedTarget = previous < dailyMission.target && next >= dailyMission.target
  const completedDailyMissionIds = reachedTarget && !current.completedDailyMissionIds.includes(dailyMission.id)
    ? [...current.completedDailyMissionIds, dailyMission.id]
    : current.completedDailyMissionIds

  return {
    ...current,
    dailyProgress: { ...current.dailyProgress, [event]: next },
    completedDailyMissionIds,
    weeklyCompletedDailyMissions: current.weeklyCompletedDailyMissions + (reachedTarget ? 1 : 0),
  }
}

export function getMissionProgress(state: MissionState, mission: MissionDefinition): number {
  if (mission.period === 'weekly') return state.weeklyCompletedDailyMissions
  return state.dailyProgress[mission.event as MissionEvent] ?? 0
}
