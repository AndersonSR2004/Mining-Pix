import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type MonthRevenue = { month: string; gross_cents: number | string; deductions_cents: number | string; net_cents: number | string }
type MonthExpense = { month: string; expense_cents: number | string }
type EconomySnapshot = { captured_at: string; pc_supply: number | string; wallets_count: number; active_equipment_count: number; installed_hashrate: number | string; players_count: number }
type FinanceSnapshot = {
  generated_at: string
  revenue_months: MonthRevenue[]
  expense_months: MonthExpense[]
  revenue_last_3_full_months_cents: number | string
  revenue_forecast_next_month_cents: number | string
  forecast_method: string
  expenses_last_3_full_months_cents: number | string
  reserve_target_cents: number | string
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
}

const brl = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0) / 100)
const integer = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value ?? 0))
const decimal = (value: number | string | null | undefined, digits = 2) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value ?? 0))
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
        <article className="admin-stat"><span>RECEITA LÍQUIDA · 3 MESES COMPLETOS</span><strong>{brl(data.revenue_last_3_full_months_cents)}</strong><small>Somente entradas liquidadas e conciliadas</small></article>
        <article className="admin-stat"><span>PREVISÃO · PRÓXIMO MÊS</span><strong>{brl(data.revenue_forecast_next_month_cents)}</strong><small>Média simples dos três últimos meses completos</small></article>
        <article className="admin-stat"><span>COMPROMISSOS FINANCEIROS EM ABERTO</span><strong>{brl(data.commitments_open_brl_cents)}</strong><small>{brl(data.commitments_due_30d_brl_cents)} vencem nos próximos 30 dias</small></article>
        <article className="admin-stat"><span>RESERVA FINANCEIRA</span><strong>{brl(data.reserve_balance_cents)}</strong><small>Saldo registrado por movimentos auditáveis</small></article>
        <article className="admin-stat"><span>META DA RESERVA · 3 MESES</span><strong>{brl(data.reserve_target_cents)}</strong><small>Soma das despesas efetivas dos três últimos meses completos</small></article>
        <article className="admin-stat"><span>COMPROMISSOS DE RECOMPENSA</span><strong>{decimal(data.commitments_open_mc, 8)} MC</strong><small>Separados de obrigações em BRL; sem valor de resgate atribuído</small></article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">SOLVÊNCIA E LIQUIDEZ</span><h2>Fundo de garantia</h2></div><span>Meta móvel baseada em despesas reais</span></div>
        <div className="finance-reserve-row">
          <div><strong>{reserveCoverage === null ? 'Sem histórico suficiente' : `${decimal(reserveCoverage)}% coberto`}</strong><small>Saldo atual: {brl(data.reserve_balance_cents)} · Meta: {brl(data.reserve_target_cents)}</small></div>
          <strong className="finance-gap">{brl(data.reserve_gap_cents)} <small>para atingir a meta</small></strong>
        </div>
        <div className="finance-progress"><span style={{ width: `${reserveCoverage ?? 0}%` }} /></div>
        <p className="admin-empty">A meta equivale à soma das despesas operacionais efetivamente pagas nos três últimos meses completos. Aporte e retirada ainda não são automáticos.</p>
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
        <div className="finance-notice"><strong>Telemetria ainda não conectada</strong><span>{data.player_activity.telemetry_status} Até a integração, os zeros significam ausência de coleta, não ausência de jogadores ativos. Eventos enviados pelo cliente serão métricas de produto, nunca prova para gerar recompensas.</span></div>
      </section>

      <p className="admin-generated">Dados consultados em {new Date(data.generated_at).toLocaleString('pt-BR')} · Financial Intelligence Center · Supabase DEV</p>
    </div>
  )
}
