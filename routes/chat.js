import express from "express";
import getGeminiResponse from "../utils/gemini.js";
import Message from "../models/message.js";

const router = express.Router();

// Middleware to ensure authentication
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/auth/login");
    }
    next();
};

router.get("/chat", requireAuth, async (req, res) => {
    try {
        // Retrieve messages for the logged-in user, sorted by creation time
        const messages = await Message.find({ user: req.session.userId })
            .sort({ createdAt: 1 })
            .lean();

        res.render("chat", {
            messages,
            user: req.session.user, // Optional: if you want to display user info
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.render("chat", { messages: [] });
    }
});

router.post("/chat", requireAuth, async (req, res) => {
    const userInput = req.body.userInput?.trim();

    if (!userInput) {
        return res.status(400).json({
            error: "Please type a message before sending.",
            sender: "bot",
        });
    }

    try {
        // Save user message to DB
        const userMessage = await Message.create({
            content: userInput,
            sender: "user",
            user: req.session.userId,
        });

        // Get chat history and format for Gemini API
        const dbHistory = await Message.find({ user: req.session.userId })
            .sort({ createdAt: -1 })
            .limit(20);

        const geminiHistory = dbHistory
            .map((msg) => ({
                role: msg.sender === "user" ? "user" : "model",
                parts: [{ text: msg.content }],
            }))
            .reverse();

        // Get Gemini response
        const { responseText } = await getGeminiResponse(
            userInput,
            geminiHistory
        );

        // Save bot response to DB
        const botMessage = await Message.create({
            content: responseText,
            sender: "bot",
            user: req.session.userId,
        });

        // Return both messages as JSON
        res.json({
            success: true,
            messages: [
                {
                    content: userMessage.content,
                    sender: userMessage.sender,
                    createdAt: userMessage.createdAt,
                },
                {
                    content: botMessage.content,
                    sender: botMessage.sender,
                    createdAt: botMessage.createdAt,
                },
            ],
        });
    } catch (error) {
        console.error("Error processing chat:", error);
        res.status(500).json({
            error: "I apologize, but I'm currently experiencing technical difficulties. Please try again later.",
            sender: "bot",
        });
    }
});

// Add this to your chat.js controller
router.post("/clear-chat", requireAuth, async (req, res) => {
    try {
        // Delete all messages for the current user
        await Message.deleteMany({ user: req.session.userId });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error clearing chat:", error);
        res.status(500).json({ success: false, error: "Failed to clear chat" });
    }
});

export default router;
