import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import routes from './routes';
import { initializeSocket } from './socket/index';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.static('src'));
app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, io };
