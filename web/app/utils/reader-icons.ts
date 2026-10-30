export const readerIconPaths = {
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  lock: 'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
  chevron: 'm6 9 6 6 6-6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  'eye-off': 'm3 3 18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a14.8 14.8 0 0 1-3 3.7 M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.2 0 2.3-.2 3.2-.6',
  voice: 'M5 11a2 2 0 0 1 0 2 M9 7a7 7 0 0 1 0 10 M13 3a12 12 0 0 1 0 18',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6',
  width: 'M8 3H5v18h3 M16 3h3v18h-3 M8 12h8 M10 10l-2 2 2 2 M14 10l2 2-2 2',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6.1 6a8 8 0 0 1 13.2 1L20 12 M4 12l.7 5A8 8 0 0 0 17.9 18',
  palette: 'M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.2 1.2 1.2 0 0 1 .9-2H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3 M7 11h.01 M10 7h.01 M15 7h.01 M17 11h.01',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
  moon: 'M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13',
  toc: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  close: 'm6 6 12 12 M6 18 18 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  copy: 'M9 9h11v12H9z M5 15H3V3h12v2',
  check: 'm5 12 4 4L19 6',
  lines: 'M9 5h12 M9 12h12 M9 19h12 M3 3h2v4 M3 11h2l-2 3h2 M3 18h2v3H3',
  expand: 'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5',
  zoomIn: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6 M7 10h6 M10 7v6',
  zoomOut: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6 M7 10h6',
  reset: 'M3 10a9 9 0 1 1 2 8 M3 3v7h7',
  pencil: 'm16 3 5 5L8 21H3v-5z M14 5l5 5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7h.01',
  warning: 'm12 3 10 18H2z M12 9v5 M12 17h.01',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',
  quote: 'M3 5h7v8H6l-3 6 M14 5h7v8h-4l-3 6',
  bulb: 'M9 18h6 M10 21h4 M8 15a7 7 0 1 1 8 0l-1 3H9z',
} as const
export type ReaderIconName = keyof typeof readerIconPaths
export function readerIconHtml(name: ReaderIconName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${readerIconPaths[name]}" /></svg>`
}
