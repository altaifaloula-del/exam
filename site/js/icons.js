// Inline SVG icons, built with createElementNS (never parsed from strings). 24x24 grid, stroke-only.
// Decorative by default (aria-hidden); pass a label only when the icon is the sole content of a control.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  assistant: ['M6 3v6a4 4 0 0 0 8 0V3', 'M4.5 3H7.5', 'M12.5 3h3', 'M10 13v2a5 5 0 0 0 10 0v-1.5', 'M20 11.5a2 2 0 1 0 0 4a2 2 0 0 0 0-4z'],
  nursing: ['M9 3h6', 'M12 3v2.2', 'M7.5 5.5h9a1.5 1.5 0 0 1 1.5 1.5v6.8a6 6 0 0 1-12 0V7a1.5 1.5 0 0 1 1.5-1.5z', 'M12 9.2v4.6', 'M9.7 11.5h4.6', 'M12 20v1.5'],
  midwifery: ['M12 3.2a6.6 6.6 0 1 0 0 13.2a6.6 6.6 0 0 0 0-13.2z', 'M10.6 3.4c.2-1.2 1.4-1.6 2.3-1', 'M9.4 10.4h.01', 'M14.6 10.4h.01', 'M9.8 13.2c1.3 1.1 3.1 1.1 4.4 0', 'M5.5 21c.8-2.6 3.2-3.8 6.5-3.8s5.7 1.2 6.5 3.8'],
  dental: ['M7.5 3.5c-2.4 0-4 1.8-4 4.2 0 1.8.7 3 1.2 4.8.6 2.2.6 5 1.9 7.6.6 1.2 2 1 2.4-.4.4-1.6.8-3.4 2-3.4s1.6 1.8 2 3.4c.4 1.4 1.8 1.6 2.4.4 1.3-2.6 1.3-5.4 1.9-7.6.5-1.8 1.2-3 1.2-4.8 0-2.4-1.6-4.2-4-4.2-1.7 0-2.5 1-4.5 1s-2.8-1-4.5-1z'],
  all: ['M12 3l8.5 4.5L12 12 3.5 7.5z', 'M3.5 12L12 16.5 20.5 12', 'M3.5 16.5L12 21l8.5-4.5'],
  review: ['M12 6.2C10.4 5 8.3 4.5 5 4.5v13c3.3 0 5.4.5 7 1.7 1.6-1.2 3.7-1.7 7-1.7v-13c-3.3 0-5.4.5-7 1.7z', 'M12 6.2v13'],
  exam: ['M12 6.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15z', 'M12 10v4l2.6 1.6', 'M9.5 2.5h5', 'M12 2.5v4', 'M18.4 5.3l1.4 1.4'],
  custom: ['M4 7h9', 'M17 7h3', 'M13 5v4', 'M17 5v4', 'M4 17h3', 'M11 17h9', 'M7 15v4', 'M11 15v4', 'M4 12h16'],
  models: ['M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v9.8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z', 'M9 14.2l2.2 2.2L15.6 12'],
  topic: ['M4 9h16', 'M4 15h16', 'M9.5 3.5l-1.6 17', 'M16 3.5l-1.6 17'],
  essay: ['M6 3.5h8l4 4V11', 'M6 3.5v17h6', 'M9 11h6', 'M9 14.5h3', 'M15 20.5l.6-2.6 4.2-4.2a1.5 1.5 0 0 1 2.1 2.1l-4.2 4.2z'],
  mistakes: ['M4.5 12a7.5 7.5 0 1 1 2.3 5.4', 'M4 18v-4.6h4.6', 'M9.8 9.8l4.4 4.4', 'M14.2 9.8l-4.4 4.4'],
  stats: ['M4 20V4', 'M4 20h16', 'M8 16v-4', 'M12.5 16V8', 'M17 16v-7'],
  shield: ['M12 3l7 2.8v5.4c0 4.3-2.8 7.6-7 9.8-4.2-2.2-7-5.5-7-9.8V5.8z', 'M8.8 12l2.2 2.2 4.2-4.4'],
  flag: ['M6 21V4', 'M6 5h11l-2 4 2 4H6'],
  check: ['M5 12.5l4.2 4.2L19 7'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  back: ['M9 5l7 7-7 7'],   // points right: "previous" in a right-to-left layout
  fwd: ['M15 5l-7 7 7 7'],  // points left: "next" in a right-to-left layout
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 21h4'],
  home: ['M4 11l8-6.5 8 6.5', 'M6 10v9.5h12V10', 'M10 19.5v-5h4v5'],
};

export const ICON_NAMES = Object.keys(PATHS);

export function icon(name, label) {
  const d = PATHS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('viewBox', '0 0 24 24');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  for (const p of d || []) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', p);
    svg.append(path);
  }
  return svg;
}
