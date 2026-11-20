import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type DepixSnapshot = {
  total: string
  reserved: string
  available: string
  entries: { id: string; amount: string; entry_type: string; created_at: string }[]
}

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

function formatDepix(value: string) {
  const [integer, decimals = ''] = value.split('.')
  const fraction = decimals.replace(/0+$/, '').padEnd(2, '0')
  const sign = integer.startsWith('-') ? '-' : ''
  return `${sign}${BigInt(integer.replace(/^-/, '')).toLocaleString('pt-BR')},${fraction} DePix`
}

export default function DepixWalletPanel() {
  const [snapshot, setSnapshot] = useState<DepixSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadWallet = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data, error: requestError } = await supabase.rpc('depix_wallet_snapshot')
      if (requestError || !data) throw requestError ?? new Error('Carteira indisponível')
      setSnapshot(data as DepixSnapshot)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWallet()
  }, [loadWallet])

  return (
    <article className="panel page-panel persistent-wallet-panel" aria-busy={loading}>
      <div className="panel-heading">
        <h2>Carteira DePix · DEV</h2>
        <button type="button" className="secondary-button" disabled={loading} onClick={() => void loadWallet()}>
          Atualizar
        </button>
      </div>
      {loading && <p role="status">Consultando saldo e movimentações...</p>}
      {error && <p className="auth-error" role="alert">Não foi possível consultar a carteira DePix.</p>}
      {!loading && !error && snapshot && (
        <>
          <dl className="wallet-summary persistent-wallet-summary">
            <dt>Disponível</dt><dd>{formatDepix(snapshot.available)}</dd>
            <dt>Reservado</dt><dd>{formatDepix(snapshot.reserved)}</dd>
            <dt>Total</dt><dd>{formatDepix(snapshot.total)}</dd>
          </dl>
          <h3>Movimentações DePix</h3>
          {snapshot.entries.length === 0 && <p>Nenhuma movimentação registrada.</p>}
          {snapshot.entries.map((entry) => (
            <div className="history-item" key={entry.id}>
              <span>
                <strong>{entryLabels[entry.entry_type] ?? entry.entry_type}</strong>
                <small>{new Date(entry.created_at).toLocaleString('pt-BR')}</small>
              </span>
              <strong>{formatDepix(entry.amount)}</strong>
            </div>
          ))}
        </>
      )}
    </article>
  )
}
