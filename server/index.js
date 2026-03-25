import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { registerAISocket } from './sockets/aiSocket.js';

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerAISocket(io);

server.listen(env.PORT, () => {
  console.log(`AI orchestrator running on http://localhost:${env.PORT}`);
});

