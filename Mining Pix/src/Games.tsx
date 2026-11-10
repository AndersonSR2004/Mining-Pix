import { useEffect, useRef, useState } from 'react'
import './Games.css'
import { supabase } from './lib/supabase/client'

type GameMode = 'flappy' | 'snake' | 'coin'
type GameStatus = 'ready' | 'running' | 'over'
type Point = { x: number; y: number }
type Pipe = { x: number; gapY: number; scored: boolean }
type Progress = Record<GameMode, { level: number; wins: number; cooldownUntil: number }>
type Props = {
  userId: string
  onGameComplete: (game: 'flappy_games' | 'snake_games' | 'coin_catch_games', won: boolean) => void
}

const WIDTH = 640
const HEIGHT = 360
const DURATION = 45
const STORAGE = 'mining-pix-games-progress-v2'
const emptyProgress: Progress = {
  flappy: { level: 1, wins: 0, cooldownUntil: 0 },
  snake: { level: 1, wins: 0, cooldownUntil: 0 },
  coin: { level: 1, wins: 0, cooldownUntil: 0 },
}
const labels: Record<GameMode, string> = { flappy: 'FLAPPY PIX', snake: 'PIX SNAKE', coin: 'COIN CATCH' }
const events: Record<GameMode, 'flappy_games' | 'snake_games' | 'coin_catch_games'> = {
  flappy: 'flappy_games', snake: 'snake_games', coin: 'coin_catch_games',
}
const targetFor = (level: number) => 10 + (level - 1) * 5
const cooldownFor = (level: number) => level === 1 ? 10 : level === 2 ? 20 : level === 3 ? 30 : 60

export default function Games({ userId, onGameComplete }: Props) {
  const progressStorageKey = `${STORAGE}:${userId}`
  const bestStorageKey = `mining-pix-games-best-v1:${userId}`
  const [mode, setMode] = useState<GameMode>('flappy')
  const [status, setStatus] = useState<GameStatus>('ready')
  const [score, setScore] = useState(0)
  const [seconds, setSeconds] = useState(DURATION)
  const [, setFrame] = useState(0)
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(progressStorageKey) || '{}')
      return Object.fromEntries((['flappy', 'snake', 'coin'] as GameMode[]).map((key) => {
        const item = parsed[key] || {}
        return [key, {
          level: Math.max(1, Number(item.level) || 1),
          wins: Math.max(0, Number(item.wins) || 0) % 3,
          cooldownUntil: Math.max(0, Number(item.cooldownUntil) || 0),
        }]
      })) as Progress
    } catch { return emptyProgress }
  })
  const [now, setNow] = useState(Date.now())
  const [dailyUsed, setDailyUsed] = useState<Record<GameMode, number>>({ flappy: 0, snake: 0, coin: 0 })
  const [activeHash, setActiveHash] = useState(0)
  const [boostExpiresAt, setBoostExpiresAt] = useState<string | null>(null)
  const [rewardMessage, setRewardMessage] = useState('')
  const [rewardError, setRewardError] = useState('')
  const [starting, setStarting] = useState(false)
  const [best, setBest] = useState<Record<GameMode, number>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(bestStorageKey) || '{}')
      return { flappy: Number(parsed.flappy) || 0, snake: Number(parsed.snake) || 0, coin: Number(parsed.coin) || 0 }
    } catch { return { flappy: 0, snake: 0, coin: 0 } }
  })
  const scoreRef = useRef(0)
  const completedRef = useRef(false)
  const attemptRef = useRef<string | null>(null)
  const lastCoinSpawnAtRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flappyRef = useRef({ y: HEIGHT / 2, velocity: 0, pipes: [] as Pipe[] })
  const snakeRef = useRef<Point[]>([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }])
  const directionRef = useRef<Point>({ x: 1, y: 0 })
  const nextDirectionRef = useRef<Point>({ x: 1, y: 0 })
  const foodRef = useRef<Point>({ x: 14, y: 8 })
  const catcherRef = useRef(5)
  const fallingRef = useRef<{ x: number; y: number }[]>([])

  const current = progress[mode]
  const target = targetFor(current.level)
  const remainingCooldown = Math.max(0, Math.ceil((current.cooldownUntil - now) / 1000))
  const canStart = remainingCooldown === 0 && status !== 'running' && !starting && dailyUsed[mode] < 30

  useEffect(() => { localStorage.setItem(progressStorageKey, JSON.stringify(progress)) }, [progress])
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let mounted = true
    void supabase.rpc('get_player_game_status').then(({ data, error }) => {
      if (!mounted || error || !data) return
      const result = data as { daily_used?: Record<string, number>; active_hashrate?: number; expires_at?: string | null }
      setDailyUsed({
        flappy: Number(result.daily_used?.flappy_games ?? 0),
        snake: Number(result.daily_used?.snake_games ?? 0),
        coin: Number(result.daily_used?.coin_catch_games ?? 0),
      })
      setActiveHash(Number(result.active_hashrate ?? 0))
      setBoostExpiresAt(result.expires_at ?? null)
    })
    return () => { mounted = false }
  }, [])

  function updateBest(value: number) {
    setBest((old) => {
      const next = { ...old, [mode]: Math.max(old[mode], value) }
      try { localStorage.setItem(bestStorageKey, JSON.stringify(next)) } catch { /* storage optional */ }
      return next
    })
  }

  function recordGameActivity(eventType: 'game_started' | 'game_completed') {
    void supabase.rpc('record_player_activity_event', {
      p_event_type: eventType,
      p_idempotency_key: crypto.randomUUID(),
    })
  }

  async function finishGame(won: boolean) {
    if (completedRef.current) return
    completedRef.current = true
    recordGameActivity('game_completed')
    setStatus('over')
    updateBest(scoreRef.current)
    const cooldown = cooldownFor(current.level)
    setProgress((old) => {
      const item = old[mode]
      const nextWins = won ? item.wins + 1 : item.wins
      const levelUp = nextWins >= 3
      return {
        ...old,
        [mode]: {
          level: levelUp ? item.level + 1 : item.level,
          wins: levelUp ? 0 : nextWins,
          cooldownUntil: Date.now() + cooldown * 1000,
        },
      }
    })

    const attemptId = attemptRef.current
    attemptRef.current = null
    if (!attemptId) {
      setRewardError('Não foi possível localizar a partida no servidor. Nenhuma recompensa foi creditada.')
      onGameComplete(events[mode], won)
      return
    }

    const { data, error } = await supabase.rpc('finish_player_game_attempt', {
      p_attempt_id: attemptId,
      p_won: won,
    })
    if (error) {
      setRewardError(error.message.includes('expirou')
        ? 'A partida expirou no servidor. Nenhuma recompensa foi creditada.'
        : 'Não foi possível confirmar a partida no servidor. Nenhuma recompensa foi creditada.')
    } else if (data) {
      const result = data as {
        pc_awarded?: number
        hash_awarded?: number
        active_hashrate?: number
        expires_at?: string | null
        daily_used?: number
      }
      setDailyUsed((old) => ({ ...old, [mode]: Number(result.daily_used ?? old[mode]) }))
      setActiveHash(Number(result.active_hashrate ?? 0))
      setBoostExpiresAt(result.expires_at ?? null)
      setRewardMessage(won
        ? 'Vitória confirmada: +1 H/s temporário por 24 horas. PIX COIN é obtida exclusivamente por compra.'
        : 'Partida registrada. Sem recompensa de vitória.')
      setRewardError('')
    }
    onGameComplete(events[mode], won)
  }

  async function startGame() {
    if (remainingCooldown > 0 || status === 'running' || starting || dailyUsed[mode] >= 30) return
    setStarting(true)
    setRewardError('')
    setRewardMessage('')
    const { data, error } = await supabase.rpc('start_player_game_attempt', {
      p_game_id: events[mode],
    })
    if (error || !data) {
      setRewardError(error?.message.includes('Limite diário')
        ? 'Você atingiu o limite de 30 partidas diárias deste jogo.'
        : error?.message ?? 'Não foi possível iniciar a partida.')
      setStarting(false)
      return
    }

    const result = data as { attempt_id: string; daily_used: number }
    attemptRef.current = result.attempt_id
    setDailyUsed((old) => ({ ...old, [mode]: Number(result.daily_used ?? old[mode] + 1) }))
    setStarting(false)
    completedRef.current = false
    recordGameActivity('game_started')
    scoreRef.current = 0
    setScore(0)
    setSeconds(DURATION)
    if (mode === 'flappy') flappyRef.current = { y: HEIGHT / 2, velocity: 0, pipes: [{ x: WIDTH + 40, gapY: 160, scored: false }] }
    if (mode === 'snake') {
      snakeRef.current = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]
      directionRef.current = { x: 1, y: 0 }
      nextDirectionRef.current = { x: 1, y: 0 }
      foodRef.current = { x: 14, y: 8 }
    }
    if (mode === 'coin') {
      catcherRef.current = 5
      fallingRef.current = []
      lastCoinSpawnAtRef.current = Date.now()
    }
    setStatus('running')
  }

  function addPoint() {
    const value = scoreRef.current + 1
    scoreRef.current = value
    setScore(value)
    if (value >= target) finishGame(true)
  }

  function flap() {
    if (mode !== 'flappy') return
    if (status !== 'running') { if (status === 'ready') startGame(); return }
    flappyRef.current.velocity = -320
  }

  useEffect(() => {
    if (status !== 'running') return
    const countdown = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) { window.clearInterval(countdown); finishGame(scoreRef.current >= target); return 0 }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(countdown)
  }, [status, mode, target])

  useEffect(() => {
    if (status !== 'running') return
    if (mode === 'flappy') {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      let animationFrame = 0
      let previousTime = 0
      const draw = () => {
        const game = flappyRef.current
        const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
        gradient.addColorStop(0, '#10283a')
        gradient.addColorStop(1, '#14251f')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, WIDTH, HEIGHT)
        for (const pipe of game.pipes) {
          ctx.fillStyle = '#39b878'
          ctx.fillRect(pipe.x, 0, 58, pipe.gapY - 72)
          ctx.fillRect(pipe.x, pipe.gapY + 72, 58, HEIGHT)
        }
        ctx.fillStyle = '#f5c451'
        ctx.beginPath()
        ctx.arc(130, game.y, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#e8edf5'
        ctx.font = 'bold 22px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(scoreRef.current), WIDTH / 2, 38)
      }
      const tick = (time: number) => {
        if (!previousTime) previousTime = time
        const delta = Math.min((time - previousTime) / 1000, 0.05)
        previousTime = time
        const game = flappyRef.current
        game.velocity += 900 * delta
        game.y += game.velocity * delta
        game.pipes = game.pipes.map((pipe) => ({ ...pipe, x: pipe.x - 210 * delta }))
        if (!game.pipes.length || game.pipes[game.pipes.length - 1].x < WIDTH - 270) {
          game.pipes.push({ x: WIDTH + 20, gapY: 112 + Math.random() * 136, scored: false })
        }
        for (const pipe of game.pipes) {
          if (!pipe.scored && pipe.x + 58 < 130) {
            pipe.scored = true
            addPoint()
            if (completedRef.current) {
              draw()
              return
            }
          }
          const overlap = 148 > pipe.x && 112 < pipe.x + 58
          const outside = game.y - 18 < pipe.gapY - 72 || game.y + 18 > pipe.gapY + 72
          if (overlap && outside) {
            draw()
            finishGame(false)
            return
          }
        }
        game.pipes = game.pipes.filter((pipe) => pipe.x > -58)
        if (game.y - 18 < 0 || game.y + 18 > HEIGHT) {
          draw()
          finishGame(false)
          return
        }
        draw()
        animationFrame = window.requestAnimationFrame(tick)
      }
      draw()
      animationFrame = window.requestAnimationFrame(tick)
      return () => window.cancelAnimationFrame(animationFrame)
    }
    if (mode === 'snake') {
      const timer = window.setInterval(() => {
        const body = snakeRef.current
        const direction = nextDirectionRef.current
        directionRef.current = direction
        const head = { x: body[0].x + direction.x, y: body[0].y + direction.y }
        const ate = head.x === foodRef.current.x && head.y === foodRef.current.y
        const collisionBody = ate ? body : body.slice(0, -1)
        if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 11 || collisionBody.some((p) => p.x === head.x && p.y === head.y)) { finishGame(false); return }
        const next = [head, ...body]
        if (!ate) next.pop()
        else {
          addPoint()
          let food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 11) }
          while (next.some((p) => p.x === food.x && p.y === food.y)) food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 11) }
          foodRef.current = food
        }
        snakeRef.current = next
        setFrame((v) => v + 1)
      }, 135)
      return () => window.clearInterval(timer)
    }
    const timer = window.setInterval(() => {
      fallingRef.current = fallingRef.current.map((coin) => ({ ...coin, y: coin.y + 1 })).filter((coin) => coin.y < 10)
      const nowMs = Date.now()
      const coinNearTop = fallingRef.current.some((coin) => coin.y <= 2)
      if (!coinNearTop && nowMs - lastCoinSpawnAtRef.current >= 1300 && Math.random() < 0.65) {
        fallingRef.current.push({ x: Math.floor(Math.random() * 10), y: 0 })
        lastCoinSpawnAtRef.current = nowMs
      }
      const caught = fallingRef.current.filter((coin) => coin.y >= 9 && coin.x === catcherRef.current).length
      fallingRef.current = fallingRef.current.filter((coin) => !(coin.y >= 9 && coin.x === catcherRef.current))
      for (let i = 0; i < caught; i++) addPoint()
      setFrame((v) => v + 1)
    }, 350)
    return () => window.clearInterval(timer)
  }, [mode, status, target])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (mode === 'flappy' && (event.code === 'Space' || event.code === 'ArrowUp')) { event.preventDefault(); flap(); return }
      if (mode === 'snake' && status === 'running') {
        const keys: Record<string, Point> = {
          ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
          ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
        }
        const next = keys[event.code]
        if (next) { event.preventDefault(); const cur = directionRef.current; if (next.x !== -cur.x || next.y !== -cur.y) nextDirectionRef.current = next }
      }
      if (mode === 'coin' && status === 'running') {
        if (event.code === 'ArrowLeft' || event.code === 'KeyA') catcherRef.current = Math.max(0, catcherRef.current - 1)
        if (event.code === 'ArrowRight' || event.code === 'KeyD') catcherRef.current = Math.min(9, catcherRef.current + 1)
        setFrame((v) => v + 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mode, status])


  const snakeCells = new Set(snakeRef.current.map((part) => part.y * 20 + part.x))
  const coinCells = new Set(fallingRef.current.map((coin) => coin.y * 10 + coin.x))
  const progressPct = Math.min(100, score / target * 100)

  return (
    <section className="games-page">
      <div className="games-heading">
        <div><span className="eyebrow">ARCADE DO MINING PIX</span><h1>Central de Jogos</h1><p>Complete objetivos no tempo limite, vença e avance de nível.</p></div>
        <span className="games-status">● RECOMPENSAS PERSISTENTES · LIMITE DIÁRIO</span>
      </div>
      <div className="games-tabs">
        {(['flappy', 'snake', 'coin'] as GameMode[]).map((key) => <button key={key} className={mode === key ? 'selected' : ''} onClick={() => { if (status !== 'running') { setMode(key); setStatus('ready'); setScore(0); scoreRef.current = 0 } }}>{labels[key]}</button>)}
      </div>
      <div className="games-layout">
        <article className="game-stage">
          <div className="game-stage-top"><span>{labels[mode]}</span><span>TEMPO <strong>{seconds}s</strong> · PONTOS <strong>{score}/{target}</strong></span></div>
          {mode === 'flappy' && <div className="flappy-wrap" onClick={flap}>
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Jogo Flappy Pix" />
            {status !== 'running' && <div className="game-overlay"><strong>{status === 'over' ? (score >= target ? 'VITÓRIA!' : 'FIM DE JOGO') : 'PRONTO PARA VOAR?'}</strong><span>{status === 'over' ? 'Aguarde o cooldown para outra partida.' : 'Clique ou pressione espaço para começar e voar.'}</span><button disabled={!canStart} onClick={(e) => { e.stopPropagation(); startGame() }}>{dailyUsed[mode] >= 30 ? 'LIMITE DIÁRIO' : starting ? 'INICIANDO...' : remainingCooldown ? `AGUARDE ${remainingCooldown}s` : status === 'over' ? 'NOVA PARTIDA' : 'INICIAR PARTIDA'}</button></div>}
          </div>}
          {mode === 'snake' && <div className="snake-board" role="application" aria-label="Jogo da cobrinha">
            {Array.from({ length: 220 }, (_, i) => <span key={i} className={snakeCells.has(i) ? 'snake-cell body' : foodRef.current.y * 20 + foodRef.current.x === i ? 'snake-cell food' : 'snake-cell'} />)}
            {status !== 'running' && <div className="game-overlay"><strong>{status === 'over' ? (score >= target ? 'VITÓRIA!' : 'FIM DE JOGO') : 'PIX SNAKE'}</strong><span>Use setas ou WASD. Colete {target} alimentos em 45 segundos.</span><button disabled={!canStart} onClick={startGame}>{dailyUsed[mode] >= 30 ? 'LIMITE DIÁRIO' : starting ? 'INICIANDO...' : remainingCooldown ? `AGUARDE ${remainingCooldown}s` : 'INICIAR PARTIDA'}</button></div>}
          </div>}
          {mode === 'coin' && <div className="coin-board" role="application" aria-label="Coin Catch">
            {Array.from({ length: 100 }, (_, i) => <span key={i} className={i === 90 + catcherRef.current ? 'coin-catcher' : coinCells.has(i) ? 'coin-falling' : 'coin-cell'}>{i === 90 + catcherRef.current ? '▰' : coinCells.has(i) ? '●' : ''}</span>)}
            {status !== 'running' && <div className="game-overlay"><strong>{status === 'over' ? (score >= target ? 'VITÓRIA!' : 'FIM DE JOGO') : 'COIN CATCH'}</strong><span>Mova a cesta com ← → ou A/D e capture {target} moedas.</span><button disabled={!canStart} onClick={startGame}>{remainingCooldown ? `AGUARDE ${remainingCooldown}s` : 'INICIAR PARTIDA'}</button></div>}
          </div>}
          <div className="game-controls"><span>RECORDE: <strong>{best[mode]}</strong></span><span>NÍVEL {current.level} · VITÓRIAS {current.wins}/3</span><span>PARTIDAS HOJE: <strong>{dailyUsed[mode]}/30</strong></span></div>
          {rewardMessage && <div className="game-reward-message" role="status">{rewardMessage}</div>}
          {rewardError && <div className="game-reward-error" role="alert">{rewardError}</div>}
          <div className="game-progress"><div style={{ width: `${progressPct}%` }} /></div>
        </article>
        <aside className="game-info">
          <div className="game-info-card"><span className="eyebrow">PROGRESSÃO</span><h2>Nível {current.level} · {target} objetivos</h2><p>Você tem 45 segundos para atingir a meta. A cada três vitórias, avança um nível e a meta aumenta em cinco objetivos.</p><small>COOLDOWN APÓS CADA PARTIDA: {cooldownFor(current.level)} SEGUNDOS</small></div>
          <div className="game-info-card"><span className="eyebrow">RECOMPENSAS</span><h2>Vitória vale progresso</h2><p>Cada vitória confirmada concede +1 H/s temporário por 24 horas. PIX COIN é obtida exclusivamente por compra. O HASH ativo atual é {activeHash} H/s.</p><small>PARTIDAS DISPONÍVEIS HOJE: {Math.max(0, 30 - dailyUsed[mode])}/30 · {boostExpiresAt ? `BÔNUS ATÉ ${new Date(boostExpiresAt).toLocaleString('pt-BR')}` : 'SEM HASH TEMPORÁRIO ATIVO'}</small></div>
          <div className="game-info-card"><span className="eyebrow">CONTROLES</span><h2>{mode === 'flappy' ? 'Desvie dos obstáculos' : mode === 'snake' ? 'Guie a cobrinha' : 'Capture as moedas'}</h2><p>{mode === 'flappy' ? 'Clique ou pressione espaço para manter o pássaro no ar.' : mode === 'snake' ? 'Use as setas ou WASD para mudar a direção.' : 'Use ← → ou A/D para mover a cesta e pegar moedas que caem.'}</p></div>
          <div className="game-disclaimer">Limite diário e recompensas são registrados no servidor por jogo. Níveis, recordes e cooldowns continuam salvos neste navegador. A validação do resultado de vitória ainda depende do cliente e não deve ser considerada proteção antifraude completa.</div>
        </aside>
      </div>
    </section>
  )
}
