import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type Bot = { id: string; bot_number: number; display_name: string; hashrate: number; pc_balance: number; mc_balance: number; total_pc_earned: number; total_mc_earned: number; active: boolean }
type Block = { id: string; block_number: number; status: string; opened_at: string; duration_seconds: number; reward_pc: number; reward_mc: number; total_hashrate: number; participant_count: number; accelerated: boolean; closed_at: string | null }
type Snapshot = { session: { id: string; status: string; created_at: string }; bots: Bot[]; blocks: Block[]; network_hashrate: number; open_block: Block | null }
const fmt = (v: unknown, digits = 2) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: digits })

export default function SandboxNetworkControl() {
  const [sessionId, setSessionId] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [rewardPc, setRewardPc] = useState('100')
  const [rewardMc, setRewardMc] = useState('1')
  const [adjustReason, setAdjustReason] = useState('')
  const [now, setNow] = useState(Date.now())
  const settlingBlockRef = useRef('')
  const startPromiseRef = useRef<Promise<string> | null>(null)

  const load = useCallback(async (id: string) => {
    const { data, error: rpcError } = await supabase.rpc('admin_sandbox_snapshot', { p_session_id: id })
    if (rpcError) throw rpcError
    const result = data as Snapshot
    setSnapshot(result)
    if (result.open_block) {
      setRewardPc(String(result.open_block.reward_pc))
      setRewardMc(String(result.open_block.reward_mc))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!startPromiseRef.current) {
      startPromiseRef.current = (async () => {
        const { data, error: rpcError } = await supabase.rpc('admin_sandbox_start_session', {
          p_session_key: crypto.randomUUID(),
          p_reason: 'Nova sessão administrativa do sandbox',
        })
        if (rpcError) throw rpcError
        const id = String((data as { session_id?: string }).session_id ?? '')
        if (!id) throw new Error('O servidor não retornou a sessão de sandbox.')
        return id
      })()
    }
    startPromiseRef.current.then(async id => {
      if (!cancelled) {
        setSessionId(id)
        await load(id)
      }
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o sandbox.')
    })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const timer = window.setInterval(() => { void load(sessionId).catch(() => undefined) }, 10000)
    return () => window.clearInterval(timer)
  }, [sessionId, load])

  const remaining = useMemo(() => {
    if (!snapshot?.open_block) return 0
    return Math.max(0, Math.ceil((new Date(snapshot.open_block.opened_at).getTime() + 600000 - now) / 1000))
  }, [snapshot, now])

  async function settle(accelerate: boolean) {
    if (!sessionId || !snapshot?.open_block) return
    const why = accelerate ? adjustReason.trim() : 'Fechamento automático do bloco após 600 segundos'
    if (why.length < (accelerate ? 10 : 5)) {
      setError('Informe um motivo com pelo menos 10 caracteres para acelerar o bloco.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_sandbox_settle_block', {
        p_session_id: sessionId,
        p_block_id: snapshot.open_block.id,
        p_accelerate: accelerate,
        p_reason: why,
        p_request_id: crypto.randomUUID(),
      })
      if (rpcError) throw rpcError
      const result = data as { pc_distributed?: number; mc_distributed?: number; already_settled?: boolean }
      setMessage(result.already_settled ? 'Este bloco já havia sido liquidado.' : `Bloco liquidado no sandbox: ${fmt(result.pc_distributed, 0)} PC e ${fmt(result.mc_distributed, 8)} MC distribuídos.`)
      setAdjustReason('')
      await load(sessionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao liquidar o bloco.')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    const blockId = snapshot?.open_block?.id ?? ''
    if (remaining === 0 && blockId && !busy && settlingBlockRef.current !== blockId) {
      settlingBlockRef.current = blockId
      void settle(false)
    }
  }, [remaining, busy, snapshot?.open_block?.id])

  async function saveRewards() {
    if (!sessionId || !snapshot?.open_block) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_sandbox_set_rewards', {
        p_session_id: sessionId,
        p_block_id: snapshot.open_block.id,
        p_reward_pc: Number(rewardPc),
        p_reward_mc: Number(rewardMc),
        p_reason: adjustReason.trim(),
        p_request_id: crypto.randomUUID(),
      })
      if (rpcError) throw rpcError
      setMessage('Recompensa do próximo fechamento atualizada e auditada.')
      await load(sessionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao alterar a recompensa.')
    } finally { setBusy(false) }
  }

  return (
    <section className="admin-panel sandbox-control">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">TEST NETWORK · AMBIENTE ISOLADO</span><h2>Controle da rede sandbox</h2></div><span className="sandbox-status">SIMULAÇÃO</span></div>
      <p className="admin-empty">Cada abertura do Admin Center inicia uma sessão nova com 10 bots. Os bots recebem HASH aleatório de 0 a 100 H/s. PC e MC são creditados somente em carteiras sandbox, sem tocar nas carteiras reais, ledger financeiro oficial ou Mining Pool de produção.</p>
      {error && <div className="admin-error" role="alert">{error}</div>}
      {message && <p className="admin-success" role="status">{message}</p>}
      {!snapshot && !error && <p className="admin-empty">Inicializando os 10 bots de teste...</p>}
      {snapshot && (
        <>
          <div className="admin-stat-grid sandbox-stats">
            <article className="admin-stat"><span>HASH DA REDE</span><strong>{fmt(snapshot.network_hashrate)} <small>H/s</small></strong><small>Somente bots sandbox</small></article>
            <article className="admin-stat"><span>BOTS ATIVOS</span><strong>{snapshot.bots.filter(bot => bot.active).length}</strong><small>10 bots por sessão</small></article>
            <article className="admin-stat"><span>BLOCO ATUAL</span><strong>#{snapshot.open_block?.block_number ?? '—'}</strong><small>{remaining > 0 ? `${Math.floor(remaining / 60)}m ${remaining % 60}s restantes` : 'Pronto para fechamento'}</small></article>
          </div>
          <div className="sandbox-block-grid">
            <div><span className="admin-eyebrow">RECOMPENSA DO BLOCO ABERTO</span><strong>{fmt(snapshot.open_block?.reward_pc, 0)} PC</strong><strong>{fmt(snapshot.open_block?.reward_mc, 8)} MC</strong></div>
            <div><span className="admin-eyebrow">CONTROLE DE RECOMPENSA</span>
              <label>PIX COIN (PC)<input type="number" min="0" step="1" value={rewardPc} onChange={e => setRewardPc(e.target.value)} /></label>
              <label>MINING COIN (MC)<input type="number" min="0" step="0.00000001" value={rewardMc} onChange={e => setRewardMc(e.target.value)} /></label>
              <label>Motivo da alteração / aceleração<input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} maxLength={500} placeholder="Justificativa obrigatória..." /></label>
              <div className="sandbox-actions">
                <button className="admin-secondary" disabled={busy || !adjustReason.trim() || Number(rewardPc) < 0 || Number(rewardMc) < 0} onClick={() => void saveRewards()}>SALVAR RECOMPENSA</button>
                <button className="admin-primary" disabled={busy || remaining > 0 || !snapshot.open_block} onClick={() => void settle(false)}>FECHAR BLOCO (600S)</button>
                <button className="admin-danger" disabled={busy || adjustReason.trim().length < 10 || !snapshot.open_block} onClick={() => void settle(true)}>ACELERAR BLOCO</button>
              </div>
            </div>
          </div>
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">MINERADORES FICTÍCIOS</span><h2>10 bots da sessão</h2></div><span>PC e MC simulados</span></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Bot</th><th>HASH</th><th>Saldo PC</th><th>Saldo MC</th><th>PC recebido</th><th>MC recebido</th></tr></thead><tbody>
            {snapshot.bots.map(bot => <tr key={bot.id}><td><strong>{bot.display_name}</strong></td><td>{fmt(bot.hashrate)} H/s</td><td>{fmt(bot.pc_balance, 0)}</td><td>{fmt(bot.mc_balance, 8)}</td><td>{fmt(bot.total_pc_earned, 0)}</td><td>{fmt(bot.total_mc_earned, 8)}</td></tr>)}
          </tbody></table></div>
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">HISTÓRICO</span><h2>Últimos blocos</h2></div></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Bloco</th><th>Status</th><th>HASH</th><th>Participantes</th><th>Fechamento</th></tr></thead><tbody>
            {snapshot.blocks.map(block => <tr key={block.id}><td>#{block.block_number}</td><td>{block.status === 'settled' ? 'Liquidado' : 'Aberto'}</td><td>{fmt(block.total_hashrate)} H/s</td><td>{block.participant_count}</td><td>{block.closed_at ? new Date(block.closed_at).toLocaleString('pt-BR') : 'Em andamento'}</td></tr>)}
          </tbody></table></div>
        </>
      )}
    </section>
  )
}
