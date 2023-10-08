const express = require('express');
require('dotenv').config();
const firebase = require('./firebase.js');
const utilities = require('./utilities.js');

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
    res.redirect('/');
})

app.get('/thermalAnomalies', async (req, res) => {
    const lat = req.body.latitude;
    const long = req.body.longitude;
    const radius = req.body.radius;

    const box = utilities.areaCoordinates(lat,long,radius);
    const apiUrl = utilities.buildApiUrl(box);
    
    let thermalAnomalies = await utilities.retrieveThermalAnomalies(apiUrl);
    thermalAnomalies = thermalAnomalies.filter(function (point) {
        return utilities.pointInCircle(lat,long,point.latitude,point.longitude,radius)
    });
    res.json(thermalAnomalies);
})

app.get('/ping', async (req,res) => {
    const usersRef = await firebase.db.collection("users").get();
    const users = usersRef.docs.map((doc) => doc.data());
    res.status(201).json(users);
})

app.post('/createEventDTO', async (req,res) => {
    const lat = req.body.latitude;
    const long = req.body.longitude;
    const token = req.body.token;

    //Validar token
    const auth = firebase.admin.auth();
    try {
        const user = await auth.getUser(token);
        const userInDB = await db.collection("users").doc(user.uid).get();
        if (user.empty) {
            res.status(401).json({
                error: "Invalid user token."
            });
            return;
        }
    } catch (error) {
        res.status(401).json({
            error: "Invalid user token."
        });
        return;
    }

    //Chequeo de AT
    const box = utilities.areaCoordinates(lat,long,0.4);
    const apiUrl = utilities.buildApiUrl(box);
    let thermalAnomalies = await utilities.retrieveThermalAnomalies(apiUrl);
    
    if (!thermalAnomalies.length) {
        res.status(422).json({
            error: "No thermal anomalies detected in the zone."
        });
        return;
    }

    //Crear evento
    const newEvent = await db.collection('events').add({
        initialLatitude: lat,
        initialLongitude: long,
        starterUser: user,
        thermalAnomalies: thermalAnomalies,
        comments: []
    });

    //Avisar a organizaciones
    const organizationsRef = await firebase.db.collection("organizations").get();
    let organizations = organizationsRef.docs.map((doc) => {doc.data()});
    organizations.forEach(function (organization) {
        utilities.sendNotification(organization, newEvent);
    })

    //Devolver evento
    res.status(201).json(newEvent);
})

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
})

