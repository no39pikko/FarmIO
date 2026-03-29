'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Game = require('./server/Game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const game = new Game(io);
game.start();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FarmIO server running on http://localhost:${PORT}`);
});
