import express from "express";
import Post from "../models/community/post.js";
import Answer from "../models/community/answer.js";

const router = express.Router();

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        req.user = req.session.user; // Make user available as req.user
        next();
    } else {
        res.redirect("/auth/login");
    }
};

// Get all community questions
router.get("/", isAuthenticated, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("author", "name avatar")
            .sort("-createdAt")
            .limit(10)
            .exec();

        res.render("community", {
            user: req.session.user,
            posts,
        });
    } catch (err) {
        console.error("Error fetching community posts:", err);
        res.render("community", {
            user: req.session.user,
            error: "Failed to load community posts",
        });
    }
});

// Get single question with answers
router.get("/:id", async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate("author", "name")
            .populate({
                path: "answers",
                populate: {
                    path: "author",
                    select: "name",
                },
            });

        res.render("question-detail", {
            post,
            currentUser: req.session.user,
            answerCount: post.answers ? post.answers.length : 0,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
});

// Create new question
router.post("/", isAuthenticated, async (req, res) => {
    try {
        const { title, content, tags } = req.body;

        const post = new Post({
            title,
            content,
            tags: tags || [],
            author: req.session.user._id,
        });

        await post.save();
        res.redirect(`/community/${post._id}`);
    } catch (err) {
        console.error("Error creating question:", err);
        res.render("community", {
            user: req.session.user,
            error: "Failed to create question",
        });
    }
});

// Add answer to question
router.post("/:id/answers", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        // Check if user is the question author
        if (post.author.toString() === req.session.user._id) {
            return res.redirect(`/community/${req.params.id}`);
        }

        const answer = new Answer({
            content: req.body.content,
            author: req.session.user._id,
            post: req.params.id,
        });

        await answer.save();

        // Add answer reference to the post
        post.answers.push(answer._id);
        await post.save();

        res.redirect(`/community/${req.params.id}`);
    } catch (err) {
        console.error("Error adding answer:", err);
        res.redirect(`/community/${req.params.id}`);
    }
});

// Mark answer as solution
router.post("/answers/:id/solution", isAuthenticated, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.id).populate("post");

        if (!answer) {
            return res.status(404).render("error", {
                user: req.session.user,
                error: "Answer not found",
            });
        }

        // Verify question ownership
        if (answer.post.author.toString() !== req.session.user._id) {
            return res.status(403).render("error", {
                user: req.session.user,
                error: "Only the question author can mark a solution",
            });
        }

        // Unmark any previous solutions
        await Answer.updateMany(
            { post: answer.post._id, isSolution: true },
            { $set: { isSolution: false } }
        );

        // Mark current answer as solution
        answer.isSolution = true;
        await answer.save();

        res.redirect(`/community/${answer.post._id}`);
    } catch (err) {
        console.error("Error marking solution:", err);
        res.redirect(`/community/${answer.post._id}`);
    }
});

export default router;
