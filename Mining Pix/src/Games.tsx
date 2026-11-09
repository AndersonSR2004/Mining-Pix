import { useEffect, useRef, useState } from 'react'
import './Games.css'

type GameMode = 'flappy' | 'snake'
type GameStatus = 'ready' | 'running' | 'over'
type Pipe = { x: number; gapY: number; scored: boolean }
type Point = { x: number; y: number }

type Props = {
  onGameComplete: (game: 'flappy_games' | 'snake_games') => void
}

const WIDTH = 640
const HEIGHT = 360
const BIRD_X = 130
const BIRD_SIZE = 18
const PIPE_WIDTH = 58
const PIPE_GAP = 132

export default function Games({ onGameComplete }: Props) {
  const [mode, setMode] = useState<GameMode>('flappy')
  const [status, setStatus] = useState<GameStatus>('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<Record<GameMode, number>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('mining-pix-games-best-v1') || '{}')
      return { flappy: Number(parsed.flappy) || 0, snake: Number(parsed.snake) || 0 }
    } catch {
      return { flappy: 0, snake: 0 }
    }
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flappyRef = useRef({ y: HEIGHT / 2, velocity: 0, pipes: [{ x: WIDTH + 40, gapY: 170, scored: false }] as Pipe[] })
  const snakeRef = useRef<Point[]>([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }])
  const directionRef = useRef<Point>({ x: 1, y: 0 })
  const nextDirectionRef = useRef<Point>({ x: 1, y: 0 })
  const foodRef = useRef<Point>({ x: 14, y: 8 })
  const completedRef = useRef(false)

  function saveBest(nextScore: number) {
    setBest((current) => {
      const updated = { ...current, [mode]: Math.max(current[mode], nextScore) }
      try { localStorage.setItem('mining-pix-games-best-v1', JSON.stringify(updated)) } catch { /* storage optional */ }
      return updated
    })
  }

  function finishGame(finalScore: number) {
    if (completedRef.current) return
    completedRef.current = true
    setScore(finalScore)
    saveBest(finalScore)
    setStatus('over')
    onGameComplete(mode === 'flappy' ? 'flappy_games' : 'snake_games')
  }

  function startGame() {
    completedRef.current = false
    setScore(0)
    if (mode === 'flappy') {
      flappyRef.current = { y: HEIGHT / 2, velocity: 0, pipes: [{ x: WIDTH + 40, gapY: 150 + Math.random() * 100, scored: false }] }
    } else {
      snakeRef.current = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]
      directionRef.current = { x: 1, y: 0 }
      nextDirectionRef.current = { x: 1, y: 0 }
      foodRef.current = { x: 14, y: 8 }
    }
    setStatus('running')
  }

  function flap() {
    if (mode !== 'flappy') return
    if (status !== 'running') {
      if (status !== 'over') startGame()
      return
    }
    flappyRef.current.velocity = -5.8
  }

  useEffect(() => {
    if (status !== 'running') return
    if (mode === 'flappy') {
      const timer = window.setInterval(() => {
        const game = flappyRef.current
        game.velocity += 0.32
        game.y += game.velocity
        game.pipes = game.pipes.map((pipe) => ({ ...pipe, x: pipe.x - 3.2 }))
        if (game.pipes.length === 0 || game.pipes[game.pipes.length - 1].x < WIDTH - 250) {
          game.pipes.push({ x: WIDTH + 20, gapY: 105 + Math.random() * 150, scored: false })
        }
        let nextScore = score
        for (const pipe of game.pipes) {
          if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
            pipe.scored = true
            nextScore += 1
            setScore(nextScore)
          }
          const overlapsX = BIRD_X + BIRD_SIZE > pipe.x && BIRD_X - BIRD_SIZE < pipe.x + PIPE_WIDTH
          const outsideGap = game.y - BIRD_SIZE < pipe.gapY - PIPE_GAP / 2 || game.y + BIRD_SIZE > pipe.gapY + PIPE_GAP / 2
          if (overlapsX && outsideGap) { finishGame(nextScore); return }
        }
        game.pipes = game.pipes.filter((pipe) => pipe.x > -PIPE_WIDTH)
        if (game.y - BIRD_SIZE < 0 || game.y + BIRD_SIZE > HEIGHT) finishGame(nextScore)
      }, 30)
      return () => window.clearInterval(timer)
    }

    const timer = window.setInterval(() => {
      const body = snakeRef.current
      const direction = nextDirectionRef.current
      directionRef.current = direction
      const head = { x: body[0].x + direction.x, y: body[0].y + direction.y }
      const ate = head.x === foodRef.current.x && head.y === foodRef.current.y
      const collisionBody = ate ? body : body.slice(0, -1)
      if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 11 || collisionBody.some((part) => part.x === head.x && part.y === head.y)) {
        finishGame(score)
        return
      }
      const nextBody = [head, ...body]
      if (!ate) nextBody.pop()
      else {
        const nextScore = score + 1
        setScore(nextScore)
        if (nextScore >= 220) { snakeRef.current = nextBody; finishGame(nextScore); return }
        let food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 11) }
        while (nextBody.some((part) => part.x === food.x && part.y === food.y)) food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 11) }
        foodRef.current = food
      }
      snakeRef.current = nextBody
    }, 135)
    return () => window.clearInterval(timer)
  }, [mode, status, score])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (mode === 'flappy' && (event.code === 'Space' || event.code === 'ArrowUp')) {
        event.preventDefault()
        if (status === 'running') flap()
        else if (status === 'ready') startGame()
        return
      }
      if (mode !== 'snake' || status !== 'running') return
      const current = directionRef.current
      const keys: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
      }
      const next = keys[event.code]
      if (!next) return
      event.preventDefault()
      if (next.x !== -current.x || next.y !== -current.y) nextDirectionRef.current = next
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mode, status])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || mode !== 'flappy') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    gradient.addColorStop(0, '#10283a')
    gradient.addColorStop(1, '#14251f')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = 'rgba(255,255,255,.05)'
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.arc((i * 103 + 40) % WIDTH, 55 + (i % 3) * 74, 18 + (i % 2) * 12, 0, Math.PI * 2); ctx.fill()
    }
    for (const pipe of flappyRef.current.pipes) {
      ctx.fillStyle = '#39b878'
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY - PIPE_GAP / 2)
      ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP / 2, PIPE_WIDTH, HEIGHT)
      ctx.fillStyle = '#63e7a1'
      ctx.fillRect(pipe.x - 5, pipe.gapY - PIPE_GAP / 2 - 12, PIPE_WIDTH + 10, 12)
      ctx.fillRect(pipe.x - 5, pipe.gapY + PIPE_GAP / 2, PIPE_WIDTH + 10, 12)
    }
    ctx.fillStyle = '#f5c451'
    ctx.beginPath(); ctx.arc(BIRD_X, flappyRef.current.y, BIRD_SIZE, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#18202a'
    ctx.beginPath(); ctx.arc(BIRD_X + 7, flappyRef.current.y - 5, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#f18b4b'
    ctx.beginPath(); ctx.moveTo(BIRD_X + 15, flappyRef.current.y); ctx.lineTo(BIRD_X + 26, flappyRef.current.y + 4); ctx.lineTo(BIRD_X + 15, flappyRef.current.y + 8); ctx.fill()
    ctx.fillStyle = '#e8edf5'
    ctx.font = 'bold 22px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(score), WIDTH / 2, 38)
  }, [mode, status, score])

  useEffect(() => {
    if (mode !== 'flappy' || status !== 'running') return
    const redraw = window.setInterval(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const game = flappyRef.current
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
      gradient.addColorStop(0, '#10283a'); gradient.addColorStop(1, '#14251f')
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.fillStyle = 'rgba(255,255,255,.05)'
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc((i * 103 + 40) % WIDTH, 55 + (i % 3) * 74, 18 + (i % 2) * 12, 0, Math.PI * 2); ctx.fill() }
      for (const pipe of game.pipes) {
        ctx.fillStyle = '#39b878'
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY - PIPE_GAP / 2)
        ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP / 2, PIPE_WIDTH, HEIGHT)
        ctx.fillStyle = '#63e7a1'
        ctx.fillRect(pipe.x - 5, pipe.gapY - PIPE_GAP / 2 - 12, PIPE_WIDTH + 10, 12)
        ctx.fillRect(pipe.x - 5, pipe.gapY + PIPE_GAP / 2, PIPE_WIDTH + 10, 12)
      }
      ctx.fillStyle = '#f5c451'; ctx.beginPath(); ctx.arc(BIRD_X, game.y, BIRD_SIZE, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#18202a'; ctx.beginPath(); ctx.arc(BIRD_X + 7, game.y - 5, 3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#f18b4b'; ctx.beginPath(); ctx.moveTo(BIRD_X + 15, game.y); ctx.lineTo(BIRD_X + 26, game.y + 4); ctx.lineTo(BIRD_X + 15, game.y + 8); ctx.fill()
      ctx.fillStyle = '#e8edf5'; ctx.font = 'bold 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(score), WIDTH / 2, 38)
    }, 30)
    return () => window.clearInterval(redraw)
  }, [mode, status, score])

  const snakeCells = new Set(snakeRef.current.map((part) => part.y * 20 + part.x))

  return (
    <section className="games-page">
      <div className="games-heading">
        <div><span className="eyebrow">ARCADE DO MINING PIX</span><h1>Central de Jogos</h1><p>Jogue, bata seus recordes e avance nas missões diárias.</p></div>
        <span className="games-status">● JOGOS OFFLINE · SANDBOX</span>
      </div>
      <div className="games-tabs">
        <button className={mode === 'flappy' ? 'selected' : ''} onClick={() => { setMode('flappy'); setStatus('ready'); setScore(0) }}>FLAPPY PIX</button>
        <button className={mode === 'snake' ? 'selected' : ''} onClick={() => { setMode('snake'); setStatus('ready'); setScore(0) }}>PIX SNAKE</button>
      </div>
      <div className="games-layout">
        <article className="game-stage">
          <div className="game-stage-top"><span>{mode === 'flappy' ? 'FLAPPY PIX' : 'PIX SNAKE'}</span><span>PONTOS <strong>{score}</strong></span></div>
          {mode === 'flappy' ? (
            <div className="flappy-wrap" onClick={flap}>
              <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Jogo Flappy Pix" />
              {status !== 'running' && <div className="game-overlay"><strong>{status === 'over' ? 'FIM DE JOGO' : 'PRONTO PARA VOAR?'}</strong><span>{status === 'over' ? 'Toque para tentar novamente' : 'Clique ou pressione espaço para começar'}</span><button onClick={(event) => { event.stopPropagation(); startGame() }}>{status === 'over' ? 'JOGAR NOVAMENTE' : 'INICIAR PARTIDA'}</button></div>}
            </div>
          ) : (
            <div className="snake-board" role="application" aria-label="Jogo da cobrinha">
              {Array.from({ length: 220 }, (_, index) => <span key={index} className={snakeCells.has(index) ? 'snake-cell body' : foodRef.current.y * 20 + foodRef.current.x === index ? 'snake-cell food' : 'snake-cell'} />)}
              {status !== 'running' && <div className="game-overlay"><strong>{status === 'over' ? 'FIM DE JOGO' : 'PIX SNAKE'}</strong><span>{status === 'over' ? 'Tente superar sua pontuação' : 'Use as setas ou WASD para se mover'}</span><button onClick={startGame}>{status === 'over' ? 'JOGAR NOVAMENTE' : 'INICIAR PARTIDA'}</button></div>}
            </div>
          )}
          <div className="game-controls"><span>RECORDE: <strong>{best[mode]}</strong></span><span>{mode === 'flappy' ? 'ESPAÇO / CLIQUE PARA VOAR' : 'SETAS / WASD PARA MOVER'}</span></div>
        </article>
        <aside className="game-info">
          <div className="game-info-card"><span className="eyebrow">COMO JOGAR</span><h2>{mode === 'flappy' ? 'Desvie dos obstáculos' : 'Colete os pontos'}</h2><p>{mode === 'flappy' ? 'Mantenha o pássaro no ar e atravesse os vãos entre os obstáculos. Cada passagem vale um ponto.' : 'Guie a cobrinha até a comida. Cada item coletado aumenta sua pontuação e o tamanho da cobrinha.'}</p></div>
          <div className="game-info-card"><span className="eyebrow">MISSÕES</span><h2>Progresso diário</h2><p>Ao encerrar uma partida, o jogo registra automaticamente uma conclusão na missão correspondente. Não é necessário atingir uma pontuação mínima.</p><small>10 PARTIDAS CONCLUÍDAS = 100 XP DO PASSE</small></div>
          <div className="game-disclaimer">As partidas e recordes são salvos localmente neste navegador. Não há premiação financeira ou anúncio real integrado.</div>
        </aside>
      </div>
    </section>
  )
}
