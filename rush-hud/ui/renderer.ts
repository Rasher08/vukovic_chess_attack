import { Chess, type Square } from 'chess.js';
import type { AppState, RushAPI } from '../types';
declare global { interface Window { rush: RushAPI } }
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let current: AppState;
let renderedFen = '';
const labels = { warming: 'Запускаю движок…', waiting: 'Жду позицию', searching: 'Ищу ход…', ready: 'Ход найден', paused: 'Пауза', error: 'Не удалось проверить' };
const pieces: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
function board(fen: string, move: string | null) {
  const position = new Chess(fen); const black = position.turn() === 'b';
  if (renderedFen !== fen) {
    renderedFen = fen; $('squares').replaceChildren();
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const square = (String.fromCharCode(97 + (black ? 7 - col : col)) + (black ? row + 1 : 8 - row)) as Square;
      const piece = position.get(square);
      const cell = document.createElement('div'); cell.className = `square${(row + col) % 2 ? ' dark' : ''}`;
      if (piece) { const icon = document.createElement('span'); icon.className = piece.color === 'w' ? 'piece-white' : 'piece-black'; icon.textContent = pieces[piece.type]; cell.append(icon); }
      if (col === 0 || row === 7) { const coordinate = document.createElement('span'); coordinate.className = 'coordinate'; coordinate.textContent = col === 0 ? square[1] : square[0]; cell.append(coordinate); }
      $('squares').append(cell);
    }
  }
  const arrow = $('board-arrow');
  if (!move) arrow.removeAttribute('data-move');
  else {
    const xy = (square: string) => { const f = square.charCodeAt(0) - 97, r = Number(square[1]) - 1; return [(black ? 7 - f : f) * 100 + 50, (black ? r : 7 - r) * 100 + 50]; };
    const [x1, y1] = xy(move.slice(0, 2)), [x2, y2] = xy(move.slice(2, 4));
    const len = Math.hypot(x2 - x1, y2 - y1), shortening = Math.min(25, len * .2);
    const line = $('arrow-line');
    for (const [key, val] of Object.entries({ x1, y1, x2: x2 - (x2 - x1) / len * shortening, y2: y2 - (y2 - y1) / len * shortening })) line.setAttribute(key, String(val));
    arrow.setAttribute('data-move', move);
  }
  $('turn').textContent = black ? 'Ход чёрных' : 'Ход белых';
}
function render(value: AppState) {
  current = value;
  $('version').textContent = `v${value.version}`;
  $('engine').textContent = value.engineLabel + ' · локально';
  $('status').textContent = labels[value.status]; $('dot').className = `dot ${value.status}`;
  $('connection').textContent = value.connected ? 'Расширение подключено · позиция с доски' : 'Подключите расширение на странице задач';
  $<HTMLSelectElement>('budget').value = String(value.budget);
  $('pause').textContent = value.status === 'paused' ? 'Продолжить' : 'Пауза';
  const result = value.result;
  $('metrics').textContent = result ? `${Math.round(result.elapsedMs)} мс · глубина ${result.depth}${value.cached ? ' · кэш' : ''}` : '—';
  $('result').textContent = value.error || (result?.move ? (result.final ? 'Готово' : 'Предварительный ход') + (result.move[4] ? ` · превращение в ${{ q: 'ферзя', r: 'ладью', b: 'слона', n: 'коня' }[result.move[4]] ?? result.move[4]}` : '') : 'На странице задач стрелка появится прямо поверх доски.');
  if (value.fen) board(value.fen, result?.move ?? null);
  else { $('board-arrow').removeAttribute('data-move'); }
}
function notice(error: unknown) { $('notice').textContent = error instanceof Error ? error.message : String(error); }
$('copy').onclick = async () => { try { await window.rush.copyToken(); notice('Ключ скопирован. Вставь его в расширение Rush HUD.'); } catch (e) { notice(e); } };
$('extension').onclick = async () => { try { await window.rush.openExtension(); } catch (e) { notice(e); } };
$('pause').onclick = async () => { try { await window.rush.configure({ paused: current.status !== 'paused' }); } catch (e) { notice(e); } };
$('budget').onchange = async () => { try { await window.rush.configure({ budget: Number($<HTMLSelectElement>('budget').value) }); } catch (e) { notice(e); } };
$('analyze').onclick = async () => {
  $<HTMLButtonElement>('analyze').disabled = true; notice('');
  try { await window.rush.analyze($<HTMLTextAreaElement>('fen').value.trim()); } catch (e) { notice(e); }
  finally { $<HTMLButtonElement>('analyze').disabled = false; }
};
board($<HTMLTextAreaElement>('fen').value, null);
window.rush.onState(render);
void window.rush.state().then(render, notice);
