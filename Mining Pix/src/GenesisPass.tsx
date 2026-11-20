import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase/client'
import { formatDepix } from './lib/depixSandbox'

type Pass = {
  id: string; title: string; ends_at: string; premium: boolean; full: boolean; level: number; xp_per_level: number
  premium_price: string; skip_price: string; full_price: string
  claimed: { level: number; label: string; quantity: number }[]
}

export default function GenesisPass() {
  const [pass, setPass] = useState<Pass | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const requests = useRef(new Map<string, string>())

  async function refresh() {
    const { data, error: failure } = await supabase.rpc('genesis_pass_snapshot')
    if (failure) throw failure
    setPass(data as Pass | null)
  }
  function showError(failure: unknown) {
    setError(typeof failure === 'object' && failure && 'message' in failure ? String(failure.message) : 'Falha ao consultar o passe.')
  }
  useEffect(() => {
    void refresh().catch(showError).finally(() => setBusy(false))
  }, [])

  async function action(type: string, level: number | null, price: string | null) {
    if (!pass || busy) return
    setBusy(true)
    setError('')
    const key = `${pass.id}:${type}:${level}:${price}`
    const id = requests.current.get(key) ?? crypto.randomUUID()
    requests.current.set(key, id)
    try {
      const { error: failure } = await supabase.rpc('genesis_pass_action', {
        p_request: id, p_pass: pass.id, p_action: type, p_level: level, p_expected_price: price,
      })
      if (failure) throw failure
      requests.current.delete(key)
      await refresh()
    } catch (failure) { showError(failure) } finally { setBusy(false) }
  }

  return <section className="panel page-panel" aria-busy={busy}>
    <h2>{pass ? `Passe ${pass.title}` : 'Passe de batalha'}</h2>
    {error && <p role="alert">{error}</p>}
    {!pass && !busy && !error && <p>Nenhum passe ativo.</p>}
    {pass && <>
      <p>Nível {pass.level} de 30 · {pass.xp_per_level} XP por nível · até {new Date(pass.ends_at).toLocaleString('pt-BR')}.</p>
      <p>Preços em DePix fictício. Máquinas e racks de recompensa são itens de demonstração sem HASH.</p>
      <div className="shop-grid">
        {!pass.premium && <button type="button" className="primary-button" disabled={busy} onClick={() => void action('premium', null, pass.premium_price)}>Premium · {formatDepix(pass.premium_price)}</button>}
        {pass.premium && pass.level < 30 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void action('skip', null, pass.skip_price)}>Avançar 1 nível · {formatDepix(pass.skip_price)}</button>}
        {!pass.full && <button type="button" className="primary-button" disabled={busy} onClick={() => void action('full', null, pass.full_price)}>Passe completo · {formatDepix(pass.full_price)}</button>}
      </div>
      <div className="shop-grid">{Array.from({ length: 30 }, (_, index) => {
        const level = index + 1
        const claim = pass.claimed.find(entry => entry.level === level)
        const reward = level % 3 === 1 ? '10 parts' : level % 3 === 2 ? 'Rack de passe' : 'Máquina de passe'
        return <article className="panel shop-card" key={level}>
          <h3>Nível {level}</h3><p>{claim ? `${claim.quantity} × ${claim.label}` : reward}</p>
          {claim ? <p>Resgatado</p> : <button type="button" className="secondary-button" disabled={busy || !pass.premium || pass.level < level} onClick={() => void action('claim', level, null)}>Resgatar</button>}
        </article>
      })}</div>
    </>}
  </section>
}
