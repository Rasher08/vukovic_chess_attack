"""Read the official CC0 Lichess CSV from stdin; stop after balanced quotas.
Reproduce: curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | python3 scripts/import_training_bank.py
Only selected factual rows are retained; no player names or annotations imported.
"""
import csv, json, sys, hashlib
from pathlib import Path

SKILLS = ['king-attack', 'sacrifice', 'calculation', 'defense', 'quiet-move', 'mating-net']
TARGET = 20  # four rating bands × 20 = 80 per skill
counts = {(s, b): 0 for s in SKILLS for b in range(4)}
chosen, games, fens = [], set(), set()
scanned = 0
resume = '--resume' in sys.argv
prior_scanned = 0
if resume:
    chosen = json.loads(Path('content/training-bank/selected-source-rows.json').read_text())
    prior_scanned = json.loads(Path('content/training-bank/selection-report.json').read_text())['scannedRows']
    for item in chosen:
        counts[item['skillId'], min(3, (int(item['Rating']) - 2200) // 150)] += 1
        games.add(item['GameUrl'].split('lichess.org/')[-1][:8])
        fens.add(' '.join(item['FEN'].split()[:4]))
for row in csv.DictReader(sys.stdin):
    scanned += 1
    rating = int(row['Rating'])
    tags = set(row['Themes'].split())
    moves = row['Moves'].split()
    if not (2200 <= rating <= 2800 and int(row['RatingDeviation']) <= 85 and int(row['Popularity']) >= 85 and int(row['NbPlays']) >= 500): continue
    if not (6 <= len(moves) <= 18) or 'endgame' in tags or 'mateIn1' in tags or 'mateIn2' in tags: continue
    if 'middlegame' not in tags: continue
    family = row['GameUrl'].split('lichess.org/')[-1][:8]
    fen_key = ' '.join(row['FEN'].split()[:4])
    if family in games or fen_key in fens: continue
    band = min(3, (rating - 2200) // 150)
    eligible = []
    if tags & {'kingsideAttack', 'queensideAttack', 'exposedKing', 'attackingF2F7'}: eligible.append('king-attack')
    if tags & {'sacrifice', 'attraction', 'clearance', 'deflection'}: eligible.append('sacrifice')
    if tags & {'long', 'veryLong'} and not tags & {'mate'}: eligible.append('calculation')
    if 'defensiveMove' in tags: eligible.append('defense')
    if tags & {'quietMove', 'intermezzo'}: eligible.append('quiet-move')
    if tags & {'mateIn3', 'mateIn4', 'mateIn5'}: eligible.append('mating-net')
    eligible = [s for s in eligible if (sum(counts[s, b] for b in range(4)) < 80 if s == 'mating-net' else counts[s, band] < TARGET)]
    if not eligible: continue
    # Rarer skills first, then least-filled quota, deterministic tie breaking.
    priority = {'defense': 0, 'quiet-move': 1, 'king-attack': 2, 'sacrifice': 3, 'mating-net': 4, 'calculation': 5}
    skill = min(eligible, key=lambda s: (priority[s], counts[s, band]))
    row['skillId'] = skill
    chosen.append(row); games.add(family); fens.add(fen_key); counts[skill, band] += 1
    if all(sum(counts[s, b] for b in range(4)) == 80 for s in SKILLS): break
    if scanned >= 1500000: break
out = Path('content/training-bank')
out.mkdir(exist_ok=True)
(out / 'selected-source-rows.json').write_text(json.dumps(chosen, ensure_ascii=False, indent=2) + '\n')
report = {'source': 'https://database.lichess.org/lichess_db_puzzle.csv.zst', 'license': 'CC0-1.0', 'retrieved': '2026-10-24', 'scannedRows': scanned + prior_scanned, 'passes': 2 if resume else 1, 'selected': len(chosen), 'selection': 'Deterministic prefix scan, 80 per skill, equal rating-band quotas except mating-net; not a random or representative sample.', 'criteria': {'rating': [2200, 2800], 'ratingDeviationMax': 85, 'popularityMin': 85, 'playsMin': 500, 'sourcePlies': [6, 18], 'distinctSourceGame': True, 'exclude': ['endgame', 'mateIn1', 'mateIn2'], 'required': ['middlegame']}, 'quotas': {s: [counts[s, b] for b in range(4)] for s in SKILLS}}
(out / 'selection-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False), file=sys.stderr)
if len(chosen) != 480: sys.exit(2)
