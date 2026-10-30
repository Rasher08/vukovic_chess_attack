import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { createRequire } from 'node:module';
import path from 'node:path';
import { BrowserChessEngine } from '../../src/lib/browserEngine';

export interface NodeEngineOptions {
  enginePath?: string;
  executablePath?: string;
  startupTimeoutMs?: number;
  searchTimeoutMs?: number;
}

/** A Worker-shaped adapter; the production UCI parser and queue remain shared. */
class ProcessWorker extends EventTarget {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private stopped = false;

  constructor(enginePath: string, executablePath: string) {
    super();
    this.child = spawn(executablePath, [enginePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Electron's executable also serves as the local Node runtime. No shell.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', data => this.dispatchEvent(new MessageEvent('message', { data })));
    this.child.on('error', () => this.failed('Stockfish не удалось запустить.'));
    this.child.on('exit', () => { if (!this.stopped) this.failed('Stockfish завершился во время проверки.'); });
    this.child.stdin.on('error', () => { if (!this.stopped) this.failed('Соединение со Stockfish прервано.'); });
    // Drain stderr without leaking engine analysis into the HUD or logs.
    this.child.stderr.resume();
  }

  postMessage(command: string): void {
    if (this.stopped) throw new Error('Stockfish остановлен.');
    this.child.stdin.write(command + '\n');
  }

  terminate(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.lines.close();
    this.child.stdin.destroy();
    // Worker cancellation must interrupt synchronous WASM searches, not queue stop.
    this.child.kill('SIGKILL');
  }

  private failed(message: string): void {
    if (this.stopped) return;
    const event = new Event('error', { cancelable: true }) as ErrorEvent;
    Object.defineProperty(event, 'message', { value: message });
    this.dispatchEvent(event);
  }
}

/** Single-threaded Stockfish 19 Lite, 32 MB hash. Recreate after dispose/failure. */
export class NodeEngine extends BrowserChessEngine {
  constructor(options: NodeEngineOptions = {}) {
    // Resolve from cwd so bundled Electron code and tsx tests use the same assets.
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const enginePath = options.enginePath ?? path.join(path.dirname(require.resolve('stockfish/package.json')), 'bin/stockfish-19-lite-single.js');
    super({
      workerFactory: () => new ProcessWorker(enginePath, options.executablePath ?? process.execPath) as unknown as Worker,
      startupTimeoutMs: options.startupTimeoutMs ?? 15000,
      searchTimeoutMs: options.searchTimeoutMs ?? 20000,
    });
  }
}
