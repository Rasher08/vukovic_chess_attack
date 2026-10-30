#!/usr/bin/env python3
"""Fit an experimental game-quality scale from characteristic loss by Elo band.

This fits E[quality loss | rating group], then inverts that characteristic curve.
It does NOT fit/predict E[player Elo | one game's quality]. Whole games remain
in held-out groups. Standard-library-only and reproducible from aggregate rows.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
from collections import Counter, defaultdict

MIN_DECISIONS = 12
SOURCE_URL = 'https://csslab.cs.toronto.edu/datasets/'


def split_game(game_id: str) -> str:
    return 'test' if int(hashlib.sha256(game_id.encode()).hexdigest()[:8], 16) % 5 == 0 else 'train'


def rounded(value: float) -> int:
    return math.floor(value / 50 + .5) * 50


def band(row: dict) -> int:
    return int(row['elo']) // 100 * 100


def mean(values):
    return sum(values) / len(values)


def fit(rows: list[dict]) -> tuple[list[list[float]], list[dict]]:
    groups = defaultdict(list)
    for row in rows:
        groups[band(row)].append(row)
    anchors = [{'band': key, 'n': len(values), 'rating': mean([row['elo'] for row in values]),
                'rawLoss': mean([row['meanLossWP'] for row in values])} for key, values in sorted(groups.items())]
    # Weighted PAVA on band-mean losses: higher rating must not have higher
    # characteristic loss. Weight by observed sides, not an invented prior.
    blocks = []
    for index, anchor in enumerate(anchors):
        blocks.append({'n': anchor['n'], 'sumLoss': anchor['rawLoss'] * anchor['n'], 'indices': [index]})
        while len(blocks) > 1 and blocks[-2]['sumLoss'] / blocks[-2]['n'] < blocks[-1]['sumLoss'] / blocks[-1]['n']:
            right = blocks.pop()
            left = blocks.pop()
            blocks.append({'n': left['n'] + right['n'], 'sumLoss': left['sumLoss'] + right['sumLoss'], 'indices': left['indices'] + right['indices']})
    for block in blocks:
        for index in block['indices']:
            anchors[index]['fittedLoss'] = block['sumLoss'] / block['n']
    return [[anchor['fittedLoss'], anchor['rating']] for anchor in reversed(anchors)], anchors


def predict(knots: list[list[float]], loss: float) -> int:
    # No extrapolation. Equal-loss plateaus are ambiguous: use their midpoint.
    if loss < knots[0][0]:
        return rounded(knots[0][1])
    if loss > knots[-1][0]:
        return rounded(knots[-1][1])
    same = [rating for x, rating in knots if abs(loss - x) < 1e-9]
    if same:
        return rounded((min(same) + max(same)) / 2)
    for left, right in zip(knots, knots[1:]):
        if left[0] < loss < right[0]:
            ratio = (loss - left[0]) / (right[0] - left[0])
            return rounded(left[1] + ratio * (right[1] - left[1]))
    raise ValueError('No valid curve segment')


def expected_loss(anchors: list[dict], rating: float) -> float:
    if rating <= anchors[0]['rating']:
        return anchors[0]['fittedLoss']
    for left, right in zip(anchors, anchors[1:]):
        if rating <= right['rating']:
            ratio = (rating - left['rating']) / (right['rating'] - left['rating'])
            return left['fittedLoss'] + ratio * (right['fittedLoss'] - left['fittedLoss'])
    return anchors[-1]['fittedLoss']


def quantile(values, fraction):
    return sorted(values)[min(len(values) - 1, math.floor((len(values) - 1) * fraction))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('sample', type=Path)
    parser.add_argument('--output', type=Path, default=Path('src/data/gameQualityModel.json'))
    parser.add_argument('--report', type=Path, default=Path('.artifacts/calibration-model-validation.json'))
    args = parser.parse_args()
    data_bytes = args.sample.read_bytes()
    rows = json.loads(data_bytes)
    identities = set()
    for row in rows:
        identity = (row.get('game_id'), row.get('color'))
        if identity in identities:
            raise ValueError(f'Duplicate side {identity}')
        identities.add(identity)
        if not isinstance(row.get('game_id'), str) or row.get('color') not in ('w', 'b'):
            raise ValueError('Invalid game or color')
        if not (1000 <= row['elo'] < 2600 and row['n'] >= MIN_DECISIONS and math.isfinite(row['meanLossWP']) and 0 <= row['meanLossWP'] <= 100):
            raise ValueError('Row does not satisfy extraction contract')
    train = [row for row in rows if split_game(row['game_id']) == 'train']
    test = [row for row in rows if split_game(row['game_id']) == 'test']
    train_bands = Counter(band(row) for row in train)
    test_bands = Counter(band(row) for row in test)
    if len(train_bands) < 12 or min(train_bands) > 1200 or max(train_bands) < 2300 or len(test_bands) < 12:
        raise ValueError(f'Insufficient rating coverage: train={train_bands}, test={test_bands}')
    if min(train_bands.values()) < 25 or min(test_bands.values()) < 5:
        raise ValueError(f'Insufficient sides per band: train={train_bands}, test={test_bands}')
    knots, anchors = fit(train)
    if knots[-1][0] - knots[0][0] < 1:
        raise ValueError('Insufficient quality signal across rating groups')
    predictions = [predict(knots, row['meanLossWP']) for row in test]
    baseline_rating = rounded(mean([anchor['rating'] for anchor in anchors]))
    by_band = defaultdict(list)
    for row, prediction in zip(test, predictions):
        by_band[band(row)].append((row, prediction))
    diagnostic_bands = []
    for rating_band, values in sorted(by_band.items()):
        actual = mean([row['elo'] for row, _ in values])
        loss = mean([row['meanLossWP'] for row, _ in values])
        diagnostic_bands.append({
            'band': rating_band, 'sides': len(values), 'meanActual': actual,
            'meanLoss': loss, 'expectedLoss': expected_loss(anchors, actual),
            'ratingOfGroupMeanLoss': predict(knots, loss),
            'meanPrediction': mean([prediction for _, prediction in values]),
            'predictionP10': quantile([prediction for _, prediction in values], .1),
            'predictionP90': quantile([prediction for _, prediction in values], .9),
            'mae': mean([abs(row['elo'] - prediction) for row, prediction in values]),
            'baselineMae': mean([abs(row['elo'] - baseline_rating) for row, _ in values]),
        })
    mae = mean([group['mae'] for group in diagnostic_bands])
    baseline_mae = mean([group['baselineMae'] for group in diagnostic_bands])
    group_loss_mae = mean([abs(group['meanLoss'] - group['expectedLoss']) for group in diagnostic_bands])
    baseline_loss = mean([anchor['rawLoss'] for anchor in anchors])
    baseline_group_loss_mae = mean([abs(group['meanLoss'] - baseline_loss) for group in diagnostic_bands])
    if group_loss_mae >= baseline_group_loss_mae:
        raise ValueError('Held-out group means do not support the characteristic curve')
    report = {
        'version': 2, 'method': 'characteristic-curve',
        'sampleSha256': hashlib.sha256(data_bytes).hexdigest(),
        'split': 'SHA256(game_id) first8hex modulo5==0 for holdout; both sides stay together',
        'fit': 'Mean loss by 100point actual-rating band; weighted decreasing PAVA; invert piecewise-linear curve; flat inverse midpoint; no extrapolation; round50',
        'meaning': 'Rating group whose typical quality loss matches the game; not predicted player Elo',
        'trainingGames': len({row['game_id'] for row in train}), 'trainingSides': len(train),
        'testGames': len({row['game_id'] for row in test}), 'testSides': len(test),
        'validationMae': mae, 'baselineMae': baseline_mae,
        'groupLossMae': group_loss_mae, 'baselineGroupLossMae': baseline_group_loss_mae,
        'groupRatingMae': mean([abs(group['ratingOfGroupMeanLoss'] - group['meanActual']) for group in diagnostic_bands]),
        'predictionP10': quantile(predictions, .1), 'predictionP90': quantile(predictions, .9),
        'upperBoundarySides': sum(row['meanLossWP'] < knots[0][0] for row in test),
        'lowerBoundarySides': sum(row['meanLossWP'] > knots[-1][0] for row in test),
        'byRatingBand': diagnostic_bands, 'trainingAnchors': anchors, 'knots': knots,
    }
    model = {
        'version': 2, 'method': 'characteristic-curve', 'scale': 'Lichess', 'sourceUrl': SOURCE_URL,
        'sampleSha256': report['sampleSha256'], 'minDecisions': MIN_DECISIONS,
        'maxBeforeAbsCp': 400, 'minRating': rounded(knots[-1][1]), 'maxRating': rounded(knots[0][1]), 'roundTo': 50,
        'trainingGames': report['trainingGames'], 'trainingSides': len(train),
        'testGames': report['testGames'], 'testSides': len(test),
        'validationMae': round(mae, 1), 'baselineMae': round(baseline_mae, 1),
        'groupLossMae': round(group_loss_mae, 3), 'baselineGroupLossMae': round(baseline_group_loss_mae, 3),
        'groupRatingMae': round(report['groupRatingMae'], 1),
        'knots': [[round(x, 9), round(y, 6)] for x, y in knots],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')) + '\n')
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('trainingGames', 'trainingSides', 'testGames', 'testSides', 'validationMae', 'baselineMae', 'groupLossMae', 'baselineGroupLossMae', 'groupRatingMae', 'predictionP10', 'predictionP90', 'upperBoundarySides', 'lowerBoundarySides')}, indent=2))

if __name__ == '__main__':
    main()
