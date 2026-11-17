import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack } from '@pribe/shared';

export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * The real server entry (`src/index.ts`) as a child process, so the test sees what an
 * operator sees: env config, stdout/stderr logs and a hard kill like a crashed container.
 */
export class ServerProcess {
  private child: ChildProcess | null = null;
  /** stdout + stderr of every run, for the "no names in logs" check (R22). */
  logs = '';

  constructor(
    readonly port: number,
    private readonly env: Record<string, string>,
  ) {}

  get base(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    if (await fetch(`${this.base}/api/health`).then((r) => r.ok, () => false)) {
      throw new Error(`Port ${this.port} ist schon belegt (läuft noch ein Pribe-Server?)`);
    }
    const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...this.env, PORT: String(this.port), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout!.on('data', (d: Buffer) => (this.logs += d.toString('utf8')));
    child.stderr!.on('data', (d: Buffer) => (this.logs += d.toString('utf8')));

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Server beendet (${child.exitCode}):\n${this.logs}`);
      const up = await fetch(`${this.base}/api/health`).then((r) => r.ok, () => false);
      if (up) return;
      await sleep(150);
    }
    throw new Error(`Server nicht erreichbar:\n${this.logs}`);
  }

  /** Hard kill, no graceful shutdown: the persisted state has to carry the game (R4). */
  async kill(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGKILL');
    });
  }
}

/** A port the OS just handed out; the server process binds it right after. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export const sleep =(ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timeout: ${what}`);
    await sleep(50);
  }
}

/** Minimal cookie jar: `name=value` pairs from `Set-Cookie`. */
export function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
}

export async function api<T = unknown>(
  base: string,
  method: string,
  url: string,
  opts: { cookie?: string; json?: unknown; form?: FormData } = {},
): Promise<{ status: number; body: T; res: Response }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | FormData | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  const res = await fetch(`${base}${url}`, { method, headers, body });
  const text = await res.clone().text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // binary or plain text body
  }
  return { status: res.status, body: parsed as T, res };
}

export async function openSocket(base: string, ns: string, cookie: string): Promise<Socket> {
  const socket = connect(`${base}${ns}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { cookie },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

export function call<T = void>(socket: Socket, event: string, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

export async function request<T>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  const res = await call<T>(socket, event, ...args);
  if (!res.ok) throw new Error(`${event}: ${res.error}`);
  return (res as { data: T }).data;
}
