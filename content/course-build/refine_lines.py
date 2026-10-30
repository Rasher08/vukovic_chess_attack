import chess,chess.engine,json,pathlib
p=pathlib.Path(__file__).resolve().parent;items=json.loads((p/'analyses.json').read_text())
e=chess.engine.SimpleEngine.popen_uci(__import__('os').environ['STOCKFISH_BINARY']);e.configure({'Threads':1,'Hash':128})
for item in items:
 b=chess.Board(item['fen']); first=b.parse_san(item['candidate']); info=e.analyse(b,chess.engine.Limit(nodes=2500000),root_moves=[first],game=object())
 pv=list(info['pv']);moves=[]; goal=15 if item['id']=='double-sacrifice' else 11
 for i in range(goal):
  if b.is_game_over():break
  if not pv:
   more=e.analyse(b,chess.engine.Limit(nodes=700000),game=object());pv=list(more['pv'])
  m=pv.pop(0);moves.append(b.san(m));b.push(m)
 item['refined']={'san':moves,'score':str(info['score'].pov(chess.Board(item['fen']).turn)),'depth':info['depth'],'nodes':info['nodes']}
 print(item['id'],item['refined'],flush=True)
 (p/'refined.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
e.quit()
