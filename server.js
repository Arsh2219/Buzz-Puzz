const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", (adminName) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomId] = {
      admin: socket.id,
      players: {},
      buzzed: [],
      locked: false,
      startTime: Date.now(),
    };
    rooms[roomId].players[socket.id] = adminName;

    socket.join(roomId);
    socket.emit("room-created", { roomId });
    io.to(roomId).emit("update-players", Object.values(rooms[roomId].players));
  });

  socket.on("join-room", ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("room-error", "Room not found.");
      return;
    }
    room.players[socket.id] = playerName;
    socket.join(roomId);
    io.to(roomId).emit("update-players", Object.values(room.players));
  });

  socket.on("buzz", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.locked) return;
    if (room.buzzed.find((entry) => entry.id === socket.id)) return;

    const timeInSeconds = ((Date.now() - room.startTime) / 1000).toFixed(2);
    const buzzData = {
      id: socket.id,
      name: room.players[socket.id],
      time: timeInSeconds,
    };
    room.buzzed.push(buzzData);
    io.to(roomId).emit("buzzed", room.buzzed);
  });

  socket.on("lock-buzzer", (roomId) => {
    const room = rooms[roomId];
    if (room && socket.id === room.admin) {
      room.locked = true;
      io.to(roomId).emit("buzzer-locked");
    }
  });

  socket.on("reset-buzzer", (roomId) => {
    const room = rooms[roomId];
    if (room && socket.id === room.admin) {
      room.buzzed = [];
      room.locked = false;
      room.startTime = Date.now();
      io.to(roomId).emit("buzzer-reset");
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      delete room.players[socket.id];
      room.buzzed = room.buzzed.filter((b) => b.id !== socket.id);

      if (socket.id === room.admin) {
        io.to(roomId).emit("room-closed");
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("update-players", Object.values(room.players));
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
