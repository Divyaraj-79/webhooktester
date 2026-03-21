// test_extract.js - test postback extraction locally with the provided JSON
const botJSON = {"id":"xitFB@0.0.1","nodes":{"1":{"id":1,"data":{"title":"Chatbot For filter data","postbackId":"69be43fa012c5","xitFbpostbackId":"69be43fa012ca","buttonWebhookUrl":"","labelIds":["273167"],"labelIdTextsArray":["Contractor Karigar Helper"],"labelIdsRemove":[],"labelIdTextsArrayRemove":[],"googleSheets":[],"googleSheetsArray":[],"sequenceIdValue":"","sequenceIdText":"Select a Sequence","sequenceIdValueRemove":"","sequenceIdTextRemove":"Select a Sequence","conversationGroupId":"","conversationGroupText":"Select Team Role","conversationUserId":"","conversationUserText":"Select Team Member","triggerKeyword":"Hi","triggerMatchingType":"exact","customFieldId":"","customFieldSelectedOptionText":"Select"},"inputs":{"referenceInputActionButton":{"connections":[]}},"outputs":{"referenceOutput":{"connections":[{"node":25,"input":"interactiveInput","data":[]}]},"referenceOutputSequence":{"connections":[]}},"position":[-449,-52],"name":"Start Bot Flow"},"25":{"id":25,"data":{"uniqueId":"69be43fa012e3","headerType":"text","headerText":"","mediaType":"","headerMediaUrl":"","headerMediaID":"","textMessage":"नमस्ते 🙏\nSWAGAAR में आपका स्वागत है।\n\nआप नीचे दिए गए विकल्पों में से किस प्रकार का काम करते हैं ?","footerText":"","original_file_name":"","delayReplyFor":0,"delaySec":0,"delayMin":0,"delayHour":0,"IsTypingOnDisplayChecked":false},"inputs":{"interactiveInput":{"connections":[{"node":1,"output":"referenceOutput","data":[]}]}},"outputs":{"interactiveOutput":{"connections":[]},"interactiveOutputButton":{"connections":[{"node":28,"input":"buttonInput","data":[]},{"node":26,"input":"buttonInput","data":[]},{"node":27,"input":"buttonInput","data":[]}]},"interactiveOutputListMessage":{"connections":[]},"interactiveOutputEcommerce":{"connections":[]}},"position":[-147,81],"name":"Interactive"},"26":{"id":26,"data":{"postbackId":"69be43fa012f4","buttonText":"कारीगर / ऑपरेटर","buttonWebhookUrl":"","buttonType":"new_post_back","text":"Send Message","rowType":"static","customFieldIndex":"","customFieldIndexTitle":"","labelIds":[],"labelIdTextsArray":[],"labelIdsRemove":[],"labelIdTextsArrayRemove":[],"googleSheets":[],"googleSheetsArray":[],"sequenceIdValue":"","sequenceIdText":"Select a Sequence","sequenceIdValueRemove":"","sequenceIdTextRemove":"Select a Sequence","conversationGroupId":"","conversationGroupText":"Select Team Role","conversationUserId":"","conversationUserText":"Select Team Member","customFieldId":"","customFieldSelectedOptionText":"Select","appointment_id":"","appointment_text":"Select","googleCalendar":"","saveGoogleMeetToCustomField":false,"googleMeetCustomField":"","googleMeetCustomFieldSelectedOptionText":"Select","newPostbackId":"69be43fa012fa"},"inputs":{"buttonInput":{"connections":[{"node":25,"output":"interactiveOutputButton","data":[]}]}},"outputs":{"buttonOutput":{"connections":[{"node":328,"input":"interactiveInput","data":[]}]},"buttonOutputSequence":{"connections":[]}},"position":[100,100],"name":"Inline Button"},"27":{"id":27,"data":{"postbackId":"69be43fa0130b","buttonText":"हेल्पर / मजदूर","buttonWebhookUrl":"","buttonType":"new_post_back","text":"Send Message","rowType":"static","customFieldIndex":"","customFieldIndexTitle":"","labelIds":[],"labelIdTextsArray":[],"labelIdsRemove":[],"labelIdTextsArrayRemove":[],"googleSheets":[],"googleSheetsArray":[],"sequenceIdValue":"","sequenceIdText":"Select a Sequence","sequenceIdValueRemove":"","sequenceIdTextRemove":"Select a Sequence","conversationGroupId":"","conversationGroupText":"Select Team Role","conversationUserId":"","conversationUserText":"Select Team Member","customFieldId":"","customFieldSelectedOptionText":"Select","appointment_id":"","appointment_text":"Select","googleCalendar":"","saveGoogleMeetToCustomField":false,"googleMeetCustomField":"","googleMeetCustomFieldSelectedOptionText":"Select","newPostbackId":"69be43fa01313"},"inputs":{"buttonInput":{"connections":[{"node":25,"output":"interactiveOutputButton","data":[]}]}},"outputs":{"buttonOutput":{"connections":[{"node":106,"input":"interactiveInput","data":[]}]},"buttonOutputSequence":{"connections":[]}},"position":[100,200],"name":"Inline Button"},"28":{"id":28,"data":{"postbackId":"69be43fa0131d","buttonText":"कांट्रेक्टर/ ठेकेदार","buttonWebhookUrl":"","buttonType":"new_post_back","text":"Send Message","rowType":"static","customFieldIndex":"","customFieldIndexTitle":"","labelIds":[],"labelIdTextsArray":[],"labelIdsRemove":[],"labelIdTextsArrayRemove":[],"googleSheets":[],"googleSheetsArray":[],"sequenceIdValue":"","sequenceIdText":"Select a Sequence","sequenceIdValueRemove":"","sequenceIdTextRemove":"Select a Sequence","conversationGroupId":"","conversationGroupText":"Select Team Role","conversationUserId":"","conversationUserText":"Select Team Member","customFieldId":"","customFieldSelectedOptionText":"Select","appointment_id":"","appointment_text":"Select","googleCalendar":"","saveGoogleMeetToCustomField":false,"googleMeetCustomField":"","googleMeetCustomFieldSelectedOptionText":"Select","newPostbackId":"69be43fa01322"},"inputs":{"buttonInput":{"connections":[{"node":25,"output":"interactiveOutputButton","data":[]}]}},"outputs":{"buttonOutput":{"connections":[{"node":30,"input":"interactiveInput","data":[]}]},"buttonOutputSequence":{"connections":[]}},"position":[100,300],"name":"Inline Button"}}};

const nodeMap = botJSON.nodes;
const postbacksMap = new Map();
const memoParents = new Map();

function getParentMessage(nodeId, visited = new Set()) {
    if (!nodeId || visited.has(nodeId)) return null;
    if (memoParents.has(nodeId)) return memoParents.get(nodeId);
    visited.add(nodeId);
    const node = nodeMap[nodeId];
    if (!node) return null;
    if (node.data && (node.data.textMessage || node.data.headerText)) {
        const res = node.data.textMessage || node.data.headerText;
        memoParents.set(nodeId, res);
        return res;
    }
    const inputConns = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
    for (const conn of inputConns) {
        const pt = getParentMessage(conn.node, visited);
        if (pt) { memoParents.set(nodeId, pt); return pt; }
    }
    memoParents.set(nodeId, null);
    return null;
}

Object.values(nodeMap).forEach(node => {
    if (!node || !node.data) return;
    const postbackId = (node.data.postbackId || node.data.newPostbackId || '').toString().trim();
    const buttonText = (node.data.buttonText || node.data.title || '').toString().trim();
    if (postbackId && buttonText) {
        let sourceNodeName = node.name || 'Button';
        if (['Inline Button', 'Rows', 'Button'].includes(sourceNodeName)) {
            const inputConns = node.inputs ? Object.values(node.inputs).flatMap(i => i.connections || []) : [];
            if (inputConns.length > 0) {
                const parentText = getParentMessage(inputConns[0].node);
                if (parentText) {
                    const lines = parentText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                    const qLine = lines.find(l => l.includes('?')) || lines[lines.length-1] || lines[0];
                    sourceNodeName = qLine ? qLine.substring(0, 35).trim() : sourceNodeName;
                }
            }
        }
        postbacksMap.set(postbackId, { postbackId, buttonText, sourceNodeName });
    }
});

const postbacks = Array.from(postbacksMap.values());
console.log(`✅ Extracted ${postbacks.length} postbacks:`);
postbacks.forEach(p => console.log(`  [${p.sourceNodeName}] "${p.buttonText}"`));
