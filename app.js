const express = require('express');
//const scheduledFunctions = require('./scheduledFunctions/scheduledFunctions');
const turf = require('turf')
const axios = require('axios');
const Papa = require('papaparse');
require('dotenv').config();
const firebase = require('./firebase.js');

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
    res.redirect('/');
})

function areaCoordinates(lat, long, radius) {
    const point = turf.point([long,lat]);
    const distanceToAdd = radius;

    let west = turf.destination(point, distanceToAdd, -90);
    west = west.geometry.coordinates[0];
    let south = turf.destination(point, distanceToAdd, -180);
    south = south.geometry.coordinates[1];
    let east = turf.destination(point, distanceToAdd, 90);
    east = east.geometry.coordinates[0];
    let north = turf.destination(point, distanceToAdd, 0);
    north = north.geometry.coordinates[1];
    
    return {west, south, east, north};
}

function pointInCircle(x, y, cx, cy, r) {
    const from = turf.point([x, y]);
    const to = turf.point([cx, cy]);
    const distance = turf.distance(from, to);
    return distance <= r;
}

function todayString() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

app.get('/thermalAnomalies', async (req, res) => {
    const lat = req.body.latitude;
    const long = req.body.longitude;
    const radius = req.body.radius;

    const box = areaCoordinates(lat,long,radius);
    const coordinates = `${box.west},${box.south},${box.east},${box.north}`;
    console.log(coordinates)
    const satellite = "VIIRS_NOAA20_NRT";
    const mapKey = process.env.MAP_KEY;
    const apiUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${satellite}/${coordinates}/1/${todayString()}`;
    
    try {
        const response = await axios.get(apiUrl);
        if (response.status === 200) {
            Papa.parse(response.data, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    const data = results.data.filter(function (point) {
                        return pointInCircle(lat,long,point.latitude,point.longitude,radius)
                    });
                    res.json(data);
                },
                error: function (error) {
                    //devolver un res status correspondiente
                    console.error('CSV parsing error:', error.message);
                },
            });
        } else {
            res.status(response.status).json({ error: 'Failed to fetch CSV data from the API.' });
        }
    } catch (error) {
        console.error('Error fetching CSV data:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
})

app.post('/createEventDTO', (req,res) => {
    const lat = req.body.latitude;
    const long = req.body.longitude;
    const token = req.body.token;
})

app.get('/ping', async (req,res) => {
    const usersRef = await firebase.db.collection("users").get();
    const users = usersRef.docs.map((doc) => doc.data());
    res.status(201).json(users);
})

//scheduledFunctions.initScheduledJobs();

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
})

