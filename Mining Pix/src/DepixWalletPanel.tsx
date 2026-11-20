import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  entryLabel, formatDepix, parseSandboxAmount, sandboxDate, sandboxStatus,
  type SandboxBalances, type SandboxEntry, type SandboxTransaction,
} from './lib/depixSandbox'
import { supabase } from './lib/supabase/client'

type SandboxSnapshot = SandboxBalances & {
  entries: SandboxEntry[]
  deposits: SandboxTransaction[]
  withdrawals: SandboxTransaction[]
}

function TransactionHistory({ title, rows }: { title: string; rows: SandboxTransaction[] }) {
  return (
    <section className="depix-history">
      <h3>{title}</h3>
      {rows.length === 0 && <p>Nenhuma solicitação.</p>}
      {rows.map((row) => (
        <div className="history-item" key={row.id}>
          <span>
            <strong>{sandboxStatus(row.status)}</strong>
            <small>{sandboxDate(row.created_at)}</small>
            {row.destination_address && <small>{row.destination_address}</small>}
          </span>
          <strong>{formatDepix(row.amount)}</strong>
        </div>
      ))}
    </section>
  )
}

export default function DepixWalletPanel() {
  const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [operation, setOperation] = useState<'deposit' | 'withdrawal'>('deposit')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [requestId, setRequestId] = useState('')

  const loadWallet = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data, error } = await supabase.rpc('depix_sandbox_wallet_snapshot')
      if (error || !data) throw error ?? new Error('Carteira indisponível')
      setSnapshot(data as SandboxSnapshot)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadWallet() }, [loadWallet])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setNotice('')
    setSubmitError('')
    const parsed = parseSandboxAmount(amount)
    const target = destination.trim()
    if (!parsed || parsed.units <= 0n) {
      setSubmitError('Informe um valor positivo com até oito casas decimais.')
      return
    }
    if (operation === 'withdrawal' && !/^sandbox:[a-zA-Z0-9_-]{3,64}$/.test(target)) {
      setSubmitError('Use um destino fictício como sandbox:jogador.')
      return
    }
    const id = requestId || crypto.randomUUID()
    setRequestId(id)
    setBusy(true)
    try {
      const { error } = operation === 'deposit'
        ? await supabase.rpc('depix_sandbox_request_deposit', { p_request_id: id, p_amount: parsed.value })
        : await supabase.rpc('depix_sandbox_request_withdrawal', { p_request_id: id, p_amount: parsed.value, p_destination: target })
      if (error) {
        if (/insufficient/i.test(error.message)) {
          setSubmitError('Saldo disponível insuficiente para este saque.')
          return
        }
        throw error
      }
      setNotice(operation === 'deposit' ? 'Depósito fictício enviado para confirmação.' : 'Saque fictício enviado para aprovação.')
      setAmount('')
      setDestination('')
      setRequestId('')
      await loadWallet()
    } catch {
      setSubmitError('Não foi possível confirmar a solicitação. Tente novamente com os mesmos dados.')
    } finally {
      setBusy(false)
    }
  }

  function resetRequest() {
    setRequestId('')
    setSubmitError('')
    setNotice('')
  }

  return (
    <article className="panel page-panel persistent-wallet-panel" aria-busy={loading}>
      <div className="panel-heading">
        <h2>Carteira DePix · Sandbox</h2>
        <button type="button" className="secondary-button" disabled={loading || busy} onClick={() => void loadWallet()}>
          Atualizar
        </button>
      </div>
      <p>Saldo fictício, sem valor resgatável. Depósitos e saques são simulados.</p>
      {loading && <p role="status">Consultando saldo e movimentações...</p>}
      {loadError && <p className="auth-error" role="alert">Não foi possível atualizar a carteira DePix.</p>}
      {snapshot && (
        <>
          <dl className="depix-balances">
            <div><dt>Disponível</dt><dd>{formatDepix(snapshot.available)}</dd></div>
            <div><dt>Reservado</dt><dd>{formatDepix(snapshot.reserved)}</dd></div>
            <div><dt>Total</dt><dd>{formatDepix(snapshot.total)}</dd></div>
          </dl>
          <form className="depix-wallet-form" onSubmit={submit}>
            <label>
              Operação
              <select value={operation} disabled={busy} onChange={(event) => {
                setOperation(event.target.value === 'deposit' ? 'deposit' : 'withdrawal')
                resetRequest()
              }}>
                <option value="deposit">Depósito simulado</option>
                <option value="withdrawal">Saque simulado</option>
              </select>
            </label>
            <label>
              Valor em DePix
              <input required value={amount} disabled={busy} inputMode="decimal" maxLength={19} onChange={(event) => { setAmount(event.target.value); resetRequest() }} />
            </label>
            {operation === 'withdrawal' && (
              <label>
                Destino fictício
                <input required value={destination} disabled={busy} placeholder="sandbox:jogador" maxLength={72} onChange={(event) => { setDestination(event.target.value); resetRequest() }} />
              </label>
            )}
            <button className="secondary-button" type="submit" disabled={busy || loading || loadError}>
              {busy ? 'Enviando...' : 'Solicitar'}
            </button>
          </form>
          {notice && <p role="status">{notice}</p>}
          {submitError && <p className="auth-error" role="alert">{submitError}</p>}
          <TransactionHistory title="Depósitos" rows={snapshot.deposits} />
          <TransactionHistory title="Saques" rows={snapshot.withdrawals} />
          <section className="depix-history">
            <h3>Movimentações</h3>
            {snapshot.entries.length === 0 && <p>Nenhuma movimentação registrada.</p>}
            {snapshot.entries.map((entry) => (
              <div className="history-item" key={entry.id}>
                <span>
                  <strong>{entryLabel(entry.entry_type)}</strong>
                  <small>{sandboxDate(entry.created_at)}</small>
                </span>
                <strong>{formatDepix(entry.amount)}</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </article>
  )
}
