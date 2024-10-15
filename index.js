import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import User from "./models/User.js";
import Post from "./models/Post.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import connectToMongoDB from "./data.config.js";
import { fileURLToPath } from "url";
import path from "path";

// Determine which environment file to load
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(__dirname, envPath) });
/* 

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

*/
const app = express();
const uploadMiddleware = multer({ dest: "uploads/" });
const salt = bcrypt.genSaltSync(10);
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));
const hostname = "0.0.0.0";
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: "https://dapper-marzipan-3f7e6a.netlify.app", // Allow the frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // Allow credentials
  })
);

// MongoDB Connection
connectToMongoDB();

// Routes
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });

  if (!userDoc) {
    return res.status(400).json({ message: "User not found" });
  }

  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({ username, id: userDoc._id }, JWT_SECRET, {}, (err, token) => {
      if (err) {
        console.error("JWT Sign Error:", err);
        return res.status(500).json({ message: "Token generation failed" });
      }
      res.cookie("token", token).json({
        id: userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json("Wrong credentials");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies; // Get token from cookies
  if (!token) {
    return res.status(401).json({ message: "No token provided" }); // No token case
  }

  jwt.verify(token, JWT_SECRET, {}, (err, info) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" }); // Token is invalid
    }
    res.json(info); // Return user info if valid
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});
app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;

  // Ensure the uploaded file exists
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }

  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;

  // Rename the uploaded file to include its original extension
  fs.renameSync(path, newPath);

  // Verify the JWT token from cookies
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Destructure title, summary, and content from the request body
    const { title, summary, content } = req.body;

    try {
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath,
        author: info.id,
      });
      res.json(postDoc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create post" });
    }
  });
});

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    const newPath = path + "." + ext;
    fs.renameSync(path, newPath);

    const { token } = req.cookies;

    // Verify the token
    jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { title, summary, content } = req.body;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath,
        author: info.id,
      });

      // Set the token in a cookie after creating the post
      res.cookie("token", token, { httpOnly: true }); // Set cookie options as needed
      res.status(201).json(postDoc);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/post", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch posts" });
  }
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await Post.findById(id).populate("author", ["username"]);
    if (!postDoc) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(postDoc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch post" });
  }
});

// Start server
app.listen(PORT, () =>
  console.log(`Server running at http://${hostname}:${PORT}`)
);
