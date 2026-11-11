import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

type GameEvent = {
  id: string
  title: string
  description: string
  event_type: 'event' | 'battle_pass'
  status: 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled'
  starts_at: string
  ends_at: string
  payload: Record<string, unknown>
  updated_at: string
}

const toLocalInput = (value: string) => {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
const statusLabel: Record<GameEvent['status'], string> = {
  draft: 'RASCUNHO', scheduled: 'AGENDADO', live: 'AO VIVO', ended: 'ENCERRADO', cancelled: 'CANCELADO',
}

export default function EventControl() {
  const [events, setEvents] = useState<GameEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<'event' | 'battle_pass'>('event')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [payloadText, setPayloadText] = useState('{}')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('admin_list_game_events')
    if (rpcError) {
      setError(rpcError.message)
      setEvents([])
    } else {
      setEvents(((data as { events?: GameEvent[] })?.events ?? []) as GameEvent[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function resetForm() {
    setEditingId(null); setTitle(''); setDescription(''); setEventType('event')
    setStartsAt(''); setEndsAt(''); setPayloadText('{}')
  }

  function edit(item: GameEvent) {
    setEditingId(item.id); setTitle(item.title); setDescription(item.description)
    setEventType(item.event_type); setStartsAt(toLocalInput(item.starts_at))
    setEndsAt(toLocalInput(item.ends_at)); setPayloadText(JSON.stringify(item.payload ?? {}, null, 2))
    setNotice('Rascunho carregado para edição. Eventos ao vivo ou encerrados são imutáveis.')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(payloadText)
      } catch {
        throw new Error('A configuração JSON possui sintaxe inválida.')
      }
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('A configuração precisa ser um objeto JSON.')
      }
      const { data, error: rpcError } = await supabase.rpc('admin_save_game_event', {
        p_id: editingId,
        p_title: title.trim(),
        p_description: description.trim(),
        p_event_type: eventType,
        p_starts_at: new Date(startsAt).toISOString(),
        p_ends_at: new Date(endsAt).toISOString(),
        p_payload: payload,
      })
      if (rpcError) throw rpcError
      setNotice(editingId ? 'Evento atualizado. Ele continua em rascunho/agendado.' : 'Evento criado como rascunho. Programe ou inicie quando estiver pronto.')
      resetForm()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o evento.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(item: GameEvent, status: GameEvent['status']) {
    setBusy(true); setError(''); setNotice('')
    const { error: rpcError } = await supabase.rpc('admin_set_game_event_status', { p_id: item.id, p_status: status })
    if (rpcError) setError(rpcError.message)
    else { setNotice(`${item.title}: ${statusLabel[status].toLowerCase()}.`); await load() }
    setBusy(false)
  }

  return (
    <section className="admin-event-control">
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">LIVE OPS · ADMIN</span><h2>{editingId ? 'Editar evento ou temporada' : 'Criar evento ou Passe de Batalha'}</h2></div><span>Publicação controlada</span></div>
        <p className="admin-empty">Crie a campanha, defina a janela e salve como rascunho. Depois agende ou inicie manualmente. O conteúdo só aparece aos jogadores quando estiver AO VIVO e dentro da janela configurada.</p>
        <form className="admin-note-form" onSubmit={(event) => { void save(event) }}>
          <label>Tipo de publicação
            <select value={eventType} onChange={event => setEventType(event.target.value as 'event' | 'battle_pass')}>
              <option value="event">Evento</option><option value="battle_pass">Passe de Batalha</option>
            </select>
          </label>
          <label>Nome<input value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} required placeholder="Ex.: Temporada Genesis" /></label>
          <label>Descrição<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="Texto exibido aos jogadores..." /></label>
          <div className="admin-event-dates">
            <label>Início<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required /></label>
            <label>Encerramento<input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} required /></label>
          </div>
          <label>Configuração da campanha (JSON)
            <textarea value={payloadText} onChange={event => setPayloadText(event.target.value)} rows={8} spellCheck={false} />
          </label>
          {eventType === 'battle_pass' && <p className="admin-empty">Use a configuração JSON para registrar temporada, XP por nível, trilhas Free/Premium/Full, recompensas e custos em PC. O backend armazena a configuração; a ativação de compras e resgates permanece separada até a integração completa.</p>}
          <div className="admin-event-actions">
            <button className="admin-primary" type="submit" disabled={busy || !title.trim() || !startsAt || !endsAt}>{busy ? 'SALVANDO...' : editingId ? 'SALVAR ALTERAÇÕES' : 'CRIAR RASCUNHO'}</button>
            {editingId && <button className="admin-secondary" type="button" onClick={resetForm} disabled={busy}>CANCELAR EDIÇÃO</button>}
          </div>
        </form>
        {error && <div className="admin-error" role="alert">{error}</div>}
        {notice && <p className="admin-success" role="status">{notice}</p>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">CALENDÁRIO EDITORIAL</span><h2>Eventos e temporadas</h2></div><button className="admin-secondary" onClick={() => void load()} disabled={loading || busy}>ATUALIZAR</button></div>
        {loading ? <p className="admin-empty">Carregando calendário...</p> : events.length === 0 ? <p className="admin-empty">Nenhum evento criado. Use o formulário acima para criar o primeiro rascunho.</p> : (
          <div className="admin-event-list">
            {events.map(item => (
              <article className="admin-event-card" key={item.id}>
                <div className="admin-event-card-head">
                  <div><span className="admin-eyebrow">{item.event_type === 'battle_pass' ? 'PASSE DE BATALHA' : 'EVENTO'}</span><h3>{item.title}</h3></div>
                  <span className={`admin-event-status status-${item.status}`}>{statusLabel[item.status]}</span>
                </div>
                <p>{item.description || 'Sem descrição.'}</p>
                <small>{new Date(item.starts_at).toLocaleString('pt-BR')} → {new Date(item.ends_at).toLocaleString('pt-BR')}</small>
                <div className="admin-event-actions">
                  {(item.status === 'draft' || item.status === 'scheduled') && <button className="admin-secondary" onClick={() => edit(item)} disabled={busy}>EDITAR</button>}
                  {item.status === 'draft' && <button className="admin-secondary" onClick={() => void changeStatus(item,'scheduled')} disabled={busy}>AGENDAR</button>}
                  {(item.status === 'draft' || item.status === 'scheduled') && <button className="admin-primary" onClick={() => void changeStatus(item,'live')} disabled={busy}>INICIAR AGORA</button>}
                  {item.status === 'live' && <button className="admin-primary" onClick={() => void changeStatus(item,'ended')} disabled={busy}>ENCERRAR</button>}
                  {(item.status === 'draft' || item.status === 'scheduled') && <button className="admin-danger" onClick={() => void changeStatus(item,'cancelled')} disabled={busy}>CANCELAR</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
