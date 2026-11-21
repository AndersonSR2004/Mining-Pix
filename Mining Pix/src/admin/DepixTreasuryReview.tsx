import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { formatSandboxUnits } from '../lib/depixSandbox'

type Review = {
  pool_balance: string; obligations: string; reserved: string
  covered: string; uncovered: string; ledger_mismatches: number
}

export default function DepixTreasuryReview() {
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error: failure } = await supabase.rpc('depix_treasury_review')
        if (failure || !data) throw failure
        if (active) setReview(data as Review)
      } catch {
        if (active) setError(true)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  return <section className="admin-panel">
    <h2>Tesouraria DePix sandbox</h2>
    {error && <p role="alert">Não foi possível consultar a conciliação.</p>}
    {!review && !error && <p role="status">Consultando a tesouraria…</p>}
    {review && <>
      <dl>
        <dt>Saldo da pool</dt><dd>{formatSandboxUnits(review.pool_balance)}</dd>
        <dt>Saques em aberto</dt><dd>{formatSandboxUnits(review.obligations)}</dd>
        <dt>Reservas nas carteiras</dt><dd>{formatSandboxUnits(review.reserved)}</dd>
        <dt>Cobertura por conta</dt><dd>{review.obligations === '0' ? 'Sem obrigações' :
          `${Number(BigInt(review.covered) * 10000n / BigInt(review.obligations)) / 100}%`}</dd>
        <dt>Obrigações descobertas</dt><dd>{formatSandboxUnits(review.uncovered)}</dd>
        <dt>Contas com divergência contábil</dt><dd>{review.ledger_mismatches}</dd>
      </dl>
      {(review.ledger_mismatches > 0 || BigInt(review.uncovered) > 0n) &&
        <p role="alert">Há divergências ou obrigações sem reserva suficiente. Revise a conciliação.</p>}
    </>}
  </section>
}
