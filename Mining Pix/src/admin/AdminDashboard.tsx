import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'
import FinanceCenter from './FinanceCenter'
import SandboxNetworkControl from './SandboxNetworkControl'
import AdminPowerTools from './AdminPowerTools'

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
type AdminPlayer = {
  user_id: string
  display_name: string
  created_at: string
  wallet_balance_pc: number
  level: number
  xp: number
  vip_tier: number
  premium_pass: boolean
  installed_equipment_count: number
  installed_hashrate: number
  is_admin: boolean
  banned_until: string | null
  access_status: 'active' | 'blocked'
}
type AdminDirectory = { generated_at: string; total: number; limit: number; offset: number; players: AdminPlayer[] }
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
  const [activeSection, setActiveSection] = useState<'operations' | 'finance' | 'sandbox' | 'powers'>('operations')
  const [audit, setAudit] = useState<AdminAuditSnapshot | null>(null)
  const [directory, setDirectory] = useState<AdminDirectory | null>(null)
  const [directorySearch, setDirectorySearch] = useState('')
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditError, setAuditError] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [noteReason, setNoteReason] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteMessage, setNoteMessage] = useState('')
  const [noteError, setNoteError] = useState('')
  const [selectedAccessPlayer, setSelectedAccessPlayer] = useState<AdminPlayer | null>(null)
  const [accessAction, setAccessAction] = useState<'block' | 'unblock' | null>(null)
  const [accessReason, setAccessReason] = useState('')
  const [accessConfirmText, setAccessConfirmText] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessMessage, setAccessMessage] = useState('')
  const [accessError, setAccessError] = useState('')
  const [accessRequestId, setAccessRequestId] = useState('')

  const loadDirectory = useCallback(async (query: string, offset: number) => {
    setDirectoryLoading(true)
    setDirectoryError('')
    const { data, error: directoryRpcError } = await supabase.rpc('admin_player_directory', {
      p_search: query.trim() || null,
      p_limit: 25,
      p_offset: offset,
    })
    if (directoryRpcError) {
      setDirectoryError(directoryRpcError.message)
      setDirectory(null)
    } else {
      setDirectory(data as AdminDirectory)
    }
    setDirectoryLoading(false)
  }, [])

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

  useEffect(() => {
    void load()
    void loadDirectory('', 0)
  }, [load, loadDirectory])

  function searchPlayers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadDirectory(directorySearch, 0)
  }

  function beginAccessChange(player: AdminPlayer, action: 'block' | 'unblock') {
    setSelectedAccessPlayer(player)
    setAccessAction(action)
    setAccessReason('')
    setAccessConfirmText('')
    setAccessRequestId(crypto.randomUUID())
    setAccessMessage('')
    setAccessError('')
  }

  async function submitAccessChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAccessPlayer || !accessAction) return
    const expected = accessAction === 'block' ? 'BLOQUEAR' : 'DESBLOQUEAR'
    if (accessConfirmText.trim() !== expected) {
      setAccessError(`Digite exatamente ${expected} para confirmar.`)
      return
    }

    setAccessBusy(true)
    setAccessError('')
    setAccessMessage('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-control', {
        body: {
          action: 'set_player_access',
          target_user_id: selectedAccessPlayer.user_id,
          access_action: accessAction,
          reason: accessReason.trim(),
          request_id: accessRequestId || crypto.randomUUID(),
        },
      })
      if (invokeError) throw invokeError
      if (data?.status !== 'succeeded') throw new Error('O servidor não confirmou a alteração de acesso.')
      setAccessMessage(data.no_op
        ? 'A conta já estava no estado solicitado. A verificação foi auditada.'
        : accessAction === 'block'
          ? 'Conta bloqueada por 30 dias. A operação foi auditada.'
          : 'Bloqueio removido. A operação foi auditada.')
      setSelectedAccessPlayer(null)
      setAccessAction(null)
      setAccessReason('')
      setAccessConfirmText('')
      setAccessRequestId('')
      await load()
      await loadDirectory(directorySearch, directory?.offset ?? 0)
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : 'Não foi possível alterar o acesso.')
    } finally {
      setAccessBusy(false)
    }
  }

  async function createInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNoteBusy(true)
    setNoteError('')
    setNoteMessage('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-control', {
        body: {
          action: 'create_player_note',
          target_user_id: targetUserId.trim(),
          note: internalNote.trim(),
          reason: noteReason.trim(),
          request_id: crypto.randomUUID(),
        },
      })
      if (invokeError) throw invokeError
      if (!data?.event_id) throw new Error('O servidor não confirmou o registro.')
      setNoteMessage(data.duplicate ? 'Solicitação já registrada; nenhuma duplicação foi criada.' : 'Nota interna registrada e auditada.')
      setInternalNote('')
      setNoteReason('')
      await load()
      await loadDirectory(directorySearch, directory?.offset ?? 0)
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : 'Não foi possível registrar a nota.')
    } finally {
      setNoteBusy(false)
    }
  }

  const pageStart = directory && directory.total > 0 ? directory.offset + 1 : 0
  const pageEnd = directory ? Math.min(directory.offset + directory.players.length, directory.total) : 0

  return (
    <main className="admin-app">
      <header className="admin-header">
        <div className="admin-brand"><span className="admin-mark">MP</span><div><strong>MINING PIX</strong><small>ADMIN CENTER · DEV</small></div></div>
        <div className="admin-header-actions"><span>{userEmail}</span><button className="admin-secondary" onClick={onSignOut}>SAIR</button></div>
      </header>

      <section className="admin-content">
        <div className="admin-title-row">
          <div><span className="admin-eyebrow">VISÃO OPERACIONAL</span><h1>Painel administrativo</h1><p>Visão consolidada do banco DEV. Todas as informações são consultadas no backend.</p></div>
          <button className="admin-primary admin-refresh" onClick={() => { void load(); void loadDirectory(directorySearch, directory?.offset ?? 0) }} disabled={loading || directoryLoading}>{loading ? 'ATUALIZANDO...' : 'ATUALIZAR DADOS'}</button>
        </div>

        <div className="admin-security-note"><strong>Acesso administrativo restrito</strong><span>O Admin Center reúne controles de jogadores e Financial Intelligence Center. Lançamentos financeiros exigem motivo, referência e autorização server-side; o painel não executa transferências bancárias, emissão de MINING COIN ou saques.</span></div>

        <nav className="admin-section-nav" aria-label="Seções do Admin Center">
          <button className={activeSection === 'operations' ? 'active' : ''} onClick={() => setActiveSection('operations')}>CENTRO OPERACIONAL</button>
          <button className={activeSection === 'finance' ? 'active' : ''} onClick={() => setActiveSection('finance')}>FINANCIAL INTELLIGENCE</button>
          <button className={activeSection === 'sandbox' ? 'active' : ''} onClick={() => setActiveSection('sandbox')}>NETWORK CONTROL</button>
          <button className={activeSection === 'powers' ? 'active' : ''} onClick={() => setActiveSection('powers')}>SUPER POWERS</button>
        </nav>
        <div style={{ display: activeSection === 'sandbox' ? 'block' : 'none' }}><SandboxNetworkControl /></div>
        {activeSection === 'powers' && <AdminPowerTools />}
        {activeSection === 'finance' ? <FinanceCenter /> : activeSection === 'sandbox' || activeSection === 'powers' ? null : <>

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
              <div className="admin-panel-heading"><div><span className="admin-eyebrow">GESTÃO DE CONTAS · FASE 7A</span><h2>Diretório de jogadores</h2></div><span>{number(directory?.total ?? 0)} contas</span></div>
              <p className="admin-empty">Pesquise pelo nome ou pelo início do UUID. O diretório é somente leitura; os únicos controles disponíveis são bloquear ou desbloquear contas comuns, com motivo obrigatório e confirmação explícita.</p>
              <form className="admin-directory-search" onSubmit={searchPlayers}>
                <input aria-label="Buscar jogador" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} maxLength={80} placeholder="Nome do jogador ou início do UUID..." />
                <button className="admin-primary" type="submit" disabled={directoryLoading}>{directoryLoading ? 'BUSCANDO...' : 'PESQUISAR'}</button>
              </form>
              {directoryError && <div className="admin-error" role="alert">{directoryError}</div>}
              {directoryLoading && !directory && <p className="admin-empty">Carregando diretório...</p>}
              {!directoryError && directory && directory.players.length === 0 && <p className="admin-empty">Nenhum jogador encontrado para esta pesquisa.</p>}
              {!directoryError && directory && directory.players.length > 0 && (
                <>
                  <div className="admin-directory-meta"><span>Exibindo {number(pageStart)}–{number(pageEnd)} de {number(directory.total)}</span><span>Consulta e ações de acesso auditadas</span></div>
                  <div className="admin-table-wrap"><table className="admin-table admin-directory-table"><thead><tr><th>Jogador / UUID</th><th>Cadastro</th><th>Saldo</th><th>Nível / XP</th><th>VIP</th><th>Equipamentos</th><th>Hashrate</th><th>Passe</th><th>Acesso</th><th>Controle</th></tr></thead><tbody>
                    {directory.players.map((player) => <tr key={player.user_id}>
                      <td><strong>{player.display_name || 'Jogador'}</strong><small>{player.user_id}</small></td>
                      <td>{date(player.created_at)}</td>
                      <td>{number(player.wallet_balance_pc)} PC</td>
                      <td>{number(player.level)} / {number(player.xp)} XP</td>
                      <td>VIP {number(player.vip_tier)}</td>
                      <td>{number(player.installed_equipment_count)}</td>
                      <td>{number(player.installed_hashrate)} H/s</td>
                      <td>{player.premium_pass ? 'Premium' : 'Padrão'}</td>
                      <td>{player.is_admin ? 'Administrador' : player.access_status === 'blocked' ? <><strong className="admin-negative">Bloqueado</strong><small>Até {player.banned_until ? date(player.banned_until) : '—'}</small></> : <span className="admin-positive">Ativo</span>}</td>
                      <td>{player.is_admin ? 'Protegido' : <button className="admin-secondary admin-access-action" onClick={() => beginAccessChange(player, player.access_status === 'blocked' ? 'unblock' : 'block')}>{player.access_status === 'blocked' ? 'DESBLOQUEAR' : 'BLOQUEAR'}</button>}</td>
                    </tr>)}
                  </tbody></table></div>
                  <div className="admin-directory-pagination">
                    <button className="admin-secondary" disabled={directoryLoading || directory.offset === 0} onClick={() => { void loadDirectory(directorySearch, Math.max(0, directory.offset - directory.limit)) }}>ANTERIOR</button>
                    <span>Página {Math.floor(directory.offset / directory.limit) + 1} de {Math.max(1, Math.ceil(directory.total / directory.limit))}</span>
                    <button className="admin-secondary" disabled={directoryLoading || directory.offset + directory.limit >= directory.total} onClick={() => { void loadDirectory(directorySearch, directory.offset + directory.limit) }}>PRÓXIMA</button>
                  </div>
                </>
              )}
            </section>

            {selectedAccessPlayer && accessAction && (
              <section className="admin-panel admin-access-panel">
                <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONTROLE DE ACESSO · FASE 7B</span><h2>{accessAction === 'block' ? 'Bloquear conta' : 'Desbloquear conta'}</h2></div><button className="admin-secondary" type="button" onClick={() => { setSelectedAccessPlayer(null); setAccessAction(null); setAccessRequestId(''); setAccessError('') }} disabled={accessBusy}>CANCELAR</button></div>
                <p className="admin-empty">Conta: <strong>{selectedAccessPlayer.display_name}</strong> · {selectedAccessPlayer.user_id}</p>
                <p className="admin-empty">{accessAction === 'block' ? 'O bloqueio impedirá novos logins e renovações de sessão por 30 dias. Tokens de acesso já emitidos podem permanecer válidos até expirarem (normalmente até 1 hora); portanto, a interrupção de sessões já abertas não é instantânea.' : 'O desbloqueio remove o banimento no Supabase Auth e permite que a conta volte a autenticar.'}</p>
                <form className="admin-note-form" onSubmit={(event) => { void submitAccessChange(event) }}>
                  <label>Motivo obrigatório<textarea value={accessReason} onChange={(event) => setAccessReason(event.target.value)} minLength={5} maxLength={500} rows={3} placeholder="Descreva o motivo administrativo da alteração..." required /></label>
                  <label>Confirmação explícita<input value={accessConfirmText} onChange={(event) => setAccessConfirmText(event.target.value)} placeholder={accessAction === 'block' ? 'Digite BLOQUEAR' : 'Digite DESBLOQUEAR'} autoComplete="off" required /></label>
                  <button className="admin-primary" type="submit" disabled={accessBusy || accessReason.trim().length < 5 || accessConfirmText.trim() !== (accessAction === 'block' ? 'BLOQUEAR' : 'DESBLOQUEAR')}>{accessBusy ? 'PROCESSANDO...' : accessAction === 'block' ? 'CONFIRMAR BLOQUEIO POR 30 DIAS' : 'CONFIRMAR DESBLOQUEIO'}</button>
                </form>
                {accessError && <div className="admin-error" role="alert">{accessError}<span>Se o servidor indicar auditoria pendente, tente novamente sem alterar os dados desta solicitação.</span></div>}
                {accessMessage && <p className="admin-success" role="status">{accessMessage}</p>}
              </section>
            )}

            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="admin-eyebrow">SUPORTE ADMINISTRATIVO</span><h2>Registrar nota interna</h2></div><span>Sem efeito na conta do jogador</span></div>
              <p className="admin-empty">Registre um contexto interno para atendimento ou investigação. A nota fica visível somente no Admin Center e entra na trilha imutável de auditoria.</p>
              <form className="admin-note-form" onSubmit={(event) => { void createInternalNote(event) }}>
                <label>ID do jogador (UUID)<input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="Cole o UUID da conta" minLength={36} maxLength={36} required /></label>
                <label>Nota interna<textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} minLength={5} maxLength={1500} rows={3} placeholder="Descreva o contexto de suporte ou observação interna..." required /></label>
                <label>Motivo do registro<textarea value={noteReason} onChange={(event) => setNoteReason(event.target.value)} minLength={3} maxLength={500} rows={2} placeholder="Por que esta nota está sendo registrada?" required /></label>
                <button className="admin-primary" type="submit" disabled={noteBusy || !targetUserId.trim() || internalNote.trim().length < 5 || noteReason.trim().length < 3}>{noteBusy ? 'REGISTRANDO...' : 'REGISTRAR NOTA AUDITADA'}</button>
              </form>
              {noteError && <div className="admin-error" role="alert">{noteError}</div>}
              {noteMessage && <p className="admin-success" role="status">{noteMessage}</p>}
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
        </>}
      </section>
    </main>
  )
}
