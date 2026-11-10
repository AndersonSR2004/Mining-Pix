import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

type MonthRevenue = { month: string; gross_cents: number | string; deductions_cents: number | string; net_cents: number | string }
type MonthExpense = { month: string; expense_cents: number | string }
type EconomySnapshot = { captured_at: string; pc_supply: number | string; wallets_count: number; active_equipment_count: number; installed_hashrate: number | string; players_count: number }
type ExpenseItem = { id: string; category: string; description: string; amount_cents: number | string; expense_date: string; paid_at: string; vendor_reference: string | null }
type CommitmentItem = { id: string; commitment_type: string; category: string; description: string; amount_cents: number | string | null; amount_mc: number | string | null; due_date: string; status: string; created_at: string }
type ReserveMovement = { id: string; movement_type: string; signed_amount_cents: number | string; source_reference: string; reason: string; created_at: string }
type RewardCommitmentMonth = { month: string; amount_mc: number | string }
type ExpenseMonthClose = { month_start: string; closed_at: string; closed_by: string; reason: string }
type FinancialAdminEvent = { id: string; actor_user_id: string; event_type: string; entity_type: string; entity_id: string; amount_cents: number | string | null; amount_mc: number | string | null; reason: string; created_at: string }
type FinanceSnapshot = {
  generated_at: string
  revenue_months: MonthRevenue[]
  expense_months: MonthExpense[]
  revenue_accumulated_cents: number | string
  expenses_accumulated_cents: number | string
  net_operating_result_accumulated_cents: number | string
  revenue_last_3_full_months_cents: number | string
  revenue_forecast_next_month_cents: number | string
  forecast_method: string
  expenses_last_3_full_months_cents: number | string
  reserve_target_cents: number | string | null
  reserve_history_complete: boolean
  reserve_closed_months_count: number
  reserve_balance_cents: number | string
  reserve_gap_cents: number | string
  reserve_coverage_ratio: number | string | null
  commitments_open_brl_cents: number | string
  commitments_due_30d_brl_cents: number | string
  commitments_open_mc: number | string
  allocation_policy: { pool_percent: number; reserve_percent: number; operations_percent: number; administration_percent: number }
  pc_economy: { current_supply: number | string; gross_issued: number | string; gross_sunk: number | string; net_issuance: number | string; net_issuance_vs_supply_percent: number | string | null; interpretation: string }
  supply_latest_snapshot: EconomySnapshot | null
  supply_30d_baseline: { captured_at: string; pc_supply: number | string } | null
  player_activity: { unique_players_7d: number; unique_players_30d: number; events_24h: number; telemetry_status: string }
  recent_expenses: ExpenseItem[]
  recent_commitments: CommitmentItem[]
  recent_reserve_movements: ReserveMovement[]
  reward_commitments_monthly: RewardCommitmentMonth[]
  expense_month_closings: ExpenseMonthClose[]
  recent_financial_events: FinancialAdminEvent[]
}

const brl = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0) / 100)
const integer = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value ?? 0))
const decimal = (value: number | string | null | undefined, digits = 2) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value ?? 0))
const localDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const previousMonth = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); return first.getFullYear() + '-' + String(first.getMonth() + 1).padStart(2, '0') }
const amountToCents = (value: string) => {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um valor monetário válido com até duas casas decimais.')
  const [whole, fraction = ''] = normalized.split('.')
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString()
}
const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1))
}

export default function FinanceCenter() {
  const [data, setData] = useState<FinanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('infrastructure')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(localDate())
  const [expenseVendor, setExpenseVendor] = useState('')
  const [expenseSource, setExpenseSource] = useState('')
  const [expenseReason, setExpenseReason] = useState('')
  const [expenseBusy, setExpenseBusy] = useState(false)
  const [expenseRequestId, setExpenseRequestId] = useState(() => crypto.randomUUID())
  const [commitmentType, setCommitmentType] = useState('operational')
  const [commitmentCategory, setCommitmentCategory] = useState('infraestrutura')
  const [commitmentDescription, setCommitmentDescription] = useState('')
  const [commitmentAmount, setCommitmentAmount] = useState('')
  const [commitmentDueDate, setCommitmentDueDate] = useState(localDate())
  const [commitmentSource, setCommitmentSource] = useState('')
  const [commitmentReason, setCommitmentReason] = useState('')
  const [commitmentBusy, setCommitmentBusy] = useState(false)
  const [commitmentRequestId, setCommitmentRequestId] = useState(() => crypto.randomUUID())
  const [reserveType, setReserveType] = useState<'contribution' | 'withdrawal'>('contribution')
  const [reserveAmount, setReserveAmount] = useState('')
  const [reserveSource, setReserveSource] = useState('')
  const [reserveReason, setReserveReason] = useState('')
  const [reserveBusy, setReserveBusy] = useState(false)
  const [closeMonthValue, setCloseMonthValue] = useState(previousMonth())
  const [closeMonthReason, setCloseMonthReason] = useState('')
  const [closeMonthBusy, setCloseMonthBusy] = useState(false)
  const [closeMonthRequestId, setCloseMonthRequestId] = useState(() => crypto.randomUUID())
  const [selectedCommitmentId, setSelectedCommitmentId] = useState('')
  const [transitionStatus, setTransitionStatus] = useState<'paid' | 'cancelled'>('paid')
  const [transitionExpenseId, setTransitionExpenseId] = useState('')
  const [transitionReason, setTransitionReason] = useState('')
  const [transitionBusy, setTransitionBusy] = useState(false)
  const [reserveRequestId, setReserveRequestId] = useState(() => crypto.randomUUID())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: result, error: rpcError } = await supabase.rpc('admin_financial_snapshot')
    if (rpcError) {
      setError(rpcError.message)
      setData(null)
    } else {
      setData(result as FinanceSnapshot)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function captureSupplySnapshot() {
    setCapturing(true)
    setError('')
    setMessage('')
    const { error: captureError } = await supabase.rpc('admin_capture_economy_snapshot')
    if (captureError) {
      setError(captureError.message)
    } else {
      setMessage('Snapshot da economia PIX COIN registrado. O comparativo de 30 dias ficará disponível após existir uma linha de base com essa idade.')
      await load()
    }
    setCapturing(false)
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setExpenseBusy(true); setError(''); setMessage('')
    try {
      const amount_cents = amountToCents(expenseAmount)
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-finance', { body: {
        action: 'record_expense', category: expenseCategory, description: expenseDescription.trim(), amount_cents,
        expense_date: expenseDate, vendor_reference: expenseVendor.trim() || null, source_reference: expenseSource.trim(),
        idempotency_key: expenseRequestId, reason: expenseReason.trim(),
      } })
      if (invokeError) throw invokeError
      if (result?.status !== 'succeeded') throw new Error('O backend não confirmou o lançamento da despesa.')
      setMessage(result.duplicate ? 'Despesa já registrada; nenhuma duplicação foi criada.' : 'Despesa efetiva registrada e auditada.')
      setExpenseDescription(''); setExpenseAmount(''); setExpenseVendor(''); setExpenseSource(''); setExpenseReason(''); setExpenseRequestId(crypto.randomUUID()); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a despesa.') }
    finally { setExpenseBusy(false) }
  }

  async function submitCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCommitmentBusy(true); setError(''); setMessage('')
    try {
      const isMc = commitmentType === 'player_reward_mc'
      let amount_cents: string | null = null; let amount_mc: string | null = null
      if (isMc) {
        if (!/^\d{1,22}(\.\d{1,8})?$/.test(commitmentAmount.trim()) || Number(commitmentAmount) <= 0) throw new Error('Informe uma quantidade MC válida, com até oito casas decimais.')
        amount_mc = commitmentAmount.trim()
      } else amount_cents = amountToCents(commitmentAmount)
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-finance', { body: {
        action: 'create_commitment', commitment_type: commitmentType, category: commitmentCategory.trim(),
        description: commitmentDescription.trim(), amount_cents, amount_mc, due_date: commitmentDueDate,
        source_reference: commitmentSource.trim(), idempotency_key: commitmentRequestId, reason: commitmentReason.trim(),
      } })
      if (invokeError) throw invokeError
      if (result?.status !== 'succeeded') throw new Error('O backend não confirmou o compromisso.')
      setMessage('Compromisso registrado e auditado.'); setCommitmentDescription(''); setCommitmentAmount('');
      setCommitmentSource(''); setCommitmentReason(''); setCommitmentRequestId(crypto.randomUUID()); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o compromisso.') }
    finally { setCommitmentBusy(false) }
  }

  async function submitMonthClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCloseMonthBusy(true); setError(''); setMessage('')
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-finance', {
        body: { action: 'close_expense_month', month: closeMonthValue, idempotency_key: closeMonthRequestId, reason: closeMonthReason.trim() },
      })
      if (invokeError) throw invokeError
      if (result?.status !== 'succeeded') throw new Error('O backend não confirmou o fechamento mensal.')
      setMessage(result.duplicate ? 'Este mês já estava fechado com a mesma solicitação.' : 'Mês fechado. A meta da reserva será recalculada quando os três últimos meses completos estiverem fechados.')
      setCloseMonthReason(''); setCloseMonthRequestId(crypto.randomUUID()); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível fechar o mês.') }
    finally { setCloseMonthBusy(false) }
  }

  async function submitCommitmentTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = data?.recent_commitments.find((item) => item.id === selectedCommitmentId)
    if (!selected) return
    setTransitionBusy(true); setError(''); setMessage('')
    try {
      if (transitionStatus === 'paid' && (!selected.amount_cents || !transitionExpenseId)) {
        throw new Error('Selecione uma despesa paga de valor correspondente para liquidar o compromisso.')
      }
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-finance', {
        body: {
          action: 'transition_commitment',
          commitment_id: selected.id,
          new_status: transitionStatus,
          paid_expense_entry_id: transitionStatus === 'paid' ? transitionExpenseId : null,
          reason: transitionReason.trim(),
        },
      })
      if (invokeError) throw invokeError
      if (result?.status !== 'succeeded') throw new Error('O backend não confirmou a mudança do compromisso.')
      setMessage(transitionStatus === 'paid' ? 'Compromisso marcado como pago e vinculado à despesa.' : 'Compromisso cancelado e auditado.')
      setSelectedCommitmentId(''); setTransitionExpenseId(''); setTransitionReason('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o compromisso.') }
    finally { setTransitionBusy(false) }
  }

  async function submitReserveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReserveBusy(true); setError(''); setMessage('')
    try {
      const cents = BigInt(amountToCents(reserveAmount))
      const signed_amount_cents = (reserveType === 'withdrawal' ? -cents : cents).toString()
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-finance', { body: {
        action: 'record_reserve_movement', movement_type: reserveType, signed_amount_cents,
        source_reference: reserveSource.trim(), idempotency_key: reserveRequestId, reason: reserveReason.trim(),
      } })
      if (invokeError) throw invokeError
      if (result?.status !== 'succeeded') throw new Error('O backend não confirmou o movimento da reserva.')
      setMessage('Movimento contábil da reserva registrado. Nenhuma transferência bancária foi executada.')
      setReserveAmount(''); setReserveSource(''); setReserveReason(''); setReserveRequestId(crypto.randomUUID()); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o movimento da reserva.') }
    finally { setReserveBusy(false) }
  }
  if (loading && !data) return <section className="admin-panel">Carregando Financial Intelligence Center...</section>
  if (error && !data) return <section className="admin-error" role="alert">Não foi possível carregar os indicadores financeiros: {error}</section>
  if (!data) return null

  const reserveCoverage = data.reserve_coverage_ratio === null ? null : Math.max(0, Math.min(100, Number(data.reserve_coverage_ratio) * 100))
  const revenueMax = Math.max(1, ...data.revenue_months.map((item) => Math.max(0, Number(item.net_cents))))
  const expenseMax = Math.max(1, ...data.expense_months.map((item) => Number(item.expense_cents)))
  const latestSupply = data.supply_latest_snapshot
  const supplyChange = latestSupply && data.supply_30d_baseline
    ? Number(latestSupply.pc_supply) - Number(data.supply_30d_baseline.pc_supply)
    : null

  return (
    <div className="finance-center">
      <div className="admin-title-row finance-heading">
        <div><span className="admin-eyebrow">FINANCIAL INTELLIGENCE CENTER</span><h1>Controle financeiro</h1><p>Contabilidade gerencial, compromissos, reserva e indicadores da economia virtual.</p></div>
        <div className="finance-actions">
          <button className="admin-secondary" onClick={() => void load()} disabled={loading}>{loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}</button>
          <button className="admin-primary" onClick={() => void captureSupplySnapshot()} disabled={capturing}>{capturing ? 'REGISTRANDO...' : 'REGISTRAR SNAPSHOT PIX'}</button>
        </div>
      </div>

      {error && <div className="admin-error" role="alert">{error}</div>}
      {message && <div className="admin-success" role="status">{message}</div>}

      <div className="finance-notice"><strong>Indicadores sem dados não são estimativas reais.</strong><span>O projeto ainda não possui receitas, despesas, reserva ou compromissos financeiros importados. Os painéis mostram a estrutura e permanecem zerados até o registro de fatos verificáveis.</span></div>

      <div className="admin-stat-grid finance-stat-grid">
        <article className="admin-stat"><span>RECEITA LÍQUIDA ACUMULADA</span><strong>{brl(data.revenue_accumulated_cents)}</strong><small>Histórico completo do Revenue Ledger</small></article>
        <article className="admin-stat"><span>DESPESAS EFETIVAS ACUMULADAS</span><strong>{brl(data.expenses_accumulated_cents)}</strong><small>Despesas pagas registradas</small></article>
        <article className="admin-stat"><span>RESULTADO OPERACIONAL REGISTRADO</span><strong>{brl(data.net_operating_result_accumulated_cents)}</strong><small>Receita líquida acumulada menos despesas pagas; antes de compromissos não pagos</small></article>
        <article className="admin-stat"><span>RECEITA LÍQUIDA · 3 MESES COMPLETOS</span><strong>{brl(data.revenue_last_3_full_months_cents)}</strong><small>Somente entradas liquidadas e conciliadas</small></article>
        <article className="admin-stat"><span>PREVISÃO · PRÓXIMO MÊS</span><strong>{brl(data.revenue_forecast_next_month_cents)}</strong><small>Média simples dos três últimos meses completos</small></article>
        <article className="admin-stat"><span>COMPROMISSOS FINANCEIROS EM ABERTO</span><strong>{brl(data.commitments_open_brl_cents)}</strong><small>{brl(data.commitments_due_30d_brl_cents)} vencem nos próximos 30 dias</small></article>
        <article className="admin-stat"><span>RESERVA FINANCEIRA</span><strong>{brl(data.reserve_balance_cents)}</strong><small>Saldo registrado por movimentos auditáveis</small></article>
        <article className="admin-stat"><span>META DA RESERVA · 3 MESES</span><strong>{data.reserve_history_complete ? brl(data.reserve_target_cents) : 'Aguardando fechamento'}</strong><small>Soma das despesas efetivas dos três últimos meses completos, após conciliação mensal</small></article>
        <article className="admin-stat"><span>COMPROMISSOS DE RECOMPENSA</span><strong>{decimal(data.commitments_open_mc, 8)} MC</strong><small>Separados de obrigações em BRL; sem valor de resgate atribuído</small></article>
      </div>

      <div className="finance-entry-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONTABILIDADE</span><h2>Registrar despesa efetiva</h2></div><span>Somente paga</span></div>
          <p className="admin-empty">Registre despesas já pagas. Elas entram no cálculo da meta de reserva dos três meses completos.</p>
          <form className="admin-note-form" onSubmit={(event) => void submitExpense(event)}>
            <label>Categoria<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option value="infrastructure">Infraestrutura</option><option value="software">Software</option><option value="marketing">Marketing</option><option value="support">Suporte</option><option value="legal">Jurídico</option><option value="tax">Tributos</option><option value="payment_processing">Processamento de pagamentos</option><option value="contractors">Prestadores</option><option value="administration">Administração</option><option value="other">Outras</option></select></label>
            <label>Descrição<input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} minLength={3} maxLength={240} required /></label>
            <label>Valor pago (R$)<input inputMode="decimal" placeholder="0,00" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required /></label>
            <label>Data do pagamento<input type="date" value={expenseDate} max={localDate()} onChange={(event) => setExpenseDate(event.target.value)} required /></label>
            <label>Fornecedor (opcional)<input value={expenseVendor} onChange={(event) => setExpenseVendor(event.target.value)} maxLength={160} /></label>
            <label>Referência (nota, fatura ou comprovante)<input value={expenseSource} onChange={(event) => setExpenseSource(event.target.value)} minLength={1} maxLength={160} required /></label>
            <label>Motivo / observação administrativa<textarea value={expenseReason} onChange={(event) => setExpenseReason(event.target.value)} minLength={3} maxLength={500} required /></label>
            <button className="admin-primary" type="submit" disabled={expenseBusy}>{expenseBusy ? 'REGISTRANDO...' : 'REGISTRAR DESPESA PAGA'}</button>
          </form>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONTAS A PAGAR</span><h2>Registrar compromisso</h2></div><span>Obrigação futura</span></div>
          <p className="admin-empty">Compromissos em BRL e recompensas em MC são armazenados separadamente. MC não recebe valor em reais.</p>
          <form className="admin-note-form" onSubmit={(event) => void submitCommitment(event)}>
            <label>Tipo<select value={commitmentType} onChange={(event) => setCommitmentType(event.target.value)}><option value="operational">Operacional · BRL</option><option value="contractor">Prestador · BRL</option><option value="tax">Tributo · BRL</option><option value="other">Outro compromisso · BRL</option><option value="player_reward_mc">Recompensa de jogador · MC</option></select></label>
            <label>Categoria<input value={commitmentCategory} onChange={(event) => setCommitmentCategory(event.target.value)} minLength={2} maxLength={80} required /></label>
            <label>Descrição<input value={commitmentDescription} onChange={(event) => setCommitmentDescription(event.target.value)} minLength={3} maxLength={240} required /></label>
            <label>{commitmentType === 'player_reward_mc' ? 'Quantidade comprometida (MC)' : 'Valor comprometido (R$)'}<input inputMode="decimal" placeholder={commitmentType === 'player_reward_mc' ? '0,00000000' : '0,00'} value={commitmentAmount} onChange={(event) => setCommitmentAmount(event.target.value)} required /></label>
            <label>Vencimento<input type="date" value={commitmentDueDate} onChange={(event) => setCommitmentDueDate(event.target.value)} required /></label>
            <label>Referência<input value={commitmentSource} onChange={(event) => setCommitmentSource(event.target.value)} minLength={1} maxLength={160} required /></label>
            <label>Motivo / origem da obrigação<textarea value={commitmentReason} onChange={(event) => setCommitmentReason(event.target.value)} minLength={3} maxLength={500} required /></label>
            <button className="admin-primary" type="submit" disabled={commitmentBusy}>{commitmentBusy ? 'REGISTRANDO...' : 'REGISTRAR COMPROMISSO'}</button>
          </form>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">RESERVA FINANCEIRA</span><h2>Registrar movimento contábil</h2></div><span>Não transfere dinheiro</span></div>
        <form className="finance-reserve-form" onSubmit={(event) => void submitReserveMovement(event)}>
          <label>Movimento<select value={reserveType} onChange={(event) => setReserveType(event.target.value as 'contribution' | 'withdrawal')}><option value="contribution">Aporte na reserva</option><option value="withdrawal">Retirada da reserva</option></select></label>
          <label>Valor (R$)<input inputMode="decimal" placeholder="0,00" value={reserveAmount} onChange={(event) => setReserveAmount(event.target.value)} required /></label>
          <label>Referência<input value={reserveSource} onChange={(event) => setReserveSource(event.target.value)} minLength={1} maxLength={160} required /></label>
          <label>Motivo obrigatório<input value={reserveReason} onChange={(event) => setReserveReason(event.target.value)} minLength={3} maxLength={500} required /></label>
          <button className="admin-primary" type="submit" disabled={reserveBusy}>{reserveBusy ? 'REGISTRANDO...' : 'REGISTRAR MOVIMENTO'}</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">LANÇAMENTOS</span><h2>Despesas efetivas recentes</h2></div><span>Últimas 10</span></div>
        {data.recent_expenses.length === 0 ? <p className="admin-empty">Nenhuma despesa paga registrada.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Fornecedor</th><th>Valor</th></tr></thead><tbody>{data.recent_expenses.map((item) => <tr key={item.id}><td>{item.expense_date}</td><td>{item.category}</td><td>{item.description}</td><td>{item.vendor_reference || '—'}</td><td>{brl(item.amount_cents)}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">OBRIGAÇÕES</span><h2>Compromissos recentes</h2></div><span>Últimos 20</span></div>
        {data.recent_commitments.length === 0 ? <p className="admin-empty">Nenhum compromisso registrado.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Vencimento</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Status</th></tr></thead><tbody>{data.recent_commitments.map((item) => <tr key={item.id}><td>{item.due_date}</td><td>{item.commitment_type}</td><td>{item.description}</td><td>{item.amount_mc !== null ? decimal(item.amount_mc, 8) + ' MC' : brl(item.amount_cents)}</td><td>{item.status === 'open' ? <button className="admin-secondary admin-access-action" onClick={() => { setSelectedCommitmentId(item.id); setTransitionStatus(item.amount_cents !== null ? 'paid' : 'cancelled'); setTransitionExpenseId(''); setTransitionReason('') }}>GERENCIAR</button> : item.status}</td></tr>)}</tbody></table></div>}
      </section>

      {selectedCommitmentId && (() => {
        const selected = data.recent_commitments.find((item) => item.id === selectedCommitmentId)
        if (!selected) return null
        const matchingExpenses = data.recent_expenses.filter((item) => String(item.amount_cents) === String(selected.amount_cents))
        return <section className="admin-panel finance-transition-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">BAIXA DE OBRIGAÇÃO</span><h2>Atualizar compromisso</h2></div><button className="admin-secondary" type="button" onClick={() => setSelectedCommitmentId('')}>CANCELAR</button></div>
          <p className="admin-empty">{selected.description} · {selected.amount_mc !== null ? decimal(selected.amount_mc, 8) + ' MC' : brl(selected.amount_cents)} · vencimento {selected.due_date}</p>
          <form className="admin-note-form" onSubmit={(event) => void submitCommitmentTransition(event)}>
            <label>Resultado<select value={transitionStatus} onChange={(event) => setTransitionStatus(event.target.value as 'paid' | 'cancelled')}><option value="cancelled">Cancelar obrigação</option>{selected.amount_cents !== null && <option value="paid">Marcar como paga</option>}</select></label>
            {transitionStatus === 'paid' && <label>Despesa efetivamente paga (valor deve corresponder)<select value={transitionExpenseId} onChange={(event) => setTransitionExpenseId(event.target.value)} required><option value="">Selecione a despesa...</option>{matchingExpenses.map((expense) => <option key={expense.id} value={expense.id}>{expense.expense_date} · {expense.description} · {brl(expense.amount_cents)}</option>)}</select>{matchingExpenses.length === 0 && <small>Nenhuma despesa recente de valor correspondente. Registre a despesa paga primeiro.</small>}</label>}
            <label>Motivo obrigatório<textarea value={transitionReason} onChange={(event) => setTransitionReason(event.target.value)} minLength={3} maxLength={500} required /></label>
            <button className="admin-primary" type="submit" disabled={transitionBusy || transitionReason.trim().length < 3 || (transitionStatus === 'paid' && !transitionExpenseId)}>{transitionBusy ? 'PROCESSANDO...' : transitionStatus === 'paid' ? 'CONFIRMAR BAIXA COMO PAGA' : 'CONFIRMAR CANCELAMENTO'}</button>
          </form>
        </section>
      })()}

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">PREVISÃO DE OBRIGAÇÕES</span><h2>Compromissos de recompensa por mês</h2></div><span>Somente MC</span></div>
        <div className="finance-bars">{data.reward_commitments_monthly.map((item) => <div className="finance-bar-row" key={item.month}><span>{monthLabel(item.month)}</span><div className="finance-bar-track"><i style={{ width: `${Math.min(100, Number(item.amount_mc) / Math.max(1, ...data.reward_commitments_monthly.map((row) => Number(row.amount_mc))) * 100)}%` }} /></div><strong>{decimal(item.amount_mc, 8)} MC</strong></div>)}</div>
        <p className="admin-empty">Valores registrados como compromissos de recompensa, sem conversão para BRL. Como a emissão MC permanece bloqueada, este indicador não representa pagamento autorizado ou promessa de saque.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">MOVIMENTAÇÕES</span><h2>Histórico da reserva</h2></div><span>Últimos 10</span></div>
        {data.recent_reserve_movements.length === 0 ? <p className="admin-empty">Nenhum movimento de reserva registrado.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Tipo</th><th>Referência</th><th>Motivo</th><th>Valor</th></tr></thead><tbody>{data.recent_reserve_movements.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('pt-BR')}</td><td>{item.movement_type}</td><td>{item.source_reference}</td><td>{item.reason}</td><td>{brl(item.signed_amount_cents)}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">FECHAMENTO CONTÁBIL</span><h2>Conferir e fechar mês de despesas</h2></div><span>{data.reserve_closed_months_count}/3 meses fechados</span></div>
        <div className="finance-notice"><strong>Fechamento irreversível</strong><span>Feche somente depois de confirmar que todas as despesas efetivamente pagas naquele mês foram registradas. Um mês fechado não pode ser editado ou reaberto por esta interface.</span></div>
        <form className="finance-reserve-form" onSubmit={(event) => void submitMonthClose(event)}>
          <label>Mês concluído<input type="month" value={closeMonthValue} max={previousMonth()} onChange={(event) => setCloseMonthValue(event.target.value)} required /></label>
          <label className="finance-close-reason">Confirmação e justificativa<textarea value={closeMonthReason} onChange={(event) => setCloseMonthReason(event.target.value)} minLength={10} maxLength={500} placeholder="Confirmei as despesas pagas e os documentos do mês..." required /></label>
          <button className="admin-primary" type="submit" disabled={closeMonthBusy || closeMonthReason.trim().length < 10}>{closeMonthBusy ? 'FECHANDO...' : 'FECHAR MÊS CONTÁBIL'}</button>
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Mês</th><th>Fechamento</th><th>Justificativa</th></tr></thead><tbody>{data.expense_month_closings.length === 0 ? <tr><td colSpan={3}>Nenhum mês fechado.</td></tr> : data.expense_month_closings.map((item) => <tr key={item.month_start}><td>{item.month_start.slice(0, 7)}</td><td>{new Date(item.closed_at).toLocaleString('pt-BR')}</td><td>{item.reason}</td></tr>)}</tbody></table></div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">SOLVÊNCIA E LIQUIDEZ</span><h2>Fundo de garantia</h2></div><span>Meta móvel baseada em despesas reais</span></div>
        <div className="finance-reserve-row">
          <div><strong>{reserveCoverage === null ? 'Histórico incompleto · ' + data.reserve_closed_months_count + '/3 meses fechados' : `${decimal(reserveCoverage)}% coberto`}</strong><small>Saldo atual: {brl(data.reserve_balance_cents)} · Meta: {data.reserve_history_complete ? brl(data.reserve_target_cents) : 'aguardando fechamento'}</small></div>
          <strong className="finance-gap">{data.reserve_history_complete ? brl(data.reserve_gap_cents) : '—'} <small>{data.reserve_history_complete ? 'para atingir a meta' : 'meta ainda não validada'}</small></strong>
        </div>
        <div className="finance-progress"><span style={{ width: `${reserveCoverage ?? 0}%` }} /></div>
        <p className="admin-empty">A meta equivale à soma das despesas operacionais efetivamente pagas nos três últimos meses completos, mas só é considerada válida depois de fechar os três meses. Aporte e retirada ainda não são automáticos.</p>
      </section>

      <div className="finance-chart-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">DESEMPENHO</span><h2>Receita líquida mensal</h2></div><span>BRL</span></div>
          <div className="finance-bars">{data.revenue_months.map((item) => <div className="finance-bar-row" key={item.month}><span>{monthLabel(item.month)}</span><div className="finance-bar-track"><i style={{ width: `${Math.max(0, Number(item.net_cents)) / revenueMax * 100}%` }} /></div><strong>{brl(item.net_cents)}</strong></div>)}</div>
          <p className="admin-empty">A previsão é uma referência estatística simples, não promessa de receita nem orçamento disponível.</p>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">CUSTOS</span><h2>Despesas mensais</h2></div><span>BRL</span></div>
          <div className="finance-bars">{data.expense_months.map((item) => <div className="finance-bar-row" key={item.month}><span>{monthLabel(item.month)}</span><div className="finance-bar-track expense"><i style={{ width: `${Number(item.expense_cents) / expenseMax * 100}%` }} /></div><strong>{brl(item.expense_cents)}</strong></div>)}</div>
          <p className="admin-empty">Somente despesas efetivamente pagas entram no cálculo da meta de reserva.</p>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">POLÍTICA FINANCEIRA APROVADA</span><h2>Alocação de referência da receita líquida</h2></div><span>Não executa transferências</span></div>
        <div className="finance-allocation-grid">
          <article><strong>{data.allocation_policy.pool_percent}%</strong><span>Mining Pool</span></article>
          <article><strong>{data.allocation_policy.reserve_percent}%</strong><span>Reserva</span></article>
          <article><strong>{data.allocation_policy.operations_percent}%</strong><span>Operação e desenvolvimento</span></article>
          <article><strong>{data.allocation_policy.administration_percent}%</strong><span>Administração</span></article>
        </div>
        <p className="admin-empty">A parcela de reserva fica suspensa quando a meta for atingida, até revisão formal. Não há redirecionamento automático. O motor de alocação será implementado após fechamento e conciliação.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">ECONOMIA VIRTUAL</span><h2>Inflação e oferta de PIX COIN</h2></div><span>Indicadores de oferta, não inflação de preços</span></div>
        <div className="admin-stat-grid finance-stat-grid">
          <article className="admin-stat"><span>OFERTA CIRCULANTE ATUAL</span><strong>{integer(data.pc_economy.current_supply)} PC</strong><small>Saldo agregado das carteiras persistentes</small></article>
          <article className="admin-stat"><span>EMISSÃO BRUTA HISTÓRICA</span><strong>{integer(data.pc_economy.gross_issued)} PC</strong><small>Créditos registrados no ledger PC</small></article>
          <article className="admin-stat"><span>CONSUMO / SINKS</span><strong>{integer(data.pc_economy.gross_sunk)} PC</strong><small>Débitos registrados no ledger PC</small></article>
          <article className="admin-stat"><span>EMISSÃO LÍQUIDA</span><strong>{integer(data.pc_economy.net_issuance)} PC</strong><small>{data.pc_economy.net_issuance_vs_supply_percent === null ? 'Taxa indisponível sem oferta circulante' : `${decimal(data.pc_economy.net_issuance_vs_supply_percent)}% da oferta atual`}</small></article>
        </div>
        <div className="finance-snapshot-row"><div><strong>Variação da oferta em 30 dias</strong><small>{latestSupply ? `Último snapshot: ${new Date(latestSupply.captured_at).toLocaleString('pt-BR')}` : 'Nenhum snapshot registrado ainda.'}</small></div><strong>{supplyChange === null ? 'Aguardando linha de base' : `${supplyChange > 0 ? '+' : ''}${integer(supplyChange)} PC`}</strong></div>
        <p className="admin-empty">{data.pc_economy.interpretation} O botão “Registrar snapshot PIX” cria pontos de comparação históricos; o primeiro comparativo de 30 dias só estará disponível depois de transcorrido esse período.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">ENGAJAMENTO</span><h2>Atividade dos jogadores</h2></div><span>Telemetria em preparação</span></div>
        <div className="admin-stat-grid finance-stat-grid">
          <article className="admin-stat"><span>JOGADORES ATIVOS · 7 DIAS</span><strong>{integer(data.player_activity.unique_players_7d)}</strong><small>Eventos registrados no módulo de atividade</small></article>
          <article className="admin-stat"><span>JOGADORES ATIVOS · 30 DIAS</span><strong>{integer(data.player_activity.unique_players_30d)}</strong><small>Eventos registrados no módulo de atividade</small></article>
          <article className="admin-stat"><span>EVENTOS · 24 HORAS</span><strong>{integer(data.player_activity.events_24h)}</strong><small>Eventos de sessão e gameplay</small></article>
        </div>
        <div className="finance-notice"><strong>Telemetria inicial ativa</strong><span>{data.player_activity.telemetry_status} A cobertura atual inclui sessões autenticadas e início/conclusão de partidas. Os zeros indicam ausência de eventos observados na janela, não ausência de jogadores cadastrados. Eventos client-reported são analytics, nunca prova para gerar recompensas.</span></div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONTROLES E RASTREABILIDADE</span><h2>Auditoria financeira</h2></div><span>Últimos 20 eventos</span></div>
        {data.recent_financial_events.length === 0 ? <p className="admin-empty">Nenhuma operação financeira administrativa registrada.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{data.recent_financial_events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString('pt-BR')}</td><td>{event.event_type}</td><td>{event.entity_type} · {event.entity_id.slice(0, 8)}</td><td>{event.amount_mc !== null ? decimal(event.amount_mc, 8) + ' MC' : event.amount_cents !== null ? brl(event.amount_cents) : '—'}</td><td>{event.reason}</td></tr>)}</tbody></table></div>}
      </section>

      <p className="admin-generated">Dados consultados em {new Date(data.generated_at).toLocaleString('pt-BR')} · Financial Intelligence Center · Supabase DEV</p>
    </div>
  )
}
