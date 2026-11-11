import { useEffect, useState } from 'react'
import Games from './Games.tsx'
import PersistentWalletPanel from './PersistentWalletPanel.tsx'
import PersistentEquipmentShop from './PersistentEquipmentShop.tsx'
import PersistentFacilityPanel from './PersistentFacilityPanel.tsx'
import PersistentMiningPool from './PersistentMiningPool.tsx'
import PersistentProgressPanel from './PersistentProgressPanel.tsx'
import PersistentVipPanel from './PersistentVipPanel.tsx'
import LiveEventsPanel from './LiveEventsPanel.tsx'
import { DAILY_REWARDED_AD_LIMIT, getMissionProgress, MISSIONS, recordMissionProgress, refreshMissionState, createMissionState, type MissionState } from './lib/missions.ts'
import './App.css'

type Page = 'Dashboard' | 'Equipamentos' | 'Loja' | 'Passe de Batalha' | 'Missões' | 'Jogos' | 'Carteira' | 'VIP'
type AppProps = { userId: string; email: string; displayName: string; onSignOut: () => void | Promise<void> }

const menu: { name: Page; icon: string }[] = [
  { name: 'Dashboard', icon: '◈' },
  { name: 'Equipamentos', icon: '▤' },
  { name: 'Loja', icon: '♜' },
  { name: 'Passe de Batalha', icon: '⚔' },
  { name: 'Missões', icon: '◎' },
  { name: 'Jogos', icon: '🎮' },
  { name: 'Carteira', icon: '◉' },
  { name: 'VIP', icon: '♛' },
]


function App({ userId, email, displayName, onSignOut }: AppProps) {
  const [page, setPage] = useState<Page>('Dashboard')
  const [message, setMessage] = useState('')
  const missionStorageKey = `mining-pix-missions-v2:${userId}`
  const [missionState, setMissionState] = useState<MissionState>(() => {
    try {
      const raw = localStorage.getItem(missionStorageKey)
      return refreshMissionState(raw ? JSON.parse(raw) as MissionState : createMissionState())
    } catch {
      return createMissionState()
    }
  })
  const [missionXp, setMissionXp] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(missionStorageKey, JSON.stringify(missionState)) } catch { /* storage unavailable */ }
  }, [missionStorageKey, missionState])

  useEffect(() => {
    setMissionState(value => recordMissionProgress(value, 'daily_login'))
  }, [])

  function claimMissionReward(missionId: string) {
    const mission = MISSIONS.find(item => item.id === missionId)
    if (!mission) return
    const current = refreshMissionState(missionState)
    if (current.claimed.includes(missionId) || getMissionProgress(current, mission) < mission.target) {
      setMessage('Missão ainda não concluída ou recompensa já resgatada.')
      return
    }
    setMissionState({ ...current, claimed: [...current.claimed, missionId] })
    setMissionXp(value => value + mission.rewardXp)
    setMessage(`Missão resgatada: +${mission.rewardXp} XP de demonstração.`)
  }

  function renderDashboard() {
    return (
      <section className="page-content dashboard-home">
        <section className="welcome dashboard-welcome">
          <div><span className="eyebrow">CENTRAL DE OPERAÇÕES</span><h1>Seu centro de mineração.</h1><p>Suas salas são permanentes. Expanda a infraestrutura, organize seus equipamentos e acompanhe seu poder.</p></div>
        </section>
        <PersistentFacilityPanel mode="dashboard" onManage={() => setPage('Equipamentos')} />
        <PersistentMiningPool compact />
        <LiveEventsPanel />
      </section>
    )
  }

  function renderEquipment() {
    return (
      <section className="page-content">
        <span className="eyebrow">INFRAESTRUTURA PERMANENTE</span><h1>Salas e equipamentos</h1>
        <p className="page-description">Gerencie salas, equipamentos instalados e itens disponíveis no inventário em uma única tela.</p>
        <PersistentFacilityPanel mode="management" />
      </section>
    )
  }

  function renderShop() {
    return (
      <section className="page-content">
        <span className="eyebrow">EXPANDA SUA OPERAÇÃO</span><h1>Loja de equipamentos</h1>
        <p className="page-description">O catálogo atual contém somente equipamentos ativos e compatíveis com a economia vigente.</p>
        <PersistentEquipmentShop />
      </section>
    )
  }

  function renderWallet() {
    return (
      <section className="page-content">
        <span className="eyebrow">GESTÃO DE RECURSOS</span><h1>Minha carteira</h1>
        <p className="page-description">Consulte o saldo PIX COIN e o ledger persistente da sua conta.</p>
        <PersistentWalletPanel />
      </section>
    )
  }

  function renderVip() {
    return (
      <section className="page-content">
        <span className="eyebrow">PROGRAMA DE BENEFÍCIOS</span><h1>VIP</h1>
        <p className="page-description">Qualificação automática pelas recargas confirmadas nos últimos 30 dias. O VIP não concede nem retira salas: toda sala comprada com PC permanece na conta.</p>
        <PersistentVipPanel />
      </section>
    )
  }

  function renderBattlePass() {
    return (
      <section className="page-content">
        <span className="eyebrow">TEMPORADAS E PROGRESSÃO</span><h1>Passe de Batalha</h1>
        <PersistentProgressPanel userId={userId} />
        <LiveEventsPanel filter="battle_pass" />
        <p className="page-description">As temporadas são criadas, configuradas e ativadas no Admin Center. A loja de níveis e os resgates serão habilitados quando regras, preços em PC e recompensas forem homologados. Passe não emite MC.</p>
      </section>
    )
  }

  function renderMissions() {
    const current = refreshMissionState(missionState)
    const renderGroup = (period: 'daily' | 'weekly') => (
      <div className="panel page-panel">
        <div className="panel-heading"><h2>{period === 'daily' ? 'Missões diárias' : 'Missões semanais'}</h2><span className="equipment-count">{period === 'daily' ? 'REINÍCIO DIÁRIO' : 'REINÍCIO SEGUNDA-FEIRA'}</span></div>
        <div className="shop-grid">
          {MISSIONS.filter(mission => mission.period === period).map(mission => {
            const progress = Math.min(getMissionProgress(current, mission), mission.target)
            const completed = progress >= mission.target
            const claimed = current.claimed.includes(mission.id)
            return <article className="panel shop-card" key={mission.id}>
              <span className="eyebrow">{period === 'daily' ? 'DIÁRIA' : 'SEMANAL'}</span><h2>{mission.title}</h2><p>{mission.description}</p>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progress / mission.target * 100}%` }} /></div>
              <div className="pool-footer"><span>Progresso</span><strong>{progress} / {mission.target}</strong></div>
              {mission.id === 'daily-rewarded-ad' && <div className="pool-footer"><span>Anúncios assistidos hoje</span><strong>{missionState.dailyProgress.rewarded_ads ?? 0} / {DAILY_REWARDED_AD_LIMIT}</strong></div>}
              <div className="pool-footer"><span>Recompensa de demonstração</span><strong>{mission.rewardXp} XP</strong></div>
              {claimed ? <span className="status">✓ RESGATADA</span> : <button className="primary-button" disabled={!completed} onClick={() => claimMissionReward(mission.id)}>{completed ? 'RESGATAR XP DE DEMONSTRAÇÃO' : 'EM ANDAMENTO'}</button>}
            </article>
          })}
        </div>
      </div>
    )
    return (
      <section className="page-content">
        <span className="eyebrow">CENTRAL DE OBJETIVOS</span><h1>Missões</h1>
        <p className="page-description">As missões demonstrativas abaixo ainda não creditam XP persistente nem MC. O XP exibido é local e não altera o nível online.</p>
        <div className="stats"><article className="stat-card"><span>XP LOCAL DE MISSÕES</span><h2>{missionXp.toLocaleString('pt-BR')}</h2></article><article className="stat-card"><span>MISSÕES DIÁRIAS CONCLUÍDAS NA SEMANA</span><h2>{current.weeklyCompletedDailyMissions}</h2></article></div>
        {renderGroup('daily')}
        <article className="panel page-panel"><div className="panel-heading"><h2>Contador semanal</h2><span className="equipment-count">MISSÕES DIÁRIAS CONCLUÍDAS</span></div><p className="page-description">O contador soma cada missão diária uma única vez por dia. As metas são cumulativas.</p><div className="pool-footer"><span>Total nesta semana</span><strong>{current.weeklyCompletedDailyMissions} / 50</strong></div></article>
        {renderGroup('weekly')}
      </section>
    )
  }

  function renderPage() {
    switch (page) {
      case 'Dashboard': return renderDashboard()
      case 'Equipamentos': return renderEquipment()
      case 'Loja': return renderShop()
      case 'Passe de Batalha': return renderBattlePass()
      case 'Missões': return renderMissions()
      case 'Jogos': return <Games userId={userId} onGameComplete={event => setMissionState(value => recordMissionProgress(value,event))} />
      case 'Carteira': return renderWallet()
      case 'VIP': return renderVip()
      default: return renderDashboard()
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><span className="logo-icon">⛏</span><div><h2>MINING PIX</h2><small>DIGITAL MINING</small></div></div>
        <nav>
          <p className="nav-label">JOGO</p>
          {menu.slice(0,6).map(item => <a key={item.name} className={page===item.name?'active':''} onClick={() => { setPage(item.name); setMessage('') }}>{item.icon} {item.name}</a>)}
          <p className="nav-label">CONTA</p>
          {menu.slice(6).map(item => <a key={item.name} className={page===item.name?'active':''} onClick={() => { setPage(item.name); setMessage('') }}>{item.icon} {item.name}</a>)}
        </nav>
        <div className="profile"><div className="avatar">{displayName.trim().charAt(0).toUpperCase() || 'M'}</div><div className="profile-identity"><strong>{displayName}</strong><small>{email}</small></div><button className="auth-logout-button" onClick={() => { void onSignOut() }} title="Encerrar sessão">SAIR</button></div>
      </aside>
      <main className="main">
        <header className="topbar"><div><span className="breadcrumb">MINING PIX /</span><strong> {page.toUpperCase()}</strong></div><div className="topbar-actions"><div className="online"><span className="online-dot" /> CONTA CONECTADA · AMBIENTE DEV</div><button className="auth-logout-button mobile-logout" onClick={() => { void onSignOut() }}>SAIR</button></div></header>
        {message && <div className="game-message">{message}<button onClick={() => setMessage('')}>×</button></div>}
        {renderPage()}
        <footer>MINING PIX © 2026 · AMBIENTE DE DESENVOLVIMENTO</footer>
      </main>
    </div>
  )
}

export default App
