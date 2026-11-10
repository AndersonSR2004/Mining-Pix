import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

export default function AdminPowerTools() {
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState('')
  const [pcReason, setPcReason] = useState('')
  const [sku, setSku] = useState('')
  const [machineReason, setMachineReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function adjustPc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_adjust_player_pc', {
        p_target_user_id: target.trim(),
        p_amount: Number(amount),
        p_reason: pcReason.trim(),
        p_request_id: crypto.randomUUID(),
      })
      if (rpcError) throw rpcError
      const result = data as { balance_after: number; duplicate: boolean }
      setMessage(`Ajuste de PC registrado. Novo saldo: ${Number(result.balance_after).toLocaleString('pt-BR')} PC.${result.duplicate ? ' Solicitação idempotente.' : ''}`)
      setAmount(''); setPcReason('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no ajuste de PC.') }
    finally { setBusy(false) }
  }

  async function grantMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_grant_player_equipment', {
        p_target_user_id: target.trim(),
        p_sku: sku.trim(),
        p_reason: machineReason.trim(),
        p_request_id: crypto.randomUUID(),
      })
      if (rpcError) throw rpcError
      const result = data as { name?: string; sku: string; blessing_percent: number; duplicate?: boolean }
      setMessage(`Máquina ${result.name ?? result.sku} concedida ao inventário do jogador. Benção: ${Number(result.blessing_percent).toFixed(2)}%.`)
      setSku(''); setMachineReason('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao conceder máquina.') }
    finally { setBusy(false) }
  }

  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><span className="admin-eyebrow">ADMINISTRATIVE POWER TOOLS</span><h2>Superpoderes administrativos</h2></div><span>DEV · AUDITADO</span></div>
    <p className="admin-empty">Ajustes de PC afetam a carteira real DEV do jogador e geram uma transação no ledger. Concessões de máquinas entram no inventário sem cobrança e ficam identificadas como concessão administrativa. MINING COIN real continua protegida pela política de emissão exclusiva via Mining Pool; PC e MC dos bots são simulados separadamente no Sandbox.</p>
    <label className="power-target">UUID do jogador<input value={target} onChange={e => setTarget(e.target.value)} minLength={36} maxLength={36} placeholder="UUID da conta de destino" /></label>
    <div className="power-tools-grid">
      <form className="admin-note-form" onSubmit={adjustPc}>
        <h3>Ajustar saldo PIX COIN</h3>
        <label>Valor inteiro (positivo credita; negativo debita)<input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <label>Motivo obrigatório<textarea value={pcReason} onChange={e => setPcReason(e.target.value)} minLength={5} maxLength={500} rows={2} required /></label>
        <button className="admin-primary" disabled={busy || target.trim().length !== 36 || !Number.isInteger(Number(amount)) || Number(amount) === 0 || pcReason.trim().length < 5}>APLICAR AJUSTE PC</button>
      </form>
      <form className="admin-note-form" onSubmit={grantMachine}>
        <h3>Conceder máquina artificialmente</h3>
        <label>SKU da máquina<input value={sku} onChange={e => setSku(e.target.value)} maxLength={64} placeholder="Ex.: pix_starter_01" required /></label>
        <label>Motivo obrigatório<textarea value={machineReason} onChange={e => setMachineReason(e.target.value)} minLength={5} maxLength={500} rows={2} required /></label>
        <button className="admin-primary" disabled={busy || target.trim().length !== 36 || !sku.trim() || machineReason.trim().length < 5}>CONCEDER AO INVENTÁRIO</button>
      </form>
    </div>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {message && <p className="admin-success" role="status">{message}</p>}
  </section>
}
