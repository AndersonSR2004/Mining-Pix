import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'
import { formatSandboxUnits, parseSandboxAmount } from '../lib/depixSandbox'

type Pool = {
  label: string; minimum_hash: number; percent: number; participants: number; hash: string
  reserved: string; distributed: string; retained: string; rounding: string
}
type Preview = { cap: string; unallocated: string; pools: Pool[] }
const emptyReserves = Array<string>(12).fill('0')
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 })

export default function LeaguePoolManager() {
  const [cap, setCap] = useState('0')
  const [reserves, setReserves] = useState(emptyReserves)
  const [result, setResult] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error: failure } = await supabase.rpc('preview_league_pools', { p_cap: '0', p_reserves: emptyReserves })
      if (!active) return
      if (failure) setError(failure.message)
      else setResult(data as Preview)
      setBusy(false)
    }
    void load()
    return () => { active = false }
  }, [])

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ceiling = parseSandboxAmount(cap)
    const amounts = reserves.map(parseSandboxAmount)
    if (!ceiling || amounts.some(amount => amount === null)) {
      setError('Informe valores DePix não negativos com até oito casas decimais.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error: failure } = await supabase.rpc('preview_league_pools', {
        p_cap: String(ceiling.units), p_reserves: amounts.map(amount => String(amount?.units)),
      })
      if (failure) setError(failure.message)
      else {
        setResult(data as Preview)
        setDirty(false)
      }
    } finally { setBusy(false) }
  }

  return <section className="admin-panel">
    <h2>Pools por liga</h2>
    <p>Simulação por bloco em DePix sandbox. Ativação condicionada à aprovação da alocação entre ligas.</p>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Consultando pools…</p>}
    {result && <form onSubmit={simulate}>
      <label>Teto hipotético por bloco (DePix) <input value={cap} inputMode="decimal" disabled={busy}
        onChange={event => { setCap(event.target.value); setDirty(true) }} /></label>
      <button className="admin-primary" type="submit" disabled={busy}>Simular</button>
      {dirty && <p>Valores abaixo correspondem à última simulação.</p>}
      <p>Sem alocação na última simulação: {formatSandboxUnits(result.unallocated)}</p>
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr>{['Liga', 'HASH mínimo', 'Multiplicador', 'Jogadores', 'HASH elegível', 'Reserva em DePix', 'Distribuição', 'Retido', 'Resíduo'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{result.pools.map((pool, index) => <tr key={pool.label}>
          <th scope="row">{pool.label}</th><td>{number.format(pool.minimum_hash)}</td>
          <td>{pool.percent}%</td><td>{number.format(pool.participants)}</td><td>{number.format(Number(pool.hash))}</td>
          <td><input aria-label={`Reserva ${pool.label} em DePix`} value={reserves[index]} inputMode="decimal" disabled={busy}
            onChange={event => { const value = event.target.value; setReserves(previous => previous.map((item, i) => i === index ? value : item)); setDirty(true) }} /></td>
          <td>{formatSandboxUnits(pool.distributed)}</td><td>{formatSandboxUnits(pool.retained)}</td><td>{formatSandboxUnits(pool.rounding)}</td>
        </tr>)}</tbody>
      </table></div>
    </form>}
  </section>
}
