const adminFirebase = require("firebase-admin");
require('dotenv').config();
const privateKey  = JSON.parse(process.env.NEXT_FIREBASE_PRIVATE_KEY);
const admin =
  adminFirebase.apps?.length === 0
    ? adminFirebase.initializeApp({
        credential: adminFirebase.credential.cert({
          projectId: "terramida",
          privateKey: privateKey.private_key,
          clientEmail: process.env.NEXT_FIREBASE_CLIENT_EMAIL,
        }),
        databaseURL: "https://terramida.firebaseio.com/",
      })
    : adminFirebase.app();

const db = adminFirebase.firestore();

exports.db = db;
exports.admin = admin;
