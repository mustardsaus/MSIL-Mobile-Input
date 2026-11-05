// Flowbite outline icons (paths copied from flowbite-react-icons 1.3.1, MIT) — used instead of emoji/symbol glyphs.
import type { CSSProperties } from 'react'

type Node = [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string>]
const ICONS: Record<string, Node[]> = {
  'lock': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M12 14v3m-3-6V7a3 3 0 1 1 6 0v4m-8 0h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1"}]],
  'exclamation-circle': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M12 13V8m0 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"}]],
  'printer': [["path", {"stroke": "currentColor", "strokeLinejoin": "round", "d": "M16.444 18H19a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h2.556M17 11V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v6zM7 15h10v4a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"}]],
  'link': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M13.213 9.787a3.39 3.39 0 0 0-4.795 0l-3.425 3.426a3.39 3.39 0 0 0 4.795 4.794l.321-.304m-.321-4.49a3.39 3.39 0 0 0 4.795 0l3.424-3.426a3.39 3.39 0 0 0-4.794-4.795l-1.028.961"}]],
  'shuffle': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M13.484 9.166 15 7h5m0 0-3-3m3 3-3 3M4 17h4l1.577-2.253M4 7h4l7 10h5m0 0-3 3m3-3-3-3"}]],
  'floppy-disk': [["path", {"stroke": "currentColor", "strokeLinejoin": "round", "d": "M4 5a1 1 0 0 1 1-1h11.586a1 1 0 0 1 .707.293l2.414 2.414a1 1 0 0 1 .293.707V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"}], ["path", {"stroke": "currentColor", "strokeLinejoin": "round", "d": "M8 4h8v4H8zm7 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"}]],
  'pen': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M10.779 17.779 4.36 19.918 6.5 13.5m4.279 4.279 8.364-8.643a3.027 3.027 0 0 0-2.14-5.165 3.03 3.03 0 0 0-2.14.886L6.5 13.5m4.279 4.279L6.499 13.5m2.14 2.14 6.213-6.504M12.75 7.04 17 11.28"}]],
  'refresh': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"}]],
  'play': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M8 18V6l8 6z"}]],
  'reply': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M14.5 8.046H11V6.119c0-.921-.9-1.446-1.524-.894l-5.108 4.49a1.2 1.2 0 0 0 0 1.739l5.108 4.49c.624.556 1.524.027 1.524-.893v-1.928h2a3.023 3.023 0 0 1 3 3.046V19a5.593 5.593 0 0 0-1.5-10.954"}]],
  'undo': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M3 9h13a5 5 0 0 1 0 10H7M3 9l4-4M3 9l4 4"}]],
  'clipboard': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-6 5h6m-6 4h6M10 3v4h4V3z"}]],
  'clipboard-list': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3m0 3h6m-3 5h3m-6 0h.01M12 16h3m-6 0h.01M10 3v4h4V3z"}]],
  'search': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "d": "m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"}]],
  'chart-mixed': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M3 15v4m6-6v6m6-4v4m6-6v6M3 11l6-5 6 5 5.5-5.5"}]],
  'calendar-month': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1m3-7h.01v.01H8zm4 0h.01v.01H12zm4 0h.01v.01H16zm-8 4h.01v.01H8zm4 0h.01v.01H12zm4 0h.01v.01H16z"}]],
  'eye': [["path", {"stroke": "currentColor", "d": "M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6 4.03-6 9-6 9 4.8 9 6Z"}], ["path", {"stroke": "currentColor", "d": "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"}]],
  'tools': [["path", {"stroke": "currentColor", "strokeLinejoin": "round", "d": "m7.582 8.96 2.232 2.232-1.618 1.618a3.523 3.523 0 0 0-3.697 5.12 1 1 0 0 0 .936.53 1 1 0 0 0 .53.936 3.522 3.522 0 0 0 5.12-3.697l4.81-4.811a3.523 3.523 0 0 0 3.697-5.12 1 1 0 0 0-.935-.53 1 1 0 0 0-.531-.936 3.523 3.523 0 0 0-5.12 3.697l-1.778 1.778-2.232-2.231zm1.31-3.14a1 1 0 0 0-.536-.761L6.374 4.046a1 1 0 0 0-1.162.183l-.863.863a1 1 0 0 0-.183 1.162l1.013 1.982a1 1 0 0 0 .762.537l1.112.144a1 1 0 0 0 .836-.285l.863-.863a1 1 0 0 0 .285-.835zm10.553 10.585-3.119-3.119a2 2 0 0 0-2.828 0l-.172.173a2 2 0 0 0 0 2.828l3.118 3.119a2 2 0 0 0 2.829 0l.172-.172a2 2 0 0 0 0-2.829Z"}]],
  'lightbulb': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M9 9a3 3 0 0 1 3-3m-2 15h4m0-3c0-4.1 4-4.9 4-9A6 6 0 1 0 6 9c0 4 4 5 4 9z"}]],
  'cog': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M21 13v-2a1 1 0 0 0-1-1h-.757l-.707-1.707.535-.536a1 1 0 0 0 0-1.414l-1.414-1.414a1 1 0 0 0-1.414 0l-.536.535L14 4.757V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v.757l-1.707.707-.536-.535a1 1 0 0 0-1.414 0L4.929 6.343a1 1 0 0 0 0 1.414l.536.536L4.757 10H4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h.757l.707 1.707-.535.536a1 1 0 0 0 0 1.414l1.414 1.414a1 1 0 0 0 1.414 0l.536-.535 1.707.707V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.757l1.707-.708.536.536a1 1 0 0 0 1.414 0l1.414-1.414a1 1 0 0 0 0-1.414l-.535-.536.707-1.707H20a1 1 0 0 0 1-1"}], ["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6"}]],
  'star': [["path", {"stroke": "currentColor", "d": "M11.083 5.104c.35-.8 1.485-.8 1.834 0l1.752 4.022a1 1 0 0 0 .84.597l4.463.342c.9.069 1.255 1.2.556 1.771l-3.33 2.723a1 1 0 0 0-.337 1.016l1.03 4.119c.214.858-.71 1.552-1.474 1.106l-3.913-2.281a1 1 0 0 0-1.008 0L7.583 20.8c-.764.446-1.688-.248-1.474-1.106l1.03-4.119A1 1 0 0 0 6.8 14.56l-3.33-2.723c-.698-.571-.342-1.702.557-1.771l4.462-.342a1 1 0 0 0 .84-.597z"}]],
  'check': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M5 11.917 9.724 16.5 19 7.5"}]],
  'close': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M6 18 17.94 6M18 18 6.06 6"}]],
  'check-circle': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M8.5 11.5 11 14l4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0"}]],
  'close-circle': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "m15 9-6 6m0-6 6 6m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0"}]],
  'file-lines': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M10 3v4a1 1 0 0 1-1 1H5m4 8h6m-6-4h6m4-8v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1"}]],
  'caret-sort': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "m8 10 4-6 4 6zm8 4-4 6-4-6z"}]],
  'chevron-up': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "m16 14-4-4-4 4"}]],
  'chevron-down': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "m8 10 4 4 4-4"}]],
  'circle-plus': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M12 7.757v8.486M7.757 12h8.486M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"}]],
  'info-circle': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "d": "M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"}]],
  'list': [["path", {"stroke": "currentColor", "strokeLinecap": "round", "d": "M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"}]],
}

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, className = '', style, strokeWidth = 2, title }: { name: IconName; size?: number; className?: string; style?: CSSProperties; strokeWidth?: number; title?: string }) {
  const nodes = ICONS[name] ?? []
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={strokeWidth} className={`inline-block flex-none align-[-0.15em] ${className}`} style={style} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {nodes.map(([Tag, a], i) => <Tag key={i} {...(a as any)} />)}
    </svg>
  )
}
