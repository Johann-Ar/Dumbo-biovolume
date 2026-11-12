# Rapport d'optimisation de la salle (11 nov. 2026)

## Causes des saccades trouvées, et ce qui a été fait
| Cause | Effet | Correction |
|---|---|---|
| Vidéos des créatures en VP9 avec transparence : décodées par le processeur (pas la puce vidéo), jusqu'à 9 en même temps en HD | images qui sautent, créatures qui « disparaissent » une fraction de seconde, tout le site ralentit | les 41 créatures réencodées en H.264 « 3 panneaux » (couleur, transparence, relief) : décodage matériel par la puce vidéo. `tools/recode_creatures.sh` |
| Créature affichée avant que sa vidéo ait une image prête | petits sauts / clignotements à l'apparition | affichée seulement quand la 1re image est décodée |
| Toutes les vidéos préchargées au lancement | démarrage lourd, réseau saturé | chargement à la demande (`preload: none`) |
| Son : ~50 voix de bruit permanentes + réverbération de 4,5 s | son de l'ordinateur qui grésille / bugge | 3 voix seulement (les 3 créatures les plus proches), réverbération 2,6 s, mise en veille du son en pause |
| Visiteurs : poses masquées mais restant dans la scène (le moteur calcule toutes les gaussiennes présentes) | ralentissement, disparitions en saccade | poses éteintes retirées de la scène ; animation de brume limitée à 30 mises à jour/s, seulement sur les poses visibles ; fondus d'entrée/sortie de 1,4 s |

## Risques restants
- Ajouter/retirer une pose de visiteur oblige le moteur à retrier les gaussiennes : léger à-coup possible sur un Mac lent. Si ça se voit encore : garder les poses dans la scène avec opacité 0 mais réduire leur nombre (`&ecart=40`).
- Mesure réelle des images/s : impossible tant que le panneau navigateur de test est caché (le navigateur met la page en pause). À mesurer fenêtre visible.
- Écrans peu lumineux : salle et écrans trop sombres sur écrans d'entrée de gamme (noté, pas traité).

## Réglages utiles (dans l'adresse)
`&accueilclair=1` hall d'origine · `&cadre=0.09` largeur du cadre de l'écran d'accueil · `&lueur=1.4` lumières des créatures · `&visiteurs=0.7` · `&ecart=30`
