require("dotenv").config();
const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");

// CONFIGURATION
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_TOPIC = process.env.MQTT_TOPIC;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;

// === CONVERT TIMESTAMP TO WIB (UTC+7) ===
function toWIBDate(ms) {
  const offsetMs = 7 * 60 * 60 * 1000; // +7 hours
  return new Date(ms + offsetMs);
}

// === UNPACK THE SENSOR PAYLOAD ===
function unpackSensorData(payload) {
  const rawEntry = payload?.data?.[0];
  if (!rawEntry || !rawEntry.tp || !rawEntry.point) {
    throw new Error("Invalid payload format");
  }

  const timestamp = toWIBDate(rawEntry.tp); // Adjust to WIB (UTC+7)
  const points = rawEntry.point;

  const device_id = points.find(p => p.id === 0)?.val || "unknown_device";
  const mac = points.find(p => p.id === 33)?.val || "unknown_mac";

  const values = {};
  points.forEach(p => {
    if (p.id !== 0 && p.id !== 33) {
      values[`id_${p.id}`] = p.val;
    }
  });

  return {
    timestamp,
    device_id,
    mac,
    values
  };
}

// === MAIN LOGGER FUNCTION ===
async function startLogger() {
  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);
  console.log("🗄️ Connected to MongoDB");

  const mqttClient = mqtt.connect(MQTT_BROKER);

  mqttClient.on("connect", () => {
    console.log("📡 Connected to MQTT broker");
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
      if (err) {
        console.error("❌ MQTT subscription error:", err);
      } else {
        console.log(`✅ Subscribed to topic "${MQTT_TOPIC}"`);
      }
    });
  });

  mqttClient.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      const doc = unpackSensorData(payload);
      await collection.insertOne(doc);
      console.log(`📥 Logged from ${doc.device_id} @ ${doc.timestamp}`);
    } catch (err) {
      console.error("❌ Message processing error:", err.message);
    }
  });
}

// === START THE PROGRAM ===
startLogger().catch(err => {
  console.error("❌ Fatal error:", err);
});
