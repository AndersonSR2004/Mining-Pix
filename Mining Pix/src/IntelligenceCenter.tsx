import { analyzeEconomy, runSandboxIntegrityChecks, type EconomyBot, type EconomyCycle } from './lib/intelligence.ts'

type MachineRecord = {
  id: number
  name: string
  hashrate: number
  price: number
  roomId: number
}

type RoomRecord = {
  id: number
  name: string
  capacity: number
}

type Props = {
  balance: number
  totalRewards: number
  machines: MachineRecord[]
  inventory: MachineRecord[]
  rooms: RoomRecord[]
  bots: EconomyBot[]
  poolHistory: EconomyCycle[]
}

const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const pc = (value: number) => `${number(value)} PC`

export default function IntelligenceCenter(props: Props) {
  const economy = analyzeEconomy(props)
  const issues = runSandboxIntegrityChecks(props)
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  return (
    <section className="page-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INTELIGÊNCIA OPERACIONAL</span>
          <h2>Monitor econômico e auditoria</h2>
        </div>
        <span className="status">● SANDBOX</span>
      </div>
      <p className="page-description">
        Indicadores calculados com os dados disponíveis neste navegador. Não representam a economia global nem substituem validação no servidor.
      </p>

      <div className="stats">
        <article className="stat-card">
          <span>SALDOS VISÍVEIS</span>
          <h2>{pc(economy.visibleWalletSupply)}</h2>
          <p>JOGADOR + BOTS</p>
        </article>
        <article className="stat-card">
          <span>ORÇAMENTO REGISTRADO</span>
          <h2>{pc(economy.recordedPoolBudget)}</h2>
          <p>{economy.cyclesAnalyzed} CICLO(S) ANALISADO(S)</p>
        </article>
        <article className="stat-card">
          <span>RECOMPENSAS REGISTRADAS</span>
          <h2>{pc(economy.recordedDistributedRewards)}</h2>
          <p>JOGADOR + BOTS</p>
        </article>
        <article className="stat-card">
          <span>PARTICIPAÇÃO DO JOGADOR</span>
          <h2>{number(economy.playerWalletShare)}<small>%</small></h2>
          <p>DO SALDO VISÍVEL SOMADO</p>
        </article>
      </div>

      <div className="panel page-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">ECONOMIC INTELLIGENCE</span><h2>Indicadores da economia local</h2></div>
          <span className="equipment-count">{economy.activeBots} bots ativos</span>
        </div>
        <div className="pool-footer"><span>Saldo mantido pelos bots</span><strong>{pc(economy.botWalletSupply)}</strong></div>
        <div className="pool-footer"><span>Maior saldo individual entre bots / saldo dos bots</span><strong>{number(economy.largestBotBalanceShare)}%</strong></div>
        <div className="pool-footer"><span>Orçamento médio por ciclo</span><strong>{pc(economy.averageCycleBudget)}</strong></div>
        <div className="pool-footer"><span>Orçamento do ciclo mais recente</span><strong>{pc(economy.latestCycleBudget)}</strong></div>
        {economy.cyclesAnalyzed === 0 && (
          <p className="page-description">Ainda não há ciclos registrados. Execute simulações para começar a formar uma série histórica.</p>
        )}
      </div>

      <div className="panel page-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">SECURITY INTELLIGENCE</span><h2>Verificações de integridade</h2></div>
          <span className={errors.length ? 'equipment-count' : 'status'}>
            {errors.length ? `${errors.length} ERRO(S)` : '● SEM ERROS'}
          </span>
        </div>
        <div className="stats">
          <article className="stat-card">
            <span>ERROS</span><h2>{errors.length}</h2><p>INCONSISTÊNCIAS IMPORTANTES</p>
          </article>
          <article className="stat-card">
            <span>AVISOS</span><h2>{warnings.length}</h2><p>ITENS PARA REVISÃO</p>
          </article>
        </div>
        <div className="machine-list">
          {issues.map((issue) => (
            <div className="history-item" key={issue.id}>
              <div>
                <strong>{issue.title}</strong>
                <small>{issue.detail}</small>
              </div>
              <span className={issue.severity === 'error' ? 'equipment-count' : 'status'}>
                {issue.severity === 'error' ? 'ERRO' : 'AVISO'}
              </span>
            </div>
          ))}
        </div>
        <p className="page-description">
          Escopo atual: consistência de saldos, equipamentos, salas, bots e histórico de ciclos. Esta auditoria não detecta adulteração de localStorage, não protege APIs e não substitui autenticação, autorização ou testes de penetração.
        </p>
      </div>
    </section>
  )
}
