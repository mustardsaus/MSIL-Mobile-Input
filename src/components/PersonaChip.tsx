import { PERSONAS, type PersonaId } from '../store/personaStore'

interface PersonaChipProps {
  personaId: PersonaId
  size?: 'sm' | 'md'
}

export function PersonaChip({ personaId, size = 'md' }: PersonaChipProps) {
  const meta = PERSONAS.find((p) => p.id === personaId)
  if (!meta) return null

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex flex-none items-center whitespace-nowrap rounded-full font-medium ${padding}`}
      style={{
        backgroundColor: meta.hex + '26', // 15% opacity
        color: meta.hex,
        border: `1px solid ${meta.hex}60`,
      }}
    >
      {meta.label}
    </span>
  )
}
