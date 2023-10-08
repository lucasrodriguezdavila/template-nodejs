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

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
})

