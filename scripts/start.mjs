// Lance le serveur et le front ensemble (sans dependance) : npm start
import { spawn, spawnSync } from 'node:child_process';

const run = (args) => spawn('npm', ['run', ...args], { stdio: 'inherit', shell: true });
const children = [run(['server']), run(['dev'])];
let code = 0;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.pid === undefined || c.exitCode !== null) continue;
    // shell:true sous Windows : tuer l'arbre pour liberer les ports 3001/5173.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']);
    else c.kill();
  }
}

for (const c of children) {
  c.on('error', (err) => {
    console.error('echec du lancement :', err);
    code = code || 1;
    stop();
  });
  c.on('exit', (exitCode) => {
    if (!stopping) code = exitCode ?? 1;
    stop();
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => {
  stop();
  process.exitCode = code;
});
