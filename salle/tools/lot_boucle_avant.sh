# Toutes les créatures : boucle à l'endroit + suppression des coupes (boucle_avant.py), puis réencodage H.264.
# Repasse tant que les lots T7 ajoutent des créatures. Journal : /tmp/boucle_avant.log
cd "/Users/johann/Documents/Projet Portfolio/Dumbo-biovolume/salle"
PY="/Users/johann/Documents/Projet Portfolio/Video-Depth-Anything/.venv/bin/python"
passe() {
  nice -n 12 "$PY" -I tools/boucle_avant.py assets/creatures_hd
  nice -n 12 "$PY" -I tools/boucle_avant.py assets/creatures poulpe
  nice -n 12 sh tools/recode_creatures.sh assets/creatures_hd
}
passe
while pgrep -f "lot_t7" >/dev/null; do sleep 300; passe; done
passe
echo FINI_BOUCLE
