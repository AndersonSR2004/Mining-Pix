export type SandboxTransaction = {
  id: string
  amount: string
  status: string
  created_at: string
  destination_address?: string | null
  user_id?: string
}

export type SandboxEntry = {
  id: string
  amount: string
  entry_type: string
  created_at: string
}

export type SandboxBalances = { available: string; reserved: string; total: string }

const entryLabels: Record<string, string> = {
  deposit: 'Depósito',
  purchase: 'Compra',
  pool_reward: 'Recompensa da pool',
  withdrawal: 'Saque',
  refund: 'Estorno',
  adjustment: 'Ajuste',
  reserve: 'Reserva',
  release: 'Liberação de reserva',
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  credited: 'Creditado',
  expired: 'Expirado',
  requested: 'Solicitado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  settled: 'Liquidado',
  failed: 'Falhou',
}

export const entryLabel = (value: string) => entryLabels[value] ?? value
export const sandboxStatus = (value: string) => statusLabels[value] ?? value
export const sandboxDate = (value: string) => new Date(value).toLocaleString('pt-BR')

export function formatDepix(value: string) {
  const [integer, decimals = ''] = value.split('.')
  const fraction = decimals.replace(/0+$/, '').padEnd(2, '0')
  const sign = integer.startsWith('-') ? '-' : ''
  return `${sign}${BigInt(integer.replace(/^-/, '')).toLocaleString('pt-BR')},${fraction} DePix`
}

export function parseSandboxAmount(input: string) {
  const value = input.trim().replace(',', '.')
  if (!/^\d{1,10}(\.\d{1,8})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  const units = BigInt(integer) * 100000000n + BigInt(fraction.padEnd(8, '0'))
  return { value, units }
}

export function formatSandboxUnits(value: string) {
  const units = BigInt(value)
  const absoluteUnits = units < 0n ? -units : units
  const integer = absoluteUnits / 100000000n
  const fraction = (absoluteUnits % 100000000n).toString().padStart(8, '0')
  return formatDepix(`${units < 0n ? '-' : ''}${integer}.${fraction}`)
}
