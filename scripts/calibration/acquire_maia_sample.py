#!/usr/bin/env python3
"""Bounded, reproducible HTTP-range sample of the official Maia KDD CSV.

Only complete bzip2 blocks and complete games are accepted. The archive is
rating-sorted; evenly spaced byte ranges cover its extent without downloading
the 209 MB archive. This is a convenience sample, not a random population sample.
Raw ranges stay in .artifacts; only game-side numeric summaries are written to
content/rating-calibration. No names, clocks, moves or FENs are exported there.
"""
import bz2
import csv
import hashlib
import io
import json
import math
import pathlib
import subprocess
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / '.artifacts/calibration-cache'
OUT = ROOT / 'content/rating-calibration'
URL = 'https://csslab.cs.toronto.edu/data/chess/kdd/maia-chess-testing-set.csv.bz2'
SIZE = 209395633
CHUNK = 2_000_000
NCHUNKS = 20


def download(index):
    start = round((SIZE - CHUNK) * index / (NCHUNKS - 1))
    end = start + CHUNK - 1
    path = CACHE / f'range-{index:02d}-{start}-{end}.bz2'
    if not path.exists() or path.stat().st_size != CHUNK:
        req = urllib.request.Request(URL, headers={'Range': f'bytes={start}-{end}'})
        with urllib.request.urlopen(req, timeout=40) as response:
            if response.status != 206:
                raise RuntimeError(f'Range unsupported: HTTP {response.status}')
            data = response.read(CHUNK + 1)
        if len(data) != CHUNK:
            raise RuntimeError('Unexpected range length')
        path.write_bytes(data)
    return {'index': index, 'start': start, 'end': end, 'bytes': CHUNK,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'path': path}


def wp(cp):
    return 100 / (1 + math.exp(-0.00368208 * cp))


def finite_cp(value):
    try:
        result = float(value) * 100  # Archive cp field is in pawn units.
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def summaries(game, opening_moves, counts):
    if not game or game[0]['move_ply'] != '0':
        counts['incomplete_game'] += 1
        return []
    first = game[0]
    try:
        num_ply = int(first['num_ply'])
        if len(game) != num_ply or any(int(row['move_ply']) != i for i, row in enumerate(game)):
            counts['incomplete_game'] += 1
            return []
        initial = int(first['time_control'].split('+')[0])
    except (ValueError, KeyError):
        counts['bad_metadata'] += 1
        return []
    if (first['termination'] != 'Normal' or first['type'] not in ('Blitz', 'Rapid', 'Classical')
            or initial < 180 or num_ply < 40
            or first['board'] != 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'):
        counts['ineligible_game'] += 1
        return []
    counts['complete_eligible_games'] += 1
    losses = {'w': [], 'b': []}
    for i, (before, after) in enumerate(zip(game, game[1:])):
        color = 'w' if before['white_active'] == 'True' else 'b'
        fields = before['board'].split(' ')
        if len(fields) < 4 or fields[1] != color:
            counts['bad_board'] += 1
            continue
        # Maia uses python-chess board.fen(): legal en-passant field, matching
        # chess.js normalization in the application's pinned opening dataset.
        position = ' '.join(fields[:4])
        if i < 36 and before['move'] in opening_moves.get(position, set()):
            counts['book'] += 1
            continue
        try:
            if int(before['num_legal_moves']) <= 1:
                counts['forced'] += 1
                continue
        except ValueError:
            continue
        pre, post = finite_cp(before['cp']), finite_cp(after['cp'])
        if pre is None or post is None:
            counts['missing_or_mate_eval'] += 1
            continue
        archived_loss = finite_cp(before['cp_loss'])
        sign = 1 if color == 'w' else -1
        if archived_loss is not None:
            counts['finite_cp_loss_crosschecks'] += 1
            if abs(archived_loss - (pre - post) * sign) > 2.01:
                counts['cp_loss_crosscheck_mismatch'] += 1
        if abs(pre) > 400:
            counts['decided_position'] += 1
            continue
        loss = max(0, min(100, wp(pre * sign) - wp(post * sign)))
        losses[color].append(loss)
        counts['eligible_decisions'] += 1
    result = []
    for color in ('w', 'b'):
        values = losses[color]
        elo = int(first['white_elo' if color == 'w' else 'black_elo'])
        if len(values) >= 12 and 1000 <= elo < 2600:
            result.append({'game_id': first['game_id'], 'color': color, 'elo': elo,
                           'n': len(values), 'meanLossWP': round(sum(values) / len(values), 9)})
    return result


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        ranges = list(pool.map(download, range(NCHUNKS)))
    print(f'Downloaded/cached {sum(r["bytes"] for r in ranges):,} compressed bytes', flush=True)
    opening = json.loads((ROOT / 'src/data/openingTheory.json').read_text())
    opening_moves = {fen: set(moves.split()) for fen, moves in opening['transitions']}
    first_data = bz2.BZ2Decompressor().decompress(ranges[0]['path'].read_bytes())
    header = next(csv.reader([first_data.split(b'\n', 1)[0].decode()]))
    counts = Counter()
    unique = {}
    for sample in ranges:
        raw = sample['path']
        recovered = CACHE / f'blocks-{sample["index"]:02d}'
        recovered.mkdir(exist_ok=True)
        local_path = recovered / 'sample.bz2'
        if not local_path.exists():
            local_path.write_bytes(raw.read_bytes())
        if not list(recovered.glob('rec*.bz2')):
            subprocess.run(['/usr/bin/bzip2recover', str(local_path)], capture_output=True, check=False)
        data = bytearray()
        good_blocks = 0
        for block in sorted(recovered.glob('rec*.bz2')):
            try:
                data.extend(bz2.decompress(block.read_bytes()))
                good_blocks += 1
            except (OSError, EOFError):
                pass
        text = bytes(data).decode('utf-8', errors='replace')
        # Both edge lines may be partial, including the source header.
        lines = text.splitlines()[1:-1]
        game, last_id, emitted = [], None, 0
        for values in csv.reader(lines):
            if len(values) != len(header):
                counts['partial_row'] += 1
                continue
            row = dict(zip(header, values))
            game_id = row.get('game_id')
            if game_id != last_id:
                for summary in summaries(game, opening_moves, counts):
                    unique[(summary['game_id'], summary['color'])] = summary
                    emitted += 1
                game, last_id = [], game_id
            game.append(row)
        # Deliberately drop the final game, which may be cut by a range edge.
        print(f'Range {sample["index"]:02d}: {good_blocks} blocks, {emitted} eligible game-sides', flush=True)
    rows = sorted(unique.values(), key=lambda row: (row['game_id'], row['color']))
    destination = OUT / 'maia-game-quality-sample.json'
    destination.write_text(json.dumps(rows, separators=(',', ':')) + '\n')
    bands = Counter((row['elo'] // 100) * 100 for row in rows)
    provenance = {
        'schemaVersion': 1,
        'sourcePage': 'https://csslab.cs.toronto.edu/datasets/',
        'sourceArchive': URL, 'sourceBytes': SIZE,
        'sourceLastModified': '2020-10-21T20:49:00Z',
        'underlyingGames': 'Lichess rated standard games, December 2019',
        'sampling': {'method': '20 evenly spaced 2MB HTTP byte ranges; bzip2recover complete blocks; complete games only',
                     'compressedBytes': sum(r['bytes'] for r in ranges),
                     'ranges': [{k: v for k, v in item.items() if k != 'path'} for item in ranges]},
        'openingSourceCommit': opening['sourceCommit'],
        'featureDefinition': 'Mean max(0, logisticWP(beforeCP*side)-logisticWP(afterCP*side)), logisticWP(cp)=100/(1+exp(-0.00368208*cp)); finite consecutive White-POV pawn evaluations converted to cp; abs(beforeCP)<=400; exclude exact pinned book transitions and <=1 legal move; >=12 eligible decisions per side.',
        'filters': 'Complete normally terminated Blitz/Rapid/Classical; initial clock>=180s; >=40 plies; target Elo1000..2599; standard initial game rows.',
        'gameSides': len(rows), 'games': len({row['game_id'] for row in rows}),
        'ratingBands': dict(sorted(bands.items())), 'processingCounts': dict(counts),
        'sampleSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'licenseNote': 'Lichess originals are CC0 (https://database.lichess.org/). CSSLab transformed dataset page gives no separate data license; Maia software is GPL3, not assumed to cover this download. Raw downloaded corpus is not redistributed; only numerical per-game-side aggregates and fitted statistics are retained.',
        'limitations': ['Byte-range convenience sample of rating-sorted selected analyzed games; not a random sample of all players.',
                        'Targets are Lichess Blitz/Rapid/Classical ratings, not Chess.com or FIDE.',
                        'Consecutive archived Stockfish evaluations differ from the application same-root forced-move analysis and have missing/mate parsing artifacts; nonfinite rows are excluded.',
                        'Single-game quality is noisy; numeric prediction is experimental, not an exact player rating.'],
    }
    (OUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'gameSides': len(rows), 'games': provenance['games'], 'bands': dict(sorted(bands.items())), 'counts': dict(counts)}), flush=True)


if __name__ == '__main__':
    main()
