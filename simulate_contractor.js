const contractorPhone = "922222222222";
const baseUrl = "http://127.0.0.1:3000/webhook/684aaab460d1a5586491627c99da7ade";

async function simulate() {
    console.log("--- Sending TRIGGER (Hi) ---");
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: contractorPhone, user_message: "Hi" })
    });

    await new Promise(r => setTimeout(r, 1000));

    // This ID is actually MAPPED in botMappings.js as "Contractor"
    console.log("--- Sending WEBHOOK 1 (Contractor Click - STATIC MAPPED ID) ---");
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: contractorPhone,
            postbackid: "2OpVf9somX2g7sT"
        })
    });

    await new Promise(r => setTimeout(r, 1000));

    console.log("--- Sending WEBHOOK 2 (Labor Type Click - UNKNOWN ID) ---");
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: contractorPhone,
            postbackid: "RANDOM_LABOR_ID_222"
        })
    });
}
simulate();
