# Quand les 80 poses des visiteurs sont finies (capture-salle/v8/done) : noirs allégés, découpage par personne,
# puis elles remplacent les 20 poses actuelles (gardées dans assets/visitors_20).
cd "/Users/johann/Documents/Projet Portfolio/Dumbo-biovolume/salle"
PY="/Users/johann/Documents/Projet Portfolio/ml-sharp/.venv/bin/python"
while [ ! -f "/Users/johann/Documents/Projet Portfolio/capture-salle/v8/done" ]; do sleep 60; done
"$PY" -I tools/noirs_transparents.py assets/visitors_80 && "$PY" -I tools/split_personnes.py assets/visitors_80 \
  && rm -rf assets/visitors_20 && mv assets/visitors assets/visitors_20 && mv assets/visitors_80 assets/visitors \
  && rsync -a --exclude .git --exclude capture "/Users/johann/Documents/Projet Portfolio/Dumbo-biovolume/" "/Users/johann/Library/Application Support/Claude/scratch-workspaces/96238fde-69f4-4f69-bf92-b3b62f8ca2d1/41fa9884-4dbc-4490-be1c-b45496119fca/scratch-2026-11-07-c4f47c/site-test/" \
  && echo "INSTALLE $(date +%H:%M)"
