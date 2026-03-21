const Bot = require('../models/Bot');
const ChatData = require('../models/ChatData');
const crypto = require('crypto');

// Upload chatbot JSON
exports.uploadBot = async (req, res) => {
    try {
        console.log("📥 [botController] New Bot Upload started");
        const botData = req.body;
        
        const fieldsMap = new Map();
        const postbacksMap = new Map();

        // extract postbacks
        function searchForPostbacks(obj, nodeName) {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
                if (Array.isArray(obj)) {
                    obj.forEach(item => searchForPostbacks(item, nodeName));
                }
                return;
            }
            if (obj.postbackId && typeof obj.postbackId === 'string') {
                postbacksMap.set(obj.postbackId, {
                    postbackId: obj.postbackId,
                    buttonText: obj.buttonText || obj.title || obj.text || 'Button Clicked',
                    sourceNodeName: nodeName || 'Button'
                });
            }
            if (obj.xitFbpostbackId && typeof obj.xitFbpostbackId === 'string') {
                postbacksMap.set(obj.xitFbpostbackId, {
                    postbackId: obj.xitFbpostbackId,
                    buttonText: obj.buttonText || obj.title || obj.text || 'Button Clicked',
                    sourceNodeName: nodeName || 'Button'
                });
            }
            if (obj.name && obj.data) {
                // Top level node object
                searchForPostbacks(obj.data, obj.name);
            } else {
                Object.values(obj).forEach(val => searchForPostbacks(val, nodeName));
            }
        }


        // Universal heuristic recursive search
        function searchForFields(obj, depth = 0) {
            if (!obj || typeof obj !== 'object' || depth > 20) return;

            if (Array.isArray(obj)) {
                obj.forEach(item => searchForFields(item, depth + 1));
                return;
            }

            const varKeys = ['customField', 'customFieldId', 'variable', 'variableId', 'key', 'fieldName', 'name', 'id'];
            const labelKeys = ['customFieldSelectedOptionText', 'question', 'text', 'label', 'prompt', 'title', 'placeholder'];

            let foundVar = null;
            if (!obj || depth > 20) return;
            if (obj.customFieldId && obj.customFieldSelectedOptionText && obj.customFieldSelectedOptionText !== 'Select') {
                fieldsMap.set(obj.customFieldId, obj.customFieldSelectedOptionText);
            }
            if (typeof obj === 'object') {
                Object.values(obj).forEach(val => searchForFields(val, depth + 1));
            }
        }

        // Parent Message Finder
        function getParentMessage(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            visited.add(nodeId);

            const node = nodeMap[nodeId];
            if (!node) return null;

            // If this node has a message, return it
            if (node.data && (node.data.textMessage || node.data.headerText)) {
                return node.data.textMessage || node.data.headerText;
            }

            // Otherwise check inputs
            const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
            for (const conn of inputConnections) {
                const parentText = getParentMessage(conn.node, visited);
                if (parentText) return parentText;
            }
            return null;
        }

        function searchForPostbacks(node) {
            if (!node || !node.data) return;

            const postbackId = node.data.postbackId || node.data.newPostbackId;
            const buttonText = node.data.buttonText || node.data.title;

            if (postbackId && buttonText) {
                // Try to find the question this button belongs to
                let sourceNodeName = node.name || 'Button';
                
                // If it's a generic button/row name, look for parent message
                if (['Inline Button', 'Rows', 'Button'].includes(sourceNodeName)) {
                    const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
                    if (inputConnections.length > 0) {
                        const parentText = getParentMessage(inputConnections[0].node);
                        if (parentText) {
                            // Try to find a meaningful line (like a question)
                            const lines = parentText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
                            const qLine = lines.find(l => l.includes('?')) || lines[lines.length - 1] || lines[0];
                            sourceNodeName = qLine ? qLine.substring(0, 35).trim() : sourceNodeName;
                        }
                    }
                }

                postbacksMap.set(postbackId, {
                    postbackId,
                    buttonText,
                    sourceNodeName
                });
            }
        }

        console.log("🔍 [botController] Starting field search...");
        searchForFields(botData);
        console.log("🔍 [botController] Parsing nodes for postbacks...");
        
        Object.values(nodeMap).forEach(node => searchForPostbacks(node));
        
        console.log("🔍 [botController] Postback search complete.");

        const fields = Array.from(fieldsMap.values());
        const postbacks = Array.from(postbacksMap.values());
        console.log("🔍 [botController] Extracted fields count:", fields.length);
        console.log("🔍 [botController] Extracted postbacks count:", postbacks.length);

        const apiKey = crypto.randomBytes(16).toString('hex');
        console.log("🔍 [botController] Creating bot with apiKey:", apiKey);

        const bot = await Bot.create({
            apiKey,
            owner: req.user.id, // Linked to user
            fields,
            postbacks
        });
        console.log("✅ [botController] Bot created successfully!");

        res.json({
            message: "Bot uploaded successfully",
            apiKey,
            fields: [...new Set(fields.map(f => f.fieldName))]
        });

    } catch (err) {
        console.error("❌ [botController] Upload error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
};

exports.getMyBots = async (req, res) => {
    try {
        const bots = await Bot.find({ owner: req.user.id });
        res.json(bots);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch bots" });
    }
};

exports.deleteBot = async (req, res) => {
    try {
        const { apiKey } = req.params;
        const userId = req.user.id;

        // Ensure the bot exists and belongs to the user
        const bot = await Bot.findOne({ apiKey, owner: userId });
        if (!bot) {
            return res.status(404).json({ error: "Bot not found or unauthorized" });
        }

        // 1. Delete associated ChatData
        await ChatData.deleteMany({ apiKey, owner: userId });

        // 2. Delete the Bot
        await Bot.findByIdAndDelete(bot._id);

        console.log(`🗑️ [botController] Bot deleted: ${apiKey} (and associated chat data)`);
        
        res.json({ message: "Bot and all associated data deleted successfully" });

    } catch (err) {
        console.error("❌ [botController] Delete error:", err);
        res.status(500).json({ error: "Failed to delete bot" });
    }
};