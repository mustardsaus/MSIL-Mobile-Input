import { Icon as FbIcon } from '../../components/Icon'
/**
 * BuilderPage — landing page for the Builder area.
 * Shows existing drafts with options to continue or delete them.
 * Redirects to /builder/new for new definitions.
 * Redirects to /builder/:id for editing published activities.
 */

import { useNavigate } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { Button, Card, PageHeader } from '../../components'

export function BuilderPage() {
  const navigate = useNavigate()
  const { drafts, deleteDraft } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'

  return (
    <div>
      <PageHeader
        title="Activity Builder"
        section="Modules"
        description="No-code wizard to define activities, fields and approval flows."
        actions={
          isAdmin && (
            <Button variant="primary" size="md" onClick={() => navigate('/builder/new')}>
              + New Definition
            </Button>
          )
        }
      />

      {!isAdmin ? (
        <Card>
          <div className="text-center py-10 text-[var(--color-muted)]">
            <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="lock" size={32} /></p>
            <p className="font-medium">Admin access required</p>
            <p className="text-sm mt-1">Switch to the <strong>Admin</strong> persona to create and edit activity definitions.</p>
          </div>
        </Card>
      ) : drafts.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-[var(--color-muted)]">
            <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="cog" size={32} /></p>
            <p className="font-medium">No drafts in progress</p>
            <p className="text-sm mt-1">
              Click "+ New Definition" to start the 4-step wizard (Basics → Fields → Flow → Review).
            </p>
            <p className="text-sm mt-1">
              You can also edit published activities from the{' '}
              <button
                onClick={() => navigate('/activities')}
                className="text-[var(--color-accent)] hover:underline"
              >
                Activities
              </button>{' '}
              page.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text)] mb-3">
            Drafts in progress ({drafts.length})
          </div>
          {drafts.map((d) => (
            <Card key={d.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--color-text)]">
                  {d.name || <span className="text-[var(--color-muted)] italic">Untitled draft</span>}
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">
                  {d.fields.length} field{d.fields.length !== 1 ? 's' : ''} · {d.flow.steps.length} flow step{d.flow.steps.length !== 1 ? 's' : ''}
                  {d.sourceId && <span> · editing "{d.sourceId}"</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => navigate(`/builder/${d.id}`)}>
                  Continue
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (confirm('Discard this draft?')) deleteDraft(d.id)
                  }}
                >
                  Discard
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
