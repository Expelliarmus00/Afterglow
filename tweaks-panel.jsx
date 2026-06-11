/* Stub léger — le panneau éditeur Omelette a été supprimé.
   useTweaks retourne les valeurs par défaut statiques. */
function useTweaks(defaults) {
  return [defaults, () => {}];
}
Object.assign(window, { useTweaks });
