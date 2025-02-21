const express = require("express");
require("dotenv").config();
const firebase = require("./firebase.js");
const utilities = require("./utilities.js");
const zod = require("zod");
const cors = require("cors");
const divercron = require("./divercron.js");

const app = express();
const port = process.env.PORT ?? 8080;

const allowedOrigins = [
  "https://www.terramida.vercel.app",
  "https://terramida.vercel.app",
  "http://localhost:3000",
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      //   if (!allowedOrigins.includes(origin)) {
      //     const msg =
      //       "The CORS policy for this site does not allow access from the specified Origin.";
      //     return callback(new Error(msg), false);
      //   }
      return callback(null, true);
    },
  })
);

app.use(express.static("public"));
app.use(express.json());

app.get("/", (req, res) => {
  res.redirect("/");
});

app.post("/thermalAnomalies", async (req, res) => {
  const reqSquema = zod.object({
    latitude: zod.number().min(-90).max(90),
    longitude: zod.number().min(-180).max(180),
    radius: zod.number().positive(),
  });
  const result = reqSquema.safeParse(req.body);

  if (!result.success) {
    return res.json({ error: result.error.message }).status(400);
  }

  const lat = req.body.latitude;
  const long = req.body.longitude;
  const radius = req.body.radius;
  const box = utilities.areaCoordinates(lat, long, radius);
  const apiUrl = utilities.buildApiUrl(box, new Date());
  let thermalAnomalies = await utilities.retrieveThermalAnomalies(apiUrl);

  if (thermalAnomalies.length === 0) {
    let yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayApiUrl = utilities.buildApiUrl(box, yesterday);
    thermalAnomalies = await utilities.retrieveThermalAnomalies(
      yesterdayApiUrl
    );
  }

  thermalAnomalies = thermalAnomalies.filter(function (point) {
    return utilities.pointInCircle(
      lat,
      long,
      point.latitude,
      point.longitude,
      radius
    );
  });

  return res.json(thermalAnomalies).status(200);
});

app.get("/ping", async (req, res) => {
  const usersRef = await firebase.db.collection("users").get();
  const users = usersRef.docs.map((doc) => doc.data());
  res.status(201).json(users);
});

app.post("/createEventDTO", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unathorized" });
  }

  const reqSquema = zod.object({
    latitude: zod.number().min(-90).max(90),
    longitude: zod.number().min(-180).max(180),
  });
  const result = reqSquema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: JSON.parse(result.error.message) });
  }

  const lat = req.body.latitude;
  const long = req.body.longitude;

  //Validar token
  let auth = null;
  let user = null;
  let userInDB = null;
  try {
    auth = firebase.admin.auth();
    const decodedToken = await auth.verifyIdToken(token);
    user = await auth.getUser(decodedToken.uid);
    userInDB = await firebase.db
      .collection("users")
      .where("uid", "==", decodedToken.uid)
      .get();
  } catch (error) {
    res.status(401).json({
      error: "Invalid user token.",
    });
    return;
  }

  //Chequeo de AT
  const box = utilities.areaCoordinates(lat, long, 2);
  const apiUrl = utilities.buildApiUrl(box, new Date());
  let thermalAnomalies = await utilities.retrieveThermalAnomalies(apiUrl);
  if (thermalAnomalies.length === 0) {
    let yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayApiUrl = utilities.buildApiUrl(box, yesterday);
    thermalAnomalies = await utilities.retrieveThermalAnomalies(
      yesterdayApiUrl
    );
  }
  if (!thermalAnomalies.length) {
    res.status(422).json({
      error: "No thermal anomalies detected in the zone.",
    });
    return;
  }

  //Crear evento
  const newEvent = {
    initialLatitude: lat,
    initialLongitude: long,
    thermalAnomalies: thermalAnomalies,
    comments: [],
  };
  const newEventAdd = await firebase.db.collection("events").add(newEvent);

  //Avisar a organizaciones
  const organizationsRef = await firebase.db.collection("organizations").get();
  let organizations = [];
  organizationsRef.docs.map((doc) => {
    organizations.push(doc.data());
  });
  organizations.forEach(function (organization) {
    utilities.sendNotification(organization, newEvent);
  });

  //Devolver evento
  res.status(201).json({ newEvent, id: newEventAdd.id });
});

app.post("/eventsInArea", async (req, res) => {
  const reqSquema = zod.object({
    latitude: zod.number().min(-90).max(90),
    longitude: zod.number().min(-180).max(180),
  });
  const result = reqSquema.safeParse(req.body);

  if (!result.success) {
    return res.json({ error: result.error.message }).status(400);
  }

  const lat = req.body.latitude;
  const long = req.body.longitude;
  const eventsRef = await firebase.db.collection("events").get();
  let events = [];
  eventsRef.docs.map((doc) => {
    events.push({ ...doc.data(), id: doc.id });
  });
  events = events.filter(function (event) {
    return utilities.pointInCircle(
      lat,
      long,
      event.initialLatitude,
      event.initialLongitude,
      2
    );
  });

  return res.json(events).status(200);
});

app.post("/createOrganizationInterestArea", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unathorized" });
  }

  const reqSquema = zod.object({
    latitude: zod.number().min(-90).max(90),
    longitude: zod.number().min(-180).max(180),
    radius: zod.number().positive(),
  });
  const result = reqSquema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: JSON.parse(result.error.message) });
  }

  const lat = req.body.latitude;
  const long = req.body.longitude;
  const radius = req.body.radius;

  //Validar token
  let auth = null;
  let user = null;
  let decodedToken = null;
  try {
    auth = firebase.admin.auth();
    decodedToken = await auth.verifyIdToken(token);
    user = await auth.getUser(decodedToken.uid);
  } catch (error) {
    res.status(401).json({
      error: "Invalid user token.",
    });
    return;
  }

  try {
    const organizationUID = user.organizationUID;
    if (!organizationUID) {
      res.status(404).json({ message: "Organization not found" });
      return;
    }
    const organizationRef = await firebase.db
      .collection("organizations")
      .doc(organizationUID);
    const organizationSnapshot = await organizationRef.get();
    if (organizationSnapshot.exists) {
      let data = organizationSnapshot.data();
      data.interestArea = {
        latitude: lat,
        longitude: long,
        radius: radius,
      };
      await organizationRef.update(data);
      res.status(201).json(data);
      return;
    }
    res.status(404).json({ message: "Organization not found" });
    return;
  } catch (error) {
    res.status(404).json({ message: "Organization not found" });
    return;
  }
});

app.post("/endEvent", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unathorized" });
  }

  const reqSquema = zod.object({
    eventUID: zod.string(),
  });
  const result = reqSquema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: JSON.parse(result.error.message) });
  }

  const eventUID = req.body.eventUID;

  //Validar token
  let auth = null;
  let user = null;
  let decodedToken = null;
  try {
    auth = firebase.admin.auth();
    decodedToken = await auth.verifyIdToken(token);
    user = await auth.getUser(decodedToken.uid);
  } catch (error) {
    res.status(401).json({
      error: "Invalid user token.",
    });
    return;
  }

  try {
    const organizationUID = user.organizationUID;
    if (!organizationUID) {
      res.status(404).json({ message: "Organization not found" });
      return;
    }
    const organizationRef = await firebase.db
      .collection("organizations")
      .doc(organizationUID);
    const organizationSnapshot = await organizationRef.get();
    if (organizationSnapshot.exists) {
      const eventRef = await firebase.db.collection("events").doc(eventUID);
      const eventSnapshot = await eventRef.get();
      if (eventSnapshot.exists) {
        await firebase.db.collection("oldEvents").add(eventSnapshot.data());
        await eventRef.delete();
        res.status(200).json({ message: "Event ended" });
        return;
      }
      res.status(404).json({ message: "Event not found" });
      return;
    }
    res.status(404).json({ message: "Organization not found" });
    return;
  } catch (error) {
    res.status(404).json({ message: "Organization not found" });
    return;
  }
});

divercron.killEventsPerHour();
divercron.notifyInterestAreas();

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
