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
    origin: process.env.FRONTEND_URL, // Allow the frontend's origin
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
    // Generate JWT token
    jwt.sign({ username, id: userDoc._id }, JWT_SECRET, {}, (err, token) => {
      if (err) {
        console.error("JWT Sign Error:", err);
        return res.status(500).json({ message: "Token generation failed" });
      }

      // Send token to client
      return res.json({
        token, // Client will store this token in LocalStorage
        id: userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json("Wrong credentials");
  }
});

app.get("/profile", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1]; // Get token from Authorization header
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, {}, (err, info) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    res.json(info); // Return user info if valid
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});
//-----------------------------------------------------------------------------------------------------------------

// Create Post Route
app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    const { originalname, path: tempPath } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    const newPath = `${tempPath}.${ext}`;

    // Rename the temporary file to include its original extension
    fs.renameSync(tempPath, newPath);

    // Get the token from the Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    // Verify the token
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }

      const { title, summary, content } = req.body;

      try {
        const postDoc = await Post.create({
          title,
          summary,
          content,
          cover: newPath, // Use newPath here
          author: info.id,
        });
        res.status(201).json(postDoc);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create post" });
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get all Posts Route
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

// Get a Single Post Route
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

// Update Post Route
app.put("/post/:id", uploadMiddleware.single("file"), async (req, res) => {
  const { id } = req.params;

  // Check if the file is uploaded
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  // Get the token from the Authorization header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, {}, async (err, info) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { title, summary, content } = req.body;

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        id,
        {
          title,
          summary,
          content,
          ...(newPath && { cover: newPath }), // Update cover if a new file is uploaded
        },
        { new: true } // Return the updated document
      );

      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.json(updatedPost);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update post" });
    }
  });
});


// Start server
app.listen(PORT, () =>
  console.log(`Server running at http://${hostname}:${PORT}`)
);
