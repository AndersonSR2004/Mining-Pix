import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  entryLabel, formatDepix, formatSandboxUnits, parseSandboxAmount, sandboxDate, sandboxStatus,
  type SandboxBalances, type SandboxEntry, type SandboxTransaction,
} from '../lib/depixSandbox'
import { supabase } from '../lib/supabase/client'

type FinanceSnapshot = {
  deposits: SandboxTransaction[]
  withdrawals: SandboxTransaction[]
  balances: SandboxBalances
  entries: SandboxEntry[]
  audit: { id: string; request_id: string; actor_id: string; action: string; created_at: string }[]
}

type PoolSnapshot = {
  blocks?: { block_at: string; total_hashrate: string; participants: number; distributed_units: string }[]
  approved_today?: string | null
  approved_tomorrow?: string | null
  daily_budget_units: string
  available_budget_units: string
  cycles: { cycle_date: string; settled_at: string; total_hashrate: string; participants: number; budget_units: string; distributed_units: string }[]
  scheduler_installed: boolean
  audit: { id: string; actor_id: string; kind: 'daily_budget' | 'funding'; units: string; previous_units: string | null; created_at: string }[]
}

type WithdrawalAction = 'approve' | 'reject' | 'settle'
const actionLabels: Record<WithdrawalAction, string> = { approve: 'Aprovar', reject: 'Rejeitar', settle: 'Simular liquidação' }
const auditLabels: Record<string, string> = { approve: 'Saque aprovado', reject: 'Saque rejeitado', settle: 'Saque liquidado', credit: 'Depósito creditado' }

function FinanceQueue({ title, rows, actions }: {
  title: string
  rows: SandboxTransaction[]
  actions: (row: SandboxTransaction) => ReactNode
}) {
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? <p>Nenhuma solicitação.</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Solicitação</th><th>Valor fictício</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}<small>{sandboxDate(row.created_at)}</small>{row.user_id && <small>Jogador {row.user_id}</small>}{row.destination_address && <small>{row.destination_address}</small>}</td>
                <td>{formatDepix(row.amount)}</td>
                <td>{sandboxStatus(row.status)}</td>
                <td><div className="admin-depix-actions">{actions(row)}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function DepixSandboxCenter() {
  const [finance, setFinance] = useState<FinanceSnapshot | null>(null)
  const [pool, setPool] = useState<PoolSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [budget, setBudget] = useState('')
  const [funds, setFunds] = useState('')
  const fundRequest = useRef('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [financeResult, poolResult] = await Promise.all([
        supabase.rpc('depix_sandbox_admin_snapshot'),
        supabase.rpc('admin_depix_pool_snapshot'),
      ])
      setFinance(financeResult.error ? null : financeResult.data as FinanceSnapshot)
      setPool(poolResult.error ? null : poolResult.data as PoolSnapshot)
      if (financeResult.error || poolResult.error) {
        setLoadError(financeResult.error ? 'A carteira administrativa está indisponível.' : 'O orçamento da pool está indisponível.')
      }
    } catch {
      setLoadError('Não foi possível consultar o sandbox.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function runAction(operation: () => Promise<{ error: { message: string } | null }>, message: string) {
    if (busy) return
    setBusy(true)
    setActionError('')
    setFeedback('')
    try {
      const result = await operation()
      if (result.error) throw result.error
      setFeedback(message)
      await load()
      return true
    } catch {
      setActionError('A operação não foi confirmada. Atualize os dados antes de tentar novamente.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function reviewWithdrawal(id: string, action: WithdrawalAction) {
    void runAction(async () => await supabase.rpc('depix_sandbox_admin_withdrawal', {
      p_request_id: id,
      p_action: action,
    }), 'Saque fictício atualizado.')
  }

  async function submitPool(event: FormEvent<HTMLFormElement>, kind: 'budget' | 'fund') {
    event.preventDefault()
    const amount = parseSandboxAmount(kind === 'budget' ? budget : funds)
    if (!amount || (kind === 'fund' && amount.units <= 0n)) {
      setActionError('Informe um valor válido com até oito casas decimais.')
      return
    }
    const units = amount.units.toString()
    if (kind === 'budget') {
      const done = await runAction(async () => await supabase.rpc('admin_configure_depix_pool_budget', { p_daily_units: units }), 'Limite diário fictício atualizado.')
      if (done) setBudget('')
      return
    }
    fundRequest.current ||= crypto.randomUUID()
    const done = await runAction(async () => await supabase.rpc('admin_fund_depix_pool', {
      p_operation_id: fundRequest.current,
      p_units: units,
    }), 'Orçamento fictício creditado.')
    if (done) {
      fundRequest.current = ''
      setFunds('')
    }
  }

  const disabled = busy || loading
  return (
    <>
      <section className="admin-panel" aria-busy={disabled}>
        <div className="admin-panel-heading">
          <h2>Economia DePix · Sandbox</h2>
          <button className="admin-secondary" type="button" disabled={disabled} onClick={() => void load()}>Atualizar</button>
        </div>
        <p>Os saldos e as operações desta seção são fictícios e não são resgatáveis.</p>
        {loading && <p role="status">Consultando operações...</p>}
        {loadError && <p className="admin-error" role="alert">{loadError}</p>}
        {actionError && <p className="admin-error" role="alert">{actionError}</p>}
        {feedback && <p className="admin-success" role="status">{feedback}</p>}
        {finance && (
          <div className="admin-stat-grid">
            <article className="admin-stat"><span>DISPONÍVEL</span><strong>{formatDepix(finance.balances.available)}</strong></article>
            <article className="admin-stat"><span>RESERVADO PARA SAQUES</span><strong>{formatDepix(finance.balances.reserved)}</strong></article>
            <article className="admin-stat"><span>SALDO TOTAL</span><strong>{formatDepix(finance.balances.total)}</strong></article>
          </div>
        )}
      </section>
      {finance && (
        <>
          <FinanceQueue title="Depósitos fictícios" rows={finance.deposits} actions={(row) => row.status === 'pending' && (
            <button type="button" className="admin-secondary" disabled={disabled} onClick={() => void runAction(
              async () => await supabase.rpc('depix_sandbox_admin_deposit', { p_request_id: row.id }),
              'Depósito fictício creditado.',
            )}>Confirmar depósito</button>
          )} />
          <FinanceQueue title="Saques fictícios" rows={finance.withdrawals} actions={(row) => {
            const actions: WithdrawalAction[] = row.status === 'requested' ? ['approve', 'reject'] : row.status === 'approved' ? ['settle', 'reject'] : []
            return actions.map((action) => <button key={action} type="button" className="admin-secondary" disabled={disabled} onClick={() => reviewWithdrawal(row.id, action)}>{actionLabels[action]}</button>)
          }} />
          <section className="admin-panel">
            <h2>Movimentações recentes</h2>
            {finance.entries.length === 0 && <p>Nenhum lançamento.</p>}
            <ul>{finance.entries.map((entry) => <li key={entry.id}>{entryLabel(entry.entry_type)} · {formatDepix(entry.amount)} · {sandboxDate(entry.created_at)}</li>)}</ul>
            <h3>Auditoria do sandbox</h3>
            {finance.audit.length === 0 && <p>Nenhuma ação registrada.</p>}
            <ul>{finance.audit.map((entry) => <li key={entry.id}>{sandboxDate(entry.created_at)} · {auditLabels[entry.action] ?? entry.action} · Solicitação {entry.request_id} · Operador {entry.actor_id}</li>)}</ul>
          </section>
        </>
      )}
      {pool && (
        <section className="admin-panel">
          <h2>Orçamento e ciclos da pool</h2>
          <p>Limite diário de {formatSandboxUnits(pool.daily_budget_units)} · Fundo disponível de {formatSandboxUnits(pool.available_budget_units)}</p>
          <p>{pool.scheduler_installed ? 'Agendamento automático configurado.' : 'Agendamento automático indisponível.'}</p>
          <div className="admin-depix-pool-forms">
            <form className="admin-login-form" onSubmit={(event) => void submitPool(event, 'budget')}>
              <label>Limite diário em DePix fictício<input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} required disabled={disabled} /></label>
              <button className="admin-secondary" type="submit" disabled={disabled}>Salvar limite</button>
            </form>
            <form className="admin-login-form" onSubmit={(event) => void submitPool(event, 'fund')}>
              <label>Valor fictício para a pool<input inputMode="decimal" value={funds} onChange={(event) => { setFunds(event.target.value); fundRequest.current = '' }} required disabled={disabled} /></label>
              <button className="admin-secondary" type="submit" disabled={disabled}>Adicionar ao orçamento</button>
            </form>
          </div>
          <p>Hoje UTC: {pool.approved_today == null ? 'aguardando aprovação' : formatSandboxUnits(pool.approved_today)} · Amanhã UTC: {pool.approved_tomorrow == null ? 'aguardando aprovação' : formatSandboxUnits(pool.approved_tomorrow)}</p>
          {[0, 1].map(offset => (
            <button key={offset} className="admin-secondary" type="button" disabled={disabled} onClick={() => {
              const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
              void runAction(async () => await supabase.rpc('admin_approve_pool_day', {
                p_day: day, p_expected_units: pool.daily_budget_units,
              }), 'Orçamento diário fictício aprovado.')
            }}>Aprovar limite para {offset === 0 ? 'hoje UTC' : 'amanhã UTC'}</button>
          ))}
          <h3>Blocos de 10 minutos</h3>
          <ul>{pool.blocks?.map(block => (
            <li key={block.block_at}>{sandboxDate(block.block_at)} · {block.participants} participantes · {formatSandboxUnits(block.distributed_units)} distribuídos</li>
          ))}</ul>
          <h3>Ciclos diários anteriores</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Ciclo</th><th>Participantes</th><th>HASH elegível</th><th>Orçamento</th><th>Distribuído</th></tr></thead>
              <tbody>{pool.cycles.map((cycle) => <tr key={cycle.cycle_date}>
                <td>{cycle.cycle_date}<small>{sandboxDate(cycle.settled_at)}</small></td>
                <td>{cycle.participants}</td><td>{Number(cycle.total_hashrate).toLocaleString('pt-BR')} H/s</td>
                <td>{formatSandboxUnits(cycle.budget_units)}</td><td>{formatSandboxUnits(cycle.distributed_units)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {pool.cycles.length === 0 && <p>Nenhum ciclo liquidado.</p>}
          <h3>Auditoria do orçamento</h3>
          {pool.audit.length === 0 ? <p>Nenhuma alteração de orçamento registrada.</p> : (
            <ul>
              {pool.audit.map((entry) => (
                <li key={entry.id}>
                  {sandboxDate(entry.created_at)} · {entry.kind === 'funding' ? 'Crédito fictício' : 'Atualização de limite diário'} ·{' '}
                  {entry.previous_units !== null && `${formatSandboxUnits(entry.previous_units)} → `}
                  {formatSandboxUnits(entry.units)} · Operador {entry.actor_id}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
