export type MissionMetric = 'cycles' | 'installs'
export type MissionPeriod = 'daily' | 'weekly'

export type MissionDefinition = {
  id: string
  title: string
  description: string
  period: MissionPeriod
  metric: MissionMetric
  target: number
  rewardXp: number
}

export type MissionState = {
  dailyPeriod: string
  weeklyPeriod: string
  dailyCycles: number
  dailyInstalls: number
  weeklyCycles: number
  weeklyInstalls: number
  claimed: string[]
}

export const MISSIONS: MissionDefinition[] = [
  { id: 'daily-cycles', title: 'Operação diária', description: 'Conclua 3 ciclos de mineração.', period: 'daily', metric: 'cycles', target: 3, rewardXp: 100 },
  { id: 'daily-install', title: 'Expansão diária', description: 'Instale 1 equipamento.', period: 'daily', metric: 'installs', target: 1, rewardXp: 100 },
  { id: 'weekly-cycles', title: 'Ritmo de produção', description: 'Conclua 10 ciclos de mineração.', period: 'weekly', metric: 'cycles', target: 10, rewardXp: 300 },
  { id: 'weekly-install', title: 'Infraestrutura em expansão', description: 'Instale 5 equipamentos.', period: 'weekly', metric: 'installs', target: 5, rewardXp: 300 },
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

export function createMissionState(now = new Date()): MissionState {
  const periods = getMissionPeriods(now)
  return {
    dailyPeriod: periods.daily,
    weeklyPeriod: periods.weekly,
    dailyCycles: 0,
    dailyInstalls: 0,
    weeklyCycles: 0,
    weeklyInstalls: 0,
    claimed: [],
  }
}

export function refreshMissionState(state: MissionState, now = new Date()): MissionState {
  const periods = getMissionPeriods(now)
  const dailyChanged = state.dailyPeriod !== periods.daily
  const weeklyChanged = state.weeklyPeriod !== periods.weekly
  if (!dailyChanged && !weeklyChanged) return state
  return {
    dailyPeriod: periods.daily,
    weeklyPeriod: periods.weekly,
    dailyCycles: dailyChanged ? 0 : state.dailyCycles,
    dailyInstalls: dailyChanged ? 0 : state.dailyInstalls,
    weeklyCycles: weeklyChanged ? 0 : state.weeklyCycles,
    weeklyInstalls: weeklyChanged ? 0 : state.weeklyInstalls,
    claimed: state.claimed.filter((id) => {
      const mission = MISSIONS.find((item) => item.id === id)
      return mission?.period === 'daily' ? !dailyChanged : mission?.period === 'weekly' ? !weeklyChanged : false
    }),
  }
}

export function recordMissionProgress(
  state: MissionState,
  metric: MissionMetric,
  now = new Date(),
): MissionState {
  const current = refreshMissionState(state, now)
  if (metric === 'cycles') {
    return { ...current, dailyCycles: current.dailyCycles + 1, weeklyCycles: current.weeklyCycles + 1 }
  }
  return { ...current, dailyInstalls: current.dailyInstalls + 1, weeklyInstalls: current.weeklyInstalls + 1 }
}

export function getMissionProgress(state: MissionState, mission: MissionDefinition): number {
  if (mission.period === 'daily') return mission.metric === 'cycles' ? state.dailyCycles : state.dailyInstalls
  return mission.metric === 'cycles' ? state.weeklyCycles : state.weeklyInstalls
}
