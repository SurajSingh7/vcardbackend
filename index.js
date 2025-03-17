const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const axios = require("axios");
const schedule = require("node-schedule");
const Vcard = require("./models/Vcard");
const User = require("./models/User");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

//Fetch Vcards for Today
async function fetchVcardsForToday() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return await Vcard.find({ sedulertime: { $gte: today, $lt: endOfDay }, whatsapp: false });
  } catch (error) {
    console.error("❌ Error fetching vcards:", error.message);
    return [];
  }
}

// Process Vcards
async function processVcards() {
  try {
    const vcards = await fetchVcardsForToday();
    if (vcards.length === 0) {
      console.log("✅ No vcards found for today.");
      return;
    }

    for (const vcard of vcards) {
      const user = await User.findOne({ userName: vcard.assignTo });
      const phoneNumber = user?.mobile || null;
      if (!phoneNumber) {
        console.log(`⚠ No phone number found for ${vcard.assignTo}, skipping.`);
        continue;
      }

      await sendWhatsApp({
        id: vcard._id,
        name: vcard.name,
        userPhoneNumber: vcard.contactNumber,
        phoneNumber,
        sedulertime: vcard.sedulertime,
        note: vcard.note,
        assignedPerson: vcard.assignTo,
      });

      // ✅ Delay of 3 seconds between messages
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error("❌ Error processing vcards:", error.message);
  }
}

// Send WhatsApp Message
async function sendWhatsApp(vcard) {
  try {
    const parseTime = new Date(vcard.sedulertime).toISOString().split("T")[0];
    const message = `Dear *${vcard.assignedPerson}*,\n\nThis is a reminder that your appointment is scheduled on *${parseTime}*.\n\nCustomer contact number is ${vcard.userPhoneNumber}.`;

    const payload = {
      apiToken: process.env.WHATSAPP_API_TOKEN,
      message,
      phoneNumber: vcard.phoneNumber,
      source: "vcard",
    };

    console.log("📤 Sending WhatsApp message:", payload);
    const response = await axios.post(process.env.WHATSAPP_API_URL, payload);
    console.log(`📩 WhatsApp sent to ${vcard.phoneNumber}:`, response.data);

    if (response.data.success) {
      try {
        await Vcard.findByIdAndUpdate(vcard.id, { whatsapp: true, updatedAt: new Date() });
      } catch (updateError) {
        console.error(`❌ Error updating vcard ${vcard.id}:`, updateError.message);
      }
    } else {
      console.error("❌ WhatsApp API Error:", response.data.message);
    }
  } catch (error) {
    console.error("❌ Error sending WhatsApp:", error.message);
  }
}

// Track retry attempts
let retryCount = 0;
const MAX_RETRIES = 3;

// Cron Job at 8:30 AM
schedule.scheduleJob("30 8 * * *", async () => {
  console.log("⏳ Running WhatsApp notification job at 11:00 AM...");
  await processVcards();
  retryFailedMessages(); 
});

// Retry Failed Messages (with max 3 attempts)
async function retryFailedMessages() {
  if (retryCount >= MAX_RETRIES) {
    console.error("❌ Max retries reached. Some messages were not sent.");
    return;
  }

  const pendingMessages = await fetchVcardsForToday();

  if (pendingMessages.length > 0) {
    retryCount++;
    console.log(`⚠ Retrying failed messages in 1 hour... (Attempt ${retryCount}/${MAX_RETRIES})`);

    setTimeout(async () => {
      await processVcards();

      const remainingMessages = await fetchVcardsForToday();
      
      if (remainingMessages.length === 0) {
        console.log("✅ All WhatsApp messages sent successfully!");
      } else {
        retryFailedMessages();
      }
    }, 60 * 60 * 1000); // 1 hour delay
  } else {
    console.log("✅ No retries needed, all messages sent successfully!");
  }
}

// API Test Route
app.get("/", (req, res) => res.json({ success: true, message: "Server is running" }));

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
