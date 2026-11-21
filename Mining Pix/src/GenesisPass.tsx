import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Pass = {
  title: string
  ends_at: string
  level: number
  premium: boolean
  claimed: { level: number; label: string; quantity: number }[]
}

export default function GenesisPass() {
  const [pass, setPass] = useState<Pass | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error: failure } = await supabase.rpc('genesis_pass_snapshot')
        if (failure) throw failure
        if (active) setPass(data as Pass | null)
      } catch {
        if (active) setError('Falha ao consultar o passe.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  return <section className="panel page-panel" aria-busy={loading}>
    <h2>{pass ? `Passe ${pass.title}` : 'Passe Genesis'}</h2>
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <p>Compras e novos resgates aguardam a próxima temporada.</p>}
    {pass && <>
      <p>Nível {pass.level} de 30 · até {new Date(pass.ends_at).toLocaleString('pt-BR')}.</p>
      {pass.premium && <p>Acesso Premium registrado.</p>}
      {pass.claimed.length > 0 && <>
        <h3>Resgates da temporada</h3>
        <ul>{pass.claimed.map(claim => <li key={claim.level}>
          Nível {claim.level} · {claim.quantity} × {claim.label}
        </li>)}</ul>
      </>}
    </>}
  </section>
}
