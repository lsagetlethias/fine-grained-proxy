// Pose l'espion sur setInterval AVANT que le module observe ne soit evalue. L'ordre est
// porte par l'ordre des import statiques du fichier de test : ce module doit y figurer
// avant celui qu'il observe, sans quoi il ne capture rien.
//
// Un import dynamique aurait ete plus lisible, mais il se resout a l'execution, donc apres
// l'evaluation du module observe : l'espion arriverait trop tard.

export const capturedIntervals: { delay: number; cb: () => void }[] = [];

const original = globalThis.setInterval;

globalThis.setInterval = ((cb: () => void, delay?: number) => {
  capturedIntervals.push({ delay: delay ?? 0, cb });
  // Le faux rend un objet et non un entier : sous Node setInterval rend un Timeout, dont
  // le module observe appelle unref(). Rendre 0, comme le faisait Deno, le ferait lever.
  const handle = {
    unref: () => handle,
    ref: () => handle,
    hasRef: () => false,
    [Symbol.toPrimitive]: () => 0,
  };
  return handle;
}) as unknown as typeof globalThis.setInterval;

export function restoreSetInterval(): void {
  globalThis.setInterval = original;
}
