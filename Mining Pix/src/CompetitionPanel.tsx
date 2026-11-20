import { useCallback, useEffect, useState } from 'react'
import { formatSandboxUnits } from './lib/depixSandbox'
import { supabase } from './lib/supabase/client'
import './CompetitionPanel.css'

type LeaderboardRow = {
  position: number
  name: string
  hashrate: string
  league: string
  movement: number | null
}

type Ranking = {
  players: LeaderboardRow[]
  participants: number
  network_hashrate: string
  leagues: { name: string; minimum_hashrate: string }[]
  me: {
    position: number | null
    hashrate: string
    participation: string
    league: string
    movement: number | null
    starter_claimed: boolean
    history: { cycle_date: string; hashrate: string; reward_units: string; position: number }[]
  }
}

const pageSize = 25

function decimal(value: string) {
  const [integer, fractional = ''] = value.split('.')
  const decimals = fractional.replace(/0+$/, '')
  return BigInt(integer).toLocaleString('pt-BR') + (decimals ? ',' + decimals : '')
}

function movementLabel(movement: number | null) {
  if (movement === null) return 'Sem posição anterior'
  if (movement > 0) return `Subiu ${movement}`
  if (movement < 0) return `Caiu ${-movement}`
  return 'Sem mudança'
}

export default function CompetitionPanel({ admin = false }: { admin?: boolean } = {}) {
  const [offset, setOffset] = useState(0)
  const [ranking, setRanking] = useState<Ranking | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')

  const loadRanking = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: requestError } = await supabase.rpc('get_competition_ranking', { p_offset: offset })
      if (requestError || !data) throw requestError ?? new Error('Ranking indisponível')
      setRanking(data as Ranking)
    } catch {
      setRanking(null)
      setError('Não foi possível carregar o ranking.')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => { void loadRanking() }, [loadRanking])

  async function claimStarter() {
    setClaiming(true)
    setError('')
    try {
      const { error: requestError } = await supabase.rpc('claim_competition_starter')
      if (requestError) throw requestError
      await loadRanking()
    } catch {
      setError('Não foi possível ativar o equipamento inicial.')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <section className="panel page-panel competition-panel" aria-busy={loading}>
      <div className="panel-heading">
        <h2>Ranking global</h2>
        <button type="button" className="secondary-button" disabled={loading || claiming} onClick={() => void loadRanking()}>
          Atualizar
        </button>
      </div>
      {loading && <p role="status">Carregando classificação…</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {!loading && ranking && (
        <>
          <dl className="competition-stats">
            <div><dt>HASH da rede</dt><dd>{decimal(ranking.network_hashrate)} H/s</dd></div>
            <div><dt>Jogadores classificados</dt><dd>{ranking.participants.toLocaleString('pt-BR')}</dd></div>
            {!admin && (
              <>
                <div><dt>Seu HASH</dt><dd>{decimal(ranking.me.hashrate)} H/s</dd></div>
                <div><dt>Participação</dt><dd>{decimal(ranking.me.participation)}%</dd></div>
                <div><dt>Liga</dt><dd>{ranking.me.league}</dd></div>
                <div><dt>Posição</dt><dd>{ranking.me.position === null ? 'Sem classificação' : `#${ranking.me.position}`}</dd></div>
                {ranking.me.position !== null && <div><dt>Desde o último ciclo</dt><dd>{movementLabel(ranking.me.movement)}</dd></div>}
              </>
            )}
          </dl>
          {!admin && !ranking.me.starter_claimed && (
            <div className="competition-onboarding">
              <p>Ative seu equipamento inicial gratuito para colocar 10 H/s na competição. O equipamento fica vinculado à sua conta.</p>
              <button type="button" className="primary-button" onClick={() => void claimStarter()} disabled={claiming}>
                {claiming ? 'Ativando…' : 'Ativar equipamento inicial'}
              </button>
            </div>
          )}
          {!admin && ranking.me.starter_claimed && (
            <p>Equipamento inicial ativo · 10 H/s. A recompensa diária na aba Passe de Batalha também concede 2 H/s por 24 horas.</p>
          )}
          <p>Empates compartilham a mesma posição. A evolução compara o resultado atual ao último ciclo da pool.</p>
          {ranking.players.length > 0 ? (
            <div className="competition-scroll">
              <table>
                <thead><tr><th>Posição</th><th>Jogador</th><th>HASH</th><th>Liga</th><th>Evolução</th></tr></thead>
                <tbody>{ranking.players.map((row, index) => (
                  <tr key={offset + index}>
                    <td>{row.position}</td><td>{row.name}</td><td>{decimal(row.hashrate)} H/s</td>
                    <td>{row.league}</td><td>{movementLabel(row.movement)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>Nenhum jogador nesta página.</p>}
          {(offset > 0 || ranking.participants > pageSize) && (
            <div className="competition-pages">
              <button type="button" className="secondary-button" disabled={!offset} onClick={() => setOffset(offset - pageSize)}>Anterior</button>
              <span>Página {offset / pageSize + 1}</span>
              <button type="button" className="secondary-button" disabled={offset + pageSize >= ranking.participants || offset + pageSize > 100000}
                onClick={() => setOffset(offset + pageSize)}>Próxima</button>
            </div>
          )}
          <details>
            <summary>Requisitos de liga</summary>
            <dl className="competition-stats">
              {ranking.leagues.map(l => <div key={l.name}><dt>{l.name}</dt><dd>{decimal(l.minimum_hashrate)} H/s</dd></div>)}
            </dl>
          </details>
          {!admin && ranking.me.history.length > 0 && (
            <div className="competition-scroll">
              <table>
                <caption>Histórico pessoal de mineração</caption>
                <thead><tr><th>Ciclo (UTC)</th><th>Posição</th><th>HASH registrado</th><th>DePix fictício</th></tr></thead>
                <tbody>{ranking.me.history.map(cycle => (
                  <tr key={cycle.cycle_date}>
                    <td>{cycle.cycle_date.split('-').reverse().join('/')}</td><td>{cycle.position}</td>
                    <td>{decimal(cycle.hashrate)} H/s</td><td>{formatSandboxUnits(cycle.reward_units)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
