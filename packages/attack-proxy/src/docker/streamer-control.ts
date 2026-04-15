import { spawn } from 'child_process';

interface DockerResult {
  code: number;
  stdout: string;
  stderr: string;
}

function spawnDockerCommand(args: string[]): Promise<DockerResult> {
  return new Promise((resolve) => {
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', () => resolve({ code: 1, stdout: '', stderr: '' }));
  });
}

async function findStreamerContainer(): Promise<string> {
  const methods = [
    ['ps', '--filter', 'label=com.docker.compose.service=streamer', '--format', '{{.ID}}'],
    ['ps', '--filter', 'name=streamer', '--format', '{{.ID}}'],
    ['ps', '-a', '--filter', 'name=.*streamer.*', '--format', '{{.ID}}'],
  ];

  for (const args of methods) {
    const { code, stdout } = await spawnDockerCommand(args);
    if (code !== 0) continue;
    const id = stdout.trim().split('\n')[0];
    if (id) return id;
  }

  throw new Error('Streamer container not found. Is the streamer service running?');
}

async function checkContainerStatus(
  containerId: string,
): Promise<{ exists: boolean; status: string | null }> {
  const { code, stdout } = await spawnDockerCommand([
    'inspect',
    '--format',
    '{{.State.Status}}',
    containerId,
  ]);
  if (code === 0) return { exists: true, status: stdout.trim() };
  return { exists: false, status: null };
}

export async function restartStreamerContainer(): Promise<void> {
  const containerId = await findStreamerContainer();

  const status = await checkContainerStatus(containerId);
  if (!status.exists) {
    throw new Error(`Container ${containerId} does not exist`);
  }

  const { code, stdout, stderr } = await spawnDockerCommand(['restart', containerId]);
  if (code === 0) {
    console.log(`Streamer container restarted: ${containerId}`);
  } else {
    throw new Error(`Docker restart failed: ${stderr || stdout}`);
  }
}
