#!/bin/bash
# Créatures en H.264 décodé par la PUCE VIDÉO (avant : VP9 avec transparence, décodé par le processeur → saccades,
# son de l'ordinateur qui craque). Transparence rangée dans un panneau à part : [couleur | alpha | relief], empilés.
# Entrée : assets/creatures_hd/<nom>.webm (moitié haute couleur+alpha, moitié basse relief)
# Sortie : assets/creatures_hd/<nom>.mp4 + champ "pile": 3 dans <nom>.json. Les .webm restent (repli).
# un seul réencodage à la fois (plusieurs lots peuvent l'appeler)
while ! mkdir /tmp/recode_creatures.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/recode_creatures.lock' EXIT
cd "${1:-$(dirname "$0")/../assets/creatures_hd}"
for f in *.webm; do
  n="${f%.webm}"; [ -f "$n.mp4" ] && grep -q '"pile"' "$n.json" && continue
  read W H <<< "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f" | tr , " ")"
  P=$(( H / 2 )); [ $P -gt 960 ] && P=960; P=$(( P / 2 * 2 ))
  W2=$(( (W * P / (H / 2)) / 2 * 2 ))
  nice -n 12 ffmpeg -v error -y -c:v libvpx-vp9 -i "$f" -filter_complex \
    "[0:v]format=rgba,split=2[a][b];[a]crop=iw:ih/2:0:0,split=2[c][c2];[c2]alphaextract,format=rgb24,scale=$W2:$P[al];[c]format=rgb24,scale=$W2:$P[co];[b]crop=iw:ih/2:0:ih/2,format=rgb24,scale=$W2:$P[d];[co][al][d]vstack=3,format=yuv420p[v]" \
    -map "[v]" -an -c:v libx264 -preset slow -crf 17 -profile:v high -movflags +faststart "v4_$n.mp4" \
  && mv -f "v4_$n.mp4" "$n.mp4" \
  && python3 - "$n.json" "$W2" "$(( P * 3 ))" <<'PY' && echo "FAIT $n ${W2}x$((P*3)) $(date +%H:%M)"
import json, sys
p, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
d = json.load(open(p)); d.update(pile=3, largeur=w, hauteur=h); json.dump(d, open(p, 'w'))
PY
done
echo FINI
