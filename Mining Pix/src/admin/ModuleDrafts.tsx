import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase/client'

const modules = { events: 'Eventos e Puzzle', lucky_boxes: 'Lucky Boxes', forge: 'Forja', marketplace: 'Marketplace' }
type Module = keyof typeof modules
type Draft = { revision: number; settings: Record<string, unknown> }

export default function ModuleDrafts() {
  const [module, setModule] = useState<Module>('events')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftText, setDraftText] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(selected: Module, settings?: Record<string, unknown>) {
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('admin_sandbox_module_draft', {
        p_module: selected, ...(settings ? { p_expected_revision: draft?.revision, p_settings: settings } : {}),
      })
      if (error) throw new Error(error.message)
      const next = data as Draft
      setDraft(next)
      setDraftText(JSON.stringify(next.settings, null, 2))
      if (settings) setMessage('Rascunho salvo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao consultar o rascunho.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load('events') }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const parsed: unknown = JSON.parse(draftText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setMessage('A configuração deve ser um objeto JSON.')
        return
      }
      void load(module, parsed as Record<string, unknown>)
    } catch {
      setMessage('Corrija a sintaxe JSON antes de salvar.')
    }
  }

  return <section className="admin-panel">
    <h2>Rascunhos de regras</h2>
    <p>Configuração para homologação. Salvar um rascunho mantém o módulo inativo.</p>
    <form className="admin-login-form" onSubmit={submit}>
      <label>Módulo <select value={module} disabled={busy} onChange={event => {
        const selected = event.target.value as Module
        setModule(selected)
        setDraft(null)
        setDraftText('')
        void load(selected)
      }}>
        {Object.entries(modules).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {draft && <label>Configuração JSON · revisão {draft.revision}
        <textarea rows={12} value={draftText} onChange={event => setDraftText(event.target.value)} disabled={busy} />
      </label>}
      <button type="submit" className="admin-primary" disabled={!draft || busy}>Salvar rascunho</button>
      <button type="button" className="admin-secondary" disabled={busy} onClick={() => void load(module)}>Atualizar</button>
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}
