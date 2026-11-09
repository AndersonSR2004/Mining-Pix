export type PoolParticipant = {
  id: string
  hashrate: number
}

/**
 * Distributes an integer cycle budget proportionally using the largest-remainder method.
 * Every eligible participant receives an integer amount and the sum equals the budget.
 */
export function distributePoolBudget(
  budget: number,
  participants: PoolParticipant[],
): Record<string, number> {
  const totalBudget = Math.floor(budget)
  const eligible = participants.filter(
    (participant) => Number.isFinite(participant.hashrate) && participant.hashrate > 0,
  )
  const totalHashrate = eligible.reduce((sum, participant) => sum + participant.hashrate, 0)

  if (
    !Number.isSafeInteger(totalBudget) ||
    totalBudget <= 0 ||
    !Number.isFinite(totalHashrate) ||
    totalHashrate <= 0
  ) return {}

  const rows = eligible.map((participant) => {
    const exactShare = totalBudget * participant.hashrate / totalHashrate
    return {
      id: participant.id,
      reward: Math.floor(exactShare),
      remainder: exactShare - Math.floor(exactShare),
    }
  })

  const undistributed = totalBudget - rows.reduce((sum, row) => sum + row.reward, 0)
  const priority = [...rows].sort(
    (a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  for (let index = 0; index < undistributed; index += 1) {
    priority[index % priority.length].reward += 1
  }

  return Object.fromEntries(rows.map((row) => [row.id, row.reward]))
}
