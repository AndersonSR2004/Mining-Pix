import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type WalletRow = { balance: number | string; version: number }
type TransactionRow = {
  id: string
  amount: number | string
  balance_after: number | string
  transaction_type: string
  description: string
  created_at: string
}

function formatPc(value: number | string) {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export default function PersistentWalletPanel() {
  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadWallet = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const [walletResult, transactionsResult] = await Promise.all([
        supabase.from('wallets').select('balance, version').maybeSingle(),
        supabase.from('wallet_transactions')
          .select('id, amount, balance_after, transaction_type, description, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      if (walletResult.error) throw walletResult.error
      if (transactionsResult.error) throw transactionsResult.error
      if (!walletResult.data) throw new Error('Carteira persistente não encontrada para esta conta.')

      setWallet(walletResult.data as WalletRow)
      setTransactions((transactionsResult.data ?? []) as TransactionRow[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a carteira persistente.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadWallet()
  }, [loadWallet])

  return (
    <article className="panel page-panel persistent-wallet-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SUPABASE · DADOS DO SERVIDOR</span>
          <h2>Carteira persistente</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadWallet(true)} disabled={refreshing}>
          {refreshing ? 'ATUALIZANDO...' : 'ATUALIZAR'}
        </button>
      </div>

      {loading ? <p className="page-description">Consultando sua carteira no banco de dados...</p> : error ? (
        <p className="auth-error" role="alert">{error}</p>
      ) : wallet ? (
        <>
          <div className="wallet-summary persistent-wallet-summary">
            <span>SALDO PERSISTENTE</span>
            <strong>{formatPc(wallet.balance)} PC</strong>
            <small>Banco de dados · versão {wallet.version}</small>
          </div>
          <div className="panel-heading"><h3>Ledger de transações</h3><span className="status">IMUTÁVEL</span></div>
          {transactions.length === 0 ? (
            <p className="page-description">Nenhuma movimentação persistente registrada. Sua carteira começa com saldo zero.</p>
          ) : transactions.map((transaction) => (
            <div className="history-item" key={transaction.id}>
              <span>
                <strong>{transaction.description || transaction.transaction_type}</strong>
                <small>{new Date(transaction.created_at).toLocaleString('pt-BR')}</small>
              </span>
              <strong className={Number(transaction.amount) < 0 ? 'wallet-debit' : 'wallet-credit'}>
                {Number(transaction.amount) > 0 ? '+' : ''}{formatPc(transaction.amount)} PC
              </strong>
            </div>
          ))}
        </>
      ) : null}
      <p className="page-description">Este saldo é independente do saldo de demonstração local. Nenhum saldo antigo foi importado e nenhuma recompensa local foi convertida em crédito persistente.</p>
    </article>
  )
}
