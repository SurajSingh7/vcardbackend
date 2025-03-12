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
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB Connected");

    // Schedule scheduleAllVcards() to run daily at 8:00 AM IST
    const rule = new schedule.RecurrenceRule();
    rule.hour = 8;
    rule.minute = 0;
    rule.tz = "Asia/Kolkata"; // Set timezone to Indian Standard Time

    schedule.scheduleJob(rule, () => {
      console.log("Running scheduleAllVcards job at 8:00 AM IST");
      scheduleAllVcards();
    });
   
  })
  .catch((err) => console.error("MongoDB Connection Error:", err));

/**
 * Schedule a job for a given vcard.
 * At the scheduled sedulertime, the job posts data to the WHATSAPP API
 * and then updates the vcard's whatsapp field to true.
 */
function scheduleVcard(vcard) {
  const scheduledDate = new Date(vcard.sedulertime);

  // If the scheduled date is in the past, skip scheduling
  if (scheduledDate <= new Date()) {
    console.log(`Skipping scheduling for vcard ${vcard._id} as sedulertime is in the past. 49`);
    return;
  }

  console.log(`Scheduling vcard ${vcard._id} for ${scheduledDate}`);
  // console.log(`Scheduling vcard ${vcard} for ${scheduledDate}`);

  schedule.scheduleJob(scheduledDate, async () => {
    try {
      // const scheduledDateFormatted = scheduledDate.toLocaleString('en-IN');
      const scheduledDateFormatted = scheduledDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' });
      
      const message = vcard.contactNumber
      ? `Dear *${vcard.name}*,\n\nthis is a reminder that your appointment is scheduled on *${scheduledDateFormatted}*.\n\n Customer contact number is ${vcard.contactNumber}.`
      : `Dear *${vcard.name}*,\n\nthis is a reminder that your appointment is scheduled on *${scheduledDateFormatted}*.`;
    
      const assignTo = vcard.assignTo;
      let phoneNumber = "919695215220"; // default number
      
      // If assignTo is provided, try fetching the user's mobile number from the users collection.
      if (assignTo) {
        const user = await User.findOne({ userName: assignTo });
        if (user && user.mobile) {
          phoneNumber = user.mobile;
        } else {
          console.log(`User not found or no mobile for assignTo ${assignTo}, using default number.`);
        }
      }

      // Prepare new payload for the WHATSAPP API using env variables for API token and URL
      const newPayload = {
        apiToken: process.env.WHATSAPP_API_TOKEN,
        message: message,
        phoneNumber: phoneNumber,
        source: "vcard"
      };

      
      // Make POST request to new WHATSAPP API
      const response = await axios.post(
        process.env.WHATSAPP_API_URL,
        newPayload
      );

  
      console.log(`WHATSAPP API response for vcard ......... ${vcard._id}:`, response.data);

      // Update the record in MongoDB (set whatsapp to true)
      await Vcard.findByIdAndUpdate(vcard._id, { whatsapp: true, updatedAt: new Date() });
      console.log(`Updated vcard ${vcard._id} to set whatsapp true.`);
    } catch (error) {
      console.error(`Error processing vcard ${vcard._id}:`, error.message);
    }
  });
}

/**
 * Fetch all vcards that haven't been processed (whatsapp is false)
 * and schedule a job for each.
 */
async function scheduleAllVcards() {
  try {
    const vcards = await Vcard.find({ whatsapp: false });
    vcards.forEach((vcard) => scheduleVcard(vcard));
  } catch (error) {
    console.error("Error fetching vcards for scheduling:", error.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
