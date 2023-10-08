const turf = require('turf');
const axios = require('axios');
const Papa = require('papaparse');
const nodemailer = require('nodemailer');
require('dotenv').config();

const areaCoordinates = (lat, long, radius) => {
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
exports.areaCoordinates = areaCoordinates;

const pointInCircle = (x, y, cx, cy, r) => {
    const from = turf.point([x, y]);
    const to = turf.point([cx, cy]);
    const distance = turf.distance(from, to);
    return distance <= r;
}
exports.pointInCircle = pointInCircle;

const todayString = () => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
exports.todayString = todayString;

const buildApiUrl = (coordinates) => {
    const coordinatesString = `${coordinates.west},${coordinates.south},${coordinates.east},${coordinates.north}`;
    const satellite = "VIIRS_NOAA20_NRT";
    const mapKey = process.env.MAP_KEY;
    return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${satellite}/${coordinatesString}/1/${todayString()}`;
}
exports.buildApiUrl = buildApiUrl;

const retrieveThermalAnomalies = async (apiUrl) => {
    let thermalAnomalies = []
    try {
        const response = await axios.get(apiUrl);
        if (response.status === 200) {
            Papa.parse(response.data, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    thermalAnomalies = results.data;
                },
                error: function (error) {
                    console.error('CSV parsing error:', error.message);
                },
            });
        } else {
            console.error('Failed to fetch CSV data from the API.');
        }
    } catch (error) {
        console.error('Error fetching CSV data:', error);
    }
    return thermalAnomalies
}
exports.retrieveThermalAnomalies = retrieveThermalAnomalies;

const sendNotification = async (organization, newEvent) => {
    const interestArea = organization.interestArea;
    if (!interestArea) {
        return false;
    }

    const hasSomeAnomaly = newEvent.thermalAnomalies.some(function (point) {
        return pointInCircle(interestArea.latitude,interestArea.longitude,point.latitude,point.longitude,interestArea.radius)
    })
    if (!hasSomeAnomaly) {
        return false;
    }

    const transporter = nodemailer.createTransport({
        host: "smtp.sendgrid.net",
        port: 465,
        secure: true,
        auth: {
          user: "apikey",
          pass: process.env.SENDGRID_API_KEY,
        },
      });

    await transporter.sendMail({
        from: process.env.SENDER_EMAIL,
        to: organization.email,
        subject: "Hay un posible INCENDIO en tu zona de interés",
        text: `¡Revise ya la aplicación! El incendio está en ${newEvent.initialLatitude} (latitud) y ${newEvent.initialLongitude} (longitud).`
    });
}
exports.sendNotification = sendNotification;