import { Icon as FbIcon } from '../../components/Icon'
import { useState } from 'react'
import { fetchFromEdoc } from '../../mock'
import { Button, Modal } from '../../components'

interface DeviationPopupProps {
  partNo: string
  mrd: string
  activityId: string
  initialEdocNumber: string
  onClose: () => void
  onEdocSave: (edocNo: string, deviationStatus: string) => void
}

export function DeviationPopup({
  partNo,
  mrd,
  initialEdocNumber,
  onClose,
  onEdocSave,
}: DeviationPopupProps) {
  const [edocNumber, setEdocNumber] = useState(initialEdocNumber)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    deviationStatus?: string
    approvalDate?: string | null
    notes?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFetch() {
    if (!edocNumber.trim()) {
      setError('Please enter an E-Doc number.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    const res = await fetchFromEdoc(edocNumber.trim())
    setLoading(false)

    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setError(res.error ?? 'Failed to fetch E-Doc status.')
    }
  }

  function handleSave() {
    const status = result?.deviationStatus ?? 'Pending'
    onEdocSave(edocNumber.trim(), status)
  }

  const statusColor =
    result?.deviationStatus === 'Accept'
      ? 'text-[#047857] bg-[#ecfdf5] border-[#a7f3d0]'
      : result?.deviationStatus === 'Reject'
      ? 'text-destructive bg-[#fef2f2] border-[#fecaca]'
      : 'text-[#b45309] bg-[#fffbeb] border-[#fde68a]'

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Deviation — Actual Date Beyond MRD"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          {result && (
            <Button variant="primary" size="sm" onClick={handleSave}>Save deviation</Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Explanation */}
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-lg px-4 py-3 text-sm text-[#92400e]">
          <p className="font-medium mb-1"><FbIcon name="exclamation-circle" size={14} className="mr-1" />Actual date exceeds MRD</p>
          <p className="text-xs">
            Part <strong>{partNo}</strong> has an actual date that is beyond the MRD ({mrd}).
            A deviation E-Doc is required. Enter the E-Doc tracking number below to fetch the
            deviation approval status.
          </p>
        </div>

        {/* E-Doc number input */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] block mb-1">
            E-Doc tracking number
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={edocNumber}
              onChange={(e) => { setEdocNumber(e.target.value); setError(null) }}
              placeholder="e.g. EDOC-2026-1234"
              className="flex-1 border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFetch}
              disabled={loading}
            >
              <><FbIcon name="refresh" size={14} className="mr-1" />{loading ? 'Fetching…' : 'Fetch status'}</>
            </Button>
          </div>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>

        {/* Result */}
        {result && (
          <div className={`border rounded-lg px-4 py-3 text-sm ${statusColor}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Deviation status</span>
              <span className={`font-bold text-base`}>{result.deviationStatus}</span>
            </div>
            {result.approvalDate && (
              <p className="text-xs">Approval date: {result.approvalDate}</p>
            )}
            {result.notes && (
              <p className="text-xs mt-1 opacity-80">{result.notes}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
