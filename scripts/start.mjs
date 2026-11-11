// Lance le serveur et le front ensemble (sans dependance) : npm start
import { spawn } from 'node:child_process';

const run = (args) => spawn('npm', ['run', ...args], { stdio: 'inherit', shell: true });
const children = [run(['server']), run(['dev'])];
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', stop));
