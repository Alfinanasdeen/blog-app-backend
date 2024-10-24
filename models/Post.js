import mongoose from "mongoose";

const { Schema, model } = mongoose;

const PostSchema = new Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, required: true },
    content: { type: String, required: true },
    cover: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    likes: { type: Number, default: 0 }, // Number of likes
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }], // Users who liked the post
  },
  {
    timestamps: true,
  }
);

const PostModel = model("Post", PostSchema);

export default PostModel;
