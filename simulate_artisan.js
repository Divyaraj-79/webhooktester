const artisanPhone = "911111111111";
const baseUrl = "http://127.0.0.1:3000/webhook/684aaab460d1a5586491627c99da7ade";

async function simulate() {
    console.log("--- Sending TRIGGER (Hi) ---");
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: artisanPhone, user_message: "Hi" })
    });

    await new Promise(r => setTimeout(r, 1000));

    console.log("--- Sending WEBHOOK 1 (Artisan Click - UNKNOWN ID) ---");
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: artisanPhone,
            postbackid: "RANDOM_ARTISAN_ID_111"
        })
    });

    await new Promise(r => setTimeout(r, 1000));

    console.log("--- Sending WEBHOOK 2 (Machine Type Click - STATIC MAPPED) ---");
    // This ID is in botMappings.js for '1 - 20', but let's assume we map 'Casting' instead for this test
    await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: artisanPhone,
            postbackid: "MACHINE_TYPE_ID_777" 
        })
    });
}
simulate();
