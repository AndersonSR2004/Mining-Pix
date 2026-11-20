import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

const categories = [
  ['pool_bps', 'Pool'],
  ['guarantee_bps', 'Fundo de garantia'],
  ['maintenance_bps', 'Manutenção'],
  ['administration_bps', 'Administração'],
] as const

type Policy = { revision: number } & Record<typeof categories[number][0], number>

export default function RevenuePolicy() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function update(weights?: number[]) {
    setBusy(true)
    setStatus('')
    try {
      const { data, error } = await supabase.rpc('admin_sandbox_revenue_policy', weights
        ? { p_expected_revision: policy?.revision, p_weights: weights } : {})
      if (error) { setStatus(error.message); return }
      setPolicy(data as Policy)
      if (weights) setStatus('Percentuais salvos.')
    } catch {
      setStatus('Não foi possível consultar a política.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { void update() }, [])
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const weights = categories.map(([name]) => Math.round(Number(fields.get(name)) * 100))
    if (weights.reduce((sum, weight) => sum + weight, 0) !== 10000) {
      setStatus('Os percentuais precisam somar 100%.')
      return
    }
    void update(weights)
  }
  return <section className="admin-panel">
    <h2>Distribuição da receita líquida elegível</h2>
    <p>Política do sandbox. A aprovação e o financiamento da pool são operações separadas.</p>
    {policy && <form key={policy.revision} className="admin-login-form" onSubmit={save}>
      {categories.map(([name, label]) => (
        <label key={name}>{label} (%) <input name={name} type="number" min="0" max="100" step="0.01" required defaultValue={policy[name] / 100} disabled={busy} /></label>
      ))}
      <button className="admin-secondary" disabled={busy}>Salvar percentuais</button>
    </form>}
    <button type="button" className="admin-secondary" onClick={() => void update()} disabled={busy}>Atualizar percentuais</button>
    {status && <p role="status">{status}</p>}
  </section>
}
