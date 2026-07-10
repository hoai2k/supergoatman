/** The control surface every goat is driven through — humans and AI alike. */
export interface Intent {
  roll: number; // -1..1  tumble left / right
  aimX: number; // -1..1  optional fine aim (right stick / lean)
  aimY: number;
  kick: boolean; // held; goat edge-detects
  grab: boolean; // held
}

export function neutralIntent(): Intent {
  return { roll: 0, aimX: 0, aimY: 0, kick: false, grab: false };
}
