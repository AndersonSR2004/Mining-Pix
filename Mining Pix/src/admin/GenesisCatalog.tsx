import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

type Machine = { sku: string; name: string; hash: string; price: string; image_url: string }
type Season = { id: string; title: string; starts_at: string; ends_at: string; closed_at: string | null; items: Machine[] }

export default function GenesisCatalog() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const update = useCallback(async (action: 'list' | 'create' | 'close', payload?: object) => {
    setBusy(true)
    setError('')
    try {
      const { data, error: failure } = await supabase.rpc('admin_genesis_catalog', { p_action: action, p_payload: payload })
      if (failure) throw failure
      setSeasons(data as Season[])
      return true
    } catch (failure) {
      setError(typeof failure === 'object' && failure && 'message' in failure
        ? String(failure.message) : 'Não foi possível atualizar o catálogo.')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void update('list') }, [update])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const items = [1, 2, 3].map(tier => ({
      sku: value(`sku-${tier}`), name: value(`name-${tier}`),
      hash: value(`hash-${tier}`).replace(',', '.'), price: value(`price-${tier}`).replace(',', '.'),
      image_url: value(`image-${tier}`),
    }))
    const saved = await update('create', {
      title: value('title'), starts_at: new Date(value('start')).toISOString(), items,
    })
    if (saved) form.reset()
  }

  return (
    <section className="admin-panel" aria-busy={busy}>
      <h2>Temporadas da loja</h2>
      {error && <p role="alert">{error}</p>}
      <form className="admin-form" onSubmit={event => void create(event)}>
        <label>Nome da temporada <input name="title" required maxLength={64} /></label>
        <label>Início no horário local <input name="start" type="datetime-local" required /></label>
        <p>A temporada é ativada na data programada e dura 30 dias.</p>
        {[1, 2, 3].map(tier => (
          <fieldset key={tier} disabled={busy}>
            <legend>Máquina de nível {tier}</legend>
            <div className="admin-form">
              <label>Identificador <input name={`sku-${tier}`} pattern="[a-z0-9][a-z0-9_\-]{2,47}" required /></label>
              <label>Nome <input name={`name-${tier}`} maxLength={64} required /></label>
              <label>HASH <input name={`hash-${tier}`} type="number" step="0.01" min="0.01" required /></label>
              <label>Preço em DePix fictício <input name={`price-${tier}`} type="number" step="0.01" min="0.01" required /></label>
              <label>URL HTTPS da imagem <input name={`image-${tier}`} type="url" maxLength={500} /></label>
            </div>
          </fieldset>
        ))}
        <button className="admin-primary" disabled={busy}>Programar temporada</button>
      </form>
      {seasons.map(season => {
        const now = Date.now()
        const start = new Date(season.starts_at)
        const end = new Date(season.ends_at)
        const closed = Boolean(season.closed_at) || +end <= now
        return <article key={season.id}>
          <h3>{season.title}</h3>
          <p>{closed ? 'Encerrada' : +start > now ? 'Programada' : 'Ativa'} · {start.toLocaleString('pt-BR')} a {end.toLocaleString('pt-BR')}</p>
          <ul>{season.items.map(item => <li key={item.sku}>{item.name} · {item.hash} HASH · {item.price} DePix fictício</li>)}</ul>
          {!closed && <button type="button" className="admin-secondary" disabled={busy} onClick={() => {
            if (window.confirm(`Encerrar as vendas da temporada ${season.title}?`)) void update('close', { id: season.id })
          }}>Encerrar vendas</button>}
        </article>
      })}
    </section>
  )
}
