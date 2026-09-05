// Pose l'espion sur setInterval AVANT que le module observe ne soit evalue. L'ordre est
// porte par l'ordre des import statiques du fichier de test : ce module doit y figurer
// avant celui qu'il observe, sans quoi il ne capture rien.
//
// Un import dynamique aurait ete plus lisible, mais il se resout a l'execution et exige
// une permission de lecture sur src/ que les taches de test n'accordent pas, a dessein.

export const capturedIntervals: { delay: number; cb: () => void }[] = [];

const original = globalThis.setInterval;

globalThis.setInterval = ((cb: () => void, delay?: number) => {
  capturedIntervals.push({ delay: delay ?? 0, cb });
  return 0;
}) as unknown as typeof globalThis.setInterval;

export function restoreSetInterval(): void {
  globalThis.setInterval = original;
}
