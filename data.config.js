import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which environment file to load
const envPath =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

// Load the environment variables from the correct file
dotenv.config({ path: path.resolve(__dirname, envPath) });

console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("FRONTEND_URL:", process.env.FRONTEND_URL);

function connectToMongoDB() {
  const DATABASE_URI =
    process.env.NODE_ENV === "development"
      ? process.env.MONGODB_URI
      : `mongodb+srv://${process.env.MONGODB_NAME}:${process.env.MONGODB_PASSWORD}@cluster0.3kvjo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

  mongoose
    .connect(DATABASE_URI)
    .then((response) => {
      console.log("Database connection successful");
    })
    .catch((error) => console.log("Database connection error:", error));
}

export default connectToMongoDB;
