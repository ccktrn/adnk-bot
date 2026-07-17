import { spawn } from 'child_process';
import { createAudioResource } from '@discordjs/voice';

const yt = spawn('./yt-dlp', ['-f', 'bestaudio', '-o', '-', '-q', 'https://www.youtube.com/watch?v=96IUmVOb2n4']);

yt.on('error', console.error);
yt.stderr.on('data', d => console.log('stderr:', d.toString()));
yt.on('close', code => console.log('exit code:', code));

const resource = createAudioResource(yt.stdout);
console.log("Resource created:", resource.playbackDuration);
setTimeout(() => {
  console.log("Waited 5s, exiting");
  yt.kill();
}, 5000);
