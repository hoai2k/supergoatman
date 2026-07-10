import RAPIER from "@dimforge/rapier2d-compat";

let ready = false;

export async function initRapier(): Promise<void> {
  if (ready) return;
  await RAPIER.init();
  ready = true;
}

export { RAPIER };
export type World = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
export type Collider = RAPIER.Collider;
