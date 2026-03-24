const mongoose = require('mongoose');
const fs = require('fs');
const dotenv = require('dotenv');
const Bot = require('./models/Bot');
const User = require('./models/User');
const crypto = require('crypto');

dotenv.config();

async function sync() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const data = JSON.parse(fs.readFileSync('tmp_bot.json', 'utf8'));
        const nodes = data.nodes;
        
        const fields = [];
        const postbacks = [];
        const nodeMap = nodes;

        // Tracing logic from botController
        const memoParents = new Map();
        function getParentMessage(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            if (memoParents.has(nodeId)) return memoParents.get(nodeId);
            visited.add(nodeId);
            const node = nodeMap[nodeId];
            if (!node) return null;
            if (node.data && (node.data.textMessage || node.data.headerText)) {
                const resText = node.data.textMessage || node.data.headerText;
                memoParents.set(nodeId, resText);
                return resText;
            }
            const inputConnections = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
            for (const conn of inputConnections) {
                const parentText = getParentMessage(conn.node, visited);
                if (parentText) {
                    memoParents.set(nodeId, parentText);
                    return parentText;
                }
            }
            return null;
        }

        const memoNextQ = new Map();
        function getNextQuestion(nodeId, visited = new Set()) {
            if (!nodeId || visited.has(nodeId)) return null;
            if (memoNextQ.has(nodeId)) return memoNextQ.get(nodeId);
            visited.add(nodeId);
            const node = nodeMap[nodeId];
            if (!node) return null;
            if (node.data && (node.data.textMessage || node.data.headerText)) {
                const nodeName = (node.name || '').toLowerCase();
                const isInteractive = ['interactive', 'button', 'reply', 'row', 'list'].some(t => nodeName.includes(t));
                const outputConns = node.outputs ? Object.values(node.outputs).flatMap(o => o.connections || []) : [];
                if (!(!isInteractive && outputConns.length > 0)) {
                    const raw = node.data.textMessage || node.data.headerText;
                    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                    const qLine = lines.find(l => l.includes('?')) || lines[lines.length - 1] || lines[0];
                    const result = qLine ? qLine.substring(0, 100).trim() : null;
                    memoNextQ.set(nodeId, result);
                    return result;
                }
            }
            const outputConns = node.outputs ? Object.values(node.outputs).flatMap(o => o.connections || []) : [];
            for (const conn of outputConns) {
                const found = getNextQuestion(conn.node, visited);
                if (found) return found;
            }
            return null;
        }

        Object.values(nodes).forEach(node => {
            if (!node.data) return;
            const postbackId = (node.data.postbackId || node.data.newPostbackId || node.data.xitFbpostbackId || '').toString().trim();
            const buttonText = (node.data.buttonText || node.data.title || node.data.text || '').toString().trim();
            const BUTTON_NODE_TYPES = ['Inline Button', 'Rows', 'Button', 'Quick Reply'];

            if (postbackId && buttonText && BUTTON_NODE_TYPES.includes(node.name)) {
                let sourceQuestion = node.name || 'Question';
                const inputConns = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
                if (inputConns.length > 0) {
                    const pText = getParentMessage(inputConns[0].node);
                    if (pText) {
                        const lines = pText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                        const qLine = lines.find(l => l.includes('?')) || lines[lines.length - 1] || lines[0];
                        sourceQuestion = qLine ? qLine.substring(0, 100).trim() : sourceQuestion;
                    }
                }
                
                let nextQuestion = null;
                const outputConns = node.outputs ? Object.values(node.outputs).flatMap(o => o.connections || []) : [];
                if (outputConns.length > 0) {
                    nextQuestion = getNextQuestion(outputConns[0].node);
                }

                postbacks.push({
                    postbackId,
                    buttonText,
                    sourceNodeName: sourceQuestion,
                    nextQuestion
                });
            }
        });

        console.log(`Extracted ${postbacks.length} postbacks`);

        const user = await mongoose.model('User').findOne({ email: 'radadiajainish@gmail.com' });
        if (!user) {
            console.error("User not found");
            process.exit(1);
        }

        // Update all bots for this specific user to be sure
        const result = await Bot.updateMany(
            { owner: user._id },
            { $set: { postbacks, fields } }
        );

        console.log(`Updated ${result.modifiedCount} bots for user ${user.email}`);
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

sync();
