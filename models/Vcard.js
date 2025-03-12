const mongoose = require("mongoose");

const VisitorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sedulertime: { type: Date, required: true },
    contactNumber: { type: String, default: "" },
    note: { type: String, default: "" },
    assignTo: { type: String, required: true },
    visitorCardFront: { type: String, default: "" },
    visitorCardBack: { type: String, default: "" },
    whatsapp: { type: Boolean, default: false },
    pin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Visitorcard", VisitorSchema);
