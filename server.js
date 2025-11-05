const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.static("public"))
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const dbFile = "USERS.json";

function loadUsers() {
  if (!fs.existsSync(dbFile)) return {};
  try {
    const data = fs.readFileSync(dbFile, "utf8");
    return JSON.parse(data || "{}");
  } catch (err) {
    console.error("Error loading users:", err);
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(dbFile, JSON.stringify(users, null, 4));
}

app.post("/signup", async (req, res) => {
  const { fullname, username, phone_number, password } = req.body;

  if (!fullname || !username || !phone_number || !password)
    return res.status(400).json({ message: "Missing required fields" });

  const users = loadUsers();

  if (users[username])
    return res.status(409).json({ message: "Username already exists" });

  for (const key in users) {
    if (users[key].phone_number === phone_number)
      return res
        .status(409)
        .json({ message: "Account already exists with this phone number" });
  }

  const hash = await bcrypt.hash(password, 10);

  users[username] = {
    fullname,
    phone_number,
    NameinUse: username,
    hash_password: hash,
  };

  saveUsers(users);
  console.log(`🟩 New user created: ${username}`);
  res.status(201).json({ message: "Account successfully created" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Enter the data" });

  const users = loadUsers();

  if (!users[username])
    return res.status(401).json({ message: "Account not found, Sign Up" });

  const user = users[username];
  const validPass = await bcrypt.compare(password, user.hash_password);

  if (!validPass)
    return res.status(401).json({ message: "Incorrect password" });

  console.log(`🟨 User Logged in: ${username}`);
  res.status(200).json({
    message: "Login Successful",
    fullname: user.fullname,
  });
});

let activeUsers = {};

io.on("connection", (socket) => {
  console.log("🟢 New user connected:", socket.id);

  socket.on("newUser", (username) => {
    socket.username = username;
    activeUsers[socket.id] = username;

    console.log(` ${username} joined`);
    io.emit("userJoined", `${username} joined the chat`);

    io.emit("userList", getUserList());
    socket.emit("userList", getUserList());
  });

  socket.on("sendMessage", (data) => {
    const time = new Date().toLocaleTimeString();
    console.log(`Message from ${data.user}: ${data.text}`);
    io.emit("rm", { ...data, time });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      console.log(`🔴 ${socket.username} disconnected`);
      io.emit("userLeft", `${socket.username} left the chat`);
      delete activeUsers[socket.id];
      io.emit("userList", getUserList());
    }
  });
});

function getUserList() {
  const users = loadUsers();
  const allUserList = Object.keys(users).map((username) => ({
    name: username,
    online: Object.values(activeUsers).includes(username),
  }));
  return allUserList;
}

app.get("/", (req, res) => {
  //res.send("IIC Chat + Auth Server Running with User List & Status");
  res.sendFile(__dirname + "/public/login.html")
});

const port = 5001;
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "{}");
server.listen(port, () =>
  console.log(`Server running on http://127.0.0.1:${port}`)
);
