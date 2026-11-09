import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type AdminTransaction = {
  id: string
  user_id: string
  display_name: string
  amount: number
  balance_after: number
  transaction_type: string
  description: string | null
  created_at: string
}
type AdminPlayer = { user_id: string; display_name: string; created_at: string }
type AdminSnapshot = {
  generated_at: string
  players_count: number
  wallets_count: number
  wallet_balance_pc: number
  installed_equipment_count: number
  installed_hashrate: number
  pool_open_cycles: number
  pool_settled_cycles: number
  pool_distributed_pc: number
  latest_transactions: AdminTransaction[]
  recent_players: AdminPlayer[]
}
type AdminAuditEvent = {
  id: string
  actor_user_id: string | null
  actor_display_name: string
  target_user_id: string | null
  target_display_name: string
  action: string
  entity_type: string
  entity_id: string | null
  reason: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
  request_id: string | null
  created_at: string
}
type AdminAuditSnapshot = { generated_at: string; total_events: number; events: AdminAuditEvent[] }

const number = (value: unknown) => Number(value ?? 0).toLocaleString('pt-BR')
const date = (value: string) => new Date(value).toLocaleString('pt-BR')
const shortId = (value: string | null) => value ? `${value.slice(0, 8)}…` : 'Sistema'

export default function AdminDashboard({ userEmail, onSignOut }: { userEmail: string; onSignOut: () => void }) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [audit, setAudit] = useState<AdminAuditSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditError, setAuditError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setAuditError('')
    const [dashboardResult, auditResult] = await Promise.all([
      supabase.rpc('admin_dashboard_snapshot'),
      supabase.rpc('admin_audit_snapshot'),
    ])

    if (dashboardResult.error) {
      setError(dashboardResult.error.message)
      setSnapshot(null)
    } else {
      setSnapshot(dashboardResult.data as AdminSnapshot)
    }

    if (auditResult.error) {
      setAuditError(auditResult.error.message)
      setAudit(null)
    } else {
      setAudit(auditResult.data as AdminAuditSnapshot)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <main className="admin-app">
      <header className="admin-header">
        <div className="admin-brand"><span className="admin-mark">MP</span><div><strong>MINING PIX</strong><small>ADMIN CENTER · DEV</small></div></div>
        <div className="admin-header-actions"><span>{userEmail}</span><button className="admin-secondary" onClick={onSignOut}>SAIR</button></div>
      </header>

      <section className="admin-content">
        <div className="admin-title-row">
          <div><span className="admin-eyebrow">VISÃO OPERACIONAL</span><h1>Painel administrativo</h1><p>Visão consolidada do banco DEV. Todas as informações são consultadas no backend.</p></div>
          <button className="admin-primary admin-refresh" onClick={() => { void load() }} disabled={loading}>{loading ? 'ATUALIZANDO...' : 'ATUALIZAR DADOS'}</button>
        </div>

        <div className="admin-security-note"><strong>Modo somente leitura</strong><span>Este painel não altera carteiras, recompensas, VIP, equipamentos ou ciclos. As operações privilegiadas continuam bloqueadas até uma etapa própria de aprovação.</span></div>

        {error && <div className="admin-error admin-error-panel" role="alert"><strong>Não foi possível consultar o painel</strong><span>{error}</span><small>Confirme a permissão administrativa e renove a sessão.</small></div>}
        {loading && !snapshot && <div className="admin-panel">Carregando indicadores do Supabase...</div>}

        {snapshot && (
          <>
            <div className="admin-stat-grid">
              <article className="admin-stat"><span>JOGADORES</span><strong>{number(snapshot.players_count)}</strong><small>Perfis cadastrados</small></article>
              <article className="admin-stat"><span>CARTEIRAS</span><strong>{number(snapshot.wallets_count)}</strong><small>Contas persistentes</small></article>
              <article className="admin-stat"><span>SALDO TOTAL</span><strong>{number(snapshot.wallet_balance_pc)} <small>PC</small></strong><small>Soma das carteiras DEV</small></article>
              <article className="admin-stat"><span>EQUIPAMENTOS INSTALADOS</span><strong>{number(snapshot.installed_equipment_count)}</strong><small>{number(snapshot.installed_hashrate)} H/s persistentes</small></article>
              <article className="admin-stat"><span>CICLOS ABERTOS</span><strong>{number(snapshot.pool_open_cycles)}</strong><small>Mining Pool</small></article>
              <article className="admin-stat"><span>CICLOS LIQUIDADOS</span><strong>{number(snapshot.pool_settled_cycles)}</strong><small>{number(snapshot.pool_distributed_pc)} PC distribuídos no DEV</small></article>
            </div>

            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="admin-eyebrow">LEDGER PERSISTENTE</span><h2>Movimentações recentes</h2></div><span>Últimas 20</span></div>
              {snapshot.latest_transactions.length === 0 ? <p className="admin-empty">Nenhuma movimentação persistente registrada.</p> : (
                <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Jogador</th><th>Tipo</th><th>Variação</th><th>Saldo após</th><th>Referência</th></tr></thead><tbody>
                  {snapshot.latest_transactions.map((tx) => <tr key={tx.id}><td>{date(tx.created_at)}</td><td><strong>{tx.display_name}</strong><small>{shortId(tx.user_id)}</small></td><td>{tx.transaction_type}</td><td className={tx.amount >= 0 ? 'admin-positive' : 'admin-negative'}>{tx.amount > 0 ? '+' : ''}{number(tx.amount)} PC</td><td>{number(tx.balance_after)} PC</td><td>{tx.description || '—'}</td></tr>)}
                </tbody></table></div>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONTAS</span><h2>Jogadores recentes</h2></div><span>Últimos 10</span></div>
              {snapshot.recent_players.length === 0 ? <p className="admin-empty">Nenhum jogador cadastrado.</p> : (
                <div className="admin-player-list">{snapshot.recent_players.map((player) => <div className="admin-player-row" key={player.user_id}><div><strong>{player.display_name || 'Jogador'}</strong><small>{player.user_id}</small></div><span>{date(player.created_at)}</span></div>)}</div>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="admin-eyebrow">TRILHA DE AUDITORIA</span><h2>Eventos administrativos</h2></div><span>{number(audit?.total_events ?? 0)} eventos · últimos 50</span></div>
              {auditError && <div className="admin-error" role="alert"><strong>Auditoria indisponível</strong><span>{auditError}</span></div>}
              {!auditError && audit && audit.events.length === 0 && <p className="admin-empty">Nenhuma ação administrativa registrada. Os eventos aparecerão aqui quando operações privilegiadas forem habilitadas.</p>}
              {!auditError && audit && audit.events.length > 0 && (
                <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Administrador</th><th>Ação</th><th>Alvo</th><th>Motivo</th><th>Detalhes</th></tr></thead><tbody>
                  {audit.events.map((event) => <tr key={event.id}>
                    <td>{date(event.created_at)}</td>
                    <td><strong>{event.actor_display_name}</strong><small>{shortId(event.actor_user_id)}</small></td>
                    <td><strong>{event.action}</strong><small>{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ''}</small></td>
                    <td><strong>{event.target_display_name}</strong><small>{shortId(event.target_user_id)}</small></td>
                    <td className="admin-audit-reason">{event.reason}</td>
                    <td><details className="admin-audit-details"><summary>Ver dados</summary><pre>{JSON.stringify({ before: event.before_data, after: event.after_data, metadata: event.metadata, request_id: event.request_id }, null, 2)}</pre></details></td>
                  </tr>)}
                </tbody></table></div>
              )}
            </section>
            <p className="admin-generated">Dados consultados em {date(snapshot.generated_at)} · Projeto Supabase DEV</p>
          </>
        )}
      </section>
    </main>
  )
}
