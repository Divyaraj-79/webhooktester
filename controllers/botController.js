const Bot = require('../models/Bot');
const ChatData = require('../models/ChatData');
const GlobalPostback = require('../models/GlobalPostback');
const crypto = require('crypto');

// Upload chatbot JSON
exports.uploadBot = async (req, res) => {
    try {
        console.log("📥 [botController] New Bot Upload started");
        const botData = req.body;
        if (!botData || !botData.nodes) {
            return res.status(400).json({ error: "Invalid Chatbot JSON: 'nodes' object is missing" });
        }

        const nodeMap = botData.nodes;
        const fieldsMap = new Map(); // fieldId -> fieldName
        const postbacksMap = new Map(); // postbackId -> { postbackId, buttonText, sourceNodeName }

        // --- Optimized Tracing Logic ---
        const memoParents = new Map();
        function getParentMessage(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            if (memoParents.has(nodeId)) return memoParents.get(nodeId);
            
            visited.add(nodeId);
            const node = nodeMap[nodeId];
            if (!node) return null;

            // If this node has a message, return it
            if (node.data && (node.data.textMessage || node.data.headerText)) {
                const resText = node.data.textMessage || node.data.headerText;
                memoParents.set(nodeId, resText);
                return resText;
            }

            // Otherwise check inputs
            const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
            for (const conn of inputConnections) {
                const parentText = getParentMessage(conn.node, visited);
                if (parentText) {
                    memoParents.set(nodeId, parentText);
                    return parentText;
                }
            }
            memoParents.set(nodeId, null);
            return null;
        }
        
        // --- Added: Recursive Parent Field Name Fetcher ---
        const memoFieldNames = new Map();
        function getParentFieldName(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            if (memoFieldNames.has(nodeId)) return memoFieldNames.get(nodeId);
            visited.add(nodeId);
            const node = nodeMap[nodeId];
            if (!node) return null;

            // If this node has a fieldName, return it
            if (node.data && node.data.customFieldSelectedOptionText && node.data.customFieldSelectedOptionText !== 'Select') {
                const fName = node.data.customFieldSelectedOptionText;
                memoFieldNames.set(nodeId, fName);
                return fName;
            }

            // Otherwise check inputs
            const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
            for (const conn of inputConnections) {
                const parentField = getParentFieldName(conn.node, visited);
                if (parentField) {
                    memoFieldNames.set(nodeId, parentField);
                    return parentField;
                }
            }
            memoFieldNames.set(nodeId, null);
            return null;
        }

        // Trace FORWARD from a button output to find the NEXT question text
        const memoNextQ = new Map();
        function getNextQuestion(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            if (memoNextQ.has(nodeId)) return memoNextQ.get(nodeId);
            visited.add(nodeId);
            const node = nodeMap[nodeId];
            if (!node) return null;
            if (node.data && (node.data.textMessage || node.data.headerText)) {
                // Determine if this node waits for user input. If it doesn't, we skip it to find the REAL next question.
                const nodeName = (node.name || '').toLowerCase();
                const isInteractive = ['interactive', 'button', 'reply', 'row', 'list'].some(t => nodeName.includes(t));
                
                const outputConns = node.outputs ? Object.values(node.outputs).flatMap(o => o.connections || []) : [];

                // If it's NOT interactive, AND it has outputs, keep tracing forward!
                if (!(!isInteractive && outputConns.length > 0)) {
                    const raw = node.data.textMessage || node.data.headerText;
                    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                    const qLine = lines.find(l => l.includes('?')) || lines[lines.length - 1] || lines[0];
                    const result = qLine ? qLine.substring(0, 200).trim() : null;
                    memoNextQ.set(nodeId, result);
                    return result;
                }
            }
            const outputConns = node.outputs ? Object.values(node.outputs).flatMap(o => o.connections || []) : [];
            for (const conn of outputConns) {
                const found = getNextQuestion(conn.node, visited);
                if (found) { memoNextQ.set(nodeId, found); return found; }
            }
            memoNextQ.set(nodeId, null);
            return null;
        }

        // --- Extraction Pass ---
        console.log("🔍 [botController] Extracting fields and postbacks from nodes...");
        
        Object.values(nodeMap).forEach(node => {
            if (!node || !node.data) return;

            // 1. Extract Custom Fields
            if (node.data.customFieldId && node.data.customFieldSelectedOptionText && node.data.customFieldSelectedOptionText !== 'Select') {
                const fieldId = node.data.customFieldId;
                const fieldName = node.data.customFieldSelectedOptionText;
                // Get breadcrumb question for this field if possible
                let qText = fieldName;
                const inputConns = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
                if (inputConns.length > 0) {
                    const pText = getParentMessage(inputConns[0].node);
                    if (pText) qText = pText;
                }

                fieldsMap.set(fieldId, {
                    fieldId,
                    fieldName,
                    questionText: qText.substring(0, 200).trim()
                });
            }

            // 2. Extract Postbacks (Buttons/Rows)
            const postbackId = (node.data.postbackId || node.data.newPostbackId || node.data.xitFbpostbackId || '').toString().trim();
            const buttonText = (node.data.buttonText || node.data.title || node.data.text || '').toString().trim();

            // Only extract postbacks from interactive elements (not trigger nodes)
            const BUTTON_NODE_TYPES = ['Inline Button', 'Rows', 'Button', 'Quick Reply', 'Keyboard'];
            if (postbackId && buttonText && BUTTON_NODE_TYPES.includes(node.name)) {
                let sourceNodeName = node.name || 'Button';
                
                // Find the question this button answers by tracing back to parent
                const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
                if (inputConnections.length > 0) {
                    try {
                        const parentText = getParentMessage(inputConnections[0].node);
                        if (parentText) {
                            const lines = parentText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                            const qLine = lines.find(l => l.includes('?')) || lines[lines.length - 1] || lines[0];
                            sourceNodeName = qLine ? qLine.substring(0, 200).trim() : sourceNodeName;
                        }
                    } catch (e) {
                        // Avoid crashing on weird graphs
                    }
                }

                // Trace FORWARD to find which question comes AFTER clicking this button
                let nextQuestion = null;
                const outputConns = node.outputs
                    ? Object.values(node.outputs).flatMap(o => o.connections || [])
                    : [];
                if (outputConns.length > 0) {
                    nextQuestion = getNextQuestion(outputConns[0].node);
                }

                // Extract Custom Field Name if available
                let fieldName = node.data.customFieldSelectedOptionText;
                if (fieldName === 'Select' || !fieldName) {
                    // Search recursively up the chain for a field name (e.g. from parent question)
                    const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
                    if (inputConnections.length > 0) {
                        fieldName = getParentFieldName(inputConnections[0].node);
                    }
                }
                if (fieldName === 'Select' || !fieldName) fieldName = null;

                postbacksMap.set(postbackId, {
                    postbackId,
                    buttonText,
                    sourceNodeName,
                    fieldName,
                    nextQuestion: nextQuestion || null
                });
            }
        });

        const fields = Array.from(fieldsMap.values());
        const postbacks = Array.from(postbacksMap.values());
        console.log(`📊 [botController] Extracted ${fields.length} fields and ${postbacks.length} postbacks`);

        const apiKey = crypto.randomBytes(16).toString('hex');
        
        // Extract a human-readable bot name from the JSON
        const startNode = Object.values(botData.nodes || {}).find(n => n.name === 'Start Bot Flow');
        const botName = startNode?.data?.title || 'My Bot';
        
        // Pre-seed learnedPostbacks from Global memory if this bot name was used before
        const globalLearned = await GlobalPostback.find({ botName, owner: req.user.id });
        const learnedPostbacks = globalLearned.map(g => ({
            runtimePostbackId: g.runtimePostbackId,
            buttonText: g.buttonText,
            sourceNodeName: g.sourceNodeName
        }));

        const bot = await Bot.create({
            apiKey,
            name: botName,
            owner: req.user.id,
            fields,
            postbacks,
            learnedPostbacks
        });

        console.log(`✅ [botController] Bot "${botName}" created with ${postbacks.length} postbacks and ${learnedPostbacks.length} inherited learnings!`);
        res.json({
            message: "Bot uploaded successfully",
            apiKey: bot.apiKey,
            botName,
            fieldsCount: fields.length,
            postbacksCount: postbacks.length
        });

    } catch (err) {
        console.error("❌ [botController] Upload error:", err);
        res.status(500).json({ error: err.message || "Failed to process chatbot JSON" });
    }
};

// Fetch all bots for current user
exports.getMyBots = async (req, res) => {
    try {
        const userId = req.user.id;
        const bots = await Bot.find({ owner: userId }).sort({ createdAt: -1 });
        res.json(bots);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch bots" });
    }
};

// Delete bot and its data
exports.deleteBot = async (req, res) => {
    try {
        const { apiKey } = req.params;
        const userId = req.user.id;

        const bot = await Bot.findOne({ apiKey, owner: userId });
        if (!bot) return res.status(404).json({ error: "Bot not found" });

        // Delete all chat data
        const deleteData = await ChatData.deleteMany({ apiKey, owner: userId });
        console.log(`🗑️ Deleted ${deleteData.deletedCount} chat entries for bot: ${apiKey}`);

        // Delete bot entry
        await Bot.findByIdAndDelete(bot._id);
        
        res.json({ message: "Bot and associated data deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete bot" });
    }
};

// Get or Create a Universal Bot for the user
exports.getUniversalBot = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Find existing bot or create a new one
        let bot = await Bot.findOne({ owner: userId });
        
        if (!bot) {
            console.log(`🆕 Creating first Universal Bot for user: ${userId}`);
            const apiKey = crypto.randomBytes(16).toString('hex');
            bot = await Bot.create({
                apiKey,
                name: "Universal Bot",
                owner: userId,
                fields: [],
                postbacks: []
            });
        }
        
        res.json(bot);
    } catch (err) {
        console.error("❌ [getUniversalBot] Error:", err);
        res.status(500).json({ error: "Failed to initialize Universal Bot" });
    }
};