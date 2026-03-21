require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const bot = await Bot.findOne().sort({ _id: -1 });
    
    // Remove placeholders from learnedPostbacks
    const originalCount = bot.learnedPostbacks.length;
    bot.learnedPostbacks = bot.learnedPostbacks.filter(lp => !lp.buttonText.includes('[Postback:'));
    await bot.save();
    
    console.log(`Cleaned up learnedPostbacks from ${originalCount} to ${bot.learnedPostbacks.length}`);

    // Retroactively fix Dipti's session (or any session!)
    const sessions = await ChatData.find({ apiKey: bot.apiKey });
    let fixedSessions = 0;
    for (const session of sessions) {
        let changed = false;
        // Re-simulate learning: if any answer has [Postback:], see if we NOW know the text
        if (session.answers) {
            for (const [qKey, currentVal] of Object.entries(session.answers)) {
                if (currentVal && typeof currentVal === 'string' && currentVal.startsWith('[Postback:')) {
                    const rawPostbackId = currentVal.replace('[Postback: ', '').replace(']', '').trim();
                    const known = bot.learnedPostbacks.find(lp => lp.runtimePostbackId === rawPostbackId);
                    if (known) {
                        session.answers[qKey] = known.buttonText;
                        changed = true;
                    }
                }
            }
        }
        if (changed) {
            session.markModified('answers');
            await session.save();
            fixedSessions++;
        }
    }
    console.log(`Retroactively applied learning to ${fixedSessions} sessions.`);

    await mongoose.disconnect();
}
main();
